import { describe, expect, it } from 'vitest';
import type { RegionFilter, SortKey, SortOrder } from '../src/lib/filters';
import { DEFAULT_FILTERS, nextSortState } from '../src/lib/filters';
import { filterAndSortApiPrices } from '../src/lib/pricing';
import { readFiltersFromUrl, writeFiltersToUrl } from '../src/lib/url-state';
import type { ApiPrice, BillingCurrency, FxRate, Provenance } from '../src/lib/schema';

/**
 * v0.4.0 新增能力：#4 国内/国外筛选 · #2 表头排序 · URL 状态同步。
 * 重点守两条产品口径：
 *   1) 跨币种不排名（USD 组永远在 CNY 组之前，desc 也不许翻过来）
 *   2) 缺值永远排组末（desc 时「待核验」不能被顶到最前）
 */

const fx: FxRate = {
  base: 'USD',
  quote: 'CNY',
  rate: 7,
  date: '2026-11-01',
  source: 'test',
  sourceUrl: 'https://example.com',
  fetchedAt: '2026-11-01T00:00:00.000Z',
};

function entry(over: Partial<ApiPrice> & { id: string; providerId: string; model: string }): ApiPrice {
  const base = {
    provider: over.providerId,
    billingCurrency: 'CNY' as BillingCurrency,
    reportedCurrency: 'CNY' as BillingCurrency,
    unit: 'per_1m_tokens',
    inputPrice: 10,
    outputPrice: 20,
    cacheReadPrice: null,
    cacheWritePrice: null,
    contextTokens: 100000,
    sourceUrl: 'https://example.com',
    provenance: 'official' as Provenance,
    verifiedAt: '2026-11-01',
    status: 'verified',
    pricingCondition: '标准',
    notes: '',
  };
  return { ...base, ...over } as ApiPrice;
}

const models: ApiPrice[] = [
  entry({ id: 'cn-a', providerId: 'zhipu', model: 'A', inputPrice: 5 }),
  entry({ id: 'cn-b', providerId: 'deepseek', model: 'B', inputPrice: 1 }),
  entry({
    id: 'us-a',
    providerId: 'openai',
    model: 'C',
    inputPrice: 3,
    billingCurrency: 'USD',
    reportedCurrency: 'USD',
  }),
  entry({
    id: 'us-b',
    providerId: 'google',
    model: 'D',
    inputPrice: null,
    billingCurrency: 'USD',
    reportedCurrency: 'USD',
  }),
];

const regionMap: Record<string, 'cn' | 'intl'> = {
  zhipu: 'cn',
  deepseek: 'cn',
  openai: 'intl',
  google: 'intl',
};

describe('#4 国内 / 国外筛选', () => {
  it('region=cn 只留国内厂商', () => {
    const out = filterAndSortApiPrices(models, { region: 'cn' }, fx, regionMap);
    expect(out.map((m) => m.providerId).sort()).toEqual(['deepseek', 'zhipu']);
  });

  it('region=intl 只留国外厂商', () => {
    const out = filterAndSortApiPrices(models, { region: 'intl' }, fx, regionMap);
    expect(out.map((m) => m.providerId).sort()).toEqual(['google', 'openai']);
  });

  it('国内 + 国外 == 全部（不重不漏）', () => {
    const all = filterAndSortApiPrices(models, { region: 'all' }, fx, regionMap);
    const cn = filterAndSortApiPrices(models, { region: 'cn' }, fx, regionMap);
    const intl = filterAndSortApiPrices(models, { region: 'intl' }, fx, regionMap);
    expect(cn.length + intl.length).toBe(all.length);
  });

  it('无 region 映射的厂商 fail-closed：只在「全部」里出现，不落进国内或国外', () => {
    const withUnknown = [...models, entry({ id: 'x', providerId: 'unknown', model: 'X' })];
    const cn = filterAndSortApiPrices(withUnknown, { region: 'cn' }, fx, regionMap);
    const intl = filterAndSortApiPrices(withUnknown, { region: 'intl' }, fx, regionMap);
    const all = filterAndSortApiPrices(withUnknown, { region: 'all' }, fx, regionMap);
    // 宁可只在「全部」里露面，也不要同时算进国内与国外（会让两边之和大于全部）
    expect(cn.some((m) => m.providerId === 'unknown')).toBe(false);
    expect(intl.some((m) => m.providerId === 'unknown')).toBe(false);
    expect(all.some((m) => m.providerId === 'unknown')).toBe(true);
  });

  it('仓库里所有厂商都配了 region（fail-closed 才有意义）', async () => {
    const { readFileSync } = await import('node:fs');
    const providers = JSON.parse(readFileSync('src/data/providers.json', 'utf8')) as { region?: string }[];
    const missing = providers.filter((p) => p.region !== 'cn' && p.region !== 'intl');
    expect(missing, `${missing.length} 家厂商缺 region`).toHaveLength(0);
  });

  it('region 可与厂商 / 溯源筛选叠加', () => {
    const out = filterAndSortApiPrices(
      models,
      { region: 'cn', provider: 'zhipu', provenance: 'official' },
      fx,
      regionMap,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe('cn-a');
  });
});

describe('#2 排序', () => {
  it('输入价升序：国内组内 1 在 5 之前', () => {
    const out = filterAndSortApiPrices(models, { region: 'cn', sortBy: 'inputPrice', order: 'asc' }, fx, regionMap);
    expect(out.map((m) => m.inputPrice)).toEqual([1, 5]);
  });

  it('输入价降序：组内顺序反转', () => {
    const out = filterAndSortApiPrices(models, { region: 'cn', sortBy: 'inputPrice', order: 'desc' }, fx, regionMap);
    expect(out.map((m) => m.inputPrice)).toEqual([5, 1]);
  });

  it('跨币种不排名：desc 时 USD 组仍在 CNY 组之前', () => {
    const out = filterAndSortApiPrices(models, { sortBy: 'inputPrice', order: 'desc' }, fx, regionMap);
    const order = out.map((m) => m.billingCurrency);
    const firstCny = order.indexOf('CNY');
    const lastUsd = order.lastIndexOf('USD');
    expect(lastUsd).toBeLessThan(firstCny);
  });

  it('缺值排组末：desc 时 null 不被顶到最前', () => {
    const out = filterAndSortApiPrices(models, { region: 'intl', sortBy: 'inputPrice', order: 'desc' }, fx, regionMap);
    expect(out[0].inputPrice).not.toBeNull();
    expect(out[out.length - 1].inputPrice).toBeNull();
  });

  it('可按上下文长度排序', () => {
    const out = filterAndSortApiPrices(
      models,
      { region: 'cn', sortBy: 'contextTokens', order: 'asc' },
      fx,
      regionMap,
    );
    expect(out).toHaveLength(2);
  });

  it('可按厂商名排序', () => {
    const out = filterAndSortApiPrices(models, { sortBy: 'provider', order: 'asc' }, fx, regionMap);
    expect(out).toHaveLength(models.length);
  });
});

describe('#2 点击同一列切换方向', () => {
  it('同列再点一次反转', () => {
    const first = nextSortState({ sortBy: 'inputPrice', order: 'asc' }, 'inputPrice');
    expect(first.order).toBe('desc');
    const second = nextSortState(first, 'inputPrice');
    expect(second.order).toBe('asc');
  });

  it('换列则重置为升序（价格类默认最便宜在前）', () => {
    const next = nextSortState({ sortBy: 'inputPrice', order: 'desc' }, 'outputPrice');
    expect(next).toEqual({ sortBy: 'outputPrice', order: 'asc' });
  });
});

describe('URL 状态同步', () => {
  it('默认状态序列化为空字符串（URL 保持干净）', () => {
    expect(writeFiltersToUrl({ ...DEFAULT_FILTERS })).toBe('');
  });

  it('往返一致', () => {
    const state = { ...DEFAULT_FILTERS, region: 'cn' as RegionFilter, sortBy: 'outputPrice' as SortKey, order: 'desc' as SortOrder };
    const qs = writeFiltersToUrl(state);
    expect(qs).toContain('region=cn');
    expect(readFiltersFromUrl(qs)).toEqual(state);
  });

  it('非法参数回落到默认值，不抛错（URL 是用户可随意编辑的）', () => {
    const out = readFiltersFromUrl('?region=mars&sort=xxx&order=sideways&provenance=???');
    expect(out.region).toBe('all');
    expect(out.sortBy).toBe(DEFAULT_FILTERS.sortBy);
    expect(out.order).toBe('asc');
    expect(out.provenance).toBe('all');
  });

  it('空 query 返回默认状态', () => {
    expect(readFiltersFromUrl('')).toEqual(DEFAULT_FILTERS);
  });
});
