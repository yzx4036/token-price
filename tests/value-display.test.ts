import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { apiPrices, benchmarkDoc, fxRate } from '../src/lib/data';
import { buildRowScore, formatCostPerPoint, rankByCurrency } from '../src/lib/benchmark-view';
import { costPerPointInCny, filterAndSortApiPrices } from '../src/lib/pricing';
import { pickValueBest } from '../src/lib/benchmark-view';
import { buildPriceRow } from '../src/lib/price-row';
import { formatRate, valueSortNote } from '../src/lib/fx';
import { isConcludingEntry } from '../src/lib/stats';
import type { FxRate } from '../src/lib/schema';

let server: ViteDevServer;
let render: (path: string, props: Record<string, unknown>) => Promise<string>;
beforeAll(async () => {
  server = await createServer({ configFile: false, plugins: [vue()], server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  render = async (path, props) => {
    const { default: component } = await server.ssrLoadModule(path);
    return renderToString(createSSRApp({ render: () => h(component, props) }));
  };
});
afterAll(async () => { await server?.close(); });

const table = '/src/components/PriceTable.vue';
const card = '/src/components/PriceCard.vue';
const scores = Object.fromEntries(apiPrices.map((entry) => [entry.id, buildRowScore(entry, benchmarkDoc)]));
const sorted = filterAndSortApiPrices(apiPrices, { sortBy: 'value', order: 'asc', scores }, fxRate);
// 第六列才是性价比，避免误读智能指数。真实 SSR 能抓住模板退回原值的变异。
const valueCells = (html: string) => [...html.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
  .map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)][5]?.[1])
  .filter((cell): cell is string => cell !== undefined);
const displayedText = (cell: string) => cell.match(/<span class="score-main"[^>]*>([^<]+)<\/span>/)?.[1] ?? '—';
const numberIn = (text: string) => Number(text.replace(/^[¥$]/, ''));

describe('性价比展示与排序同源', () => {
  it('同源断言：表格展示值等于排序共用折算函数的值（按展示精度）', async () => {
    const rows = sorted.map((entry) => buildPriceRow(entry, fxRate, scores[entry.id]));
    const html = await render(table, { rows, fx: fxRate, sortBy: 'value', order: 'asc' });
    const cells = valueCells(html);
    expect(cells).toHaveLength(sorted.length);
    for (const [index, entry] of sorted.entries()) {
      const score = scores[entry.id];
      if (!score) {
        expect(displayedText(cells[index])).toBe('—');
        continue;
      }
      // 只调用生产折算函数，不在测试另写 USD×rate 的第二套计算。
      const sortValue = costPerPointInCny(entry, score.costPerPoint, fxRate);
      expect(rows[index].score!.costPerPointCny).toBe(sortValue);
      if (sortValue === null) continue;
      const expected = `¥${formatCostPerPoint(sortValue)}`;
      expect(rows[index].score!.costPerPointText, entry.id).toBe(expected);
      expect(numberIn(displayedText(cells[index])), entry.id).toBe(Number(formatCostPerPoint(sortValue)));
      expect(displayedText(cells[index]), entry.id).toBe(expected);
    }
    const numbers = cells.map(displayedText).filter((text) => text !== '—').map(numberIn);
    for (let i = 1; i < numbers.length; i++) expect(numbers[i]).toBeGreaterThanOrEqual(numbers[i - 1]);
    expect(html).toContain('性价比（¥/分）');
    // 注：这里原先用「源码里出现某字符串」来保证同源，审查实测可被注释绕过（N-7），
    // 已删除；同源由上面的行为断言承担（展示值必须等于 costPerPointInCny 的结果）。
    console.info('同源首5行', rows.slice(0, 5).map((row) => ({ id: row.id, raw: row.score!.costPerPoint, cny: row.score!.costPerPointCny, text: row.score!.costPerPointText })));
  });

  it('结论卡选法与排序同口径：有汇率按折算值选，无汇率只在同币种内选（R13 反例）', () => {
    // 构造两条：USD 原始 0.001（折算 ¥0.0067）比 CNY 原始 0.02 更便宜；
    // 因此有汇率时必须选 USD 那条，无汇率时不能跨币种硬比，应选 CNY 组内最优。
    const rate = 6.6908;
    const rows = [
      { id: 'usd-cheap', currency: 'USD', costPerPoint: 0.001, costPerPointCny: Math.round(0.001 * rate * 1e6) / 1e6 },
      { id: 'cny-mid', currency: 'CNY', costPerPoint: 0.02, costPerPointCny: 0.02 },
    ];
    // 期望值在测试里独立算，不调用被测函数
    const cheaperByConverted = 0.001 * rate < 0.02 ? 'usd-cheap' : 'cny-mid';
    expect(pickValueBest(rows)?.id).toBe(cheaperByConverted);

    const noFx = rows.map((row) => ({ ...row, costPerPointCny: null }));
    expect(pickValueBest(noFx)?.id).toBe('cny-mid');
  });

  it.each([null, { ...fxRate, rate: 0 }, { ...fxRate, rate: NaN }, { ...fxRate, rate: Infinity }])(
    '无合法 fx 保留原币种，CNY 折算值为 null，列头和提示切换（%s）', async (fx: FxRate | null) => {
      const sources = [
        { ...apiPrices[0], id: 'usd', reportedCurrency: 'USD' as const, billingCurrency: 'USD' as const },
        { ...apiPrices[0], id: 'cny', reportedCurrency: 'CNY' as const, billingCurrency: 'CNY' as const },
        { ...apiPrices[0], id: 'aggregate', reportedCurrency: 'USD' as const, billingCurrency: 'CNY' as const },
      ];
      const score = { score: 50, tier: 'High', costPerPoint: 0.0055, blendPerMillion: 0.275 };
      const rows = sources.map((entry) => buildPriceRow(entry, fx, score));
      expect(rows.map((row) => row.score!.costPerPointCny)).toEqual([null, null, null]);
      expect(rows.map((row) => row.score!.costPerPointText)).toEqual(['$0.00550', '¥0.00550', '$0.00550']);
      const html = await render(table, { rows, fx, sortBy: 'inputPrice', order: 'asc' });
      expect(valueCells(html).map(displayedText)).toEqual(['$0.00550', '¥0.00550', '$0.00550']);
      expect(html).not.toContain('性价比（¥/分）');
      expect(html).toContain('>性价比</span>');
      expect(html).toContain('无汇率，性价比按币种分段比较。');
      expect(valueSortNote(fx)).toBe('无汇率，性价比按币种分段比较。');
      const mobile = await render(card, { row: rows[0] });
      expect(mobile).toContain('<em>原币种/分</em>');
      console.info('无FX', { rate: fx?.rate ?? null, cny: rows.map((row) => row.score!.costPerPointCny), text: rows.map((row) => row.score!.costPerPointText) });
    },
  );

  it('卡片和表格显示相同折算值，title 提供报价原值及汇率；错账单币种仍按报价币种', async () => {
    const entry = { ...apiPrices[0], reportedCurrency: 'USD' as const, billingCurrency: 'CNY' as const };
    const row = buildPriceRow(entry, fxRate, { score: 50, tier: 'High', costPerPoint: 0.0055, blendPerMillion: 0.275 });
    expect(row.score!.costPerPointCny).toBe(costPerPointInCny(entry, 0.0055, fxRate));
    expect(row.score!.costPerPointTitle).toBe(`原币种 $0.00550，按 1 USD = ${formatRate(fxRate.rate)} CNY 折算`);
    const html = await render(card, { row });
    expect(html).toContain(`>${row.score!.costPerPointText}</strong>`);
    expect(html).toContain('<em>¥/分</em>');
    expect(html).toContain(`title="${row.score!.costPerPointTitle}"`);
  });

  it('缺评分或无有效成本保持缺失，负值不伪造 CNY 金额', () => {
    expect(buildPriceRow(apiPrices[0], fxRate).score).toBeNull();
    for (const costPerPoint of [NaN, Infinity, -1]) {
      const row = buildPriceRow(apiPrices[0], fxRate, { score: 50, tier: 'High', costPerPoint, blendPerMillion: NaN });
      expect(row.score!.costPerPointCny).toBeNull();
      expect(row.score!.costPerPointText).toBe('—');
    }
  });

  it('结论卡保留原选法，使用与表格相同的折算文本并注明单位', async () => {
    // 原选法原样复现：同币种 rank，再按原始 costPerPoint 取第一名。
    const rankable = apiPrices.filter(isConcludingEntry).flatMap((entry) => {
      const score = scores[entry.id];
      return score && Number.isFinite(score.costPerPoint)
        ? [{ id: entry.id, provider: entry.provider, model: entry.model, currency: entry.billingCurrency, score: score.score, costPerPoint: score.costPerPoint }]
        : [];
    });
    const best = Object.values(rankByCurrency(rankable)).flat().sort((a, b) => a.costPerPoint - b.costPerPoint)[0];
    const entry = apiPrices.find((item) => item.id === best.id)!;
    const row = buildPriceRow(entry, fxRate, scores[entry.id]);
    const { createSSRApp, h } = await import('vue');
    const { renderToString } = await import('vue/server-renderer');
    const { createRouter, createMemoryHistory } = await import('vue-router');
    const { default: component } = await server.ssrLoadModule('/src/views/ApiPricingView.vue');
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/api-pricing/', component },
      { path: '/methodology/', component: { render: () => null } },
    ] });
    await router.push('/api-pricing/');
    await router.isReady();
    const html = await renderToString(createSSRApp({ render: () => h(component) }).use(router));
    const conclusion = html.match(/<li class="conclusion"><span class="conclusion-label">性价比最优<\/span>([\s\S]*?)<\/li>/)?.[1];
    expect(conclusion).toContain(`>${row.score!.costPerPointText}</strong>`);
    expect(conclusion).toContain(`${entry.model}`);
    expect(conclusion).toContain('按 ¥/分 展示');
    console.info('结论卡', { id: best.id, text: row.score!.costPerPointText });
  });
});
