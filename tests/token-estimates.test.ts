import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDocument, TIERS, type EstimatesDocument, type TokenBasis } from '../scripts/data/lib/token-estimate.mjs';

/**
 * issue #8：Token Plan 额度 → 实际可用 token 量。
 *
 * 守三件事，不是守当前数值：
 *   1. 依据覆盖全部套餐（新增套餐没写依据要立刻红，不能静默漏掉）
 *   2. 档位与「有没有数值」一致（有数值的档位不许出现在无值档里，反之亦然）
 *   3. 算出来的量级合理（防止单位错 100 倍——这是这类折算最容易犯的错）
 */

interface PlanRow {
  id: string;
  provider: string;
  plan: string;
  monthlyPrice: number | null;
  billingCurrency: 'CNY' | 'USD';
}
function read<T>(p: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), p), 'utf8')) as T;
}
const basis = read<TokenBasis>('src/data/estimates/token-basis.json');
const plans = read<PlanRow[]>('src/data/entries/plans.json');
const generated = read<EstimatesDocument>('src/data/generated/token-estimates.generated.json');

const plansById = new Map(plans.map((p) => [p.id, p]));
const doc = buildDocument(basis, plansById);

/** 有数值的档位 */
const NUMERIC_TIERS = new Set([
  'official_currency',
  'official_credit_rate',
  'official_token_table',
  'derived_from_currency',
]);
/** 明确不给数值的档位 */
const NON_NUMERIC_TIERS = new Set([
  'unknown_rate',
  'count_only',
  'relative_only',
  'qualitative',
  'unavailable',
]);

describe('#8 折算依据完整性', () => {
  it('每条套餐都有折算依据', () => {
    const covered = new Set(basis.plans.map((r) => r.planId));
    const missing = plans.map((p) => p.id).filter((id) => !covered.has(id));
    expect(missing, `缺依据的套餐：${missing.join(', ')}`).toHaveLength(0);
  });

  it('依据里不引用已不存在的套餐（防止删套餐后留死条目）', () => {
    const ids = new Set(plans.map((p) => p.id));
    const stale = basis.plans.map((r) => r.planId).filter((id) => !ids.has(id));
    expect(stale, `依据里有已删套餐：${stale.join(', ')}`).toHaveLength(0);
  });

  it('每条依据都写明口径与来源', () => {
    for (const row of basis.plans) {
      expect(row.method, `${row.planId} 缺 method`).toBeTruthy();
      if (NUMERIC_TIERS.has(row.tier)) {
        expect(row.sourceUrl, `${row.planId} 有数值却没来源`).toMatch(/^https:\/\//);
      }
    }
  });

  it('用到的基准模型都有单价定义', () => {
    for (const row of basis.plans) {
      if (!row.basisModel) continue;
      expect(basis.currencyPrices[row.basisModel], `${row.basisModel} 没单价`).toBeDefined();
    }
  });
});

describe('#8 档位与数值的一致性', () => {
  it('档位只允许是已定义的那些', () => {
    for (const e of Object.values(doc.estimates)) {
      expect(TIERS[e.tier], `未知档位 ${e.tier}`).toBeDefined();
    }
  });

  it('有数值档必须给出 blended，无值档必须不给', () => {
    for (const [pid, e] of Object.entries(doc.estimates)) {
      if (NUMERIC_TIERS.has(e.tier)) {
        expect(e.blendedMillion, `${pid} 属 ${e.tier} 却没数值`).not.toBeNull();
        expect(e.valueKind, `${pid} 缺 valueKind`).toBeTruthy();
      } else if (NON_NUMERIC_TIERS.has(e.tier)) {
        expect(e.blendedMillion, `${pid} 属 ${e.tier} 不该有数值`).toBeNull();
      }
    }
  });

  it('纯输入量必须大于等于混合量（同单价下输入更便宜，能换更多 token）', () => {
    for (const [pid, e] of Object.entries(doc.estimates)) {
      if (e.inputOnlyMillion === null || e.blendedMillion === null) continue;
      if (e.valueKind === 'official_total') continue; // 官方总量不是「纯输入」口径
      expect(e.inputOnlyMillion, `${pid} 纯输入应 ≥ 混合`).toBeGreaterThanOrEqual(e.blendedMillion);
    }
  });
});

describe('#8 量级合理性（防单位错 100 倍）', () => {
  it('阶跃 Mini：400M Credit = ¥400，按 step-5-preview 应折出数千万级 token', () => {
    // ¥400 ÷ ((3×7+20)/1M) × 4 = 39.02M
    const e = doc.estimates['stepfun-step-plan-mini'];
    expect(e.blendedMillion).toBeGreaterThan(30);
    expect(e.blendedMillion).toBeLessThan(50);
  });

  it('百度 Pro：45,000 积分按 1 积分≈1280/366 token 应折出数千万级', () => {
    const e = doc.estimates['baidu-token-plan-pro'];
    expect(e.blendedMillion).toBeGreaterThan(25);
    expect(e.blendedMillion).toBeLessThan(50);
    // 官方上限：全部当输入 45,000×1280 = 57.6M
    expect(e.inputOnlyMillion).toBe(58);
  });

  it('智谱 Lite：官方 0.52~1.04 亿 Tokens/周 → 月度量应在数亿级', () => {
    const e = doc.estimates['zhipu-glm-coding-lite'];
    // 1.04亿/周 × 52/12 ≈ 4.51 亿 = 451M
    expect(e.blendedMillion).toBeGreaterThan(400);
    expect(e.blendedMillion).toBeLessThan(500);
    expect(e.weeklyMaxMillion).toBe(104);
    expect(e.weeklyMinMillion).toBe(52);
  });

  it('Copilot Pro：$15 AI Credits 按 Sonnet 5.5 折，应是百万以内', () => {
    const e = doc.estimates['github-copilot-pro'];
    expect(e.blendedMillion).toBeGreaterThan(3);
    expect(e.blendedMillion).toBeLessThan(5);
  });

  it('全部有数值的条目都在 (0, 100000] 百万区间内', () => {
    for (const [pid, e] of Object.entries(doc.estimates)) {
      if (e.blendedMillion === null) continue;
      expect(e.blendedMillion, `${pid} 量级异常`).toBeGreaterThan(0);
      expect(e.blendedMillion, `${pid} 量级异常`).toBeLessThan(100000);
    }
  });
});

describe('#8 产物与生成物一致', () => {
  it('入库的 generated.json 与重算结果完全一致（改依据必须重跑脚本）', () => {
    expect(JSON.stringify(generated.estimates)).toBe(JSON.stringify(doc.estimates));
  });

  it('覆盖率统计与实际条目吻合', () => {
    const withNumbers = Object.values(doc.estimates).filter((e) => e.blendedMillion !== null).length;
    expect(doc.coverage.withNumbers).toBe(withNumbers);
    expect(doc.coverage.plans).toBe(plans.length);
  });

  it('不同基准模型的 token 不可直接比较——数据里必须能看出基准模型', () => {
    // 这不是形式检查：GLM-5.3 的 1 token ≠ Step-5 的 1 token，
    // 跨模型横比必须带基准模型名，否则前端会给出错误结论
    const numeric = Object.values(doc.estimates).filter((e) => e.blendedMillion !== null);
    for (const e of numeric) {
      expect(e.basisModel, `${e.planId} 缺基准模型，无法判断可比性`).toBeTruthy();
    }
    // 基准模型应当多于一个 —— 说明数据里确实混了不同基准，前端必须分组/标注
    const models = new Set(numeric.map((e) => e.basisModel));
    expect(models.size).toBeGreaterThan(1);
  });
});
