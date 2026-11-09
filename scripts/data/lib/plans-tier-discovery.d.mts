export interface TierEvidence {
  value: number;
  currency: string;
  kinds: string[];
  reasons: string[];
  snippet: string;
}
export interface TierCandidate {
  price: number;
  reason: string;
  snippet: string;
}
export interface TierLowConfidence {
  price: number;
  kinds: string[];
  reason: string;
  snippet: string;
}
export interface TierGroup {
  provider: string;
  providerId: string;
  url: string;
  reliable: boolean;
  reason?: string;
  recordedPrices: number[];
  pageMonthlyPrices: number[];
  hits: number[];
  removed: number[];
  merged: number[];
  candidates: TierCandidate[];
  lowConfidence: TierLowConfidence[];
  evidence: Record<string, number>;
  extras: Record<string, unknown>;
}
export interface TierDiscoveryResult {
  ok: true;
  readOnly: true;
  coverage: { total: number; consistent: number; lowOnly: number; unknown: number; anomalies: number; unavailable: number };
  groups: TierGroup[];
  candidates: Array<{ provider: string; providerId: string; url: string; price: number; recordedPrices: number[]; confidence: 'high'; action: string; reason: string }>;
  lowConfidence: Array<{ provider: string; providerId: string; url: string; price: number; recordedPrices: number[]; confidence: 'low'; action: string; reason: string; kinds: string[]; snippet: string }>;
  anomalies: Array<{ provider: string; providerId: string; url: string; value: number; reason: string; snippet: string; action: string }>;
  unavailable: Array<{ provider: string; providerId: string; url: string; httpStatus: number | null; kind: string; reason: string; evidence: unknown }>;
  removed: Array<{ provider: string; providerId: string; url: string; prices: number[]; pageMonthlyPrices: number[]; action: string }>;
  merged: Array<{ provider: string; providerId: string; url: string; prices: number[]; pageMonthlyPrices: number[]; action: string }>;
}
export function collectPriceTokens(raw: string): TierEvidence[];
export function classifyToken(token: Record<string, unknown>): { kind: string; reason: string };
export function foldTokens(tokens: TierEvidence[]): TierEvidence[];
export function parseVolcengineMonthly(raw: string): { derivedMonthly: number[]; crossChecked: number[]; placeholderNote: string | null } | null;
export function evaluateGroup(plans: unknown[], folded: TierEvidence[], extras?: Record<string, unknown>): TierGroup;
export function runPlansTierDiscoveryCommand(options?: { plans?: unknown[]; plansFile?: string; fetchPage?: (url: string) => Promise<unknown>; timeoutMs?: number }): Promise<TierDiscoveryResult>;
export function formatPlansTierDiscoveryReport(result: TierDiscoveryResult): string;
