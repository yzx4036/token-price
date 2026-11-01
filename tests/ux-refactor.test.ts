import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiPrices, fxRate, providers, tokenPlans } from '../src/lib/data';
import { nextSortState, SORT_KEYS, type SortKey } from '../src/lib/filters';
import { filterPlansByRegion, sortPlans } from '../src/lib/plans';
import { billingValue, filterAndSortApiPrices } from '../src/lib/pricing';
import { computeApiConclusions, computePlanConclusions } from '../src/lib/stats';
import {
  readFiltersFromUrl,
  readPlanStateFromUrl,
  writeFiltersToUrl,
  writePlanStateToUrl,
} from '../src/lib/url-state';

const regionByProviderId = Object.fromEntries(providers.map((provider) => [provider.id, provider.region]));

function valueFor(key: SortKey, entry: (typeof apiPrices)[number]): number | string | null {
  if (key === 'provider') return entry.provider;
  if (key === 'contextTokens') return entry.contextTokens;
  // 新增的 intelligence / value 两键需要评分数据，这个辅助函数只测价格类字段
  if (key === 'intelligence' || key === 'value') return null;
  return billingValue(entry, key, fxRate);
}

describe('v0.4.0 地区筛选', () => {
  it('API 国内与国际互斥且合计为全部，未知厂商 fail closed', () => {
    const unknown = { ...apiPrices[0], id: 'unknown-region', providerId: 'not-in-providers' };
    const all = filterAndSortApiPrices([...apiPrices, unknown], { region: 'all' }, fxRate, regionByProviderId);
    const cn = filterAndSortApiPrices([...apiPrices, unknown], { region: 'cn' }, fxRate, regionByProviderId);
    const intl = filterAndSortApiPrices([...apiPrices, unknown], { region: 'intl' }, fxRate, regionByProviderId);
    expect(cn.length + intl.length).toBe(apiPrices.length);
    expect(all).toHaveLength(apiPrices.length + 1);
    expect([...cn, ...intl].some((entry) => entry.id === unknown.id)).toBe(false);
  });

  it('套餐国内与国际互斥且合计为全部，未知厂商 fail closed', () => {
    const unknown = { ...tokenPlans[0], id: 'unknown-plan-region', providerId: 'not-in-providers' };
    const cn = filterPlansByRegion([...tokenPlans, unknown], 'cn', regionByProviderId);
    const intl = filterPlansByRegion([...tokenPlans, unknown], 'intl', regionByProviderId);
    expect(cn.length + intl.length).toBe(tokenPlans.length);
    expect([...cn, ...intl].some((entry) => entry.id === unknown.id)).toBe(false);
  });

  it('地区与搜索、厂商、溯源条件可叠加', () => {
    const provider = apiPrices.find((entry) => regionByProviderId[entry.providerId] === 'cn')!;
    const filtered = filterAndSortApiPrices(apiPrices, {
      region: 'cn',
      query: provider.model.split('-')[0] ?? provider.model,
      provider: provider.providerId,
      provenance: provider.provenance,
      sortBy: 'inputPrice',
      order: 'asc',
    }, fxRate, regionByProviderId);
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((entry) => regionByProviderId[entry.providerId] === 'cn')).toBe(true);
    expect(filtered.every((entry) => entry.providerId === provider.providerId)).toBe(true);
    expect(filtered.every((entry) => entry.provenance === provider.provenance)).toBe(true);
  });
});

describe('v0.4.0 排序', () => {
  it.each(SORT_KEYS)('API %s 支持升降序，且两个方向都固定 USD 组在前', (key) => {
    for (const order of ['asc', 'desc'] as const) {
      const sorted = filterAndSortApiPrices(apiPrices, { sortBy: key, order }, fxRate, regionByProviderId);
      const firstCny = sorted.findIndex((entry) => entry.billingCurrency === 'CNY');
      expect(firstCny).toBeGreaterThan(0);
      expect(sorted.slice(0, firstCny).every((entry) => entry.billingCurrency === 'USD')).toBe(true);
      expect(sorted.slice(firstCny).every((entry) => entry.billingCurrency === 'CNY')).toBe(true);

      for (const currency of ['USD', 'CNY'] as const) {
        const values = sorted
          .filter((entry) => entry.billingCurrency === currency && entry.status === 'verified')
          .map((entry) => valueFor(key, entry))
          .filter((value): value is number | string => value !== null && value !== '');
        for (let index = 1; index < values.length; index += 1) {
          const current = values[index];
          const previous = values[index - 1];
          const comparison = typeof current === 'number' && typeof previous === 'number'
            ? current - previous
            : String(current).localeCompare(String(previous), 'zh-CN');
          expect(order === 'asc' ? comparison : -comparison).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('套餐升降序都固定 USD 组在前、CNY 组在后', () => {
    for (const key of ['monthlyPrice', 'provider'] as const) {
      for (const order of ['asc', 'desc'] as const) {
        const sorted = sortPlans(tokenPlans, key, order);
        const firstCny = sorted.findIndex((plan) => plan.billingCurrency === 'CNY');
        expect(sorted.slice(0, firstCny).every((plan) => plan.billingCurrency === 'USD')).toBe(true);
        expect(sorted.slice(firstCny).every((plan) => plan.billingCurrency === 'CNY')).toBe(true);
      }
    }
  });

  it('套餐按厂商排序时缺价档位仍在所属币种组末尾', () => {
    const sample = tokenPlans.find((plan) => plan.billingCurrency === 'USD' && plan.monthlyPrice !== null)!;
    const missing = { ...sample, id: 'missing-price', provider: 'AAA', plan: '待核验档', monthlyPrice: null };
    for (const order of ['asc', 'desc'] as const) {
      const sorted = sortPlans([...tokenPlans, missing], 'provider', order);
      const usd = sorted.filter((plan) => plan.billingCurrency === 'USD');
      expect(usd.at(-1)?.id).toBe('missing-price');
    }
  });

  it('点击同一表头反转方向，换列重置为升序', () => {
    expect(nextSortState({ sortBy: 'inputPrice', order: 'asc' }, 'inputPrice')).toEqual({
      sortBy: 'inputPrice',
      order: 'desc',
    });
    expect(nextSortState({ sortBy: 'inputPrice', order: 'desc' }, 'inputPrice')).toEqual({
      sortBy: 'inputPrice',
      order: 'asc',
    });
    expect(nextSortState({ sortBy: 'inputPrice', order: 'desc' }, 'outputPrice')).toEqual({
      sortBy: 'outputPrice',
      order: 'asc',
    });
  });
});

describe('v0.4.0 URL query', () => {
  it('API 解析与序列化 region / sort / order，并对非法值回退', () => {
    const state = readFiltersFromUrl('?region=cn&sort=cacheWritePrice&order=desc');
    expect(state).toMatchObject({ region: 'cn', sortBy: 'cacheWritePrice', order: 'desc' });
    expect(readFiltersFromUrl(writeFiltersToUrl(state))).toEqual(state);
    expect(readFiltersFromUrl('?region=moon&sort=bad&order=sideways')).toMatchObject({
      region: 'all', sortBy: 'inputPrice', order: 'asc',
    });
  });

  it('套餐解析与序列化 region / sort / order', () => {
    const state = readPlanStateFromUrl('?region=intl&sort=provider&order=desc');
    expect(state).toEqual({ region: 'intl', sortBy: 'provider', order: 'desc' });
    expect(readPlanStateFromUrl(writePlanStateToUrl(state))).toEqual(state);
  });

  it('默认状态不写进 URL，中文搜索词可往返', () => {
    expect(writeFiltersToUrl({
      query: '', provider: '', provenance: 'all', region: 'all', sortBy: 'inputPrice', order: 'asc',
    })).toBe('');
    const state = readFiltersFromUrl('?q=通义千问&region=cn');
    expect(state.query).toBe('通义千问');
    expect(readFiltersFromUrl(writeFiltersToUrl(state))).toEqual(state);
  });

  it('套餐默认状态不写进 URL', () => {
    expect(writePlanStateToUrl({ region: 'all', sortBy: 'monthlyPrice', order: 'asc' })).toBe('');
  });
});

describe('v0.4.0 结论卡口径', () => {
  it('API 包含 aggregate 来源并按全部条目计数', () => {
    const base = apiPrices[0];
    const aggregate = {
      ...base,
      id: 'aggregate-lowest',
      providerId: 'aggregate-cn',
      inputPrice: 0,
      provenance: 'aggregate' as const,
    };
    const result = computeApiConclusions([base, aggregate], {
      [base.providerId]: 'intl',
      'aggregate-cn': 'cn',
    }, fxRate);
    expect(result.entries).toBe(2);
    expect(result.cn?.entry.id).toBe('aggregate-lowest');
    expect(result.cn?.value).toBe(0);
  });

  it('套餐包含 0 元免费档并按全部档位计数', () => {
    const paid = tokenPlans.find((plan) => plan.billingCurrency === 'USD' && plan.monthlyPrice !== null && plan.monthlyPrice > 0)!;
    const free = { ...paid, id: 'free-plan', plan: 'Free', monthlyPrice: 0 };
    const result = computePlanConclusions([paid, free]);
    expect(result.plans).toBe(2);
    expect(result.USD?.plan.id).toBe('free-plan');
    expect(result.USD?.price).toBe(0);
  });
});

describe('v0.4.0 表格结构', () => {
  it('API 主表为 7 列（v0.5.0 加了智能指数与性价比）', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/PriceTable.vue'), 'utf8');
    const colgroup = source.match(/<colgroup>([\s\S]*?)<\/colgroup>/)?.[1] ?? '';
    // 5 列（模型/溯源/输入/输出/详情）+ 2 列（智能指数/性价比）= 7
    expect(colgroup.match(/<col\b/g)).toHaveLength(7);
    expect(source).toContain('<details');
    expect(source).toContain('Cache read / 1M');
    expect(source).toContain('Cache write / 1M');
    // 新增两列必须真的在表头与单元格里
    expect(source).toContain('智能指数');
    expect(source).toContain('性价比');
    expect(source).toContain('cell-score');
  });

  it('套餐主表为 5 列（v0.6.0 加了折算可用 token）', () => {
    const source = readFileSync(join(process.cwd(), 'src/views/PlansView.vue'), 'utf8');
    const colgroup = source.match(/<colgroup>([\s\S]*?)<\/colgroup>/)?.[1] ?? '';
    // 4 列（套餐/月费/额度核心/详情）+ 1 列（折算可用 token）= 5
    expect(colgroup.match(/<col\b/g)).toHaveLength(5);
    expect(source).toContain('<details');
    for (const label of ['完整额度', '周期', '可用模型', '用途限制']) expect(source).toContain(label);
    // 新增的折算列必须真的在表头里，且能回溯依据
    expect(source).toContain('折算可用 token');
    expect(source).toContain('折算依据');
  });
});
