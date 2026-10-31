import type { ApiPrice } from './schema';

export type Usage = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
};

export type PriceField = 'inputPrice' | 'outputPrice' | 'cacheReadPrice' | 'cacheWritePrice';

const usagePricePairs: ReadonlyArray<[keyof Usage, PriceField]> = [
  ['input', 'inputPrice'],
  ['output', 'outputPrice'],
  ['cacheRead', 'cacheReadPrice'],
  ['cacheWrite', 'cacheWritePrice'],
];

export type CostResult =
  | { ok: true; total: number }
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
  return { ok: true, total };
}

export function filterAndSortApiPrices(
  models: readonly ApiPrice[],
  query = '',
  provider = '',
  sortBy: PriceField = 'inputPrice',
): ApiPrice[] {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  return models
    .filter((item) => !provider || item.provider === provider)
    .filter((item) => !normalized || `${item.provider} ${item.model}`.toLocaleLowerCase('zh-CN').includes(normalized))
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'verified' ? -1 : 1;
      const aValue = a.status === 'verified' ? a[sortBy] : null;
      const bValue = b.status === 'verified' ? b[sortBy] : null;
      if (aValue === null && bValue === null) return a.model.localeCompare(b.model, 'zh-CN');
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      return aValue - bValue;
    });
}
