import { describe, expect, it } from 'vitest';
import { apiPrices, benchmarkDoc, DATA_VERIFIED_AT, tokenPlans } from '../src/lib/data';
import { blendPerMillion, buildRowScore, formatCostPerPoint, type BenchmarkDoc } from '../src/lib/benchmark-view';
import { buildScatterChart, buildCompositionChart, buildHistoryChart, buildUsageCostChart } from '../src/lib/pricing-chart-data';
import { allowanceValueSentence, comparePlanVsApi, computeBreakEven, DEFAULT_BLEND_RATIO } from '../src/lib/plan-vs-api';
import { readFileSync } from 'node:fs';
import type { ApiPrice } from '../src/lib/schema';

const base = apiPrices.find((p) => p.provenance === 'official' && p.inputPrice! > 0 && p.outputPrice! > 0)!;
const read = (path: string) => readFileSync(path, 'utf8');
const item = (id: string, changes: Partial<ApiPrice> = {}): ApiPrice => ({ ...base, id, inputPrice: 2, outputPrice: 6, billingCurrency: 'USD', reportedCurrency: 'USD', ...changes });
const doc = (scores: Record<string, number | null>): BenchmarkDoc => ({ ...benchmarkDoc, byEntryId: Object.fromEntries(Object.entries(scores).map(([id, score]) => [id, score === null ? null : { score, aaSlug: id, tierUsed: 'test', baseModel: id }])) });

describe('散点数据同源', () => {
  it('仅有分正价者入图，缺失计数准确，币种隔离且前沿 ID 精确', () => {
    const api = [
      item('usd-a', { inputPrice: 1, outputPrice: 3 }),
      item('usd-d', { inputPrice: 2, outputPrice: 6 }),
      item('usd-b', { inputPrice: 2, outputPrice: 6 }),
      item('usd-c', { inputPrice: 4, outputPrice: 12 }),
      item('cny', { billingCurrency: 'CNY', reportedCurrency: 'CNY', inputPrice: 20 }),
      item('missing'), item('no-price', { inputPrice: null }), item('zero', { inputPrice: 0, outputPrice: 0 }), item('wrong-currency', { billingCurrency: 'CNY' }),
    ];
    const model = buildScatterChart(api, doc({ 'usd-a': 5, 'usd-d': 4, 'usd-b': 8, 'usd-c': 9, cny: 5, missing: null, 'no-price': 10, zero: 10, 'wrong-currency': 8 }));
    expect(model.groups.map((g) => [g.currency, g.points.map((p) => p.id)])).toEqual([
      ['USD', ['usd-a', 'usd-d', 'usd-b', 'usd-c']],
      ['CNY', ['cny']],
    ]);
    // 前沿按 ID 集合断言：usd-d 与 usd-b 同价但分数更低，被支配；币种之间互不参与。
    expect(model.groups.map((g) => [g.currency, g.points.filter((p) => p.frontier).map((p) => p.id)])).toEqual([
      ['USD', ['usd-a', 'usd-b', 'usd-c']],
      ['CNY', ['cny']],
    ]);
    expect(model.excluded).toBe(4);
    expect(model.unscored).toBe(1);
    expect(model.invalidPrice).toBe(3);
  });
  it('10 个真实点逐字段对拍表格公式', () => {
    const points = buildScatterChart(apiPrices, benchmarkDoc).groups.flatMap((g) => g.points).slice(0, 10);
    expect(points).toHaveLength(10);
    for (const point of points) {
      const source = apiPrices.find((p) => p.id === point.id)!;
      const score = buildRowScore(source, benchmarkDoc)!;
      expect(point.price).toBe(blendPerMillion(source));
      expect(point.score).toBe(score.score);
      expect(point.costPerPoint).toBe(score.costPerPoint);
      expect(point.costText).toBe(formatCostPerPoint(score.costPerPoint));
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
  });
  it('非法价、负分、全缺不制造坐标', () => {
    const model = buildScatterChart([item('negative', { inputPrice: -1 }), item('infinite', { outputPrice: Infinity }), item('bad-score')], doc({ negative: 10, infinite: 10, 'bad-score': -1 }));
    expect(model.groups).toEqual([]);
    expect(model.excluded).toBe(3);
  });
  it('所有真实点保留，响应式标签有上限，重合标题列出全部名称', () => {
    const model = buildScatterChart([item('a', { model: 'Alpha' }), item('b', { model: 'Beta' })], doc({ a: 10, b: 10 }));
    expect(model.groups[0]!.points).toHaveLength(2);
    for (const p of model.groups[0]!.points) { expect(p.title).toContain('Alpha'); expect(p.title).toContain('Beta'); }
    for (const group of buildScatterChart(apiPrices, benchmarkDoc).groups) {
      expect(group.points.filter((p) => p.desktopLabel).length).toBeLessThanOrEqual(12);
      expect(group.points.filter((p) => p.mobileLabel).length).toBeLessThanOrEqual(5);
    }
  });
});

describe('价格构成', () => {
  it('四价齐全与缺写价不补零、不生成缺段', () => {
    const chart = buildCompositionChart([item('full', { cacheReadPrice: 1, cacheWritePrice: 3 }), item('missing', { cacheReadPrice: 1, cacheWritePrice: null })]);
    const rows = chart.groups[0]!.rows;
    expect(rows[0]!.segments.map((s) => s.index)).toEqual([0, 1, 2, 3]);
    expect(rows[1]!.segments.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(rows[1]!.missingWrite).toBe(true);
    expect(rows[1]!.missingText).toBe('无缓存写价');
    expect(chart.legend).toEqual(['输入', '输出', '缓存读', '缓存写']);
  });
  it('同币种按混合价采样 8 条、报告范围，不反写源数组', () => {
    const api = Array.from({ length: 11 }, (_, i) => item(`usd-${i}`, { inputPrice: 12 - i }));
    api.push(item('cny', { billingCurrency: 'CNY', reportedCurrency: 'CNY' }));
    const before = JSON.stringify(api);
    const chart = buildCompositionChart(api);
    expect(chart.groups.map((g) => [g.currency, g.shown, g.total])).toEqual([['USD', 8, 11], ['CNY', 1, 1]]);
    expect(chart.groups[0]!.rows[0]!.id).toBe('usd-10');
    expect(JSON.stringify(api)).toBe(before);
  });
  it('负价、非法价、错误币种和全缺不进入图', () => {
    expect(buildCompositionChart([item('neg', { cacheWritePrice: -1 }), item('nan', { inputPrice: NaN }), item('missing', { outputPrice: null }), item('mismatch', { reportedCurrency: 'CNY' })]).groups).toEqual([]);
  });
});

const historyState = (inputPrice = 2, billingCurrency = 'USD') => ({ inputPrice, outputPrice: 6, cacheReadPrice: null, cacheWritePrice: null, billingCurrency, provenance: 'official', verifiedAt: '2026-01-01' });
const event = (date: string, kind: string, entries: unknown) => JSON.stringify({ date, kind, entries });
const baseline = event('2026-01-01', 'baseline', { sample: historyState() });
const delta = (date: string, inputPrice: number) => event(date, 'delta', { sample: { before: historyState(), after: historyState(inputPrice), change: 'price' } });
describe('真实历史快照', () => {
  const api = [item('sample')];
  it('1 天无折线；未来 today 不制造已积累天数', () => {
    const chart = buildHistoryChart(baseline, api, undefined, '2026-12-01');
    expect(chart.days).toBe(1);
    expect(chart.ready).toBe(false);
    expect(chart.status).toBe('历史积累中（已 1 天，需 6 周）');
    expect(chart.groups[0]!.series[0]!.path).toBeNull();
    expect(chart.expectedDate).toBe('2026-02-11');
  });
  it('两次变化合并 full/delta，保留真实 3 点且不足门槛只给前后对比', () => {
    const text = baseline.replace('baseline', 'full') + '\n' + delta('2026-01-02', 4) + '\n' + delta('2026-01-05', 8);
    const chart = buildHistoryChart(text, api, undefined, '2026-02-20');
    const series = chart.groups[0]!.series[0]!;
    expect(series.points.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-05']);
    expect(series.points.map((p) => p.price)).toEqual([blendPerMillion(historyState(2)), blendPerMillion(historyState(4)), blendPerMillion(historyState(8))]);
    expect(series.path).toBeNull();
    expect(series.comparison).toContain('2026-01-02');
    expect(series.comparison).toContain('2026-01-05');
  });
  it('41 天不画线；42 天才连真实点，不补中间日期', () => {
    const early = buildHistoryChart(baseline + '\n' + delta('2026-02-10', 4), api, undefined, '2026-02-20');
    expect(early.days).toBe(41);
    expect(early.groups[0]!.series[0]!.path).toBeNull();
    const enough = buildHistoryChart(baseline + '\n' + delta('2026-02-11', 4), api, undefined, '2026-02-20');
    expect(enough.days).toBe(42);
    expect(enough.groups[0]!.series[0]!.points).toHaveLength(2);
    expect(enough.groups[0]!.series[0]!.path).toMatch(/^M.*L/);
  });
  it('42 个真实日期原样保留；无变化 delta 不补其他模型点', () => {
    const text = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      return i ? delta(date, i + 2) : baseline;
    }).join('\n');
    const chart = buildHistoryChart(text, api, undefined, '2026-02-20');
    expect(chart.groups[0]!.series[0]!.points).toHaveLength(42);
    expect(chart.snapshotDates).toHaveLength(42);
    const unrelated = buildHistoryChart(baseline + '\n' + event('2026-02-11', 'delta', { other: { after: historyState(4) } }), api, undefined, '2026-02-20');
    expect(unrelated.groups[0]!.series[0]!.points).toHaveLength(1);
    expect(unrelated.groups[0]!.series[0]!.path).toBeNull();
  });
  it('乱序日期归并、同日观察去重；删除及币种变更不连线', () => {
    const text = delta('2026-02-11', 4) + '\n' + baseline + '\n' + delta('2026-01-01', 3);
    const chart = buildHistoryChart(text, api, undefined, '2026-02-20');
    expect(chart.groups[0]!.series[0]!.points).toHaveLength(2);
    expect(chart.groups[0]!.series[0]!.points[0]!.price).toBe(blendPerMillion(historyState(3)));
    const removed = buildHistoryChart(baseline + '\n' + event('2026-01-02', 'delta', { sample: { after: null } }) + '\n' + delta('2026-02-11', 4), api, undefined, '2026-02-20');
    expect(removed.groups[0]!.series.every((s) => s.path === null)).toBe(true);
    const changed = buildHistoryChart(baseline + '\n' + event('2026-02-11', 'delta', { sample: { after: historyState(3, 'CNY') } }), api, undefined, '2026-02-20');
    expect(changed.groups).toHaveLength(2);
    expect(changed.groups.every((g) => g.series.every((s) => s.path === null))).toBe(true);
  });
  it('读取真实只增快照，当前积累态；空数据不伪造', () => {
    const chart = buildHistoryChart(readFileSync('src/data/history/price-history.jsonl', 'utf8'), apiPrices, undefined, '2026-11-09');
    expect(chart.days).toBe(1);
    expect(chart.groups.flatMap((g) => g.series).every((s) => s.path === null)).toBe(true);
    expect(buildHistoryChart('', api, undefined, '2026-02-20').groups).toEqual([]);
    expect(() => buildHistoryChart('{oops}', api, undefined, '2026-02-20')).toThrow();
    expect(() => buildHistoryChart(event('2026-02-30', 'baseline', {}), api, undefined, '2026-02-20')).toThrow();
  });
  it('UTC 边界：注入日期落后于快照日也不切掉当日快照，不产出「已 0 天」', () => {
    // 真实快照日期是 2026-11-09，而 DATA_VERIFIED_AT 是 2026-11-01。
    // 若仍按构建机 UTC 的「今天」截断，UTC+8 凌晨构建（UTC 停在 11-08）会把当日快照切掉，页面上写「已 0 天」。
    const text = readFileSync('src/data/history/price-history.jsonl', 'utf8');
    for (const today of ['2026-11-08', '2026-11-09', DATA_VERIFIED_AT]) {
      const chart = buildHistoryChart(text, apiPrices, undefined, today);
      expect(chart.days, `today=${today} 不应丢掉快照`).toBe(1);
      expect(chart.status).not.toContain('已 0 天');
      expect(chart.groups.length).toBeGreaterThan(0);
    }
    // 生产接线必须注入数据侧日期，不再读构建机 UTC 今天。
    expect(read('src/views/ApiPricingView.vue')).toContain('buildHistoryChart(historyText, apiPrices, undefined, DATA_VERIFIED_AT)');
  });
});

const currencyOf = (value: string) => value === 'USD' ? '$' : '¥';
describe('用量-成本曲线', () => {
  const model = buildUsageCostChart(tokenPlans, apiPrices);
  it('跨币种不串味：每组基准模型与组币种一致；组内截断有报告', () => {
    expect(model.usageMillion).toBe(50);
    expect(model.currentLabel).toBe('当前用量 50M');
    expect(model.groups.map((g) => g.currency)).toEqual(['USD', 'CNY']);
    for (const group of model.groups) {
      expect(group.shown).toBeLessThanOrEqual(5);
      // 真实数据每组都有 16/17 个候选，画出来的只有 5 组，必须如实报告。
      expect(group.total).toBeGreaterThan(group.shown);
      for (const pair of group.pairs) {
        const api = apiPrices.find((entry) => entry.id === pair.modelId);
        expect(api, `${pair.id} 的基准模型必须存在于 API 表`).toBeDefined();
        expect(api!.billingCurrency).toBe(group.currency);
      }
    }
  });
  it('每个采样点与 comparePlanVsApi 同源，且按 3:1 拆分输入输出', () => {
    let checked = 0;
    for (const group of model.groups) {
      for (const pair of group.pairs) {
        const plan = tokenPlans.find((entry) => entry.id === pair.id)!;
        const api = apiPrices.find((entry) => entry.id === pair.modelId)!;
        for (const sample of pair.samples) {
          const outputMillion = sample.usageMillion / (DEFAULT_BLEND_RATIO + 1);
          const outcome = comparePlanVsApi(plan, api, { inputMillion: 3 * outputMillion, outputMillion });
          expect(outcome.kind).toBe('ok');
          if (outcome.kind !== 'ok') continue;
          expect(sample.apiCost).toBe(outcome.apiCost);
          expect(sample.planCost).toBe(outcome.planCost);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
  it('保本点作为采样点存在，两条线在该处同值并与 computeBreakEven 对拍', () => {
    let checked = 0;
    for (const group of model.groups) {
      for (const pair of group.pairs) {
        const plan = tokenPlans.find((entry) => entry.id === pair.id)!;
        const api = apiPrices.find((entry) => entry.id === pair.modelId)!;
        const outcome = computeBreakEven(plan, api);
        expect(outcome.kind).toBe('break_even');
        if (outcome.kind !== 'break_even') continue;
        expect(pair.breakEvenMillion).toBe(outcome.result.totalMillion);
        const at = pair.samples.find((sample) => sample.usageMillion === outcome.result.totalMillion);
        expect(at, `${pair.id} 的保本点必须落在采样点上`).toBeDefined();
        if (!at) continue;
        // 相对误差 1e-6：阈值处 API 成本应等于固定月费。
        expect(Math.abs(at.apiCost - at.planCost) / at.planCost).toBeLessThan(1e-6);
        expect(Math.abs(at.planCost - plan.monthlyPrice!) / plan.monthlyPrice!).toBeLessThan(1e-6);
        checked++;
      }
    }
    expect(checked).toBe(10);
  });
  it('交点反解回原成本：每个交点金额都落在某套餐月费上', () => {
    let count = 0;
    for (const group of model.groups) {
      const monthly = group.pairs.map((pair) => tokenPlans.find((entry) => entry.id === pair.id)!.monthlyPrice!);
      for (const point of group.intersections) {
        expect(monthly.some((price) => Math.abs(point.cost - price) / price < 1e-6), `交点 ${point.label} 金额 ${point.cost}`).toBe(true);
        expect(point.usageMillion).toBeGreaterThanOrEqual(1);
        expect(point.usageMillion).toBeLessThanOrEqual(1000);
        count++;
      }
    }
    expect(count).toBeGreaterThan(0);
  });
  it('纵轴是对数：每十倍用量在 y 上等距，总跨距超过 100 用户单位', () => {
    for (const group of model.groups) {
      for (const pair of group.pairs) {
        const apiY = (usage: number) => pair.samples.find((sample) => sample.usageMillion === usage)!.apiY;
        const decade1 = apiY(10) - apiY(1);
        const decade2 = apiY(100) - apiY(10);
        const decade3 = apiY(1000) - apiY(100);
        // 线性轴下 1M→10M 只有约 1.9 用户单位、10M→100M 约 19 用户单位，这条断言会红。
        expect(Math.abs(decade1 - decade2)).toBeLessThan(1e-6 * Math.abs(decade1));
        expect(Math.abs(decade2 - decade3)).toBeLessThan(1e-6 * Math.abs(decade2));
        expect(Math.abs(apiY(1000) - apiY(1))).toBeGreaterThan(100);
      }
    }
  });
  it('负、零、NaN、越界用量回落到 50M；合法值原样生效', () => {
    const fallbackX = buildUsageCostChart(tokenPlans, apiPrices, 50).currentX;
    for (const usage of [-5, 0, Number.NaN, 1001]) {
      const chart = buildUsageCostChart(tokenPlans, apiPrices, usage);
      expect(chart.usageMillion).toBe(50);
      expect(chart.currentLabel).toBe('当前用量 50M');
      expect(chart.currentX).toBe(fallbackX);
    }
    const custom = buildUsageCostChart(tokenPlans, apiPrices, 100);
    expect(custom.usageMillion).toBe(100);
    expect(custom.currentLabel).toBe('当前用量 100M');
    expect(custom.currentX).toBeGreaterThan(fallbackX);
  });
  it('3:1 拆分与 allowanceValueSentence 同口径', () => {
    const group = model.groups[0]!;
    const pair = group.pairs[0]!;
    const plan = tokenPlans.find((entry) => entry.id === pair.id)!;
    const api = apiPrices.find((entry) => entry.id === pair.modelId)!;
    const sample = pair.samples.find((point) => point.usageMillion === 100)!;
    // 图内按 totalMillion /(ratio+1) 拆出输出量，allowanceValueSentence 也按同一比例拆；
    // 两边算出的按量成本必须落成同一句金额（整数取整后相等）。
    expect(sample.usageMillion / (DEFAULT_BLEND_RATIO + 1)).toBe(25);
    const sentence = allowanceValueSentence(sample.usageMillion, api, plan);
    expect(sentence).not.toBeNull();
    expect(sentence).toContain(`≈ 按量付费 ${currencyOf(group.currency)}${Math.round(sample.apiCost).toLocaleString('en-US')}`);
  });
});

/** 移动层：viewBox 收窄到 360（375 视口下 1:1 附近），内容按票面降级，桌面层字段一个不动。 */
describe('移动层（360 宽）', () => {
  it('散点移动层宽 360、每币种最多 5 个代表标签，坐标按移动 frame 重排', () => {
    const model = buildScatterChart(apiPrices, benchmarkDoc);
    expect(model.mobile.viewBox).toBe('0 0 360 330');
    expect(model.viewBox).toBe('0 0 640 360');
    expect(model.mobile.groups.map((group) => group.currency)).toEqual(model.groups.map((group) => group.currency));
    for (const desktop of model.groups) {
      const mobile = model.mobile.groups.find((group) => group.currency === desktop.currency)!;
      expect(mobile.points).toHaveLength(desktop.points.length);
      const labelled = mobile.points.filter((point) => point.mobileLabel);
      expect(labelled.length).toBeGreaterThan(0);
      expect(labelled.length).toBeLessThanOrEqual(5);
      for (const point of mobile.points) {
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(360);
        expect(point.y).toBeGreaterThanOrEqual(0);
        expect(point.y).toBeLessThanOrEqual(330);
        // 两层各按自己的 frame 映射，同一模型不会得到同一坐标。
        expect(point.mx).toBe(point.x);
        expect(point.my).toBe(point.y);
        expect(point.x).not.toBe(desktop.points.find((entry) => entry.id === point.id)!.x);
      }
      // 非前沿点也保留圆点，只是不出标签。
      expect(mobile.points.filter((point) => !point.frontier && !point.mobileLabel).length).toBeGreaterThan(0);
    }
  });
  it('价格构成移动层每币种 4 行、行距 36，桌面层仍是 8 行 31', () => {
    const model = buildCompositionChart(apiPrices);
    expect(model.mobile.viewBox).toBe('0 0 360 170');
    for (const group of model.mobile.groups) {
      expect(group.rows).toHaveLength(4);
      expect(group.shown).toBe(4);
      expect(group.total).toBeGreaterThan(group.shown);
      expect(group.rows.map((row) => row.y)).toEqual([30, 66, 102, 138]);
      for (const row of group.rows) expect(row.label.length).toBeLessThanOrEqual(19);
    }
    for (const group of model.groups) expect(group.rows).toHaveLength(8);
  });
  it('用量-成本移动层每币种最多 3 条 pair，标的当前用量按移动 frame 重算', () => {
    const model = buildUsageCostChart(tokenPlans, apiPrices);
    expect(model.mobile.viewBox).toBe('0 0 360 320');
    expect(model.mobile.groups.map((group) => group.currency)).toEqual(model.groups.map((group) => group.currency));
    for (const desktop of model.groups) {
      const mobile = model.mobile.groups.find((group) => group.currency === desktop.currency)!;
      expect(mobile.pairs.length).toBeLessThanOrEqual(3);
      expect(mobile.shown).toBe(mobile.pairs.length);
      // 3 条 pair 的交点必须仍落回某套餐月费：移动层没有另算一套业务口径。
      const monthly = mobile.pairs.map((pair) => tokenPlans.find((entry) => entry.id === pair.id)!.monthlyPrice!);
      for (const point of mobile.intersections) {
        expect(monthly.some((price) => Math.abs(point.cost - price) / price < 1e-6)).toBe(true);
        expect(point.x).toBeGreaterThanOrEqual(0);
        expect(point.x).toBeLessThanOrEqual(360);
      }
    }
    expect(model.mobile.currentX).not.toBe(model.currentX);
    expect(model.mobile.currentX).toBeGreaterThanOrEqual(0);
    expect(model.mobile.currentX).toBeLessThanOrEqual(360);
  });
  it('走势移动层沿用同一批真实观察点，只换 frame', () => {
    const text = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      return i ? delta(date, i + 2) : baseline;
    }).join('\n');
    const chart = buildHistoryChart(text, [item('sample')], undefined, '2026-02-20');
    expect(chart.mobile.viewBox).toBe('0 0 360 300');
    const desktop = chart.groups[0]!.series[0]!;
    const mobile = chart.mobile.groups[0]!.series[0]!;
    expect(mobile.points.map((point) => point.date)).toEqual(desktop.points.map((point) => point.date));
    expect(mobile.points.map((point) => point.price)).toEqual(desktop.points.map((point) => point.price));
    expect(mobile.path).toMatch(/^M/);
    for (const point of mobile.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(360);
    }
  });
});
