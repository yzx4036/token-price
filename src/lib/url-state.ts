import {
  DEFAULT_FILTERS,
  isRegionFilter,
  isSortKey,
  isSortOrder,
  type FilterState,
} from './filters';
import type { Provenance } from './schema';
import type { PlanSortKey, PlanSortOrder } from './plans';

const PROVENANCES: readonly (Provenance | 'all')[] = ['all', 'official', 'aggregate'];

function isProvenance(value: unknown): value is Provenance | 'all' {
  return typeof value === 'string' && (PROVENANCES as readonly string[]).includes(value);
}

/**
 * 从 URL query 解析筛选状态。
 *
 * 预渲染约束：构建期没有真实 URL，所以这条只在客户端 onMounted 后调用。
 * 非法值一律回落到默认值——URL 是用户可随意编辑的，不能因为 `?sort=xxx` 就崩。
 */
export function readFiltersFromUrl(search: string): FilterState {
  const params = new URLSearchParams(search);
  const next: FilterState = { ...DEFAULT_FILTERS };

  const query = params.get('q');
  if (query) next.query = query;

  const provider = params.get('provider');
  if (provider) next.provider = provider;

  const provenance = params.get('provenance');
  if (isProvenance(provenance)) next.provenance = provenance;

  const region = params.get('region');
  if (isRegionFilter(region)) next.region = region;

  const sort = params.get('sort');
  if (isSortKey(sort)) next.sortBy = sort;

  const order = params.get('order');
  if (isSortOrder(order)) next.order = order;

  return next;
}

/** 序列化成 query 字符串；等于默认值的项不写，保持 URL 干净 */
export function writeFiltersToUrl(filters: FilterState): string {
  const params = new URLSearchParams();
  if (filters.query.trim()) params.set('q', filters.query.trim());
  if (filters.provider) params.set('provider', filters.provider);
  if (filters.provenance !== DEFAULT_FILTERS.provenance) params.set('provenance', filters.provenance);
  if (filters.region !== DEFAULT_FILTERS.region) params.set('region', filters.region);
  if (filters.sortBy !== DEFAULT_FILTERS.sortBy) params.set('sort', filters.sortBy);
  if (filters.order !== DEFAULT_FILTERS.order) params.set('order', filters.order);
  const s = params.toString();
  return s ? `?${s}` : '';
}

export type PlanUrlState = {
  region: FilterState['region'];
  sortBy: PlanSortKey;
  order: PlanSortOrder;
};

export const DEFAULT_PLAN_URL_STATE: PlanUrlState = {
  region: 'all',
  sortBy: 'monthlyPrice',
  order: 'asc',
};

/** 套餐页 URL 状态；和 API 页一样，只允许在 onMounted 后传入 location.search。 */
export function readPlanStateFromUrl(search: string): PlanUrlState {
  const params = new URLSearchParams(search);
  const next = { ...DEFAULT_PLAN_URL_STATE };
  const region = params.get('region');
  const sort = params.get('sort');
  const order = params.get('order');
  if (isRegionFilter(region)) next.region = region;
  if (sort === 'monthlyPrice' || sort === 'provider') next.sortBy = sort;
  if (isSortOrder(order)) next.order = order;
  return next;
}

export function writePlanStateToUrl(state: PlanUrlState): string {
  const params = new URLSearchParams();
  if (state.region !== DEFAULT_PLAN_URL_STATE.region) params.set('region', state.region);
  if (state.sortBy !== DEFAULT_PLAN_URL_STATE.sortBy) params.set('sort', state.sortBy);
  if (state.order !== DEFAULT_PLAN_URL_STATE.order) params.set('order', state.order);
  const search = params.toString();
  return search ? `?${search}` : '';
}
