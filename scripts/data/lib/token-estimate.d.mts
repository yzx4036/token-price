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

export type ValueKind = 'official_total' | 'official_blend' | 'estimated_blend';

export interface TierMeta {
  label: string;
  precision: 'exact' | 'near_exact' | 'none';
  note: string;
}

export declare const TIERS: Record<TierId, TierMeta>;

export interface CurrencyPrice {
  currency: 'CNY' | 'USD';
  inputPerM: number;
  outputPerM: number;
  sourceUrl: string;
}

export interface BasisRow {
  planId: string;
  tier: TierId;
  raw: Record<string, number> | null;
  basisModel: string | null;
  method: string;
  sourceUrl: string;
  creditToCny?: number;
  tokensPerCreditInput?: number;
  tokensPerCreditOutput?: number;
}

export interface TokenBasis {
  generatedAt: string;
  conventions: Record<string, unknown>;
  currencyPrices: Record<string, CurrencyPrice>;
  plans: BasisRow[];
}

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

export interface EstimatesDocument {
  generatedAt: string;
  conventions: Record<string, unknown>;
  coverage: {
    plans: number;
    withNumbers: number;
    withoutNumbers: number;
    byTier: Record<string, number>;
  };
  currencyPrices: Record<string, CurrencyPrice>;
  estimates: Record<string, PlanEstimate>;
}

export declare function computeEstimates(
  basis: TokenBasis,
  plansById: Map<string, unknown>,
): Map<string, PlanEstimate>;

export declare function buildDocument(
  basis: TokenBasis,
  plansById: Map<string, unknown>,
): EstimatesDocument;
