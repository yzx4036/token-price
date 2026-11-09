export interface PriceState {
  inputPrice: number | null; outputPrice: number | null;
  cacheReadPrice: number | null; cacheWritePrice: number | null;
  billingCurrency: string; provenance: unknown; verifiedAt: string | null;
}
export type Change = 'price' | 'currency' | 'new' | 'removed';
export interface Delta { change: Change; before: PriceState | null; after: PriceState | null }
export type HistoryEvent = { date: string; kind: 'baseline'; entries: Record<string, PriceState> }
  | { date: string; kind: 'delta'; entries: Record<string, Delta> };
export const HISTORY_SPLIT_THRESHOLD_LINES: number;
export const HISTORY_FILE: string;
export function extractPriceStates(entries: unknown): Record<string, PriceState>;
export function classifyChange(before: PriceState | null, after: PriceState | null): Change | null;
export function parseHistory(text: string): HistoryEvent[];
export function replayStates(events: HistoryEvent[]): Record<string, PriceState>;
export function buildSnapshot(events: HistoryEvent[], entries: unknown, date: string): HistoryEvent[];
export function runSnapshotCommand(options?: { entriesFile?: string; historyFile?: string; now?: Date }): { ok: true; written: boolean; events: number };
export function runReplayCommand(options?: { id?: string; historyFile?: string }): { ok: true; readOnly: true; id: string; history: { date: string; change: Change | 'baseline'; before: PriceState | null; after: PriceState | null }[] };
