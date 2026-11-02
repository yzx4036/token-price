import type { BillingCurrency, FxRate } from './schema';

export const PRICE_PLACEHOLDER = '待核验';
export const FX_DISCLAIMER = '汇率非实时，仅用于横向比较';

/**
 * 四页（比价表 / 计算器 / 口径 / 来源）共用的免责句，只此一处定义。
 * 写死成一整句而不是各页各写一版，避免口径漂移。
 */
export const RATE_DISCLAIMER = '汇率随时变化，人民币数值为按某日汇率估算的参考值，不准确；最终账单以厂商原币种为准。';

/** 汇率标注文案：按 6.6696 估算（2026-10-31） */
export function formatRate(rate: number): string {
  return rate.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

export function fxNote(fx: FxRate | null): string {
  if (!fx) return '缺少汇率数据';
  return `按 ${formatRate(fx.rate)} 估算（${fx.date}）`;
}

export function fxSourceLine(fx: FxRate | null): string {
  if (!fx) return `汇率数据缺失：${FX_DISCLAIMER}`;
  return `汇率来源 ${fx.source}，抓取于 ${fx.fetchedAt.slice(0, 16).replace('T', ' ')} UTC（${fx.date}）`;
}

/**
 * 换算到人民币。CNY 原样返回（官方标价），USD 乘汇率。
 * 缺汇率时抛错，绝不返回 0 或静默使用历史常量。
 */
export function toCny(amount: number | null, currency: BillingCurrency, fx: FxRate | null): number | null {
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null;
  if (currency === 'CNY') return amount;
  if (!fx || !Number.isFinite(fx.rate) || fx.rate <= 0) {
    throw new Error('缺少可用汇率，无法换算人民币金额');
  }
  return amount * fx.rate;
}

/**
 * 币种间换算（展示与排序共用）：同币种原样返回；缺汇率或汇率非法返回 null。
 * 与 toCny 的区别是它不抛错——展示层要「美元照常显示、人民币明说缺失」，
 * 不能因为缺汇率把整行或整个计算打掉。
 */
export function convertAmount(
  amount: number | null,
  from: BillingCurrency,
  to: BillingCurrency,
  fx: FxRate | null,
): number | null {
  if (amount === null || !Number.isFinite(amount) || amount < 0) return null;
  if (from === to) return amount;
  if (!fx || !Number.isFinite(fx.rate) || fx.rate <= 0) return null;
  return from === 'USD' ? amount * fx.rate : amount / fx.rate;
}

export function formatCny(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount) || amount < 0) return PRICE_PLACEHOLDER;
  const digits = amount < 1 ? 4 : 2;
  return `¥${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}
