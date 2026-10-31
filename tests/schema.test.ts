import { describe, expect, it } from 'vitest';
import { rawApiPrices } from '../src/data/api-prices';
import { rawTokenPlans } from '../src/data/token-plans';
import { parseApiPrices, parseTokenPlans } from '../src/lib/schema';

describe('静态数据校验', () => {
  it('接受仓库中的官方核验数据与空 Plan 集合', () => {
    expect(parseApiPrices(rawApiPrices)).toHaveLength(3);
    expect(parseTokenPlans(rawTokenPlans)).toEqual([]);
  });

  it('拒绝负价格（非法价格变异门禁）', () => {
    const mutated = [{ ...rawApiPrices[0], inputPrice: -0.01 }];
    expect(() => parseApiPrices(mutated)).toThrow();
  });

  it('拒绝重复 id', () => {
    expect(() => parseApiPrices([rawApiPrices[0], rawApiPrices[0]])).toThrow(/重复 id/);
  });

  it.each(['inputPrice', 'outputPrice'] as const)('拒绝缺少 %s 的 verified 条目', (field) => {
    const mutated = [{ ...rawApiPrices[0], [field]: null }];
    expect(() => parseApiPrices(mutated)).toThrow(/输入和输出价格/);
  });

  it('允许 pending 价格为空，但拒绝 pending 条目缺少 schema 字段', () => {
    const pending = {
      ...rawApiPrices[0],
      status: 'pending',
      inputPrice: null,
      outputPrice: null,
      cacheReadPrice: null,
      cacheWritePrice: null,
    };
    expect(parseApiPrices([pending])).toHaveLength(1);

    const missingField = { ...pending } as Record<string, unknown>;
    delete missingField.notes;
    expect(() => parseApiPrices([missingField])).toThrow();
  });

  it.each([
    ['API 价格', () => parseApiPrices([{ ...rawApiPrices[0], sourceUrl: 'http://example.com/pricing' }])],
    ['Token Plan', () => parseTokenPlans([{
      id: 'pending-plan',
      provider: 'Example',
      plan: 'Pending',
      monthlyPrice: null,
      currency: 'USD',
      allowance: null,
      billingCycle: null,
      availableModels: [],
      usageRestrictions: null,
      sourceUrl: 'http://example.com/pricing',
      verifiedAt: '2026-10-31',
      status: 'pending',
    }])],
  ])('拒绝使用非 HTTPS 来源的%s', (_label, parse) => {
    expect(parse).toThrow(/HTTPS/);
  });

  it.each(['not-a-date', '2026-02-30', '2026-10-31T00:00:00Z'])('拒绝非法核验日期 %s', (verifiedAt) => {
    expect(() => parseApiPrices([{ ...rawApiPrices[0], verifiedAt }])).toThrow();
  });

  it('拒绝非有限价格', () => {
    expect(() => parseApiPrices([{ ...rawApiPrices[0], inputPrice: Number.POSITIVE_INFINITY }])).toThrow();
  });

  it('拒绝额外字段，防止静默拼写错误', () => {
    const mutated = [{ ...rawApiPrices[0], typoPrice: 12 }];
    expect(() => parseApiPrices(mutated)).toThrow();
  });

  it('拒绝核心字段不完整却标为 verified 的 Token Plan', () => {
    const incompletePlan = {
      id: 'incomplete-plan',
      provider: 'Example',
      plan: 'Example Plan',
      monthlyPrice: null,
      currency: 'USD',
      allowance: null,
      billingCycle: null,
      availableModels: [],
      usageRestrictions: null,
      sourceUrl: 'https://example.com/pricing',
      verifiedAt: '2026-10-31',
      status: 'verified',
    };
    expect(() => parseTokenPlans([incompletePlan])).toThrow(/月费、额度、周期、模型与用途限制/);
  });

  it('拒绝 Token Plan 的负月费和重复 id', () => {
    const plan = {
      id: 'verified-plan',
      provider: 'Example',
      plan: 'Example Plan',
      monthlyPrice: 20,
      currency: 'USD',
      allowance: '100 requests',
      billingCycle: 'monthly',
      availableModels: ['example-model'],
      usageRestrictions: 'personal use',
      sourceUrl: 'https://example.com/pricing',
      verifiedAt: '2026-10-31',
      status: 'verified',
    };
    expect(() => parseTokenPlans([{ ...plan, monthlyPrice: -1 }])).toThrow();
    expect(() => parseTokenPlans([plan, plan])).toThrow(/重复 id/);
  });
});
