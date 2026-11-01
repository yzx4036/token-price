export declare const BLEND_INPUT_WEIGHT: number;

export interface ApiEntryLike {
  id: string;
  provider: string;
  model: string;
  inputPrice: number | null;
  outputPrice: number | null;
  billingCurrency: 'CNY' | 'USD';
}

export interface BenchmarkRow {
  aaSlug: string;
  aaName: string;
  creator: string;
  score: number;
  tierUsed: string;
  isEstimated?: boolean | null;
  contextWindowTokens?: number | null;
}

export interface BenchmarkBasis {
  $comment?: string;
  source: { name: string; url: string; fetchedAt: string; note?: string };
  methodology: Record<string, string>;
  benchmarks: BenchmarkRow[];
  mapping: Record<string, string>;
}

export interface ModelScore {
  aaSlug: string;
  aaName: string;
  creator: string;
  score: number;
  tierUsed: string;
  isEstimated?: boolean | null;
}

export interface EntryScore {
  score: number;
  aaSlug: string;
  tierUsed: string;
  baseModel: string;
}

export interface BenchmarkDocument {
  generatedAt: string;
  source: BenchmarkBasis['source'];
  methodology: Record<string, string>;
  coverage: {
    uniqueModels: number;
    scoredModels: number;
    unscoredModels: number;
    apiEntries: number;
    apiEntriesScored: number;
    danglingMappings: string[];
  };
  models: Record<string, ModelScore | null>;
  byEntryId: Record<string, EntryScore | null>;
}

export interface ValueScore {
  pricePerMillion: number;
  costPerScorePoint: number;
  currency: 'CNY' | 'USD';
}

export declare function baseModelName(model: string): string;

export declare function computeCoverage(
  entries: ApiEntryLike[],
): { uniqueModels: number };

export declare function buildBenchmarkDocument(
  basis: BenchmarkBasis,
  apiEntries: ApiEntryLike[],
): BenchmarkDocument;

export declare function blendedPricePerMillion(entry: ApiEntryLike): number | null;

export declare function computeValueScore(
  entry: ApiEntryLike,
  score: number,
): ValueScore | null;

export declare function rankByValue<T extends { entry: ApiEntryLike; score: number }>(
  rows: T[],
): Record<'CNY' | 'USD', (T & { value: ValueScore })[]>;

/** 校验映射两端语义一致，返回不一致项（空数组=通过）。防「A 的分数安到 B 头上」。 */
export declare function findSemanticMismatches(basis: BenchmarkBasis): string[];
