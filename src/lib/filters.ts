import type { PriceField } from './pricing';
import type { Provenance } from './schema';

/** 厂商地区：与 providers.json 的 region 字段一致 */
export type Region = 'cn' | 'intl';
export type RegionFilter = Region | 'all';

/** 可排序字段：价格四列 + 上下文长度 + 厂商名 + 智能/性价比（issue #5） */
export type SortKey = PriceField | 'contextTokens' | 'provider' | 'intelligence' | 'value';
export type SortOrder = 'asc' | 'desc';

/** 比价页筛选状态：FilterBar 与各视图共用同一个类型 */
export type FilterState = {
  query: string;
  provider: string;
  provenance: Provenance | 'all';
  /** 国内 / 国外筛选 */
  region: RegionFilter;
  sortBy: SortKey;
  order: SortOrder;
};

export const DEFAULT_FILTERS: FilterState = {
  query: '',
  provider: '',
  provenance: 'all',
  region: 'all',
  sortBy: 'inputPrice',
  order: 'asc',
};

export const SORT_KEYS: readonly SortKey[] = [
  'inputPrice',
  'outputPrice',
  'cacheReadPrice',
  'cacheWritePrice',
  'contextTokens',
  'intelligence',
  'value',
  'provider',
];

export const SORT_KEY_LABELS: Record<SortKey, string> = {
  inputPrice: '输入价',
  outputPrice: '输出价',
  cacheReadPrice: 'Cache 读',
  cacheWritePrice: 'Cache 写',
  contextTokens: '上下文',
  intelligence: '智能指数',
  value: '性价比',
  provider: '厂商',
};

export function isSortKey(value: unknown): value is SortKey {
  return typeof value === 'string' && (SORT_KEYS as readonly string[]).includes(value);
}

export function isSortOrder(value: unknown): value is SortOrder {
  return value === 'asc' || value === 'desc';
}

export function isRegionFilter(value: unknown): value is RegionFilter {
  return value === 'all' || value === 'cn' || value === 'intl';
}

/** 点击同一列反转方向；换列时重置为升序（价格类默认升序 = 最便宜在前，符合直觉） */
export function nextSortState(current: Pick<FilterState, 'sortBy' | 'order'>, key: SortKey): Pick<FilterState, 'sortBy' | 'order'> {
  if (current.sortBy === key) return { sortBy: key, order: current.order === 'asc' ? 'desc' : 'asc' };
  return { sortBy: key, order: 'asc' };
}
