import { writeFileSync } from 'node:fs';
import { fetchJson } from './http.mjs';
import { CliError, PATHS, readJson, relative, slugify, writeJsonAtomic } from './io.mjs';
import { normalizeModelName } from '../../../src/lib/schema.ts';

export const AGGREGATE_SOURCE = 'models.dev';
export const AGGREGATE_SOURCE_URL = 'https://models.dev/api.json';
export const AGGREGATE_SOURCE_HOMEPAGE = 'https://models.dev/';

/**
 * 聚合源只用于补空缺：明确列出允许用聚合数据补位的厂商与每厂商最多收录条数。
 * 已在官方页核验过的厂商（deepseek / aliyun / volcengine / minimax / anthropic / google）
 * 不在表内，避免聚合值悄悄覆盖官方值。
 */
export const AGGREGATE_LIMITS = {
  openai: 12,
  xai: 8,
  mistral: 12,
  cohere: 8,
  meta: 6,
  moonshot: 6,
  zhipu: 12,
  xiaomi: 6,
  stepfun: 4,
};

// 只收文本生成类模型：排除向量、图像、语音、视频、审核等非对话单价
const NON_CHAT_MODEL = /embed|image|tts|whisper|rerank|moderation|audio|video|transcri|ocr|guard|dall|sora|lyria/i;

function pickCost(cost) {
  const input = typeof cost?.input === 'number' && Number.isFinite(cost.input) ? cost.input : null;
  const output = typeof cost?.output === 'number' && Number.isFinite(cost.output) ? cost.output : null;
  if (input === null || output === null) return null;
  if (input === 0 && output === 0) return null; // 免费/未标价条目对横向比较无意义
  const cacheRead = typeof cost?.cache_read === 'number' && Number.isFinite(cost.cache_read) ? cost.cache_read : null;
  const cacheWrite = typeof cost?.cache_write === 'number' && Number.isFinite(cost.cache_write) ? cost.cache_write : null;
  return { input, output, cacheRead, cacheWrite };
}

export async function downloadModelsDev() {
  const payload = await fetchJson(AGGREGATE_SOURCE_URL, { timeoutMs: 60000 });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new CliError('models.dev 返回结构异常（期望 provider 字典）', { code: 'AGGREGATE_SHAPE' });
  }
  const providers = Object.keys(payload).length;
  const models = Object.values(payload).reduce((sum, provider) => sum + Object.keys(provider?.models ?? {}).length, 0);
  writeFileSync(PATHS.modelsDevCache, JSON.stringify(payload), 'utf8');
  return { payload, stats: { providers, models } };
}

/** 从 models.dev 快照挑选聚合条目（确定性：按 release_date 倒序取前 N 条） */
export function buildAggregateEntries(payload, providers, fetchedAt) {
  const fetchedDate = fetchedAt.slice(0, 10);
  const entries = [];
  const perProvider = [];

  for (const provider of providers) {
    const limit = AGGREGATE_LIMITS[provider.id];
    if (!limit || !provider.aggregateProvider) continue;
    const source = payload[provider.aggregateProvider];
    if (!source?.models) {
      perProvider.push({ providerId: provider.id, aggregateProvider: provider.aggregateProvider, selected: 0, missing: true });
      continue;
    }
    const ranked = Object.values(source.models)
      .filter((model) => !NON_CHAT_MODEL.test(String(model?.id ?? '')))
      .map((model) => ({ model, cost: pickCost(model?.cost) }))
      .filter((item) => item.cost !== null)
      .sort((a, b) => {
        const byDate = String(b.model.release_date ?? '').localeCompare(String(a.model.release_date ?? ''));
        return byDate !== 0 ? byDate : String(a.model.id).localeCompare(String(b.model.id));
      });

    // 同一厂商下同名模型（不同 id 别名）只保留排在最前的一条，避免合并期再丢
    const seenNames = new Set();
    const candidates = [];
    for (const item of ranked) {
      const key = normalizeModelName(String(item.model.name ?? item.model.id));
      if (seenNames.has(key)) continue;
      seenNames.add(key);
      candidates.push(item);
      if (candidates.length >= limit) break;
    }

    for (const { model, cost } of candidates) {
      const contextRaw = model?.limit?.context;
      const contextTokens = Number.isInteger(contextRaw) && contextRaw > 0 ? contextRaw : null;
      // 聚合源对国内厂商也以 USD 发布（= 人民币挂牌价 ÷ 汇率）；账单币种仍按厂商地区判定
      const billingCurrency = provider.region === 'cn' ? 'CNY' : 'USD';
      const notes = billingCurrency === 'CNY'
        ? `取自 models.dev（provider=${provider.aggregateProvider} · model=${model.id}）；聚合源以 USD 发布，折算自厂商人民币挂牌价；未逐条核对厂商官方页。`
        : `取自 models.dev（provider=${provider.aggregateProvider} · model=${model.id}）；聚合源以 USD 发布；未逐条核对厂商官方页。`;
      entries.push({
        id: `${provider.id}-${slugify(String(model.id))}`,
        providerId: provider.id,
        provider: provider.nameZh,
        model: String(model.name ?? model.id),
        billingCurrency,
        reportedCurrency: 'USD',
        unit: 'per_1m_tokens',
        inputPrice: cost.input,
        outputPrice: cost.output,
        cacheReadPrice: cost.cacheRead,
        cacheWritePrice: cost.cacheWrite,
        contextTokens,
        sourceUrl: AGGREGATE_SOURCE_HOMEPAGE,
        provenance: 'aggregate',
        aggregateSource: AGGREGATE_SOURCE,
        aggregateFetchedAt: fetchedDate,
        verifiedAt: fetchedDate,
        status: 'verified',
        pricingCondition: '聚合源标准单价：不区分峰谷、批量、长上下文与优先服务档',
        notes,
      });
    }
    perProvider.push({
      providerId: provider.id,
      aggregateProvider: provider.aggregateProvider,
      selected: candidates.length,
      missing: false,
    });
  }

  const ids = new Set();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new CliError(`聚合生成出现重复 id：${entry.id}`, { code: 'AGGREGATE_DUPLICATE_ID' });
    ids.add(entry.id);
  }
  return { entries, perProvider };
}

export async function runPullCommand({ now = new Date() } = {}) {
  const providers = readJson(PATHS.providers);
  const { payload, stats } = await downloadModelsDev();
  const fetchedAt = now.toISOString();
  const { entries, perProvider } = buildAggregateEntries(payload, providers, fetchedAt);
  const aggregateFile = {
    source: AGGREGATE_SOURCE,
    sourceUrl: AGGREGATE_SOURCE_URL,
    fetchedAt,
    providerStats: stats,
    entries,
  };
  writeJsonAtomic(PATHS.aggregate, aggregateFile);
  return {
    stats,
    fetchedAt,
    aggregateCount: entries.length,
    perProvider,
    cachePath: relative(PATHS.modelsDevCache),
    aggregatePath: relative(PATHS.aggregate),
  };
}
