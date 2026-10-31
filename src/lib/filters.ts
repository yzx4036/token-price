import type { PriceField } from './pricing';
import type { Provenance } from './schema';

/** 比价页筛选状态：FilterBar 与 ApiPricingView 共用同一个类型 */
export type FilterState = {
  query: string;
  provider: string;
  provenance: Provenance | 'all';
  sortBy: PriceField;
};

export const DEFAULT_FILTERS: FilterState = {
  query: '',
  provider: '',
  provenance: 'all',
  sortBy: 'inputPrice',
};
