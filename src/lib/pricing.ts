import { convertAmount } from './fx';
import type { RegionFilter, SortKey, SortOrder } from './filters';
import type { ApiPrice, BillingCurrency, FxRate, Provenance, ReportedCurrency } from './schema';

export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type PriceField = 'inputPrice' | 'outputPrice' | 'cacheReadPrice' | 'cacheWritePrice';

export const PRICE_FIELDS: readonly PriceField[] = [
  'inputPrice',
  'outputPrice',
  'cacheReadPrice',
  'cacheWritePrice',
];

const usagePricePairs: ReadonlyArray<[keyof Usage, PriceField]> = [
  ['input', 'inputPrice'],
  ['output', 'outputPrice'],
  ['cacheRead', 'cacheReadPrice'],
  ['cacheWrite', 'cacheWritePrice'],
];

export type CostResult =
  | { ok: true; total: number; currency: ReportedCurrency; billingCurrency: BillingCurrency }
  | { ok: false; reason: string };

export type UsageInput = Record<keyof Usage, string | null>;

export type UsageParseResult =
  | { ok: true; usage: Usage }
  | { ok: false; reason: string };

export function parseUsageInput(input: UsageInput): UsageParseResult {
  const usage = {} as Usage;
  for (const [key] of usagePricePairs) {
    const raw = input[key];
    if (raw === null || raw.trim() === '') {
      return { ok: false, reason: '所有 Token 用量都必须填写；零用量请明确填写 0。' };
    }
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < 0) {
      return { ok: false, reason: 'Token 用量必须是非负安全整数。' };
    }
    usage[key] = value;
  }
  return { ok: true, usage };
}

/** 按价格数字自身的币种（reportedCurrency）结算，缺价即 fail closed */
export function calculateMonthlyCost(model: ApiPrice, usage: Usage): CostResult {
  if (model.status !== 'verified') {
    return { ok: false, reason: '该价格不可用，不能用于成本计算。' };
  }
  let total = 0;
  for (const [usageKey, priceKey] of usagePricePairs) {
    const tokens = usage[usageKey];
    if (!Number.isFinite(tokens) || tokens < 0) {
      return { ok: false, reason: 'Token 用量必须是有限的非负数。' };
    }
    const price = model[priceKey];
    if (tokens > 0 && price === null) {
      return { ok: false, reason: `${usageKey} 暂无可用价格，不能完整计算。` };
    }
    total += (tokens / 1_000_000) * (price ?? 0);
  }
  return { ok: true, total, currency: model.reportedCurrency, billingCurrency: model.billingCurrency };
}

/**
 * 单字段「账单币种原值」：USD 条目给美元数，CNY 条目给人民币数。
 * 排序只用它，保证「最便宜」是同一币种内的比较；聚合的 USD 报价按汇率折到账单币种，
 * 缺汇率时返回 null（排到同币种组末尾，不伪造 0）。
 */
export function billingValue(entry: ApiPrice, field: PriceField, fx: FxRate | null): number | null {
  return convertAmount(entry[field], entry.reportedCurrency, entry.billingCurrency, fx);
}

export type ApiFilters = {
  query?: string;
  provider?: string;
  /** 'all' 或空字符串表示不按溯源过滤 */
  provenance?: Provenance | 'all';
  /** 国内 / 国外筛选；需要配合 regionByProviderId 才生效 */
  region?: RegionFilter;
  sortBy?: SortKey;
  order?: SortOrder;
  /**
   * 评分与性价比查表（issue #5）。不传则 intelligence / value 两键退化为「全部空值」，
   * 排序结果与不排序一致 —— 不允许在缺数据时伪造 0 把未评测的排到最前。
   */
  scores?: Readonly<Record<string, RowScoreLike>>;
};

/** 排序只需要这两个数，不必依赖完整的 RowScore 类型 */
export type RowScoreLike = { score: number; costPerPoint: number } | null;

/** 美元组在前、人民币组在后：跨币种不合并出一个「最便宜」榜首 */
const currencyRank = (currency: BillingCurrency): number => (currency === 'USD' ? 0 : 1);

/** 取排序用的可比值：价格按账单币种原值，上下文与厂商名各自取值 */
function sortValue(
  entry: ApiPrice,
  key: SortKey,
  fx: FxRate | null,
  scores?: Readonly<Record<string, RowScoreLike>>,
): number | string | null {
  if (key === 'contextTokens') return entry.contextTokens;
  if (key === 'provider') return entry.provider;
  if (key === 'intelligence') {
    const s = scores?.[entry.id];
    return s && Number.isFinite(s.score) ? s.score : null;
  }
  if (key === 'value') {
    // 性价比 = 每分智能成本，越小越划算；NaN（有分无价）按空值处理
    const s = scores?.[entry.id];
    return s && Number.isFinite(s.costPerPoint) ? s.costPerPoint : null;
  }
  return billingValue(entry, key, fx);
}

/** 排序比较：数值/字符串通用，null 与空值一律排在组末，不伪造 0 */
function compareValues(a: number | string | null, b: number | string | null): number {
  const aEmpty = a === null || a === '';
  const bEmpty = b === null || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'zh-CN');
}

/**
 * 筛选 + 排序。口径（顺序即优先级）：
 * 1) 按账单币种分组（USD 组 → CNY 组），**跨币种不直接比较**；
 * 2) 组内有价条目在前，pending 在后；
 * 3) 组内按选中字段排序，order 控制升降（'desc' 反转组内顺序，但不打乱分组）；
 * 4) 空值置后，同值按模型名。
 */
export function filterAndSortApiPrices(
  models: readonly ApiPrice[],
  filters: ApiFilters = {},
  fx: FxRate | null = null,
  regionByProviderId: Record<string, 'cn' | 'intl'> = {},
): ApiPrice[] {
  const query = (filters.query ?? '').trim().toLocaleLowerCase('zh-CN');
  const provider = filters.provider ?? '';
  const provenance = filters.provenance ?? 'all';
  const region = filters.region ?? 'all';
  const sortBy = filters.sortBy ?? 'inputPrice';
  const order = filters.order ?? 'asc';
  const dir = order === 'desc' ? -1 : 1;

  return models
    .filter((item) => !provider || item.providerId === provider)
    .filter((item) => provenance === 'all' || item.provenance === provenance)
    .filter((item) => {
      // 显式筛地区时未知厂商 fail closed，不能同时落入国内与国外集合
      if (region === 'all') return true;
      const itemRegion = regionByProviderId[item.providerId];
      return itemRegion === region;
    })
    .filter((item) => {
      if (!query) return true;
      const haystack = `${item.provider} ${item.providerId} ${item.model}`.toLocaleLowerCase('zh-CN');
      return haystack.includes(query);
    })
    .sort((a, b) => {
      // 分组优先：desc 也不能把 CNY 组翻到 USD 组前面
      if (a.billingCurrency !== b.billingCurrency) {
        return currencyRank(a.billingCurrency) - currencyRank(b.billingCurrency);
      }
      if (a.status !== b.status) return a.status === 'verified' ? -1 : 1;
      const aValue = a.status === 'verified' ? sortValue(a, sortBy, fx, filters.scores) : null;
      const bValue = b.status === 'verified' ? sortValue(b, sortBy, fx, filters.scores) : null;
      const cmp = compareValues(aValue, bValue);
      // 空值不参与方向反转，否则 desc 时会把「缺价」顶到组首
      if (cmp !== 0 && (aValue === null || bValue === null || aValue === '' || bValue === '')) return cmp;
      if (cmp !== 0) return cmp * dir;
      return a.model.localeCompare(b.model, 'zh-CN');
    });
}
