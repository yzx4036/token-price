import { formatContextTokens, priceBasisLabel, priceCells, provenanceLabel, provenanceShort } from './format';
import type { ApiPrice, FxRate, Provenance } from './schema';

/** 表格 / 卡片共用的行数据：所有展示文本都在这里算好，组件只负责排版 */
export type PriceRow = {
  id: string;
  provider: string;
  providerId: string;
  model: string;
  provenance: Provenance;
  /** 列内徽章用短标签：官方核验 / 聚合数据 */
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
};

export function buildPriceRow(item: ApiPrice, fx: FxRate | null): PriceRow {
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
  };
}
