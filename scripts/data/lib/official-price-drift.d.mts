import type { ApiPrice } from '../../../src/lib/schema';

export interface OfficialPrice {
  providerId: string; model: string; condition: string; currency: 'CNY';
  input: number; output: number; cacheRead: number | null;
}
export interface OfficialPriceDiff {
  model: string; condition: string; field: string;
  recorded: number | string | OfficialPrice | null;
  official: number | string | OfficialPrice | null;
}
export interface OfficialProviderReport {
  providerId: string; url: string; httpStatus: number | null;
  parsedRows: number; baselineRows: number;
  status: 'unchanged' | 'changed' | 'unavailable';
  baselineHash: string | null; officialHash: string | null;
  diffs: OfficialPriceDiff[]; reason: string | null;
}
export interface OfficialPriceDriftResult {
  ok: true; readOnly: true; providers: OfficialProviderReport[];
}
export const OFFICIAL_PRICE_SOURCES: readonly Readonly<{ providerId: string; url: string }>[];
export function officialPriceBasis(entries: unknown, providerId: string): OfficialPrice[];
export function canonicalizePrices(rows: ReadonlyArray<Omit<OfficialPrice, 'input' | 'output' | 'cacheRead'> & {
  input: number | string; output: number | string; cacheRead: number | string | null;
}>): OfficialPrice[];
export function priceFingerprint(rows: Parameters<typeof canonicalizePrices>[0]): string;
export function parseDeepseekPrices(markdown: string, targets: OfficialPrice[]): OfficialPrice[];
export function parseAliyunPrices(markdown: string, targets: OfficialPrice[]): OfficialPrice[];
export function parseVolcenginePrices(markdown: string, targets: OfficialPrice[]): OfficialPrice[];
export function diffOfficialPrices(basis: OfficialPrice[], official: OfficialPrice[]): OfficialPriceDiff[];
export function runOfficialPriceDriftCommand(options?: {
  entriesFile?: string; entries?: ApiPrice[] | unknown; timeoutMs?: number;
  fetchPage?: (url: string, init: RequestInit) => Promise<{ status: number; text(): Promise<string> }>;
}): Promise<OfficialPriceDriftResult>;
export function formatOfficialPriceDriftReport(result: OfficialPriceDriftResult): string;
export function parseOfficialPriceDriftArgs(argv: string[]): { entriesFile?: string; timeoutMs?: number };
