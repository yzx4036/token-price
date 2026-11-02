import { describe, expect, it } from 'vitest';
import { apiPrices, tokenEstimates, tokenPlans } from '../src/lib/data';
import type { PlanEstimate } from '../src/lib/token-estimate-view';
import {
  DEFAULT_BLEND_RATIO,
  allowanceValueSentence,
  breakEvenBasisOf,
  breakEvenSentence,
  comparePlanVsApi,
  comparePlansForUsage,
  computeBreakEven,
  formatMillionTokens,
  matchStrength,
  pickBasisModel,
} from '../src/lib/plan-vs-api';
import type { ApiPrice, TokenPlan } from '../src/lib/schema';

function makePlan(overrides: Partial<TokenPlan> = {}): TokenPlan {
  return {
    id: 'test-plan',
    providerId: 'openai',
    provider: 'OpenAI',
    plan: 'Test Plan',
    monthlyPrice: 20,
    billingCurrency: 'USD',
    allowance: null,
    billingCycle: '每月',
    availableModels: [],
    usageRestrictions: null,
    sourceUrl: 'https://example.com',
    verifiedAt: '2026-11-01',
    status: 'verified',
    allowanceNature: 'quota',
    ...overrides,
  } as TokenPlan;
}

function makeModel(overrides: Partial<ApiPrice> = {}): ApiPrice {
  return {
    id: 'test-model',
    providerId: 'openai',
    provider: 'OpenAI',
    model: 'Test Model',
    billingCurrency: 'USD',
    reportedCurrency: 'USD',
    unit: 'per_1m_tokens',
    inputPrice: 2,
    outputPrice: 10,
    cacheReadPrice: null,
    cacheWritePrice: null,
    contextTokens: null,
    sourceUrl: 'https://example.com',
    provenance: 'official',
    aggregateSource: null,
    aggregateFetchedAt: null,
    verifiedAt: '2026-11-01',
    status: 'verified',
    pricingCondition: '测试用',
    notes: null,
    ...overrides,
  } as ApiPrice;
}

describe('保本点：只认官方页抓取 + 同币种', () => {
  it('聚合数据不能当基准（误差会被放大到花钱决策上）', () => {
    expect(breakEvenBasisOf(makeModel({ provenance: 'aggregate' }))).toBeNull();
  });

  it('缺价或零价不能当基准', () => {
    expect(breakEvenBasisOf(makeModel({ inputPrice: null }))).toBeNull();
    expect(breakEvenBasisOf(makeModel({ outputPrice: null }))).toBeNull();
    expect(breakEvenBasisOf(makeModel({ outputPrice: 0 }))).toBeNull();
  });

  it('报价币种与账单币种不一致时不能当基准（数字不是该厂商计价单位）', () => {
    expect(breakEvenBasisOf(makeModel({ billingCurrency: 'CNY', reportedCurrency: 'USD' }))).toBeNull();
  });

  it('正常官方条目可用', () => {
    const b = breakEvenBasisOf(makeModel());
    expect(b).not.toBeNull();
    expect(b!.inputPrice).toBe(2);
    expect(b!.outputPrice).toBe(10);
  });
});

describe('保本点计算（混合口径 3:1）', () => {
  it('$20 月费 / 输出 $10 + 输入 $2 → 20 / (10 + 3×2) = 1.25M 输出', () => {
    const outcome = computeBreakEven(makePlan({ monthlyPrice: 20 }), makeModel());
    expect(outcome.kind).toBe('break_even');
    if (outcome.kind !== 'break_even') return;
    expect(outcome.result.outputMillion).toBeCloseTo(20 / 16, 10);
    expect(outcome.result.inputMillion).toBeCloseTo((20 / 16) * 3, 10);
    expect(outcome.result.totalMillion).toBeCloseTo((20 / 16) * 4, 10);
    expect(outcome.result.ratio).toBe(DEFAULT_BLEND_RATIO);
  });

  it('混合口径比纯输出口径更保守（把输入成本算进去了）', () => {
    const model = makeModel();
    const outcome = computeBreakEven(makePlan({ monthlyPrice: 20 }), model);
    if (outcome.kind !== 'break_even') throw new Error('应为 break_even');
    const pureOutput = 20 / model.outputPrice!;
    // 纯输出会给出 2M，混合口径给出 1.25M —— 后者更保守，不会让读者高估套餐
    expect(outcome.result.outputMillion).toBeLessThan(pureOutput);
    expect(pureOutput).toBeCloseTo(2, 10);
  });

  it('免费套餐不出保本点（月费 0 时任何用量都是套餐划算，结论无意义）', () => {
    const outcome = computeBreakEven(makePlan({ monthlyPrice: 0 }), makeModel());
    expect(outcome.kind).toBe('no_price');
  });

  it('没有月费的套餐出 no_price 并给出可读原因', () => {
    const outcome = computeBreakEven(makePlan({ monthlyPrice: null }), makeModel());
    expect(outcome.kind).toBe('no_price');
    if (outcome.kind === 'no_price') expect(outcome.reason).toContain('未公布月费');
  });

  it('跨币种拒绝折算（换汇是另一层不确定性，不混进保本点）', () => {
    const outcome = computeBreakEven(
      makePlan({ billingCurrency: 'USD' }),
      makeModel({ billingCurrency: 'CNY', reportedCurrency: 'CNY' }),
    );
    expect(outcome.kind).toBe('no_model');
    if (outcome.kind === 'no_model') expect(outcome.reason).toContain('跨币种');
  });

  it('零价基准不产生 Infinity（防除零）', () => {
    const outcome = computeBreakEven(
      makePlan(),
      makeModel({ inputPrice: 0, outputPrice: 0 }),
    );
    expect(outcome.kind).toBe('no_model');
  });
});

describe('基准模型挑选', () => {
  it('只在本厂商内选，绝不跨厂商兜底', () => {
    // 踩过的坑：曾允许「同地区同币种」兜底，结果百度/腾讯套餐按智谱的低价模型
    // 算出「¥9.9 ≈ 99M」「¥99 ≈ 990M」，语义上完全错误
    const plan = makePlan({ providerId: 'tencent', billingCurrency: 'CNY' });
    const picked = pickBasisModel(plan, [
      makeModel({ id: 'zhipu-cny', providerId: 'zhipu', billingCurrency: 'CNY', reportedCurrency: 'CNY', outputPrice: 0.1 }),
      makeModel({ id: 'baidu-cny', providerId: 'baidu', billingCurrency: 'CNY', reportedCurrency: 'CNY', outputPrice: 0.2 }),
    ]);
    // 腾讯自己没有 API 条目 → 宁可返回 null，也不借别家的价
    expect(picked).toBeNull();
  });

  it('同厂商有多条时按模型去重后取中位档，不取最便宜', () => {
    const plan = makePlan({ providerId: 'openai' });
    const picked = pickBasisModel(
      plan,
      [
        makeModel({ id: 'cheap', providerId: 'openai', model: 'Model A', outputPrice: 0.5 }),
        makeModel({ id: 'mid', providerId: 'openai', model: 'Model B', outputPrice: 10 }),
        makeModel({ id: 'high', providerId: 'openai', model: 'Model C', outputPrice: 50 }),
      ],
    );
    // 中位数是 Model B；取最便宜会系统性高估套餐价值
    expect(picked!.id).toBe('mid');
  });

  it('同模型的多档位条目先去重，避免中位数偏到长上下文溢价档', () => {
    // 实测 OpenAI 曾选中「GPT-6.1 Sol（长上下文 >272K）」——那是高价特例
    const plan = makePlan({ providerId: 'openai' });
    const picked = pickBasisModel(
      plan,
      [
        makeModel({ id: 'sol-base', providerId: 'openai', model: 'GPT Sol', outputPrice: 10 }),
        makeModel({ id: 'sol-longctx', providerId: 'openai', model: 'GPT Sol（长上下文 >272K）', outputPrice: 40 }),
        makeModel({ id: 'luna', providerId: 'openai', model: 'GPT Luna', outputPrice: 0.5 }),
      ],
    );
    // 去重后只剩 2 个模型：Luna 0.5 / Sol 10（取 Sol 的便宜档）→ 中位数取索引 1 = Sol
    expect(picked!.model).toBe('GPT Sol');
    expect(picked!.outputPrice).toBe(10);
  });

  it('优先用套餐自己列出的可用模型，不按厂商全量中位数', () => {
    // 踩过的坑：智谱 Coding Plan 只卖 GLM-5.3 / 5.3-Flash，但按全厂商中位数选中了
    // GLM-4-Plus —— 页面上出现「按 GLM-4-Plus 反推」而套餐根本用不了这个模型
    const plan = makePlan({
      providerId: 'zhipu', billingCurrency: 'CNY', availableModels: ['GLM-5.3', 'GLM-5.3-Flash'],
    });
    const picked = pickBasisModel(plan, [
      makeModel({ id: 'plus', providerId: 'zhipu', billingCurrency: 'CNY', reportedCurrency: 'CNY', model: 'GLM-4-Plus', outputPrice: 5 }),
      makeModel({ id: 'v53', providerId: 'zhipu', billingCurrency: 'CNY', reportedCurrency: 'CNY', model: 'GLM-5.3', outputPrice: 28 }),
      makeModel({ id: 'flash', providerId: 'zhipu', billingCurrency: 'CNY', reportedCurrency: 'CNY', model: 'GLM-5.3-Flash', outputPrice: 2.8 }),
    ]);
    expect(picked!.model).toBe('GLM-5.3');
  });

  it('完全相同优先于名字更像的子串（防 FlashX-Legal 冒充 Flash）', () => {
    // GLM-5.3-FlashX-Legal 包含 GLM-5.3-Flash，只做子串会把「法律版」算成套餐的 Flash 档
    const plan = makePlan({
      providerId: 'zhipu', billingCurrency: 'CNY', availableModels: ['GLM-5.3', 'GLM-5.3-Flash'],
    });
    const picked = pickBasisModel(plan, [
      makeModel({ id: 'flash', providerId: 'zhipu', billingCurrency: 'CNY', reportedCurrency: 'CNY', model: 'GLM-5.3-Flash', outputPrice: 2.8 }),
      makeModel({ id: 'legal', providerId: 'zhipu', billingCurrency: 'CNY', reportedCurrency: 'CNY', model: 'GLM-5.3-FlashX-Legal', outputPrice: 7 }),
      makeModel({ id: 'flashx', providerId: 'zhipu', billingCurrency: 'CNY', reportedCurrency: 'CNY', model: 'GLM-5.3-FlashX', outputPrice: 7 }),
    ]);
    expect(picked!.model).toBe('GLM-5.3-Flash');
  });

  it('套餐写的是模糊描述时退回全厂商中位数，不强行匹配', () => {
    // 「最新 Grok 模型」这类描述里没有可比对的模型名
    const plan = makePlan({ providerId: 'xai', availableModels: ['最新 Grok 模型'] });
    const picked = pickBasisModel(plan, [
      makeModel({ id: 'a', providerId: 'xai', model: 'grok-4-small', outputPrice: 1 }),
      makeModel({ id: 'b', providerId: 'xai', model: 'grok-4-mid', outputPrice: 10 }),
      makeModel({ id: 'c', providerId: 'xai', model: 'grok-4-big', outputPrice: 40 }),
    ]);
    expect(picked!.id).toBe('b');
  });

  it('短词不参与匹配（Pro / Max / Go 不能拽进不相关模型）', () => {
    expect(matchStrength('GLM Coding Plan Pro', 'Pro')).toBe(0);
    expect(matchStrength('GPT-5.6 Sol', 'Go')).toBe(0);
  });

  it('无任何可用官方条目时返回 null，不硬凑', () => {
    expect(pickBasisModel(makePlan(), [makeModel({ provenance: 'aggregate' })])).toBeNull();
  });
});

describe('用量对比（订阅 vs 按量）', () => {
  it('用量低时按量更省，用量高时订阅更省', () => {
    const plan = makePlan({ monthlyPrice: 20 });
    const model = makeModel();

    const low = comparePlanVsApi(plan, model, { inputMillion: 0.1, outputMillion: 0.1 });
    if (low.kind !== 'ok') throw new Error('应为 ok');
    // 0.1×2 + 0.1×10 = $1.2，远低于 $20
    expect(low.apiCost).toBeCloseTo(1.2, 6);
    expect(low.cheaper).toBe('api');

    const high = comparePlanVsApi(plan, model, { inputMillion: 30, outputMillion: 10 });
    if (high.kind !== 'ok') throw new Error('应为 ok');
    // 30×2 + 10×10 = $160，远高于 $20
    expect(high.apiCost).toBeCloseTo(160, 6);
    expect(high.cheaper).toBe('plan');
  });

  it('恰好等于保本点时应判持平（浮点不能直接用 ===）', () => {
    const plan = makePlan({ monthlyPrice: 20 });
    const model = makeModel();
    const be = computeBreakEven(plan, model);
    if (be.kind !== 'break_even') throw new Error('应为 break_even');
    const cmp = comparePlanVsApi(plan, model, {
      inputMillion: be.result.inputMillion,
      outputMillion: be.result.outputMillion,
    });
    if (cmp.kind !== 'ok') throw new Error('应为 ok');
    expect(cmp.cheaper).toBe('tie');
    expect(cmp.apiCost).toBeCloseTo(20, 6);
  });

  it('负用量被拒绝，不产生负成本', () => {
    const cmp = comparePlanVsApi(makePlan(), makeModel(), { inputMillion: -1, outputMillion: 1 });
    expect(cmp.kind).toBe('fail');
  });

  it('NaN 被拒绝', () => {
    const cmp = comparePlanVsApi(makePlan(), makeModel(), { inputMillion: Number.NaN, outputMillion: 1 });
    expect(cmp.kind).toBe('fail');
  });

  it('跨币种比较被拒绝', () => {
    const cmp = comparePlanVsApi(
      makePlan({ billingCurrency: 'USD' }),
      makeModel({ billingCurrency: 'CNY', reportedCurrency: 'CNY' }),
      { inputMillion: 1, outputMillion: 1 },
    );
    expect(cmp.kind).toBe('fail');
  });
});

describe('格式化与文案', () => {
  it('百万 token 分级显示', () => {
    expect(formatMillionTokens(451.2)).toBe('451M');
    expect(formatMillionTokens(45.12)).toBe('45.1M');
    expect(formatMillionTokens(4.512)).toBe('4.51M');
    expect(formatMillionTokens(0.4512)).toBe('0.451M');
    expect(formatMillionTokens(-1)).toBe('—');
    expect(formatMillionTokens(Number.NaN)).toBe('—');
  });

  it('保本点结论必须同时说清：反推、基准模型、输入输出比例', () => {
    const outcome = computeBreakEven(makePlan({ monthlyPrice: 20 }), makeModel());
    const text = breakEvenSentence(outcome);
    // 三件事缺一件就会被误读成「官方给的额度」
    expect(text).toContain('反推');
    expect(text).toContain('OpenAI Test Model');
    expect(text).toContain('3:1');
    expect(text).toContain('订阅才比按量付费便宜');
  });

  it('无法折算时也要给可读原因，不留空', () => {
    expect(breakEvenSentence(computeBreakEven(makePlan({ monthlyPrice: null }), makeModel())))
      .toContain('未公布月费');
    expect(breakEvenSentence(computeBreakEven(makePlan(), makeModel({ provenance: 'aggregate' }))))
      .toContain('没有可用的官方单价');
  });
});

describe('官方额度「用满值多少钱」', () => {
  it('按 3:1 拆分输入输出后乘单价，得出等效按量成本', () => {
    // 官方额度 400M 混合；3:1 → 输入 300M / 输出 100M
    // 成本 = 300×2 + 100×10 = 1600；月费 $20 → 80 倍
    const text = allowanceValueSentence(400, makeModel(), makePlan({ monthlyPrice: 20 }));
    expect(text).toContain('$1,600');
    expect(text).toContain('80 倍');
  });

  it('额度价值低于月费时不说倍数，避免「0.3 倍」这种反直觉表述', () => {
    const text = allowanceValueSentence(1, makeModel(), makePlan({ monthlyPrice: 20 }));
    expect(text).toContain('低于月费');
  });

  it('缺月费 / 缺单价 / 跨币种 / 非法额度一律返回 null（不硬编）', () => {
    expect(allowanceValueSentence(400, makeModel(), makePlan({ monthlyPrice: null }))).toBeNull();
    expect(allowanceValueSentence(400, makeModel({ provenance: 'aggregate' }), makePlan())).toBeNull();
    expect(allowanceValueSentence(400, makeModel({ billingCurrency: 'CNY', reportedCurrency: 'CNY' }), makePlan())).toBeNull();
    expect(allowanceValueSentence(0, makeModel(), makePlan())).toBeNull();
    expect(allowanceValueSentence(Number.NaN, makeModel(), makePlan())).toBeNull();
  });

  it('真实数据：有官方额度的套餐能算出这句，且倍数不小于 1（套餐不该比按量还贵）', () => {
    const ests = tokenEstimates.estimates as Record<string, PlanEstimate>;
    let computed = 0;
    for (const plan of tokenPlans) {
      const est = ests[plan.id];
      const official = est?.blendedMillion ?? null;
      if (official === null) continue;
      const model = pickBasisModel(plan, apiPrices);
      if (!model) continue;
      const text = allowanceValueSentence(official, model, plan);
      if (text === null) continue;
      computed += 1;
      expect(text).toContain('用满官方额度');
      // 如果出现「低于月费」，说明该套餐额度比按量还贵 —— 属于数据异常，值得人工复核
      expect(text).not.toContain('低于月费');
    }
    expect(computed).toBeGreaterThan(5);
  });
});

describe('真实数据下的表现', () => {
  it('每个带月费的套餐都能算出保本点或给出明确原因', () => {
    const paid = tokenPlans.filter((p) => p.monthlyPrice !== null && p.monthlyPrice > 0);
    expect(paid.length).toBeGreaterThan(0);
    let computed = 0;
    for (const plan of paid) {
      const model = pickBasisModel(plan, apiPrices);
      if (!model) continue; // 无同厂商 API 条目是允许的（百度/腾讯/Copilot 只有订阅）
      const outcome = computeBreakEven(plan, model);
      if (outcome.kind === 'break_even') {
        computed += 1;
        expect(Number.isFinite(outcome.result.outputMillion)).toBe(true);
        expect(outcome.result.outputMillion).toBeGreaterThan(0);
      } else {
        expect(outcome.reason.length).toBeGreaterThan(0);
      }
    }
    expect(computed).toBeGreaterThan(paid.length * 0.5);
  });

  it('基准模型必须与套餐同厂商同币种（防跨厂商借价）', () => {
    for (const plan of tokenPlans.filter((p) => p.monthlyPrice !== null)) {
      const model = pickBasisModel(plan, apiPrices);
      if (!model) continue;
      expect(model.providerId).toBe(plan.providerId);
      expect(model.billingCurrency).toBe(plan.billingCurrency);
      expect(model.provenance).toBe('official');
    }
  });

  it('批量对比的排序：订阅更省的在前，同组按差额绝对值降序', () => {
    const model = officialModelFor(apiPrices);
    // 大用量下必然有套餐更省
    const rows = comparePlansForUsage(
      tokenPlans,
      model,
      { inputMillion: 100, outputMillion: 30 },
      null,
    );
    expect(rows.length).toBeGreaterThan(0);
    // 前一半必须是 winner-plan（如果存在），且差额递减
    let sawApi = false;
    let prevAbs = Infinity;
    for (const row of rows) {
      if (row.winner !== 'plan') sawApi = true;
      // 一旦出现 api 组，后面不能再回到 plan 组
      if (sawApi) expect(row.winner).not.toBe('plan');
      if (!sawApi) {
        expect(Math.abs(row.deltaValue)).toBeLessThanOrEqual(prevAbs);
        prevAbs = Math.abs(row.deltaValue);
      }
    }
  });

  it('小用量下列表里不该出现「订阅更省」（说明对比逻辑没算反）', () => {
    const model = officialModelFor(apiPrices);
    const rows = comparePlansForUsage(tokenPlans, model, { inputMillion: 0.1, outputMillion: 0.02 }, null);
    // 极小用量下，任何有月费的套餐都应该比按量贵
    for (const row of rows) {
      expect(row.winner).toBe('api');
    }
  });
});

/** 取一条官方页抓取、同币种报价、有正价格的条目当基准 */
function officialModelFor(items: typeof apiPrices) {
  const found = items.find(
    (i) => i.provenance === 'official' && i.reportedCurrency === i.billingCurrency
      && i.inputPrice !== null && i.outputPrice !== null && i.outputPrice > 0,
  );
  if (!found) throw new Error('没有可用基准模型');
  return found;
}
