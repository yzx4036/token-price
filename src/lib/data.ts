import aggregateRaw from '../data/generated/aggregate.generated.json';
import benchmarksRaw from '../data/generated/benchmarks.generated.json';
import tokenEstimatesRaw from '../data/generated/token-estimates.generated.json';
import apiEntries from '../data/entries/api.json';
import planEntries from '../data/entries/plans.json';
import fxRaw from '../data/generated/fx.generated.json';
import providerEntries from '../data/providers.json';
import type { BenchmarkDoc } from './benchmark-view';
import type { TokenEstimatesDoc } from './token-estimate-view';
import {
  mergeApiPrices,
  parseAggregateFile,
  parseApiPrices,
  parseFxRate,
  parseProviders,
  parseTokenPlans,
} from './schema';

// 构建期只读仓库内文件：这里不发任何网络请求。
export const providers = parseProviders(providerEntries);
export const fxRate = parseFxRate(fxRaw);
export const aggregateFile = parseAggregateFile(aggregateRaw);

const manualEntries = parseApiPrices(apiEntries);
// 手写条目优先，聚合生成物只补空缺；重复 id / 同模型由 mergeApiPrices 处理
export const apiPrices = parseApiPrices(mergeApiPrices(manualEntries, aggregateFile.entries));
export const tokenPlans = parseTokenPlans(planEntries);

/**
 * 智能评分（issue #5）与 Token Plan 折算（issue #8）。
 *
 * 两者都是**构建期生成的产物**，由 scripts/data/gen-*.mjs 从手写依据算出，
 * 门禁里有 --check 保证产物与依据一致。前端只读，不在这里重算。
 */
export const benchmarkDoc = benchmarksRaw as unknown as BenchmarkDoc;
export const tokenEstimates = tokenEstimatesRaw as unknown as TokenEstimatesDoc;

const officialDates = apiPrices
  .filter((entry) => entry.provenance === 'official')
  .map((entry) => entry.verifiedAt)
  .sort();

/** 最近一次抓取日期（派生自数据，不写死常量） */
export const DATA_VERIFIED_AT = officialDates.at(-1) ?? aggregateFile.fetchedAt.slice(0, 10);
export const AGGREGATE_FETCHED_AT = aggregateFile.fetchedAt;
export const AGGREGATE_SOURCE = aggregateFile.source;
export const AGGREGATE_SOURCE_URL = aggregateFile.sourceUrl;
