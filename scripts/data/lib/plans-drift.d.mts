export interface DriftPlanLike {
  id: string;
  plan: string;
  provider: string;
  monthlyPrice: number;
  billingCurrency: string;
  sourceUrl: string;
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
  unknown: Array<{ id: string; plan: string; reason: string; url?: string }>;
}

export function normalizePage(html: string): string;
export function extractPriceTokens(text: string): Set<string>;
export function runPlansDriftCommand(options?: {
  plans?: DriftPlanLike[] | null;
  fetchPage?: (url: string) => Promise<{ text?: string; error?: string }>;
  timeoutMs?: number;
}): Promise<PlansDriftResult>;
export function formatPlansDriftReport(result: PlansDriftResult): string;
