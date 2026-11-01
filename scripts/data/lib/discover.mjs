import { existsSync } from 'node:fs';
import { CliError, PATHS, readJson, relative } from './io.mjs';
import { runPullCommand } from './pull.mjs';
import { AGGREGATE_LIMITS, AGGREGATE_SOURCE, AGGREGATE_SOURCE_URL } from './pull.mjs';
import { normalizeModelName } from '../../../src/lib/schema.ts';

/**
 * 发现候选：只报告，绝不写数据。
 *
 * 为什么不做「自动收录」：本站的核心卖点是来源可追溯。聚合值一律标
 * 「未逐条核官方」，如果让机器自动把新厂商/新模型塞进列表，这个立场就没了。
 * 所以这里只负责把「值得人看一眼的东西」挑出来，收录仍走人工。
 *
 * 与 drift 同一条纪律：默认不联网。聚合快照被 gitignore，CI 上没有，
 * 缓存缺失时报错让人先 pull，只有显式 allowPull 才抓。
 */

// 转售/托管平台：它们的「厂商」身份是渠道而非模型方，收进来会污染横向比较
const RESELLER_NAME = /openrouter|togetherai|together-|fireworks|deepinfra|replicate|groq|perplexity|poe|nanogpt|nano-gpt|helicone|requesty|llmgateway|aigateway|ai-router|router|vercel|cloudflare|cerebras|sambanova|hyperbolic|novita|nebius|scaleway|ovhcloud|azure|aws|bedrock|vertex|siliconflow|qiniu|vultr|baseten|friendli|mixlayer/i;

// 模型系：用来判断一个 provider 到底是「厂商」还是「渠道」。
// 渠道的特征是同时挂多家厂商的模型（既有 GPT 又有 Claude 又有 Gemini），
// 光看名字识别不出来——nano-gpt、edenai、aimlapi 这些名字里没有 reseller 字样。
const MODEL_FAMILY = {
  openai: /(^|[-_/ ])(gpt|o1|o3|o4|chatgpt|davinci)/i,
  anthropic: /claude/i,
  google: /gemini|palm/i,
  meta: /llama/i,
  mistral: /mistral|mixtral|codestral|ministral|devstral/i,
  deepseek: /deepseek/i,
  qwen: /qwen|qwq/i,
  moonshot: /kimi|moonshot/i,
  xai: /grok/i,
  cohere: /command-[arn]|aya/i,
  zhipu: /glm/i,
};

/** 该 provider 的模型横跨几个厂商系；>= 2 视为渠道（真厂商通常只挂自己一系） */
function familiesSpanned(models) {
  const hit = new Set();
  for (const model of models) {
    const id = String(model?.id ?? '');
    for (const [family, pattern] of Object.entries(MODEL_FAMILY)) {
      if (pattern.test(id)) hit.add(family);
    }
  }
  return hit.size;
}

// 只关心文本生成类模型，排除向量/图像/语音/视频/审核
const NON_CHAT_MODEL = /embed|image|tts|whisper|rerank|moderation|audio|video|transcri|ocr|guard|dall|sora|lyria/i;

/** 模型是否是可比较的对话单价 */
function isPricedChat(model) {
  const id = String(model?.id ?? '');
  if (NON_CHAT_MODEL.test(id)) return false;
  const input = model?.cost?.input;
  const output = model?.cost?.output;
  if (typeof input !== 'number' || typeof output !== 'number') return false;
  if (!Number.isFinite(input) || !Number.isFinite(output)) return false;
  // 全 0 视为免费/未标价，对横向比较无意义
  return !(input === 0 && output === 0);
}

/**
 * 扫聚合快照，找出两类值得人工判断的东西：
 * 1) 未收录厂商 —— models.dev 里有对话单价、但 providers.json 没映射的
 * 2) 被上限挤掉的模型 —— 已收录厂商里，候选数超过 AGGREGATE_LIMITS 的
 */
export async function runDiscoverCommand({
  now = new Date(),
  snapshotFile = null,
  allowPull = false,
  topN = 20,
} = {}) {
  const providers = readJson(PATHS.providers);
  const snapshotPath = snapshotFile ?? PATHS.modelsDevCache;
  let pulled = false;

  if (!existsSync(snapshotPath)) {
    if (!allowPull) {
      throw new CliError(
        `聚合快照不存在：${relative(snapshotPath)}\n` +
          `discover 只做本地扫描，不会自动联网。先运行 node scripts/data/cli.mjs pull 生成快照，` +
          `或用 --cache-file 指定已有快照，或加 --pull 允许本次自动抓取。`,
        { code: 'SNAPSHOT_MISSING' },
      );
    }
    await runPullCommand({ now });
    pulled = true;
  }

  const snapshot = readJson(snapshotPath);
  const coveredKeys = new Set(providers.filter((p) => p.aggregateProvider).map((p) => p.aggregateProvider));

  // ---- 1. 未收录厂商 ----
  const unknown = [];
  for (const [key, entry] of Object.entries(snapshot)) {
    if (coveredKeys.has(key)) continue;
    const models = Object.values(entry?.models ?? {}).filter(isPricedChat);
    if (models.length === 0) continue;
    const spanned = familiesSpanned(models);
    unknown.push({
      key,
      name: String(entry?.name ?? key),
      pricedModels: models.length,
      // 名字像渠道，或横跨 2 个以上厂商系 —— 两者任一即视为渠道
      reseller: RESELLER_NAME.test(key) || spanned >= 2,
      families: spanned,
      // 只取最贵的两个做代表，方便判断定位（贵的一般是旗舰）
      examples: models
        .slice()
        .sort((a, b) => Number(b.cost.output) - Number(a.cost.output))
        .slice(0, 2)
        .map((m) => ({ model: String(m.name ?? m.id), input: m.cost.input, output: m.cost.output })),
    });
  }
  unknown.sort((a, b) => {
    if (a.reseller !== b.reseller) return a.reseller ? 1 : -1; // 真厂商排前面
    return b.pricedModels - a.pricedModels || a.key.localeCompare(b.key);
  });

  // ---- 2. 被上限挤掉的模型 ----
  const squeezed = [];
  for (const provider of providers) {
    const limit = AGGREGATE_LIMITS[provider.id];
    if (!limit || !provider.aggregateProvider) continue;
    const source = snapshot[provider.aggregateProvider];
    if (!source?.models) continue;

    const ranked = Object.values(source.models)
      .filter(isPricedChat)
      .sort((a, b) => {
        const byDate = String(b.release_date ?? '').localeCompare(String(a.release_date ?? ''));
        return byDate !== 0 ? byDate : String(a.id).localeCompare(String(b.id));
      });

    // 与 pull 同规则：同名只留第一条，再取前 limit 条；剩下的就是被挤掉的
    const seen = new Set();
    const kept = [];
    const dropped = [];
    for (const model of ranked) {
      const key = normalizeModelName(String(model.name ?? model.id));
      if (seen.has(key)) continue;
      seen.add(key);
      if (kept.length < limit) kept.push(model);
      else dropped.push(model);
    }
    if (dropped.length === 0) continue;
    squeezed.push({
      providerId: provider.id,
      provider: provider.nameZh,
      limit,
      candidates: ranked.length,
      droppedCount: dropped.length,
      dropped: dropped.slice(0, 5).map((m) => String(m.name ?? m.id)),
    });
  }
  squeezed.sort((a, b) => b.droppedCount - a.droppedCount || a.providerId.localeCompare(b.providerId));

  return {
    ok: true,
    readOnly: true,
    pulled,
    source: AGGREGATE_SOURCE,
    sourceUrl: AGGREGATE_SOURCE_URL,
    cachePath: relative(snapshotPath),
    aggregateProviders: Object.keys(snapshot).length,
    coveredProviders: coveredKeys.size,
    unknownTotal: unknown.length,
    unknownReal: unknown.filter((item) => !item.reseller).length,
    unknown: unknown.slice(0, topN),
    squeezed,
  };
}

export function formatDiscoverReport(result) {
  const lines = [];
  lines.push('== 聚合源候选发现（只报告，不改数据） ==');
  lines.push(`快照：${result.cachePath}（${result.aggregateProviders} 个 provider）${result.pulled ? ' · 本次已自动 pull' : ''}`);
  lines.push(`已收录映射：${result.coveredProviders} 个 provider key`);
  lines.push('');

  lines.push(`== 未收录厂商：${result.unknownTotal} 个（其中非转售平台 ${result.unknownReal} 个）==`);
  if (result.unknown.length === 0) {
    lines.push('  无');
  } else {
    for (const item of result.unknown) {
      const tag = item.reseller ? `渠道·跨${item.families}系` : '模型方';
      const sample = item.examples.map((m) => `${m.model} $${m.input}/$${m.output}`).join(' · ');
      lines.push(`  [${tag}] ${item.key}（${item.name}）可计价对话模型 ${item.pricedModels} 个`);
      if (sample) lines.push(`          例：${sample}`);
    }
    if (result.unknownTotal > result.unknown.length) {
      lines.push(`  …… 其余 ${result.unknownTotal - result.unknown.length} 个省略（调大 --top 可见）`);
    }
  }
  lines.push('');

  lines.push('== 已收录但被上限挤掉的模型 ==');
  if (result.squeezed.length === 0) {
    lines.push('  无（各厂商候选数都没超过上限）');
  } else {
    for (const item of result.squeezed) {
      lines.push(
        `  ${item.provider}（${item.providerId}）：候选 ${item.candidates} 个，上限 ${item.limit}，挤掉 ${item.droppedCount} 个`,
      );
      lines.push(`          被挤掉例：${item.dropped.join('、')}`);
    }
    lines.push('');
    lines.push('  说明：列表按发布日倒序取前 N 条，新模型上线会顶掉最旧的条目。');
    lines.push('        这是设计取舍，不是 bug；要保留某个旧模型就提高该厂商上限。');
  }
  lines.push('');
  lines.push('本命令不写任何文件，收录仍需人工核验官方页后加入。');
  return lines.join('\n');
}
