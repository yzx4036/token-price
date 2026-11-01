import type { ApiPrice, FxRate, Provider, TokenPlan } from './schema';

export type PriceStats = {
  /** 计价口径条数（表格行数） */
  entries: number;
  /** 唯一「厂商 + 模型」个数 */
  models: number;
  providers: number;
  official: number;
  aggregate: number;
  verified: number;
  pending: number;
  /** 厂商实际账单币种为 CNY 的条目数 */
  cnyBilling: number;
  /** 厂商实际账单币种为 USD 的条目数 */
  usdBilling: number;
  /** 价格数字本身以 CNY 表达的条目数 */
  cnyReported: number;
  /** 价格数字本身以 USD 表达的条目数（= 需要汇率换算才能给出人民币值） */
  usdReported: number;
  /** 需要汇率换算的条目占比（0–100，保留一位小数），按 reportedCurrency 计算 */
  reportedUsdShare: number;
};

const roundShare = (part: number, total: number): number =>
  total === 0 ? 0 : Math.round((part / total) * 1000) / 10;

/**
 * 页面与 CLI verify 共用同一份统计口径，避免两处各写一份数字。
 * 账单币种（billingCurrency）与报价币种（reportedCurrency）分开统计：
 * 聚合源对国内厂商也以 USD 发布，两者不一致是常态，不能混为一谈。
 */
export function computeStats(entries: readonly ApiPrice[]): PriceStats {
  const providers = new Set<string>();
  const models = new Set<string>();
  let official = 0;
  let aggregate = 0;
  let verified = 0;
  let pending = 0;
  let cnyBilling = 0;
  let usdBilling = 0;
  let cnyReported = 0;
  let usdReported = 0;
  for (const entry of entries) {
    providers.add(entry.providerId);
    models.add(`${entry.providerId}::${entry.model}`);
    if (entry.provenance === 'official') official += 1;
    else aggregate += 1;
    if (entry.status === 'verified') verified += 1;
    else pending += 1;
    if (entry.billingCurrency === 'CNY') cnyBilling += 1;
    else usdBilling += 1;
    if (entry.reportedCurrency === 'CNY') cnyReported += 1;
    else usdReported += 1;
  }
  return {
    entries: entries.length,
    models: models.size,
    providers: providers.size,
    official,
    aggregate,
    verified,
    pending,
    cnyBilling,
    usdBilling,
    cnyReported,
    usdReported,
    reportedUsdShare: roundShare(usdReported, entries.length),
  };
}

export type ProviderCoverage = {
  providerId: string;
  nameZh: string;
  nameEn: string;
  region: Provider['region'];
  pricingUrl: string;
  website: string;
  entries: number;
  official: number;
  aggregate: number;
  /** 该厂商已收录的订阅套餐档位数（用于区分「没录 API 价」和「什么都没录」） */
  planCount: number;
  /** 官方核验占比（0–100，保留一位小数） */
  officialShare: number;
};

/**
 * 各厂商溯源覆盖率。
 *
 * `planCount` 必须一起统计：百度千帆 / GitHub Copilot / OpenCode 只上架了订阅套餐、
 * 没有按量 API 价格条目。只按 API 条目统计会把它们渲染成「条目 0 · 官方占比 0%」，
 * 读者会以为是数据缺失，实际上是这两类价格本来就分开收录。
 */
export function computeProviderCoverage(
  entries: readonly ApiPrice[],
  providers: readonly Provider[],
  plans: readonly TokenPlan[] = [],
): ProviderCoverage[] {
  return providers
    .map((provider) => {
      const own = entries.filter((entry) => entry.providerId === provider.id);
      const official = own.filter((entry) => entry.provenance === 'official').length;
      const aggregate = own.length - official;
      return {
        providerId: provider.id,
        nameZh: provider.nameZh,
        nameEn: provider.nameEn,
        region: provider.region,
        pricingUrl: provider.pricingUrl,
        website: provider.website,
        entries: own.length,
        official,
        aggregate,
        planCount: plans.filter((plan) => plan.providerId === provider.id).length,
        officialShare: own.length === 0 ? 0 : Math.round((official / own.length) * 1000) / 10,
      };
    })
    .sort((a, b) => b.entries - a.entries || a.nameZh.localeCompare(b.nameZh, 'zh-CN'));
}

export type CheapestApiInput = { entry: ApiPrice; value: number } | null;

function inputBillingValue(entry: ApiPrice, fx: FxRate | null): number | null {
  const price = entry.inputPrice;
  if (price === null) return null;
  if (entry.reportedCurrency === entry.billingCurrency) return price;
  if (!fx) return null;
  return entry.reportedCurrency === 'USD' ? price * fx.rate : price / fx.rate;
}

export type ApiConclusionScope = {
  /** 参与结论卡计算的条目数（official 且非免费档） */
  considered: number;
  /** 因是聚合数据被排除的条数 */
  excludedAggregate: number;
  /** 因价格 0（免费档）被排除的条数 */
  excludedFree: number;
};

/**
 * 是否参与「最便宜」类结论：官方核验 + 有正价格（非免费档）。
 *
 * 判定放在 lib 而不是视图：视图只负责展示，不直接对 nullable 价格做业务判断
 * （tests/format.test.ts 有守卫盯着这件事）。
 */
export function isConcludingEntry(entry: Pick<ApiPrice, 'provenance' | 'inputPrice'>): boolean {
  return entry.provenance === 'official' && entry.inputPrice !== null && entry.inputPrice > 0;
}

/**
 * 结论卡口径（methodology 已承诺，代码必须一致）：
 *
 * 1) **只取 official**。聚合数据未逐条核过官方页，数字可能过期或口径不同，
 *    不能用来宣布「最便宜」——否则页面上承诺的「最便宜类结论只基于 official」
 *    就成了一句空话（2026-11-01 实测确实出现过聚合条目夺冠）。
 * 2) **排除 0 价免费档**。免费档占满榜首后三张卡全是 0，回答不了
 *    「贵多少」；免费档另有专门的位置展示，不靠这三张卡。
 */
export function computeApiConclusions(
  entries: readonly ApiPrice[],
  regionByProviderId: Record<string, Provider['region']>,
  fx: FxRate | null,
): { cn: CheapestApiInput; intl: CheapestApiInput; entries: number; scope: ApiConclusionScope } {
  let excludedAggregate = 0;
  let excludedFree = 0;
  const considered: ApiPrice[] = [];
  for (const entry of entries) {
    if (isConcludingEntry(entry)) {
      considered.push(entry);
      continue;
    }
    if (entry.provenance !== 'official') excludedAggregate += 1;
    else excludedFree += 1;
  }

  const cheapest = (region: Provider['region']): CheapestApiInput => {
    let best: CheapestApiInput = null;
    for (const entry of considered) {
      if (regionByProviderId[entry.providerId] !== region) continue;
      const value = inputBillingValue(entry, fx);
      if (value === null) continue;
      if (!best || value < best.value) best = { entry, value };
    }
    return best;
  };
  return {
    cn: cheapest('cn'),
    intl: cheapest('intl'),
    entries: entries.length,
    scope: { considered: considered.length, excludedAggregate, excludedFree },
  };
}

export type CheapestPlan = { plan: TokenPlan; price: number; tiedCount: number } | null;

export type PlanConclusionScope = {
  /** 参与结论卡计算的档位数（有价格且 > 0） */
  considered: number;
  /** 因免费或未标价被排除的档位数 */
  excludedFree: number;
};

/**
 * 套餐结论卡口径：与 API 页对齐，**排除 0 元免费档**。
 *
 * 免费档（Claude Free / ChatGPT Free / CodeBuddy 体验版…）会把「最低月费」
 * 压成 $0 / ¥0，读者拿不到任何有用信息。免费档仍在表格与详情里完整保留，
 * 只是不参与「最低付费月费」这个结论。
 */
export function computePlanConclusions(
  plans: readonly TokenPlan[],
): { CNY: CheapestPlan; USD: CheapestPlan; plans: number; scope: PlanConclusionScope } {
  const paid = plans.filter((plan) => plan.monthlyPrice !== null && plan.monthlyPrice > 0);
  const excludedFree = plans.length - paid.length;
  const cheapest = (currency: TokenPlan['billingCurrency']): CheapestPlan => {
    let best: CheapestPlan = null;
    for (const plan of paid) {
      if (plan.billingCurrency !== currency) continue;
      const price = plan.monthlyPrice as number;
      if (!best || price < best.price) best = { plan, price, tiedCount: 0 };
    }
    if (!best) return null;
    // 并列最低价要数出来：只报一家会让读者以为另一家更贵
    const tiedCount = paid.filter(
      (plan) => plan.billingCurrency === currency && plan.monthlyPrice === best.price,
    ).length;
    return { ...best, tiedCount };
  };
  return {
    CNY: cheapest('CNY'),
    USD: cheapest('USD'),
    plans: plans.length,
    scope: { considered: paid.length, excludedFree },
  };
}
