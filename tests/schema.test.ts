import { describe, expect, it } from 'vitest';
import aggregateRaw from '../src/data/generated/aggregate.generated.json';
import fxRaw from '../src/data/generated/fx.generated.json';
import apiEntries from '../src/data/entries/api.json';
import planEntries from '../src/data/entries/plans.json';
import providerEntries from '../src/data/providers.json';
import {
  mergeApiPrices,
  parseAggregateFile,
  parseApiPrices,
  parseFxRate,
  parseProviders,
  parseTokenPlans,
} from '../src/lib/schema';
import type { ApiPrice } from '../src/lib/schema';

// JSON 导入会把字面量放宽成 string，这里统一收敛到 schema 类型（校验仍由 parseApiPrices 负责）
const first = apiEntries[0] as unknown as ApiPrice;

describe('静态数据校验', () => {
  it('接受仓库中的官方页抓取数据、聚合生成物与已核验的 Plan 集合', () => {
    expect(parseApiPrices(apiEntries).length).toBeGreaterThanOrEqual(40);
    expect(parseAggregateFile(aggregateRaw).entries.length).toBeGreaterThan(0);
    expect(parseFxRate(fxRaw).rate).toBeGreaterThan(0);
    expect(parseProviders(providerEntries).length).toBeGreaterThanOrEqual(15);

    // 原先这里断言 Plan 集合为空。现在录入了真实套餐，改为校验「每条都够格进入比较」：
    // 已核验条目必须五项齐全（月费/额度/周期/模型/用途限制），否则 schema 已会拒绝。
    const plans = parseTokenPlans(planEntries);
    expect(plans.length).toBeGreaterThan(0);
    for (const plan of plans) {
      expect(plan.status).toBe('verified');
      expect(plan.monthlyPrice).not.toBeNull();
      expect(plan.allowance).toBeTruthy();
      expect(plan.billingCycle).toBeTruthy();
      expect(plan.availableModels.length).toBeGreaterThan(0);
      expect(plan.usageRestrictions).toBeTruthy();
      // 额度性质必须显式标注：它决定读者能不能看出「这档到底有没有天花板」
      expect(['mixed', 'quota', 'undisclosed']).toContain(plan.allowanceNature);
      expect(plan.sourceUrl.startsWith('https://')).toBe(true);
      expect(plan.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('锁定编排层基线明确列出的 DeepSeek、MiniMax 与 Anthropic 官方价', () => {
    const byId = new Map(apiEntries.map((entry) => [entry.id, entry]));
    const expected = {
      'deepseek-deepseek-flash-idle': [1, 4, 0.02, null, 'CNY'],
      'deepseek-deepseek-flash-peak': [2, 8, 0.04, null, 'CNY'],
      'deepseek-deepseek-v4-pro-idle': [4.5, 13.5, 0.15, null, 'CNY'],
      'deepseek-deepseek-v4-pro-peak': [9, 27, 0.3, null, 'CNY'],
      'minimax-minimax-m3-1-flash': [1, 4, 0.1, null, 'CNY'],
      'minimax-minimax-m3-512k': [2.1, 8.4, 0.42, null, 'CNY'],
      'minimax-minimax-m3-512k-plus': [4.2, 16.8, 0.84, null, 'CNY'],
      'claude-fable-5-1': [10, 50, 0.25, 12.5, 'USD'],
      'claude-opus-5-5': [4, 20, 0.2, 5, 'USD'],
      'claude-sonnet-5-5': [2, 10, 0.1, 2.5, 'USD'],
      'claude-haiku-5-5': [0.1, 0.5, 0.01, 0.125, 'USD'],
    } as const;

    for (const [id, values] of Object.entries(expected)) {
      const entry = byId.get(id);
      expect(entry, id).toBeDefined();
      expect([
        entry?.inputPrice,
        entry?.outputPrice,
        entry?.cacheReadPrice,
        entry?.cacheWritePrice,
        entry?.billingCurrency,
      ], id).toEqual(values);
      expect(entry?.provenance, id).toBe('official');
      expect(entry?.verifiedAt, id).toBe('2026-10-31');
    }
  });

  it('仓库内 official 条目的报价币种与账单币种一致（数据迁移后不变式）', () => {
    const parsed = parseApiPrices(apiEntries);
    const missing = parsed.filter((entry) => typeof entry.reportedCurrency !== 'string');
    expect(missing).toEqual([]);
    const mismatched = parsed
      .filter((entry) => entry.provenance === 'official')
      .filter((entry) => entry.reportedCurrency !== entry.billingCurrency)
      .map((entry) => entry.id);
    expect(mismatched).toEqual([]);
  });

  it('拒绝负价格（非法价格变异门禁）', () => {
    const mutated = [{ ...first, inputPrice: -0.01 }];
    expect(() => parseApiPrices(mutated)).toThrow();
  });

  it('拒绝重复 id', () => {
    expect(() => parseApiPrices([first, first])).toThrow(/重复 id/);
  });

  it.each(['inputPrice', 'outputPrice'] as const)('拒绝缺少 %s 的 verified 条目', (field) => {
    const mutated = [{ ...first, [field]: null }];
    expect(() => parseApiPrices(mutated)).toThrow(/输入和输出价格/);
  });

  it('允许 pending 价格为空，但拒绝 pending 条目缺少 schema 字段', () => {
    const pending = {
      ...first,
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
    ['API 价格', () => parseApiPrices([{ ...first, sourceUrl: 'http://example.com/pricing' }])],
    ['Token Plan', () => parseTokenPlans([{
      id: 'pending-plan',
      providerId: 'openai',
      provider: 'OpenAI',
      plan: 'Pending',
      monthlyPrice: null,
      billingCurrency: 'USD',
      allowance: null,
      billingCycle: null,
      availableModels: [],
      usageRestrictions: null,
      allowanceNature: 'quota',
      sourceUrl: 'http://example.com/pricing',
      verifiedAt: '2026-10-31',
      status: 'pending',
    }])],
  ])('拒绝使用非 HTTPS 来源的%s', (_label, parse) => {
    expect(parse).toThrow(/HTTPS/);
  });

  it('拒绝 official 条目缺少 sourceUrl（官方来源必填）', () => {
    const missing = { ...first } as Record<string, unknown>;
    delete missing.sourceUrl;
    expect(() => parseApiPrices([missing])).toThrow();
  });

  it('拒绝 official 条目附带聚合字段', () => {
    expect(() => parseApiPrices([{ ...first, aggregateSource: 'models.dev' }])).toThrow(/不得填写 aggregateSource/);
  });

  it('拒绝 official 条目报价币种与账单币种不一致（币种模型拆分门禁）', () => {
    const officialCny = apiEntries.find((entry) => entry.billingCurrency === 'CNY')!;
    expect(() => parseApiPrices([{ ...officialCny, reportedCurrency: 'USD' }])).toThrow(/报价币种/);
    const officialUsd = apiEntries.find((entry) => entry.billingCurrency === 'USD')!;
    expect(() => parseApiPrices([{ ...officialUsd, reportedCurrency: 'CNY' }])).toThrow(/报价币种/);
  });

  it('允许 aggregate 条目账单币种与报价币种不同（聚合源对国内厂商也以 USD 发布）', () => {
    const aggregate = {
      ...first,
      id: 'aggregate-cn-usd',
      billingCurrency: 'CNY' as const,
      reportedCurrency: 'USD' as const,
      provenance: 'aggregate' as const,
      aggregateSource: 'models.dev',
      aggregateFetchedAt: '2026-10-31',
    };
    expect(parseApiPrices([aggregate])).toHaveLength(1);
  });

  it('拒绝 aggregate 条目缺少 aggregateSource 或 aggregateFetchedAt', () => {
    const aggregate = {
      ...first,
      provenance: 'aggregate',
      aggregateSource: 'models.dev',
      aggregateFetchedAt: '2026-10-31',
    };
    expect(parseApiPrices([aggregate])).toHaveLength(1);
    expect(() => parseApiPrices([{ ...aggregate, aggregateSource: null }])).toThrow(/aggregateSource/);
    expect(() => parseApiPrices([{ ...aggregate, aggregateFetchedAt: null }])).toThrow(/aggregateFetchedAt/);
  });

  it.each(['not-a-date', '2026-02-30', '2026-10-31T00:00:00Z'])('拒绝非法核验日期 %s', (verifiedAt) => {
    expect(() => parseApiPrices([{ ...first, verifiedAt }])).toThrow();
  });

  it('拒绝非有限价格', () => {
    expect(() => parseApiPrices([{ ...first, inputPrice: Number.POSITIVE_INFINITY }])).toThrow();
  });

  it('拒绝额外字段，防止静默拼写错误', () => {
    const mutated = [{ ...first, typoPrice: 12 }];
    expect(() => parseApiPrices(mutated)).toThrow();
  });

  it('拒绝核心字段不完整却标为 verified 的 Token Plan', () => {
    const incompletePlan = {
      id: 'incomplete-plan',
      providerId: 'openai',
      provider: 'OpenAI',
      plan: 'Example Plan',
      monthlyPrice: null,
      billingCurrency: 'USD',
      allowance: null,
      billingCycle: null,
      availableModels: [],
      usageRestrictions: null,
      allowanceNature: 'quota',
      sourceUrl: 'https://example.com/pricing',
      verifiedAt: '2026-10-31',
      status: 'verified',
    };
    expect(() => parseTokenPlans([incompletePlan])).toThrow(/月费、额度、周期、模型与用途限制/);
  });

  it('拒绝 Token Plan 的负月费和重复 id', () => {
    const plan = {
      id: 'verified-plan',
      providerId: 'openai',
      provider: 'OpenAI',
      plan: 'Example Plan',
      monthlyPrice: 20,
      billingCurrency: 'USD',
      allowance: '100 requests',
      billingCycle: 'monthly',
      availableModels: ['example-model'],
      usageRestrictions: 'personal use',
      allowanceNature: 'quota',
      sourceUrl: 'https://example.com/pricing',
      verifiedAt: '2026-10-31',
      status: 'verified',
    };
    expect(() => parseTokenPlans([{ ...plan, monthlyPrice: -1 }])).toThrow();
    expect(() => parseTokenPlans([plan, plan])).toThrow(/重复 id/);
  });
});

describe('溯源优先级合并', () => {
  const official = {
    ...first,
    id: 'official-entry',
    provenance: 'official' as const,
    aggregateSource: null,
    aggregateFetchedAt: null,
  };
  const aggregate = {
    ...first,
    id: 'aggregate-entry',
    model: '另一个聚合模型',
    provenance: 'aggregate' as const,
    aggregateSource: 'models.dev',
    aggregateFetchedAt: '2026-10-31',
  };

  it('同 id 时 official 不被 aggregate 覆盖', () => {
    const merged = mergeApiPrices([official], [{ ...aggregate, id: 'official-entry', inputPrice: 99 }]);
    expect(merged).toHaveLength(1);
    expect(merged[0].provenance).toBe('official');
    expect(merged[0].inputPrice).toBe(official.inputPrice);
  });

  it('同厂商同模型双来源时官方胜出', () => {
    const merged = mergeApiPrices([official], [
      { ...aggregate, id: 'agg-copy', model: `${official.model.split('（')[0]}（聚合口径）` },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('official-entry');
  });

  it('聚合条目只补空缺，并保留原顺序', () => {
    const merged = mergeApiPrices([official], [aggregate, { ...aggregate, id: 'aggregate-2', model: 'another-model' }]);
    expect(merged.map((entry) => entry.id)).toEqual(['official-entry', 'aggregate-entry', 'aggregate-2']);
  });

  it('聚合内部同模型只保留第一条', () => {
    const merged = mergeApiPrices([], [aggregate, { ...aggregate, id: 'aggregate-dup' }]);
    expect(merged.map((entry) => entry.id)).toEqual(['aggregate-entry']);
  });
});
