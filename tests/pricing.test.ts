import { describe, expect, it } from 'vitest';
import { apiPrices, fxRate } from '../src/lib/data';
import { convertAmount } from '../src/lib/fx';
import {
  billingValue,
  calculateMonthlyCost,
  filterAndSortApiPrices,
  parseUsageInput,
} from '../src/lib/pricing';

// Gemini 3.5 Flash-Lite：0.30 输入 / 2.50 输出 / 0.03 cache read（USD，官方页核验）
const google = apiPrices.find((item) => item.id === 'google-gemini-3-5-flash-lite')!;
const zeroUsageInput = { input: '0', output: '0', cacheRead: '0', cacheWrite: '0' };

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

describe('筛选与排序（同币种内比较，跨币种不排名）', () => {
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

  it('按账单币种分组：USD 组在前、CNY 组在后，组内按原币种值升序', () => {
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
