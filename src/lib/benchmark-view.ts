import type { ApiPrice } from './schema';
import type { RowScore } from './price-row';

/**
 * 智能评分与性价比的前端接入口（issue #5）。
 *
 * 数据真源是构建期生成的 benchmarks.generated.json（由
 * scripts/data/gen-benchmarks.mjs 从人工核验的映射产出）。
 * 这里只做「查表 + 算性价比」，不重新做任何映射判断。
 */

export interface BenchmarkEntry {
  score: number;
  aaSlug: string;
  tierUsed: string;
  baseModel: string;
}

export interface BenchmarkDoc {
  generatedAt: string;
  source: { name: string; url: string; fetchedAt: string; note?: string };
  methodology: Record<string, string>;
  coverage: {
    uniqueModels: number;
    scoredModels: number;
    unscoredModels: number;
    apiEntries: number;
    apiEntriesScored: number;
  };
  models: Record<string, { score: number } | null>;
  byEntryId: Record<string, BenchmarkEntry | null>;
}

const BLEND_INPUT_WEIGHT = 3;
const BLEND_TOTAL = 4;

/** 3:1 混合后每百万 token 的标价（原币种）；缺价格返回 null */
export function blendPerMillion(item: Pick<ApiPrice, 'inputPrice' | 'outputPrice'>): number | null {
  const { inputPrice, outputPrice } = item;
  if (typeof inputPrice !== 'number' || typeof outputPrice !== 'number') return null;
  return (BLEND_INPUT_WEIGHT * inputPrice + outputPrice) / BLEND_TOTAL;
}

/**
 * 组装一行的评分信息。
 *
 * 关键约束：缺价格或缺评分一律返回 null —— 前端会显示「—」，
 * 绝不拿 0 或其它模型的分数顶替（那会把「未知」伪装成「最差」）。
 */
export function buildRowScore(
  item: Pick<ApiPrice, 'id' | 'inputPrice' | 'outputPrice'>,
  doc: BenchmarkDoc,
): RowScore {
  const bench = doc.byEntryId[item.id];
  if (!bench || typeof bench.score !== 'number' || bench.score <= 0) return null;

  const blend = blendPerMillion(item);
  if (blend === null || blend <= 0) {
    // 有分数但没价格：仍展示分数，性价比留空
    return { score: bench.score, tier: bench.tierUsed, costPerPoint: Number.NaN, blendPerMillion: Number.NaN };
  }

  return {
    score: bench.score,
    tier: bench.tierUsed,
    costPerPoint: Math.round((blend / bench.score) * 10000) / 10000,
    blendPerMillion: Math.round(blend * 1000) / 1000,
  };
}

/** 有评分且能算出性价比的行（用于排行榜与结论卡） */
export function isRankable(row: { score: RowScore }): boolean {
  return (
    row.score !== null &&
    Number.isFinite(row.score.costPerPoint) &&
    row.score.costPerPoint > 0
  );
}

export interface ValueRankItem {
  id: string;
  provider: string;
  model: string;
  currency: string;
  score: number;
  costPerPoint: number;
}

/**
 * 同币种内的性价比排名（越靠前越划算）。
 * **绝不跨币种合并**：汇率波动不该伪装成性价比变化。
 */
export function rankByCurrency(rows: ValueRankItem[]): Record<string, ValueRankItem[]> {
  const groups: Record<string, ValueRankItem[]> = {};
  for (const r of rows) {
    (groups[r.currency] ??= []).push(r);
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => a.costPerPoint - b.costPerPoint);
  }
  return groups;
}

/** 数值格式化：每分智能成本很小，用 4 位有效小数避免全显示成 0.00 */
export function formatCostPerPoint(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (v >= 1) return v.toFixed(2);
  if (v >= 0.01) return v.toFixed(4);
  return v.toFixed(5);
}
