export interface AAModel {
  slug: string; name: string; modelCreatorName: string;
  intelligenceIndex: number | null; contextWindowTokens: number | null;
  [key: string]: unknown;
}
export interface BenchmarkBasis {
  source?: unknown; methodology?: Record<string, string>;
  tierPolicy: { mode: 'highest-score' };
  benchmarks: { aaSlug: string; aaName: string; creator: string; score: number; tierUsed: string; [key: string]: unknown }[];
  mapping: Record<string, string>;
}
export interface AASnapshot { fetchedAt: string; modelCount: number; models: AAModel[]; source?: unknown }
export interface BenchmarkCandidatesDocument {
  generatedAt: string;
  source: { name: string; url: string; fetchedAt: string; modelCount: number };
  tierPolicy: { mode: 'highest-score' };
  candidates: { displayModel: string; aaSlug: string; aaName: string; creator: string; score: number;
    tierUsed: string; contextWindowTokens: number | null; inBasis: boolean }[];
}
export const AA_URL: string;
export const AA_CACHE_FILE: string;
export const BENCHMARK_BASIS_FILE: string;
export const CANDIDATES_FILE: string;
export function parseRscModels(html: string): AAModel[];
export function validateModels(models: unknown): AAModel[];
export function validateBasis(basis: unknown): BenchmarkBasis;
export function validateSnapshot(snapshot: unknown): AAModel[];
export function selectHighestTiers(models: unknown): Map<string, AAModel>;
export function tierFor(model: AAModel): string;
export function buildBenchmarkCandidates(basis: BenchmarkBasis, models: AAModel[], options?: {
  now?: Date; apiEntries?: { provenance: string; providerId: string; model: string }[];
}): BenchmarkCandidatesDocument;
export function writeBenchmarkDocuments(documents: [string, string][], options?: { rename?: (from: string, to: string) => void }): void;
export function runPullBenchmarksCommand(options?: {
  basisFile?: string; cacheFile?: string; candidatesFile?: string; entriesFile?: string;
  check?: boolean; now?: Date;
  fetchPage?: (url: string, options?: { headers: Record<string, string> }) => Promise<{ text(): Promise<string> }>;
}): Promise<{ ok: true; check: boolean; written: boolean; modelCount: number; candidateCount: number }>;
