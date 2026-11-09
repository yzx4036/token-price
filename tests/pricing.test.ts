import { describe, expect, it } from 'vitest';
import { apiPrices, benchmarkDoc, fxRate } from '../src/lib/data';
import { buildRowScore } from '../src/lib/benchmark-view';
import type { ApiPrice, FxRate } from '../src/lib/schema';
import { convertAmount } from '../src/lib/fx';
import {
  billingValue,
  calculateMonthlyCost,
  filterAndSortApiPrices,
  parseUsageInput,
} from '../src/lib/pricing';
import type { SortKey } from '../src/lib/filters';

// Gemini 3.5 Flash-Lite：0.30 输入 / 2.50 输出 / 0.03 cache read（USD，官方页核验）
const google = apiPrices.find((item) => item.id === 'google-gemini-3-5-flash-lite')!;
const zeroUsageInput = { input: '0', output: '0', cacheRead: '0', cacheWrite: '0' };

// 固定反例：USD 报价/CNY 账单的 aggregate 必须按报价币种折算。
const sortFixture: ApiPrice[] = [
  { ...google, id: 'usd-high', model: 'U high' },
  { ...google, id: 'missing', model: 'Z missing' },
  { ...google, id: 'pending', model: 'A pending', status: 'pending' },
  { ...google, id: 'cny-low', model: 'C low', reportedCurrency: 'CNY', billingCurrency: 'CNY' },
  { ...google, id: 'aggregate', model: 'A aggregate', billingCurrency: 'CNY', provenance: 'aggregate' },
  { ...google, id: 'usd-low', model: 'U low' },
];
const sortScores = {
  'usd-high': { score: 60, costPerPoint: 3 },
  'usd-low': { score: 30, costPerPoint: 1 },
  'cny-low': { score: 40, costPerPoint: 2 },
  aggregate: { score: 50, costPerPoint: 0.5 },
  missing: null,
  pending: { score: 100, costPerPoint: 0.01 },
};
const sortFx = { ...fxRate, rate: 7 };
const fixtureIds = (sortBy: SortKey, fx: FxRate | null = sortFx, order: 'asc' | 'desc' = 'asc') =>
  filterAndSortApiPrices(sortFixture, { sortBy, order, scores: sortScores }, fx).map((x) => x.id);

describe('全表智能指数与统一性价比', () => {
  it('智能指数跨币种全量降序且空值统一置末', () => {
    expect(fixtureIds('intelligence', sortFx, 'desc')).toEqual([
      'usd-high', 'aggregate', 'cny-low', 'usd-low', 'missing', 'pending',
    ]);
    const scores = Object.fromEntries(apiPrices.map((x) => [x.id, buildRowScore(x, benchmarkDoc)]));
    const rows = filterAndSortApiPrices(apiPrices, { sortBy: 'intelligence', order: 'desc', scores }, fxRate);
    expect(rows).toHaveLength(apiPrices.length);
    const values = rows.map((x) => scores[x.id]?.score ?? null);
    const firstNull = values.indexOf(null);
    expect(firstNull).toBeGreaterThan(0);
    expect(values.slice(firstNull).every((x) => x === null)).toBe(true);
    for (let i = 1; i < firstNull; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]!);
    expect(rows.slice(0, firstNull).some((x, i) => i > 0 && x.billingCurrency !== rows[i - 1].billingCurrency)).toBe(true);
  });

  it('性价比按报价币种折算到 CNY 后全量升序', () => {
    expect(fixtureIds('value')).toEqual(['cny-low', 'aggregate', 'usd-low', 'usd-high', 'missing', 'pending']);
    const scores = Object.fromEntries(apiPrices.map((x) => [x.id, buildRowScore(x, benchmarkDoc)]));
    const rows = filterAndSortApiPrices(apiPrices, { sortBy: 'value', scores }, fxRate);
    const values = rows.map((x) => convertAmount(scores[x.id]?.costPerPoint ?? null, x.reportedCurrency, 'CNY', fxRate));
    const numeric = values.filter((x): x is number => x !== null);
    expect(numeric.length).toBeGreaterThan(1);
    expect(values.slice(numeric.length).every((x) => x === null)).toBe(true);
    for (let i = 1; i < numeric.length; i++) expect(numeric[i]).toBeGreaterThanOrEqual(numeric[i - 1]);
  });

  it('聚合条目按报价币种折算性价比', () => {
    expect(fixtureIds('value').indexOf('aggregate')).toBeGreaterThan(fixtureIds('value').indexOf('cny-low'));
  });

  it.each([null, { ...sortFx, rate: 0 }, { ...sortFx, rate: NaN }, { ...sortFx, rate: Infinity }])(
    '性价比缺合法汇率退回币种分段且错币种报价置空（%s）', (fx) => {
      expect(fixtureIds('value', fx)).toEqual(['usd-low', 'usd-high', 'missing', 'pending', 'cny-low', 'aggregate']);
      // desc 仍先列 CNY 的有效值；aggregate 若错误返回原值，desc 会掩盖问题，asc 不会。
      expect(fixtureIds('value', fx, 'desc')).toEqual(['usd-high', 'usd-low', 'missing', 'pending', 'cny-low', 'aggregate']);
    },
  );

  it('全量降序仍把空值和 pending 置末', () => {
    expect(fixtureIds('value', sortFx, 'desc')).toEqual(['usd-high', 'usd-low', 'aggregate', 'cny-low', 'missing', 'pending']);
  });

  it('厂商名走全表比较', () => {
    const rows = [{ ...google, provider: 'Z' }, { ...google, id: 'cn', provider: 'A', billingCurrency: 'CNY' as const }];
    expect(filterAndSortApiPrices(rows, { sortBy: 'provider' }).map((x) => x.provider)).toEqual(['A', 'Z']);
  });

  it('价格与上下文字段与改前比较器逐行一致（全部条目、双方向、合法/缺失汇率）', () => {
    // 固化 v0.10 比较器：此处不可随新排序实现改写，以锁定 R4 的逐行行为。
    for (const key of ['inputPrice', 'outputPrice', 'cacheReadPrice', 'cacheWritePrice', 'contextTokens'] as const) {
      for (const order of ['asc', 'desc'] as const) {
        for (const fx of [sortFx, null]) {
          const fixtures = [...apiPrices, ...sortFixture,
            { ...google, id: 'null-price', model: 'Null', inputPrice: null, outputPrice: null, contextTokens: null }];
          const old = [...fixtures].sort((a, b) => {
            if (a.billingCurrency !== b.billingCurrency) return a.billingCurrency === 'USD' ? -1 : 1;
            if (a.status !== b.status) return a.status === 'verified' ? -1 : 1;
            const av = a.status !== 'verified' ? null : key === 'contextTokens' ? a.contextTokens : billingValue(a, key, fx);
            const bv = b.status !== 'verified' ? null : key === 'contextTokens' ? b.contextTokens : billingValue(b, key, fx);
            if (av === null && bv !== null) return 1;
            if (bv === null && av !== null) return -1;
            if (av !== null && bv !== null && av !== bv) return (av - bv) * (order === 'desc' ? -1 : 1);
            return a.model.localeCompare(b.model, 'zh-CN');
          });
          expect(filterAndSortApiPrices(fixtures, { sortBy: key, order }, fx).map((x) => x.id), `${key}/${order}/${fx?.rate}`)
            .toEqual(old.map((x) => x.id));
        }
      }
    }
  });
});

describe('成本计算', () => {
  it('按每 1M Token 汇总四类成本，并带上厂商计价币种', () => {
    const result = calculateMonthlyCost(google, {
      input: 2_000_000,
      output: 1_000_000,
      cacheRead: 3_000_000,
      cacheWrite: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.total).toBeCloseTo(3.19, 10);
      expect(result.currency).toBe('USD');
    }
  });

  it('缺价且有对应使用量时 fail closed', () => {
    expect(calculateMonthlyCost(google, {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 1,
    })).toMatchObject({ ok: false });
  });

  it('只填写一种非零用量时只计算该项', () => {
    const result = calculateMonthlyCost(google, {
      input: 1_000_000,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.total).toBeCloseTo(0.3, 12);
  });

  it('结算币种取报价币种：USD 条目给美元，CNY 条目给人民币，不依赖汇率', () => {
    const usd = calculateMonthlyCost(google, { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(usd).toMatchObject({ ok: true, currency: 'USD', billingCurrency: 'USD' });
    if (usd.ok) expect(usd.total).toBeCloseTo(0.3, 10);

    const cnyEntry = apiPrices.find((item) => item.billingCurrency === 'CNY' && item.reportedCurrency === 'CNY' && item.status === 'verified')!;
    const cny = calculateMonthlyCost(cnyEntry, { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(cny).toMatchObject({ ok: true, currency: 'CNY' });
    if (cny.ok) expect(cny.total).toBeCloseTo(cnyEntry.inputPrice!, 10);
  });

  it('人民币只在展示层按汇率折算：缺汇率不影响原币种结算，折算值返回 null 而不是 0', () => {
    const result = calculateMonthlyCost(google, { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(convertAmount(result.total, 'USD', 'CNY', fxRate)).toBeCloseTo(result.total * fxRate.rate, 10);
    expect(convertAmount(result.total, 'USD', 'CNY', null)).toBeNull();
    // 国内厂商人民币条目完全不需要汇率
    expect(convertAmount(1, 'CNY', 'CNY', null)).toBe(1);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])('拒绝非法用量 %s', (input) => {
    expect(calculateMonthlyCost(google, { input, output: 0, cacheRead: 0, cacheWrite: 0 })).toMatchObject({ ok: false });
  });

  it('拒绝未核验价格参与计算', () => {
    expect(calculateMonthlyCost({ ...google, status: 'pending' }, {
      input: 1_000_000,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    })).toMatchObject({ ok: false });
  });

  it.each([
    ['空字符串', ''],
    ['纯空格', '   '],
    ['负值', '-1'],
    ['小数', '1.5'],
    ['超安全整数', String(Number.MAX_SAFE_INTEGER + 1)],
    ['Infinity', 'Infinity'],
    ['1e30', '1e30'],
  ])('拒绝%s输入', (_label, output) => {
    expect(parseUsageInput({ ...zeroUsageInput, output })).toMatchObject({ ok: false });
  });

  it('接受值为安全整数的科学计数法', () => {
    expect(parseUsageInput({ ...zeroUsageInput, input: '1e6' })).toEqual({
      ok: true,
      usage: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it('拒绝只填写部分字段', () => {
    expect(parseUsageInput({ ...zeroUsageInput, cacheRead: null })).toMatchObject({ ok: false });
  });

  it('接受四项全 0', () => {
    expect(parseUsageInput(zeroUsageInput)).toEqual({
      ok: true,
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    });
  });

  it('浮点结果按近似值断言，并由展示层四舍五入', () => {
    const result = calculateMonthlyCost(google, {
      input: 3_000_000,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) return;
    expect(result.total).not.toBe(0.9);
    expect(result.total).toBeCloseTo(0.9, 12);
    expect(result.total.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 6,
    })).toBe('$0.90');
  });
});

describe('筛选与排序（按字段选择跨币种口径）', () => {
  it('可按厂商和模型名筛选', () => {
    expect(filterAndSortApiPrices(apiPrices, { query: '3.5 flash-lite', provider: 'google' }, fxRate)).toHaveLength(1);
    expect(filterAndSortApiPrices(apiPrices, { query: '不存在' }, fxRate)).toEqual([]);
  });

  it('空查询保留全部条目，查询大小写不敏感且支持中文', () => {
    expect(filterAndSortApiPrices(apiPrices, { query: '   ' }, fxRate)).toHaveLength(apiPrices.length);
    const gemini = filterAndSortApiPrices(apiPrices, { query: 'gEmInI' }, fxRate);
    expect(gemini.length).toBeGreaterThanOrEqual(10);
    expect(gemini.every((item) => item.provider === 'Google')).toBe(true);
    // 峰谷口径改成「空闲/高峰」后，中文检索应命中「空闲时段」的全部条目。
    // 不写死条数（数据里会新增模型），改成不变式：命中的每一条都必须真的含「空闲」。
    const idle = filterAndSortApiPrices(apiPrices, { query: '空闲' }, fxRate);
    expect(idle.length).toBeGreaterThan(0);
    expect(idle.every((item) => (item.model as string).includes('空闲'))).toBe(true);
    // 且与数据文件里实际标注「空闲时段」的条数一致
    expect(idle.length).toBe(apiPrices.filter((item) => (item.model as string).includes('空闲')).length);
  });

  it('按溯源等级筛选', () => {
    const officialOnly = filterAndSortApiPrices(apiPrices, { provenance: 'official' }, fxRate);
    expect(officialOnly.every((item) => item.provenance === 'official')).toBe(true);
    expect(officialOnly.length).toBeGreaterThan(0);
    const aggregateOnly = filterAndSortApiPrices(apiPrices, { provenance: 'aggregate' }, fxRate);
    expect(aggregateOnly.every((item) => item.provenance === 'aggregate')).toBe(true);
    expect(officialOnly.length + aggregateOnly.length).toBe(apiPrices.length);
  });

  it('价格字段仍按账单币种分组：USD 组在前、CNY 组在后，组内按原币种值升序', () => {
    const sorted = filterAndSortApiPrices(apiPrices, { sortBy: 'outputPrice' }, fxRate);
    // 组必须连续：一旦进入 CNY 组，后面不能再出现 USD 条目
    const currencies = sorted.map((item) => item.billingCurrency);
    const firstCny = currencies.indexOf('CNY');
    expect(firstCny).toBeGreaterThan(0);
    expect(currencies.slice(firstCny).every((currency) => currency === 'CNY')).toBe(true);
    expect(currencies.slice(0, firstCny).every((currency) => currency === 'USD')).toBe(true);

    for (const currency of ['USD', 'CNY'] as const) {
      const group = sorted.filter((item) => item.billingCurrency === currency && item.status === 'verified');
      const values = group.map((item) => billingValue(item, 'outputPrice', fxRate));
      const numeric = values.filter((value): value is number => value !== null);
      expect(numeric.length).toBeGreaterThan(0);
      for (let index = 1; index < numeric.length; index += 1) {
        expect(numeric[index]).toBeGreaterThanOrEqual(numeric[index - 1]);
      }
    }
  });

  it('美元条目按美元值比较，不因人民币折算而改变组内顺序', () => {
    const sorted = filterAndSortApiPrices(apiPrices, { sortBy: 'inputPrice' }, fxRate);
    const usdGroup = sorted.filter((item) => item.billingCurrency === 'USD' && item.status === 'verified');
    expect(usdGroup.length).toBeGreaterThan(1);
    for (let index = 1; index < usdGroup.length; index += 1) {
      expect(usdGroup[index].inputPrice).toBeGreaterThanOrEqual(usdGroup[index - 1].inputPrice ?? 0);
    }
  });

  it('把 pending 与空值放在末尾', () => {
    const pending = { ...google, id: 'pending', status: 'pending' as const, inputPrice: null };
    const sorted = filterAndSortApiPrices([pending, google], {}, fxRate);
    expect(sorted.at(-1)?.id).toBe('pending');
  });

  it('排序带 null 的字段时先列已核验非空值，再列已核验空值，最后列 pending', () => {
    const verifiedNull = { ...google, id: 'verified-null', model: 'Z 已核验空值', cacheWritePrice: null };
    const pending = { ...google, id: 'pending-priced', model: 'A 待核验', status: 'pending' as const, cacheWritePrice: 0.01 };
    const verifiedValue = { ...google, id: 'verified-value', model: 'M 已核验有值', cacheWritePrice: 0.02 };
    const sorted = filterAndSortApiPrices([pending, verifiedNull, verifiedValue], { sortBy: 'cacheWritePrice' }, fxRate);
    expect(sorted.map((item) => item.id)).toEqual(['verified-value', 'verified-null', 'pending-priced']);
  });

  it('缺汇率时缺价的排序退化不会抛错（RSM 场景）', () => {
    expect(() => filterAndSortApiPrices(apiPrices, { sortBy: 'inputPrice' }, null)).not.toThrow();
  });
});
