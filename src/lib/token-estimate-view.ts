/**
 * Token Plan 额度 → 实际可用 token 量的前端接入口（issue #8）。
 *
 * 九档可信度里只有前四档出数值，后五档如实标「无法折算」。
 * **三档必须视觉可分**：读者看到「451M」要能立刻知道是官方口径还是我们估的。
 */

export type TierId =
  | 'official_currency'
  | 'official_credit_rate'
  | 'official_token_table'
  | 'derived_from_currency'
  | 'unknown_rate'
  | 'count_only'
  | 'relative_only'
  | 'qualitative'
  | 'unavailable';

export interface TierMeta {
  label: string;
  precision: 'exact' | 'near_exact' | 'none';
  note: string;
}

export type ValueKind = 'official_total' | 'official_blend' | 'estimated_blend';

export interface PlanEstimate {
  planId: string;
  tier: TierId;
  tierMeta: TierMeta;
  basisModel: string | null;
  sourceUrl: string;
  method: string;
  inputOnlyMillion: number | null;
  outputOnlyMillion: number | null;
  blendedMillion: number | null;
  valueKind: ValueKind | null;
  monthlyMillion: number | null;
  weeklyMinMillion?: number;
  weeklyMaxMillion?: number;
}

export interface TokenEstimatesDoc {
  generatedAt: string;
  conventions: {
    blendRatio: string;
    blendRatioNote: string;
    weekPerMonth: number;
    weekPerMonthNote: string;
  };
  coverage: {
    plans: number;
    withNumbers: number;
    withoutNumbers: number;
    byTier: Record<string, number>;
  };
  estimates: Record<string, PlanEstimate>;
}

/** 紧凑的数量表达：451M / 6,340M / 1.2M —— 表格里比「451,234,567」好读得多 */
export function formatMillion(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return '—';
  if (v >= 1000) return `${Math.round(v).toLocaleString('en-US')}M`;
  if (v >= 10) return `${Math.round(v)}M`;
  if (v >= 1) return `${v.toFixed(1)}M`;
  return `${v.toFixed(2)}M`;
}

/**
 * 每百万 token 的单位成本（套餐月费 ÷ 月可用量）。
 *
 * 定价纪律：nullable 的 price 字段只允许在 lib 的格式化/计算函数里读取，
 * 视图层不许直接碰 —— 有守护测试（tests/format.test.ts）钉着。
 * 所以这个函数必须留在这里，不能挪回组件里算。
 */
export function unitCost(monthlyPrice: number | null, est: PlanEstimate): number | null {
  const monthly = est.blendedMillion;
  if (monthly === null || !Number.isFinite(monthly) || monthly <= 0) return null;
  if (typeof monthlyPrice !== 'number') return null;
  return monthlyPrice / monthly;
}

/** 一步到位：给套餐行算好折算列的三段文案（视图只管排版） */
export function estimateCell(est: PlanEstimate | null, monthlyPrice: number | null): {
  main: string;
  sub: string;
  tier: 'exact' | 'near_exact' | 'none';
} {
  if (!est || est.blendedMillion === null) {
    return { main: '—', sub: est?.tierMeta.label ?? '无折算依据', tier: 'none' };
  }
  const unit = unitCost(monthlyPrice, est);
  const kind = valueKindLabel(est.valueKind);
  return {
    main: formatMillion(est.blendedMillion),
    sub: unit !== null ? `${unit.toFixed(3)}/M · ${kind}` : kind,
    tier: precisionOf(est.tier),
  };
}

/** 可信度徽章的文字与语气：exact=实心，near_exact=半实心，none=描边 */
export function precisionOf(tier: TierId): TierMeta['precision'] {
  switch (tier) {
    case 'official_currency':
    case 'official_token_table':
    case 'derived_from_currency':
      return 'exact';
    case 'official_credit_rate':
      return 'near_exact';
    default:
      return 'none';
  }
}

/** 每个取值口径对应的说明后缀，贴在数字旁边 */
export function valueKindLabel(kind: ValueKind | null): string {
  switch (kind) {
    case 'official_total':
      return '官方总量';
    case 'official_blend':
      return '官方折算率';
    case 'estimated_blend':
      return '估算';
    default:
      return '';
  }
}
