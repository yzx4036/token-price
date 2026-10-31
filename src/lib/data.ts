import aggregateRaw from '../data/generated/aggregate.generated.json';
import apiEntries from '../data/entries/api.json';
import planEntries from '../data/entries/plans.json';
import fxRaw from '../data/generated/fx.generated.json';
import providerEntries from '../data/providers.json';
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

const officialDates = apiPrices
  .filter((entry) => entry.provenance === 'official')
  .map((entry) => entry.verifiedAt)
  .sort();

/** 最近一次官方核验日期（派生自数据，不写死常量） */
export const DATA_VERIFIED_AT = officialDates.at(-1) ?? aggregateFile.fetchedAt.slice(0, 10);
export const AGGREGATE_FETCHED_AT = aggregateFile.fetchedAt;
export const AGGREGATE_SOURCE = aggregateFile.source;
export const AGGREGATE_SOURCE_URL = aggregateFile.sourceUrl;
