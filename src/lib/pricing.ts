import { convertAmount } from './fx';
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
    return { ok: false, reason: '该价格尚未核验，不能用于成本计算。' };
  }
  let total = 0;
  for (const [usageKey, priceKey] of usagePricePairs) {
    const tokens = usage[usageKey];
    if (!Number.isFinite(tokens) || tokens < 0) {
      return { ok: false, reason: 'Token 用量必须是有限的非负数。' };
    }
    const price = model[priceKey];
    if (tokens > 0 && price === null) {
      return { ok: false, reason: `${usageKey} 暂无已核验价格，不能完整计算。` };
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
  sortBy?: PriceField;
};

/** 美元组在前、人民币组在后：跨币种不合并出一个「最便宜」榜首 */
const currencyRank = (currency: BillingCurrency): number => (currency === 'USD' ? 0 : 1);

/**
 * 筛选 + 排序。口径：
 * 1) 已核验在前，pending 在后；
 * 2) 先按账单币种分组（USD 组 → CNY 组），跨币种不直接比较；
 * 3) 组内按账单币种原值升序（USD 条目按美元值，CNY 条目按人民币值）；
 * 4) 空值置后，同值按模型名。
 */
export function filterAndSortApiPrices(
  models: readonly ApiPrice[],
  filters: ApiFilters = {},
  fx: FxRate | null = null,
): ApiPrice[] {
  const query = (filters.query ?? '').trim().toLocaleLowerCase('zh-CN');
  const provider = filters.provider ?? '';
  const provenance = filters.provenance ?? 'all';
  const sortBy = filters.sortBy ?? 'inputPrice';
  return models
    .filter((item) => !provider || item.providerId === provider)
    .filter((item) => provenance === 'all' || item.provenance === provenance)
    .filter((item) => {
      if (!query) return true;
      const haystack = `${item.provider} ${item.providerId} ${item.model}`.toLocaleLowerCase('zh-CN');
      return haystack.includes(query);
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'verified' ? -1 : 1;
      if (a.billingCurrency !== b.billingCurrency) {
        return currencyRank(a.billingCurrency) - currencyRank(b.billingCurrency);
      }
      const aValue = a.status === 'verified' ? billingValue(a, sortBy, fx) : null;
      const bValue = b.status === 'verified' ? billingValue(b, sortBy, fx) : null;
      if (aValue === null && bValue === null) return a.model.localeCompare(b.model, 'zh-CN');
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      if (aValue === bValue) return a.model.localeCompare(b.model, 'zh-CN');
      return aValue - bValue;
    });
}
