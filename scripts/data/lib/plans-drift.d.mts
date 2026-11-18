export interface DriftPlanLike {
  id: string;
  plan: string;
  provider: string;
  monthlyPrice: number;
  billingCurrency: string;
  sourceUrl: string;
}

/** 一次抓取尝试（候选链上每一级的证据） */
export interface SourceAttempt {
  via: 'html' | 'md' | 'reader';
  url: string;
  status?: number;
  bytes?: number;
  priced?: boolean;
  /** 这一级解析出的价格 token 数（<2 视为弱证据，不作为定价页） */
  tokens?: number;
  error?: string;
}

export interface PlanSourcePage {
  raw?: string;
  text?: string;
  via?: 'html' | 'md' | 'reader';
  url?: string;
  contentType?: string | null;
  bytes?: number;
  tokens?: number;
  error?: string;
  attempts: SourceAttempt[];
}

export interface PlansDriftResult {
  ok: true;
  readOnly: true;
  checked: number;
  clean: number;
  drifted: Array<{
    id: string;
    plan: string;
    provider: string;
    recorded: string;
    pagePriceTokens: string[];
    url: string;
  }>;
  unknown: Array<{ id: string; plan: string; reason: string; url?: string; attempts?: SourceAttempt[] | null }>;
}

export function normalizePage(html: string): string;
export function extractPriceTokens(text: string): Set<string>;

/**
 * 抓取候选链：HTML → 官方 `.md` 变体 → 只读渲染代理。
 * 代理是外部依赖，必须由调用方显式开启（CLI 的 `--reader`）。
 */
export function planSourceCandidates(url: string, options?: { reader?: boolean }): SourceAttempt[];

/**
 * 按候选链抓取，返回第一个「解析得出价格」的来源；全失败时返回 `error` + 分级 `attempts`。
 */
export function fetchPlanSource(
  url: string,
  options?: {
    timeoutMs?: number;
    reader?: boolean;
    fetchImpl?: ((url: string, init?: unknown) => Promise<unknown>) | null;
  },
): Promise<PlanSourcePage>;

export function runPlansDriftCommand(options?: {
  plans?: DriftPlanLike[] | null;
  fetchPage?: (url: string) => Promise<{ text?: string; error?: string; attempts?: SourceAttempt[] }>;
  timeoutMs?: number;
  reader?: boolean;
}): Promise<PlansDriftResult>;
export function formatPlansDriftReport(result: PlansDriftResult): string;
