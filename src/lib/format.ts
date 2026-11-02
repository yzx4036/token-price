import type { ApiPrice, BillingCurrency, FxRate, Provenance, ReportedCurrency } from './schema';
import { PRICE_PLACEHOLDER, convertAmount, formatCny, formatRate, fxNote } from './fx';
import { AGGREGATE_NOTE, OFFICIAL_PRICE_LABEL, PROVENANCE_AGGREGATE, PROVENANCE_OFFICIAL } from './copy';

export const PRICE_PLACEHOLDER_TEXT = PRICE_PLACEHOLDER;

export function formatUsdPrice(price: number | null): string {
  if (price === null || !Number.isFinite(price) || price < 0) return PRICE_PLACEHOLDER;
  return `$${price.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
}

export function formatCnyPrice(price: number | null): string {
  return formatCny(price);
}

/**
 * 订阅套餐月费主行。
 * 同一列里 $20 与 ¥40.00 并列会对不齐，所以整数不补小数位、有小数才显示。
 * 只用于统计型价格（月费）；API 单价 ¥7.30 是有效小数，不能套这条。
 */
export function formatMonthly(price: number, currency: 'CNY' | 'USD'): string {
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${symbol}${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function formatContextTokens(tokens: number | null): string {
  if (tokens === null || !Number.isFinite(tokens) || tokens <= 0) return PRICE_PLACEHOLDER;
  return `${(tokens / 1_000_000).toLocaleString('en-US')}M`;
}

/** 首页摘要一行：只用于已核验条目，缺价同样走占位文案 */
export function formatPricePair(inputPrice: number | null, outputPrice: number | null): string {
  return `输入 ${formatUsdPrice(inputPrice)}/1M · 输出 ${formatUsdPrice(outputPrice)}/1M`;
}

/** 展示层只需要的最小字段集：币种两个字段都可缺省，缺省时按「官方 · 账单币种」处理 */
export type PriceLabelEntry = {
  billingCurrency: BillingCurrency;
  reportedCurrency?: ReportedCurrency;
  provenance?: Provenance;
};

function reportedOf(entry: PriceLabelEntry): ReportedCurrency {
  return entry.reportedCurrency ?? entry.billingCurrency;
}

/** 「按 6.6696 汇率估算（2026-10-31）」；缺汇率时明说缺，不给数字 */
function rateEstimate(fx: FxRate | null): string {
  if (!fx) return '汇率数据缺失，无法折算人民币';
  return `按 ${formatRate(fx.rate)} 汇率估算（${fx.date}）`;
}

/** 缺汇率时美元条目的副行文案：主行照常给美元，人民币位置明说缺，不给 0 */
const USD_ESTIMATE_MISSING = '汇率数据缺失，暂不给人民币估算';

/** 美元金额（计算器 / 摘要用）：至少两位小数，最多四位，避免小额显示成 $0.00 */
export function formatUsdAmount(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount) || amount < 0) return PRICE_PLACEHOLDER;
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

type DisplayOptions = { provenance?: Provenance; billingCurrency?: BillingCurrency };

/**
 * 表内单个价格的单一文本形态（首页摘要、Plan 月费等）。
 * 主币种永远是账单币种：USD 账单给美元标价 + 估算人民币，CNY 账单给人民币。
 */
export function formatDualPrice(
  price: number | null,
  currency: ReportedCurrency,
  fx: FxRate | null,
  options: DisplayOptions = {},
): string {
  if (price === null || !Number.isFinite(price) || price < 0) return `${PRICE_PLACEHOLDER}/1M`;
  const billing = options.billingCurrency ?? currency;
  const provenance = options.provenance ?? 'official';
  const aggregateTag = provenance === 'aggregate' ? ' · 聚合数据' : '';

  if (currency === billing) {
    if (billing === 'CNY') {
      return `${formatCnyPrice(price)}/1M · ${provenance === 'aggregate' ? PROVENANCE_AGGREGATE : OFFICIAL_PRICE_LABEL}`;
    }
    if (!fx) return `${formatUsdPrice(price)}/1M · ${USD_ESTIMATE_MISSING}${aggregateTag}`;
    return `${formatUsdPrice(price)}/1M · ≈ ${formatCnyPrice(price * fx.rate)}（${fxNote(fx)}）${aggregateTag}`;
  }

  // 跨币种只可能出现在聚合条目上：一律标折算，绝不出现「官方标价」
  const converted = convertAmount(price, currency, billing, fx);
  if (converted === null) {
    if (billing === 'USD') return `${formatUsdPrice(price)}/1M · ${USD_ESTIMATE_MISSING}${aggregateTag}`;
    return `${PRICE_PLACEHOLDER}/1M · 汇率数据缺失，无法折算人民币`;
  }
  if (billing === 'CNY') {
    return `${formatCnyPrice(converted)}/1M · 聚合数据 · 聚合源 USD 折算 · ${rateEstimate(fx)}`;
  }
  return `${formatUsdPrice(converted)}/1M · 聚合数据 · ${rateEstimate(fx)}`;
}

export type PriceCell = { main: string; sub: string };

/**
 * 把币种副行末尾那段「不该断开的尾巴」切出来，交给视图用 `white-space: nowrap` 包住。
 *
 * 起因：副行形如 `≈ ¥0.25 · 按 6.6696 估算（2026-10-31）`，在窄列里浏览器会在
 * 连字符处折行，把「（2026-10-」和「31）」拆到两行 —— 日期被劈成两半，读起来像坏数据。
 * CSS 没有「禁止在连字符后折行」的属性（`word-break: keep-all` 只管 CJK），
 * 所以只能把这一段单独包成不可断元素。
 *
 * 只切字符串、不改字符串本身：数据里仍是 `YYYY-MM-DD`，复制出来不会变成非 ASCII 连字符。
 * 优先切尾部全角括号（日期多半在里面），其次切裸的 `YYYY-MM-DD`（如「核验于 2026-10-31」）。
 */
export function splitUnbreakableTail(text: string): { head: string; tail: string } {
  const paren = text.match(/（[^（）]*）$/);
  if (paren?.index !== undefined) return { head: text.slice(0, paren.index), tail: paren[0] };
  const date = text.match(/\d{4}-\d{2}-\d{2}$/);
  if (date?.index !== undefined) return { head: text.slice(0, date.index), tail: date[0] };
  return { head: text, tail: '' };
}

/**
 * 表格单元格拆成两行：主行按**账单币种**给标价，副行给另一种币种的估算/折算标注。
 * - USD 账单：主行 `$x`；副行只能是 `≈ ¥y · 按 … 估算（日期）`；缺汇率时主行照旧、副行明说缺失。
 * - CNY 账单：主行 `¥x`，官方条目副行「官方标价」；聚合（报价 USD）副行标「折算」，永不出现「官方标价」。
 * 页面与测试都走这一个函数，避免各页各写一套格式化。
 */
export function priceCells(
  entry: Pick<ApiPrice, 'inputPrice' | 'outputPrice' | 'cacheReadPrice' | 'cacheWritePrice'> & PriceLabelEntry,
  fx: FxRate | null,
): Record<'input' | 'output' | 'cacheRead' | 'cacheWrite', PriceCell> {
  const reported = reportedOf(entry);
  const billing = entry.billingCurrency;
  const provenance = entry.provenance ?? 'official';
  const aggregatePrefix = provenance === 'aggregate' ? '聚合数据 · ' : '';

  const build = (price: number | null): PriceCell => {
    if (price === null || !Number.isFinite(price) || price < 0) return { main: PRICE_PLACEHOLDER, sub: '' };

    if (billing === 'CNY') {
      if (reported === 'CNY') {
        return { main: formatCnyPrice(price), sub: provenance === 'aggregate' ? PROVENANCE_AGGREGATE : OFFICIAL_PRICE_LABEL };
      }
      // 聚合源以 USD 发布：人民币是折算值，禁止「官方标价」；国内厂商行口径不用「估算」措辞
      const converted = convertAmount(price, reported, billing, fx);
      if (converted === null) return { main: PRICE_PLACEHOLDER, sub: `${aggregatePrefix}汇率数据缺失，无法折算人民币` };
      return {
        main: formatCnyPrice(converted),
        sub: `聚合数据 · 聚合源 USD 折算 · 汇率 ${formatRate(fx!.rate)}（${fx!.date}）`,
      };
    }

    // USD 账单：主行必须是美元标价
    if (reported === 'USD') {
      if (!fx) return { main: formatUsdPrice(price), sub: `${aggregatePrefix}${USD_ESTIMATE_MISSING}` };
      return {
        main: formatUsdPrice(price),
        sub: `${aggregatePrefix}≈ ${formatCnyPrice(price * fx.rate)} · 按 ${formatRate(fx.rate)} 估算（${fx.date}）`,
      };
    }

    // 罕见组合（账单 USD、报价 CNY）：折成美元展示，原文附后，不冒充官方美元挂牌
    const converted = convertAmount(price, reported, billing, fx);
    if (converted === null) return { main: PRICE_PLACEHOLDER, sub: `${aggregatePrefix}汇率数据缺失，无法折算美元` };
    return {
      main: formatUsdPrice(converted),
      sub: `${aggregatePrefix}按 ${formatRate(fx!.rate)} 折算（${fx!.date}）· 原文 ${formatCnyPrice(price)}`,
    };
  };

  return {
    input: build(entry.inputPrice),
    output: build(entry.outputPrice),
    cacheRead: build(entry.cacheReadPrice),
    cacheWrite: build(entry.cacheWritePrice),
  };
}

/**
 * 行级「计价说明」：把来源等级与币种口径合成一句话。
 * 聚合条目一律不出现在「官方标价」语境里；美元条目说明账单以美元为准。
 */
export function priceBasisLabel(entry: PriceLabelEntry, fx: FxRate | null): string {
  const reported = reportedOf(entry);
  if ((entry.provenance ?? 'official') === 'aggregate') {
    if (entry.billingCurrency === 'CNY' && reported === 'USD') {
      return `聚合数据 · 聚合源以 USD 发布，折算自厂商人民币挂牌价，${AGGREGATE_NOTE}`;
    }
    return reported === 'USD'
      ? `聚合数据 · 聚合源以 USD 发布 · ${rateEstimate(fx)} · ${AGGREGATE_NOTE}`
      : `聚合数据 · ${AGGREGATE_NOTE}`;
  }
  if (reported === 'CNY') return `${OFFICIAL_PRICE_LABEL} · 人民币挂牌，无需换算`;
  return `${OFFICIAL_PRICE_LABEL} · 美元挂牌 · ${rateEstimate(fx)}`;
}


export function provenanceLabel(entry: Pick<ApiPrice, 'provenance' | 'verifiedAt' | 'aggregateFetchedAt' | 'aggregateSource'>): string {
  if (entry.provenance === 'official') return `${PROVENANCE_OFFICIAL} · ${entry.verifiedAt}`;
  const fetched = entry.aggregateFetchedAt ?? entry.verifiedAt;
  return `聚合数据 · ${AGGREGATE_NOTE} · ${entry.aggregateSource ?? '聚合源'} · 抓取于 ${fetched}`;
}

export function provenanceShort(provenance: Provenance): string {
  return provenance === 'official' ? PROVENANCE_OFFICIAL : PROVENANCE_AGGREGATE;
}
