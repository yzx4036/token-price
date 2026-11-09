export interface StructurePlan {
  id: string; provider: string; providerId?: string; plan: string;
  monthlyPrice: number; billingCurrency: string; sourceUrl?: string | null;
  allowance?: string; availableModels?: string[]; allowanceNature?: 'mixed' | 'quota' | 'undisclosed';
}
export interface PlanPageGroup {
  provider: string; providerId: string | null; url: string; pagePrices: number[];
}
export interface PlansStructureDriftResult {
  ok: true; readOnly: true; coverage: { total: number; checked: number; unknown: number };
  missingTiers: (PlanPageGroup & { recordedPrices: number[] })[];
  mergedTiers: (PlanPageGroup & { ids: string[]; recordedPrices: number[] })[];
  removedTiers: (PlanPageGroup & { id: string; plan: string; recordedPrice: number })[];
  allowanceChanges: { id: string; plan: string; provider: string; url: string;
    changes: { field: string; recorded?: string; missingEvidence: string[] }[] }[];
  unknown: { id: string; plan: string; reason: string; url: string }[];
}
export function validatePlans(plans: unknown): StructurePlan[];
export function quantityEvidence(text: string): Set<string>;
export function runPlansStructureDriftCommand(options?: {
  plans?: unknown; plansFile?: string; timeoutMs?: number;
  fetchPage?: (url: string) => Promise<{ text?: string; error?: string }>;
}): Promise<PlansStructureDriftResult>;
export function formatPlansStructureDriftReport(result: PlansStructureDriftResult): string;
