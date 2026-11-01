import type { Provider, TokenPlan } from './schema';

/**
 * 判断一条套餐是不是「国际版」。
 *
 * 为什么不能只看币种：国内厂商在国内站也用美元计价的情况是可能出现的，
 * 反过来国际版也可能有人用人民币报价。真正决定它是国际版的因素只有两个 ——
 * 条目自己标了 market、或者它挂在渠道/国际品牌名下。
 * 缺省（没标 market）一律按国内版处理，这样已有条目不必逐条补字段。
 */
export function isInternational(plan: TokenPlan): boolean {
  return plan.market === 'international';
}

/**
 * 国内厂商在国内卖的产品必须以人民币挂牌。
 * 这条只对「国内厂商 + domestic」成立；国际版条目用什么币种是厂商自己的事。
 */
export function mustPriceInCny(plan: TokenPlan, provider: Provider | undefined): boolean {
  if (!isInternational(plan)) return provider?.region === 'cn';
  return false;
}

/** 违反「国内版必须人民币」的条目，供测试与数据校验使用 */
export function findCurrencyViolations(
  plans: TokenPlan[],
  providers: Provider[],
): TokenPlan[] {
  const byId = new Map(providers.map((p) => [p.id, p]));
  return plans.filter((plan) => mustPriceInCny(plan, byId.get(plan.providerId))
    && plan.billingCurrency !== 'CNY');
}

/** 徽章文案：international 才出徽章，domestic 返回 null */
export function marketBadge(plan: TokenPlan): string | null {
  return isInternational(plan) ? '国际版' : null;
}
