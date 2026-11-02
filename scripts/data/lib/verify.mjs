import { computeProviderCoverage, computeStats } from '../../../src/lib/stats.ts';
import {
  mergeApiPrices,
  parseAggregateFile,
  parseApiPrices,
  parseFxRate,
  parseProviders,
  parseTokenPlans,
} from '../../../src/lib/schema.ts';
import { PATHS, relative, readJson, readJsonIfExists } from './io.mjs';

const FX_STALE_DAYS = 45;
const AGGREGATE_STALE_DAYS = 90;

function daysBetween(isoDate, now) {
  const then = new Date(`${isoDate}T00:00:00Z`).getTime();
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY;
  return Math.round((now.getTime() - then) / 86_400_000);
}

function zodMessage(error) {
  const issues = error?.issues;
  if (!Array.isArray(issues) || issues.length === 0) return error instanceof Error ? error.message : String(error);
  return issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join('.') || '(根)'}: ${issue.message}`)
    .join('；');
}

function tryParse(parse, input, label, problems) {
  try {
    return { ok: true, value: parse(input) };
  } catch (error) {
    problems.push({ level: 'error', code: 'SCHEMA', message: `${label} 校验失败：${zodMessage(error)}` });
    return { ok: false, value: null };
  }
}

export function runVerifyCommand({ now = new Date() } = {}) {
  const problems = [];
  const files = {
    providers: relative(PATHS.providers),
    apiEntries: relative(PATHS.apiEntries),
    planEntries: relative(PATHS.planEntries),
    fx: relative(PATHS.fx),
    aggregate: relative(PATHS.aggregate),
  };

  const providers = tryParse(parseProviders, readJson(PATHS.providers), files.providers, problems);
  const manual = tryParse(parseApiPrices, readJson(PATHS.apiEntries), files.apiEntries, problems);
  const plans = tryParse(parseTokenPlans, readJson(PATHS.planEntries), files.planEntries, problems);

  // 「不限量」必须说清范围：写「不限」却不给 feature/surface/constrains，
  // 读者会理解成「随便用」，而实际往往只覆盖某个能力、某个入口，且仍受速率限制。
  // 这里做成硬拦截，防止新条目再把笼统表述塞回来。
  if (plans.ok) {
    for (const plan of plans.value) {
      const text = `${plan.allowance ?? ''}${plan.usageRestrictions ?? ''}`;
      if (text.includes('不限') && !plan.unlimited) {
        problems.push({
          level: 'error',
          code: 'UNLIMITED_UNSCOPED',
          message: `套餐 ${plan.id}：「不限」类表述必须带 unlimited 字段（feature / models / surface / constrains）`,
        });
      }
    }
  }
  const fxRaw = readJsonIfExists(PATHS.fx);
  const fx = fxRaw === null
    ? (problems.push({ level: 'error', code: 'FX_MISSING', message: `${files.fx} 缺失：页面构建必须读取汇率生成物` }), { ok: false, value: null })
    : tryParse(parseFxRate, fxRaw, files.fx, problems);
  const aggregateRaw = readJsonIfExists(PATHS.aggregate);
  const aggregate = aggregateRaw === null
    ? (problems.push({ level: 'error', code: 'AGGREGATE_MISSING', message: `${files.aggregate} 缺失：干净检出必须能直接构建` }), { ok: false, value: null })
    : tryParse(parseAggregateFile, aggregateRaw, files.aggregate, problems);

  const providerList = providers.value ?? [];
  const manualEntries = manual.value ?? [];
  const aggregateEntries = aggregate.value?.entries ?? [];
  const merged = mergeApiPrices(manualEntries, aggregateEntries);
  const stats = computeStats(merged);
  const coverage = computeProviderCoverage(merged, providerList);

  // 厂商存在性 + 显示名一致 + 溯源来源合法性
  const byId = new Map(providerList.map((provider) => [provider.id, provider]));
  for (const entry of [...manualEntries, ...aggregateEntries]) {
    const provider = byId.get(entry.providerId);
    if (!provider) {
      problems.push({ level: 'error', code: 'PROVIDER_MISSING', message: `${entry.id}: 厂商 ${entry.providerId} 不在 ${files.providers} 中`, entryId: entry.id });
      continue;
    }
    if (entry.provider !== provider.nameZh) {
      problems.push({ level: 'warning', code: 'PROVIDER_NAME', message: `${entry.id}: provider 显示名「${entry.provider}」与厂商表「${provider.nameZh}」不一致`, entryId: entry.id });
    }
    if (entry.provenance === 'official' && entry.sourceUrl.includes('models.dev')) {
      problems.push({ level: 'error', code: 'OFFICIAL_NOT_AGGREGATE', message: `${entry.id}: official 条目的来源不能是聚合源地址`, entryId: entry.id });
    }
    // 聚合条目的账单币种必须与厂商实际收款币种一致（国内 CNY / 国际 USD），
    // 报价币种则是聚合源的 USD；两者混用会让国内厂商被误标成美元账单
    if (entry.provenance === 'aggregate') {
      const expected = provider.region === 'cn' ? 'CNY' : 'USD';
      if (entry.billingCurrency !== expected) {
        problems.push({
          level: 'warning',
          code: 'AGGREGATE_BILLING_REGION',
          message: `${entry.id}: 聚合条目账单币种为 ${entry.billingCurrency}，但厂商 ${provider.id}（${provider.region}）应为 ${expected}`,
          entryId: entry.id,
        });
      }
    }
  }

  // 官方 / 聚合的关系：聚合条目被官方覆盖时如实提示，但不视为失败
  const manualIds = new Set(manualEntries.map((entry) => entry.id));
  const officialModelKeys = new Set(
    manualEntries
      .filter((entry) => entry.provenance === 'official')
      .map((entry) => `${entry.providerId}::${entry.model.split(/[（(]/)[0].toLowerCase()}`),
  );
  for (const entry of aggregateEntries) {
    if (manualIds.has(entry.id)) {
      problems.push({ level: 'warning', code: 'AGGREGATE_OVERRIDDEN_BY_ID', message: `聚合条目 ${entry.id} 与手写条目同 id，已被忽略`, entryId: entry.id });
      continue;
    }
    const key = `${entry.providerId}::${entry.model.split(/[（(]/)[0].toLowerCase()}`;
    if (officialModelKeys.has(key)) {
      problems.push({ level: 'warning', code: 'AGGREGATE_SUPERSEDED', message: `聚合条目 ${entry.id} 与 official 同模型，按规则以官方为准`, entryId: entry.id });
    }
  }

  // 覆盖率提示
  for (const item of coverage) {
    if (item.entries === 0) {
      problems.push({ level: 'warning', code: 'PROVIDER_EMPTY', message: `厂商 ${item.providerId} 已登记但没有任何价格条目` });
    }
  }
  const droppedIds = manualEntries.length + aggregateEntries.length - merged.length;
  if (droppedIds > 0) {
    problems.push({ level: 'warning', code: 'MERGED_DEDUPE', message: `合并时按溯源优先级丢弃 ${droppedIds} 条聚合条目` });
  }

  if (stats.official === 0) {
    problems.push({ level: 'error', code: 'NO_OFFICIAL', message: '没有任何 official 条目：溯源纪律失效' });
  }

  // 生成物新鲜度
  if (fx.value) {
    const age = daysBetween(fx.value.date, now);
    if (age > FX_STALE_DAYS) {
      problems.push({ level: 'warning', code: 'FX_STALE', message: `汇率日期 ${fx.value.date} 距今 ${age} 天，请运行 npm run data:rate` });
    }
  }
  if (aggregate.value) {
    const fetchedDate = aggregate.value.fetchedAt.slice(0, 10);
    const age = daysBetween(fetchedDate, now);
    if (age > AGGREGATE_STALE_DAYS) {
      problems.push({ level: 'warning', code: 'AGGREGATE_STALE', message: `聚合快照抓取于 ${fetchedDate}（${age} 天前），请运行 npm run data:pull` });
    }
    if (aggregate.value.entries.length === 0) {
      problems.push({ level: 'warning', code: 'AGGREGATE_EMPTY', message: '聚合生成物没有任何条目' });
    }
  }

  const errors = problems.filter((problem) => problem.level === 'error');
  const officialSourceUrls = [...new Set(
    manualEntries.filter((entry) => entry.provenance === 'official').map((entry) => entry.sourceUrl),
  )].sort();
  return {
    ok: errors.length === 0,
    stats,
    coverage,
    problems,
    errorCount: errors.length,
    warningCount: problems.length - errors.length,
    files,
    fx: fx.value,
    aggregate: aggregate.value
      ? { source: aggregate.value.source, fetchedAt: aggregate.value.fetchedAt, providerStats: aggregate.value.providerStats, entries: aggregate.value.entries.length }
      : null,
    plans: plans.value ? plans.value.length : 0,
    officialSourceUrls,
    reachability: null,
  };
}

/**
 * 把来源可达性抽查结果并入报告：失败项只算提醒（不影响 ok / 退出码）。
 * publish 门禁不调用它，发布路径保持无网络、可复现。
 */
export function attachReachability(result, reachability) {
  result.reachability = reachability;
  for (const item of reachability.failed) {
    result.problems.push({
      level: 'warning',
      code: 'SOURCE_UNREACHABLE',
      message: `${item.url}: ${item.reason}（可达性抽查提醒，不改变退出码）`,
    });
  }
  const errors = result.problems.filter((problem) => problem.level === 'error');
  result.errorCount = errors.length;
  result.warningCount = result.problems.length - errors.length;
  result.ok = errors.length === 0;
  return result;
}

export function formatVerifyReport(result) {
  const lines = [];
  const { stats } = result;
  lines.push('== 数据校验 ==');
  lines.push(`文件：${result.files.apiEntries} · ${result.files.aggregate} · ${result.files.fx}`);
  lines.push(`厂商 ${stats.providers} 家 · 计价口径 ${stats.entries} 条 · 唯一模型 ${stats.models} 个`);
  lines.push(`溯源：official ${stats.official} 条 · aggregate ${stats.aggregate} 条 · 未核验 ${stats.pending} 条`);
  lines.push(`账单币种（billingCurrency）：CNY ${stats.cnyBilling} 条 · USD ${stats.usdBilling} 条 · Token Plan ${result.plans} 条`);
  lines.push(`报价币种（reportedCurrency）：CNY ${stats.cnyReported} 条 · USD ${stats.usdReported} 条 · 需汇率换算 ${stats.reportedUsdShare}%`);
  if (result.fx) {
    lines.push(`汇率：1 USD = ${result.fx.rate} CNY（${result.fx.date}，${result.fx.source}）`);
  }
  if (result.aggregate) {
    lines.push(`聚合源：${result.aggregate.source} 抓取于 ${result.aggregate.fetchedAt}（快照 ${result.aggregate.providerStats.providers} 厂商 / ${result.aggregate.providerStats.models} 模型，收录 ${result.aggregate.entries} 条）`);
  }
  lines.push('');
  lines.push('各厂商覆盖：');
  for (const item of result.coverage) {
    lines.push(`  ${item.providerId.padEnd(12)} 共 ${String(item.entries).padStart(3)} 条 · 官方 ${String(item.official).padStart(3)} · 聚合 ${String(item.aggregate).padStart(3)} · 官方占比 ${item.officialShare}%`);
  }
  lines.push('');
  if (result.problems.length === 0) {
    lines.push('问题清单：无');
  } else {
    lines.push(`问题清单（严重 ${result.errorCount} / 提醒 ${result.warningCount}）：`);
    for (const problem of result.problems) {
      lines.push(`  [${problem.level === 'error' ? '严重' : '提醒'}] ${problem.code}: ${problem.message}`);
    }
  }
  if (result.reachability) {
    const { checked, ok, failed, limit, timeoutMs } = result.reachability;
    lines.push('');
    lines.push(`来源可达性抽查（--check-sources，仅提醒、不是发布门禁）：探测 ${checked} 个唯一 URL（上限 ${limit}，超时 ${timeoutMs / 1000}s）· 可达 ${ok} · 提醒 ${failed.length}`);
    for (const item of failed) lines.push(`  [提醒] ${item.url}: ${item.reason}`);
  }
  lines.push('');
  lines.push(result.ok ? '结论：通过（退出码 0）' : '结论：存在严重问题，构建不允许通过（退出码 1）');
  return lines.join('\n');
}
