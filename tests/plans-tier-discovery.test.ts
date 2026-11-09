import { describe, expect, it } from 'vitest';
import {
  classifyToken,
  collectPriceTokens,
  evaluateGroup,
  foldTokens,
  formatPlansTierDiscoveryReport,
  parseVolcengineMonthly,
  runPlansTierDiscoveryCommand,
} from '../scripts/data/lib/plans-tier-discovery.mjs';

/** 仿 Anthropic 定价页：单价表 + 月费卡片 + 额度句（三个真实现象） */
const anthropicLike = `
<html><body>
  <p class="card__price" data-plan="pro_monthly" data-plan-field="amount_per_month">$20</p>
  <p class="card__price" data-plan="max_monthly" data-plan-field="amount_per_month">$100</p>
  <table><tr><th>Model</th><th>Input</th><th>Output</th></tr>
    <tr><td>Sonnet</td><td>$3 / MTok</td><td>$15 / MTok</td></tr></table>
  <p>Up to $500 per month in pooled API credits</p>
</body></html>`;

/** 仿 OpenCode：$120 + 坐标轴 100 + 1K 粘成 1201001 */
const concatLike = `<div><span>$120</span><div class="tick"><span>100</span>1K</div></div>`;

/** 仿 StepFun：Markdown 定价表，月付/季付/年付分列 */
const markdownLike = `
| 档位 | 月度 Credit | 月付 | 季付 | 年付 |
| - | - | - | - | - |
| Mini | 400M | ¥49 | ¥129 | ¥456 |
| Plus | 1,600M | ¥99 | ¥269 | ¥936 |
`;

const plan = (overrides: Record<string, unknown>) => ({
  id: 'x', provider: 'X', providerId: 'x', plan: 'P', monthlyPrice: 0,
  billingCurrency: 'CNY', status: 'verified', sourceUrl: 'https://example.com', verifiedAt: '2026-11-01',
  allowance: '', ...overrides,
});

describe('v0.12.0 套餐档位发现：月费语境降噪', () => {
  it('token 单价不得进月费集合，额度句降级为低置信（反例一）', () => {
    const folded = foldTokens(collectPriceTokens(anthropicLike));
    const monthly = folded.filter((row) => row.kinds.includes('monthly')).map((row) => row.value).sort((a, b) => a - b);
    expect(monthly).toEqual([20, 100]);
    // $3 / MTok 是单价：必须有 unit 证据且不出现 monthly
    const unit = folded.find((row) => row.value === 3)!;
    expect(unit.kinds).toContain('unit');
    expect(unit.kinds).not.toContain('monthly');
    // $500 带 per month 但其实是额度 → 必须有 conflict 证据，不能只当干净月费
    const allowance = folded.find((row) => row.value === 500)!;
    expect(allowance.kinds).toContain('conflict');
  });

  it('跨标签拼接的 1201001 必须落「疑似解析异常」，不许静默丢弃（反例二）', () => {
    const folded = foldTokens(collectPriceTokens(concatLike));
    const anomaly = folded.find((row) => row.value === 1201001);
    expect(anomaly, '拼接值必须被抽出来并标为异常').toBeTruthy();
    expect(anomaly!.kinds).toContain('anomaly');
    expect(anomaly!.reasons.join(' ')).toContain('拼接');
  });

  it('Markdown 表按「月付」列认月费，季付/年付列不混入', () => {
    const folded = foldTokens(collectPriceTokens(markdownLike));
    const monthly = folded.filter((row) => row.kinds.includes('monthly')).map((row) => row.value).sort((a, b) => a - b);
    expect(monthly).toEqual([49, 99]);
    const quarterly = folded.find((row) => row.value === 129)!;
    expect(quarterly.kinds).not.toContain('monthly');
  });

  it('页面真多出 ¥129 档时报高置信「新增档位」', () => {
    const folded = foldTokens(collectPriceTokens(markdownLike));
    const group = evaluateGroup([plan({ monthlyPrice: 49 }), plan({ monthlyPrice: 99, id: 'y', plan: 'Plus' })], folded);
    expect(group.reliable).toBe(true);
    expect(group.candidates.map((row) => row.price)).toEqual([]); // 129 属季付，不该进候选

    const withNewTier = markdownLike.replace('| Plus | 1,600M | ¥99 | ¥269 | ¥936 |', '| Plus | 1,600M | ¥99 | ¥269 | ¥936 |\n| Team | 3,200M | ¥129 | ¥339 | ¥1,176 |');
    const folded2 = foldTokens(collectPriceTokens(withNewTier));
    const group2 = evaluateGroup([plan({ monthlyPrice: 49 }), plan({ monthlyPrice: 99, id: 'y', plan: 'Plus' })], folded2);
    expect(group2.candidates.map((row) => row.price)).toEqual([129]);
  });

  it('已录档位在页面消失时报「疑似下架」，且不误报其它档', () => {
    const page = markdownLike.replace('| Plus | 1,600M | ¥99 | ¥269 | ¥936 |', '| Plus | 1,600M | ¥110 | ¥269 | ¥936 |');
    const folded = foldTokens(collectPriceTokens(page));
    const group = evaluateGroup([plan({ monthlyPrice: 49 }), plan({ monthlyPrice: 99, id: 'y', plan: 'Plus' })], folded);
    expect(group.reliable).toBe(true);
    expect(group.removed).toEqual([99]);
    expect(group.candidates.map((row) => row.price)).toEqual([110]);
  });

  it('volcengine：季/年折算一致才采用，月档占位符不硬判', () => {
    const html = '<script>{"name":"Lite","priceConfig":{"discountAmount":"9.9","originalAmount":"40/月"},"periodUnit":"元/月"},'
      + '{"name":"Lite","originalAmount":"120/季","periodUnit":"元/季"},{"name":"Lite","originalAmount":"480/年","periodUnit":"元/年"}</script>';
    const parsed = parseVolcengineMonthly(html);
    expect(parsed?.derivedMonthly).toEqual([40]);
    expect(parsed?.crossChecked).toEqual([40]);
    expect(parsed?.placeholderNote).toBeNull();
  });

  it('不完整页面（只解析出 1 个月费）判「无法判定」，不报假下架', async () => {
    const result = await runPlansTierDiscoveryCommand({
      plans: [plan({ monthlyPrice: 8 }), plan({ monthlyPrice: 20, id: 'b', plan: 'Plus' })],
      fetchPage: async () => ({ text: anthropicLike.replace('<p class="card__price" data-plan="max_monthly" data-plan-field="amount_per_month">$100</p>', ''), status: 200 }),
    });
    expect(result.removed).toEqual([]);
    expect(result.coverage.unknown).toBeGreaterThan(0);
    expect(formatPlansTierDiscoveryReport(result)).toContain('无法判定');
  });

  it('抓不到只记 unavailable，不抛错（report-only）', async () => {
    const result = await runPlansTierDiscoveryCommand({
      plans: [plan({ monthlyPrice: 20 })],
      fetchPage: async () => { throw new Error('boom'); },
    });
    expect(result.unavailable).toHaveLength(1);
    expect(result.coverage.unavailable).toBe(1);
  });

  it('参数越界抛错（--timeout-ms）', async () => {
    await expect(runPlansTierDiscoveryCommand({ plans: [], timeoutMs: 0 })).rejects.toThrow(/timeout-ms/);
  });

  it('额度语境里的数字不当作月费', () => {
    const verdict = classifyToken({
      value: 2000, currency: 'USD', attrs: '', label: 'premium requests 2000', before: '', after: ' per month',
      header: '', rowLabel: 'premium requests', rowPrices: 1, snippet: '2000',
    });
    expect(verdict.kind).toBe('allowance');
  });
});
