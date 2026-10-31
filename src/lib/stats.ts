import type { ApiPrice, Provider } from './schema';

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
  /** 官方核验占比（0–100，保留一位小数） */
  officialShare: number;
};

export function computeProviderCoverage(
  entries: readonly ApiPrice[],
  providers: readonly Provider[],
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
        officialShare: own.length === 0 ? 0 : Math.round((official / own.length) * 1000) / 10,
      };
    })
    .sort((a, b) => b.entries - a.entries || a.nameZh.localeCompare(b.nameZh, 'zh-CN'));
}
