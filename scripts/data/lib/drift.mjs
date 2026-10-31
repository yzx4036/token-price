import { existsSync } from 'node:fs';
import { PATHS, readJson, readJsonIfExists, relative } from './io.mjs';
import { runPullCommand } from './pull.mjs';
import { normalizeModelName } from '../../../src/lib/schema.ts';

const DIFF_THRESHOLD = 0.05; // 相对差异 5% 以上才报告

function buildIndex(models) {
  const index = new Map();
  for (const model of Object.values(models ?? {})) {
    const keys = new Set([
      normalizeModelName(String(model.id ?? '')),
      normalizeModelName(String(model.name ?? '')),
    ]);
    for (const key of keys) {
      if (!key) continue;
      if (!index.has(key)) index.set(key, model);
    }
  }
  return index;
}

function toUsd(amount, currency, fx) {
  if (amount === null) return null;
  if (currency === 'USD') return amount;
  if (!fx || !Number.isFinite(fx.rate) || fx.rate <= 0) return null;
  return amount / fx.rate;
}

function percent(local, remote) {
  if (remote === 0) return local === 0 ? 0 : Number.POSITIVE_INFINITY;
  return ((local - remote) / remote) * 100;
}

/**
 * 对外只读：把本地 official 值与聚合源最新值对拍，输出差异清单，绝不改写数据。
 */
export async function runDriftCommand({ now = new Date(), entriesFile = null } = {}) {
  const providers = readJson(PATHS.providers);
  const localFile = entriesFile ?? PATHS.apiEntries;
  const entries = readJson(localFile);
  const fx = readJsonIfExists(PATHS.fx);
  let pulled = false;
  if (!existsSync(PATHS.modelsDevCache)) {
    await runPullCommand({ now });
    pulled = true;
  }
  const snapshot = readJson(PATHS.modelsDevCache);
  const byId = new Map(providers.map((provider) => [provider.id, provider]));

  const indexes = new Map();
  const indexFor = (providerId) => {
    if (!indexes.has(providerId)) {
      const provider = byId.get(providerId);
      const source = provider?.aggregateProvider ? snapshot[provider.aggregateProvider] : null;
      indexes.set(providerId, source ? buildIndex(source.models) : new Map());
    }
    return indexes.get(providerId);
  };

  const diffs = [];
  const unmatched = [];
  let matched = 0;
  const officialEntries = entries.filter((entry) => entry.provenance === 'official');

  for (const entry of officialEntries) {
    const index = indexFor(entry.providerId);
    const remote = index.get(normalizeModelName(entry.model));
    if (!remote) {
      unmatched.push({ id: entry.id, provider: entry.provider, model: entry.model });
      continue;
    }
    matched += 1;
    const pairs = [
      ['input', entry.inputPrice, remote.cost?.input],
      ['output', entry.outputPrice, remote.cost?.output],
      ['cacheRead', entry.cacheReadPrice, remote.cost?.cache_read],
    ];
    for (const [field, localRaw, remoteRaw] of pairs) {
      const local = toUsd(localRaw ?? null, entry.billingCurrency, fx);
      if (local === null || typeof remoteRaw !== 'number' || !Number.isFinite(remoteRaw)) continue;
      if (remoteRaw === 0) continue;
      const diff = percent(local, remoteRaw);
      if (Math.abs(diff) < DIFF_THRESHOLD * 100) continue;
      diffs.push({
        id: entry.id,
        provider: entry.provider,
        model: entry.model,
        field,
        local: Number(local.toFixed(4)),
        localCurrency: entry.billingCurrency,
        localRaw: localRaw ?? null,
        aggregate: remoteRaw,
        diffPercent: Math.round(diff * 10) / 10,
        aggregateModelId: remote.id,
      });
    }
  }

  return {
    ok: true,
    readOnly: true,
    pulled,
    entriesFile: relative(localFile),
    cachePath: relative(PATHS.modelsDevCache),
    aggregateProviderCount: Object.keys(snapshot).length,
    comparedEntries: officialEntries.length,
    matched,
    unmatched,
    diffs,
    thresholdPercent: DIFF_THRESHOLD * 100,
    fxRate: fx?.rate ?? null,
  };
}

export function formatDriftReport(result) {
  const lines = [];
  lines.push('== 本地 official 值 vs 聚合源（只报告，不改写） ==');
  lines.push(`对拍条目：${result.comparedEntries} 条 official · 匹配 ${result.matched} 条 · 未匹配 ${result.unmatched.length} 条`);
  lines.push(`聚合快照：${result.cachePath}（${result.aggregateProviderCount} 个 provider）${result.pulled ? ' · 本次已自动 pull' : ''}`);
  if (result.fxRate) lines.push(`折算汇率：1 USD = ${result.fxRate} CNY（仅用于把人民币价折成 USD 对拍）`);
  lines.push('');
  if (result.diffs.length === 0) {
    lines.push(`差异清单：无（阈值 ${result.thresholdPercent}%）`);
  } else {
    lines.push(`差异清单（阈值 ${result.thresholdPercent}%，local 已折算为 USD）：`);
    lines.push('  厂商 | 模型 | 字段 | 本地(USD) | 聚合(USD) | 差异');
    for (const diff of result.diffs) {
      lines.push(`  ${diff.provider} | ${diff.model} | ${diff.field} | ${diff.local} | ${diff.aggregate} | ${diff.diffPercent > 0 ? '+' : ''}${diff.diffPercent}%`);
    }
  }
  if (result.unmatched.length > 0) {
    lines.push('');
    lines.push(`未匹配条目（聚合源没有同名模型，属正常缺口）：${result.unmatched.length} 条`);
    for (const item of result.unmatched.slice(0, 30)) lines.push(`  - ${item.id}（${item.model}）`);
    if (result.unmatched.length > 30) lines.push(`  …… 其余 ${result.unmatched.length - 30} 条省略`);
  }
  return lines.join('\n');
}
