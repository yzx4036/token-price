import { describe, expect, it } from 'vitest';
import { apiPrices } from '../src/lib/data';
import { calculateMonthlyCost, filterAndSortApiPrices, parseUsageInput } from '../src/lib/pricing';

const google = apiPrices.find((item) => item.provider === 'Google')!;
const zeroUsageInput = { input: '0', output: '0', cacheRead: '0', cacheWrite: '0' };

describe('成本计算', () => {
  it('按每 1M Token 汇总四类成本', () => {
    const result = calculateMonthlyCost(google, {
      input: 2_000_000,
      output: 1_000_000,
      cacheRead: 3_000_000,
      cacheWrite: 0,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.total).toBeCloseTo(3.19, 10);
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

describe('筛选与排序', () => {
  it('可按厂商和模型名筛选', () => {
    expect(filterAndSortApiPrices(apiPrices, 'flash-lite', 'Google')).toHaveLength(1);
    expect(filterAndSortApiPrices(apiPrices, '不存在')).toEqual([]);
  });

  it('空查询保留全部条目，查询大小写不敏感且支持中文', () => {
    expect(filterAndSortApiPrices(apiPrices, '   ')).toHaveLength(apiPrices.length);
    expect(filterAndSortApiPrices(apiPrices, 'gEmInI')).toHaveLength(1);
    expect(filterAndSortApiPrices(apiPrices, '低谷')).toHaveLength(1);
  });

  it('按可比较数字升序排列', () => {
    const sorted = filterAndSortApiPrices(apiPrices, '', '', 'outputPrice');
    expect(sorted.map((item) => item.outputPrice)).toEqual([0.6, 1.2, 2.5]);
  });

  it('把 pending 与空值放在末尾', () => {
    const pending = { ...google, id: 'pending', status: 'pending' as const, inputPrice: null };
    const sorted = filterAndSortApiPrices([pending, google]);
    expect(sorted.at(-1)?.id).toBe('pending');
  });

  it('排序带 null 的字段时先列已核验非空值，再列已核验空值，最后列 pending', () => {
    const verifiedNull = { ...google, id: 'verified-null', model: 'Z 已核验空值', cacheWritePrice: null };
    const pending = { ...google, id: 'pending-priced', model: 'A 待核验', status: 'pending' as const, cacheWritePrice: 0.01 };
    const verifiedValue = { ...google, id: 'verified-value', model: 'M 已核验有值', cacheWritePrice: 0.02 };
    const sorted = filterAndSortApiPrices([pending, verifiedNull, verifiedValue], '', '', 'cacheWritePrice');
    expect(sorted.map((item) => item.id)).toEqual(['verified-value', 'verified-null', 'pending-priced']);
  });
});
