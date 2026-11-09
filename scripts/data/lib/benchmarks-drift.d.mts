export interface BenchmarksDriftResult {
  ok: true; readOnly: true; threshold: number;
  scoreChanges: { aaSlug: string; aaName: string; before: number; after: number; difference: number }[];
  tierChanges: { aaSlug: string; aaName: string; before: string; after: string }[];
  missingSlugs: { aaSlug: string; aaName: string }[];
}
export function compareBenchmarks(basis: unknown, snapshot: unknown): BenchmarksDriftResult;
export function runBenchmarksDriftCommand(options?: { basisFile?: string; cacheFile?: string }): BenchmarksDriftResult;
export function formatBenchmarksDriftReport(result: BenchmarksDriftResult): string;
