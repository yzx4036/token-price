import { formatContextTokens, priceBasisLabel, priceCells, provenanceLabel, provenanceShort } from './format';
import type { ApiPrice, FxRate, Provenance } from './schema';

/** 智能评分（来自第三方评测，issue #5）。未评测时为 null，不是 0 */
export type RowScore = {
  /** 综合智能指数 */
  score: number;
  /** 采信的推理档（Max / High / 唯一档 …），便于复核 */
  tier: string;
  /** 每 1 分智能指数要花多少钱（同币种内可比） */
  costPerPoint: number;
  /** 3:1 混合后的每百万 token 价，仍按原币种 */
  blendPerMillion: number;
} | null;

/** 表格 / 卡片共用的行数据：所有展示文本都在这里算好，组件只负责排版 */
export type PriceRow = {
  id: string;
  provider: string;
  providerId: string;
  model: string;
  provenance: Provenance;
  /** 列内徽章用短标签：官方页抓取 / 聚合数据 */
  provenanceBadge: string;
  /** 完整溯源说明（含核验日期 / 聚合源 / 抓取日期），收进详情 */
  provenanceText: string;
  /** 计价说明：把来源等级与币种口径合成一句话 */
  basis: string;
  cells: ReturnType<typeof priceCells>;
  context: string;
  pricingCondition: string;
  notes: string;
  sourceUrl: string;
  verifiedAt: string;
  /** 智能评分与性价比；未评测为 null（不猜、不用近似模型代填） */
  score: RowScore;
};

export function buildPriceRow(
  item: ApiPrice,
  fx: FxRate | null,
  score: RowScore = null,
): PriceRow {
  return {
    id: item.id,
    provider: item.provider,
    providerId: item.providerId,
    model: item.model,
    provenance: item.provenance,
    provenanceBadge: provenanceShort(item.provenance),
    provenanceText: provenanceLabel(item),
    basis: priceBasisLabel(item, fx),
    cells: priceCells(item, fx),
    context: formatContextTokens(item.contextTokens),
    pricingCondition: item.pricingCondition,
    notes: item.notes,
    sourceUrl: item.sourceUrl,
    verifiedAt: item.verifiedAt,
    score,
  };
}
