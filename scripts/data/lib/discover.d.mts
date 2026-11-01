export interface DiscoverExample {
  model: string;
  input: number;
  output: number;
}

export interface DiscoverUnknown {
  key: string;
  name: string;
  pricedModels: number;
  reseller: boolean;
  families: number;
  examples: DiscoverExample[];
}

export interface DiscoverSqueezed {
  providerId: string;
  provider: string;
  limit: number;
  candidates: number;
  droppedCount: number;
  dropped: string[];
}

export interface DiscoverResult {
  ok: true;
  readOnly: true;
  pulled: boolean;
  source: string;
  sourceUrl: string;
  cachePath: string;
  aggregateProviders: number;
  coveredProviders: number;
  unknownTotal: number;
  unknownReal: number;
  unknown: DiscoverUnknown[];
  squeezed: DiscoverSqueezed[];
}

export function runDiscoverCommand(options?: {
  now?: Date;
  snapshotFile?: string | null;
  allowPull?: boolean;
  topN?: number;
}): Promise<DiscoverResult>;

export function formatDiscoverReport(result: DiscoverResult): string;
