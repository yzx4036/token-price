import type { RegionFilter } from './filters';
import type { TokenPlan } from './schema';

export type PlanSortKey = 'monthlyPrice' | 'provider';
export type PlanSortOrder = 'asc' | 'desc';

/**
 * 按地区筛选套餐。显式选择地区时，未知厂商 fail closed，确保国内与国外
 * 是「全部」的互斥子集，不会因漏配而同时出现在两边。
 */
/**
 * 按地区筛选。
 *
 * 判定用的是「这条套餐卖给谁」，不是「厂商注册在哪」：
 * 国内厂商的国际版（智谱的 Z.AI、月之暗面的 kimi.ai）虽然 provider 是国内的，
 * 但它面向海外、以美元挂牌，把它算进「国内」会让读者以为国内也能买到 $18 的套餐。
 * 所以国际版一律归到国外侧，国内侧只留国内版。
 */
export function filterPlansByRegion(
  plans: readonly TokenPlan[],
  region: RegionFilter,
  regionByProviderId: Record<string, 'cn' | 'intl'>,
): TokenPlan[] {
  if (region === 'all') return [...plans];
  return plans.filter((item) => {
    const soldTo = item.market === 'international' ? 'intl' : regionByProviderId[item.providerId];
    return soldTo === region;
  });
}

/**
 * 套餐排序先固定 USD 组、再 CNY 组，方向只作用于组内。缺月费的条目
 * **永远排在所属币种组末尾**，不随 asc/desc 翻转——
 * 「缺价」跑到最前面会让读者误以为它最便宜。
 */
export function sortPlans(
  plans: readonly TokenPlan[],
  key: PlanSortKey,
  order: PlanSortOrder,
): TokenPlan[] {
  const dir = order === 'desc' ? -1 : 1;
  return [...plans].sort((a, b) => {
    if (a.billingCurrency !== b.billingCurrency) return a.billingCurrency === 'USD' ? -1 : 1;
    // 「缺价置后」优先于字段方向：升序降序都不允许缺价档位被顶到组首
    if (a.monthlyPrice === null && b.monthlyPrice === null) return a.plan.localeCompare(b.plan, 'zh-CN');
    if (a.monthlyPrice === null) return 1;
    if (b.monthlyPrice === null) return -1;
    if (key === 'provider') {
      const byName = a.provider.localeCompare(b.provider, 'zh-CN');
      if (byName !== 0) return byName * dir;
    }
    if (a.monthlyPrice === b.monthlyPrice) return a.plan.localeCompare(b.plan, 'zh-CN');
    return (a.monthlyPrice - b.monthlyPrice) * dir;
  });
}

/** 某币种下月费最低的一档（含免费档；0 元由调用方自行标注） */
export function cheapestPlanByCurrency(
  plans: readonly TokenPlan[],
  currency: 'CNY' | 'USD',
): { plan: TokenPlan; price: number } | null {
  let best: { plan: TokenPlan; price: number } | null = null;
  for (const item of plans) {
    if (item.billingCurrency !== currency) continue;
    const price = item.monthlyPrice;
    if (price === null) continue;
    if (!best || price < best.price) best = { plan: item, price };
  }
  return best;
}
