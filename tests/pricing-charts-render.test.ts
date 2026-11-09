import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { apiPrices, benchmarkDoc } from '../src/lib/data';

let server: ViteDevServer;
let renderProps: (name: string, props: Record<string, unknown>) => Promise<string>;
let render: (name: string, model: unknown) => Promise<string>;
beforeAll(async () => {
  // 使用已安装的 Vite/Vue 服务端编译器，真实执行 setup 和 SSR，不增加 DOM 依赖。
  server = await createServer({ configFile: false, plugins: [vue()], server: { middlewareMode: true, watch: null }, appType: 'custom' });
  const { createSSRApp, h } = await import('vue');
  const { renderToString } = await import('vue/server-renderer');
  renderProps = async (name, props) => {
    const { default: component } = await server.ssrLoadModule(`/src/components/pricing-charts/${name}.vue`);
    return renderToString(createSSRApp({ render: () => h(component, props) }));
  };
  render = async (name, model) => renderProps(name, { model });
});
afterAll(async () => { await server?.close(); });
const read = (p: string) => readFileSync(p, 'utf8');
/** 取某一层 svg 的标记：两层都在同一 figure 里 SSR，判据必须分层数。 */
const layersOf = (html: string, layer: 'desktop' | 'mobile') =>
  html.match(new RegExp(`<svg class="chart-layer chart-layer-${layer}"[\\s\\S]*?</svg>`, 'g')) ?? [];
const circlesIn = (html: string, layer: 'desktop' | 'mobile') =>
  layersOf(html, layer).reduce((total, svg) => total + (svg.match(/<circle\b/g) ?? []).length, 0);

describe('同步静态 SVG', () => {
  it('不足六周 SSR 显示积累状态和可用对比，无历史路径标记', async () => {
    const { buildHistoryChart } = await import('../src/lib/pricing-chart-data');
    const item = apiPrices[0]!;
    const state = { inputPrice: 2, outputPrice: 6, billingCurrency: 'USD' };
    const text = JSON.stringify({ date: '2026-01-01', kind: 'baseline', entries: { [item.id]: state } }) + '\n'
      + JSON.stringify({ date: '2026-01-02', kind: 'delta', entries: { [item.id]: { after: { ...state, inputPrice: 3 } } } });
    const html = await render('HistoryChart', buildHistoryChart(text, [item], undefined, '2026-01-02'));
    expect(html).toContain('<svg');
    expect(html).toContain('<title');
    expect(html).toContain('历史积累中（已 2 天，需 6 周）');
    expect(html).toContain('本次 vs 上次');
    expect(html).toContain('门槛：连续 6 周（42 天）');
    expect(html).not.toContain('data-history-line');
    expect(html).not.toContain('<path');
    // 空态的 figcaption 必须有可读状态与门槛，不能只剩两个空插槽注释。
    const caption = html.match(/<figcaption>([\s\S]*?)<\/figcaption>/)?.[1] ?? '';
    expect(caption.replace(/<!--[\s\S]*?-->/g, '').trim().length).toBeGreaterThan(20);
  });
  it('满六周 SSR 仅绘制真实观察路径', async () => {
    const { buildHistoryChart } = await import('../src/lib/pricing-chart-data');
    const item = apiPrices[0]!;
    const state = { inputPrice: 2, outputPrice: 6, billingCurrency: 'USD' };
    const text = JSON.stringify({ date: '2026-01-01', kind: 'baseline', entries: { [item.id]: state } }) + '\n'
      + JSON.stringify({ date: '2026-02-11', kind: 'delta', entries: { [item.id]: { after: { ...state, inputPrice: 3 } } } });
    const html = await render('HistoryChart', buildHistoryChart(text, [item], undefined, '2026-02-11'));
    expect(html).toContain('data-history-line');
    // 桌面层与移动层都 SSR：每层各 2 个真实观察点。
    expect((html.match(/<circle/g) ?? []).length).toBe(4);
    expect(circlesIn(html, 'desktop')).toBe(2);
    expect(circlesIn(html, 'mobile')).toBe(2);
  });
  it('构成 SSR 保留四段图例、缺价文案且无缺写价矩形', async () => {
    const { buildCompositionChart } = await import('../src/lib/pricing-chart-data');
    const item = apiPrices.find((p) => p.provenance === 'official' && p.inputPrice! > 0 && p.outputPrice! > 0)!;
    const html = await render('CompositionChart', buildCompositionChart([{ ...item, cacheReadPrice: 1, cacheWritePrice: null }]));
    expect(html).toContain('<svg');
    expect(html).toContain('<title');
    expect(html).toContain('无缓存写价');
    expect(html).not.toContain('class="chart-segment chart-segment-3"');
    for (const label of ['输入', '输出', '缓存读', '缓存写']) expect(html).toContain(label);
    expect(html).toContain('展示 1/1');
  });
  it('散点 SSR 已有标题、前沿路径与至少 5 个数值标签', async () => {
    const { buildScatterChart } = await import('../src/lib/pricing-chart-data');
    const html = await render('ScatterChart', buildScatterChart(apiPrices, benchmarkDoc));
    expect(html).toContain('<svg');
    expect(html).toContain('<title');
    expect(html).toContain('<desc');
    expect(html).toContain('<path');
    expect((html.match(/<text\b[^>]*>[^<]*\d/g) ?? []).length).toBeGreaterThanOrEqual(5);
    expect(html).toContain('条无评测数据未入图');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
  });
  it('用量图 SSR：两类口径图例、当前用量标线、无 NaN 且交点都带标题', async () => {
    const { buildUsageCostChart } = await import('../src/lib/pricing-chart-data');
    const { tokenPlans } = await import('../src/lib/data');
    const model = buildUsageCostChart(tokenPlans, apiPrices);
    const html = await render('UsageCostChart', model);
    expect(html).toContain('<svg');
    expect(html).toContain('<title');
    expect(html).toContain('<desc');
    expect(html).toContain('API 单价精确折算');
    expect(html).toContain('套餐按月费与 API 单价反推估算');
    expect(html).toContain('class="chart-current"');
    expect(html).toContain('当前用量 50M');
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    const intersections = model.groups.reduce((total, group) => total + group.intersections.length, 0);
    const mobileIntersections = model.mobile.groups.reduce((total, group) => total + group.intersections.length, 0);
    expect(intersections).toBeGreaterThan(0);
    expect(mobileIntersections).toBeGreaterThan(0);
    expect(html.match(/<circle\b/g) ?? []).toHaveLength(intersections + mobileIntersections);
    // 每个交点圆点都靠原生 <title> 自述，不能有裸 circle。
    expect(html.match(/<circle[^>]*><title>/g) ?? []).toHaveLength(intersections + mobileIntersections);
    expect(circlesIn(html, 'desktop')).toBe(intersections);
    expect(circlesIn(html, 'mobile')).toBe(mobileIntersections);
    // 图例两层都保留，但只列各自画出来的 pair：桌面 5+5、移动 3+3。
    const pairListItems = (name: 'desktop' | 'mobile') =>
      (html.match(new RegExp(`<ul class="chart-pair-legend chart-caption-${name}"[\\s\\S]*?</ul>`, 'g')) ?? [])
        .reduce((total, list) => total + (list.match(/<li\b/g) ?? []).length, 0);
    expect(pairListItems('desktop')).toBe(10);
    expect(pairListItems('mobile')).toBe(6);
    expect(model.mobile.groups.every((group) => group.pairs.length === 3)).toBe(true);
  });
  it('页面同步建模，图组在表格汇总之后、数据纪律之前', () => {
    const source = read('src/views/ApiPricingView.vue');
    const top = source.slice(0, source.indexOf('onMounted(()'));
    expect(top).toContain('const scatter = buildScatterChart(apiPrices, benchmarkDoc)');
    expect(top).toContain('const composition = buildCompositionChart(apiPrices)');
    expect(top).toContain('const history = buildHistoryChart(historyText, apiPrices, undefined, DATA_VERIFIED_AT)');
    expect(source).toContain(':history="history"');
    expect(source.indexOf('<PricingChartsSection')).toBeGreaterThan(source.indexOf('filter-summary-after'));
    expect(source.indexOf('<PricingChartsSection')).toBeLessThan(source.indexOf('币种口径与免责说明'));
    for (const name of ['SvgChartFrame', 'ScatterChart', 'PricingChartsSection']) {
      expect(read(`src/components/pricing-charts/${name}.vue`)).not.toMatch(/onMounted|fetch\s*\(|buildRowScore|blendPerMillion/);
    }
  });
  // N-8：原「静态守卫反例」在测试内部自定义 guard，只证明字符串替换生效，不对产品行为构成反例，已删除。
  // 生产接线的静态判据由上一条用例在真实源码上断言。
  it('图形颜色与宽度由主题变量、响应式 CSS 控制', () => {
    const css = read('src/styles/global.css').split('/* 构建期 SVG 图解')[1]!;
    expect(css).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(css).toContain('width: 100%; max-width: 100%');
    expect(css).toContain('.chart-desktop-label, .chart-desktop-point { display: none; }');
    expect(css).toContain('var(--brand)');
    // 两层 SVG 都进产物，显隐只由媒体查询决定（不许靠 JS 重绘）。
    expect(css).toContain('.pricing-chart .chart-layer-mobile { display: none; }');
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'));
    expect(mobile).toContain('.pricing-chart .chart-layer-desktop { display: none; }');
    expect(mobile).toContain('.pricing-chart .chart-layer-mobile { display: block; }');
    // 移动层 viewBox 宽 360，375 视口下 svg 实测 325px（缩放 0.903）：14 用户单位 ≈ 12.6px。
    const tickSize = Number(mobile.match(/\.pricing-chart text \{[^}]*font-size:\s*([0-9.]+)px/)?.[1]);
    const labelSize = Number(mobile.match(/\.pricing-chart \.chart-label \{[^}]*font-size:\s*([0-9.]+)px/)?.[1]);
    expect(tickSize * (325 / 360)).toBeGreaterThanOrEqual(12);
    expect(labelSize * (325 / 360)).toBeGreaterThanOrEqual(12);
  });
});

/**
 * 移动层几何判据（对应编排层 375 视口探针）。
 *
 * 探针用真实浏览器量 getBoundingClientRect；这里用同一口径的文字框估算在 SSR 产物上复算，
 * 保证「组件把模型给的坐标与 anchor 原样输出」——若哪个组件又写死 640 宽的坐标，
 * 或者把标签上限放开，这条会立刻变红。
 */
const SVG_NS_TEXT = /<text([^>]*)>([^<]*)<\/text>/g;
const decode = (s: string) => s.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const wideChar = /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/;
/** 与真实字体的偏差：ASCII 0.55em、全角 1.00em、上伸 1.08em、下伸 0.24em（比产品侧估算更接近实测）。 */
const estimate = (text: string) => [...text].reduce((sum, ch) => sum + (wideChar.test(ch) ? 1 : 0.55), 0);
function textBoxes(svg: string) {
  const viewBox = (svg.match(/viewBox="([^"]+)"/)?.[1] ?? '').split(/[ ,]+/).map(Number);
  const width = viewBox[2] ?? 0;
  const height = viewBox[3] ?? 0;
  const texts = [...svg.matchAll(SVG_NS_TEXT)].map(([, attrs, raw]) => {
    const text = decode(raw).trim();
    const x = Number(attrs.match(/\bx="([-\d.]+)"/)?.[1] ?? NaN);
    const y = Number(attrs.match(/\by="([-\d.]+)"/)?.[1] ?? NaN);
    const anchor = attrs.match(/text-anchor="(start|middle|end)"/)?.[1] ?? 'start';
    const size = 14;
    const boxWidth = estimate(text) * size;
    const left = anchor === 'start' ? x : anchor === 'end' ? x - boxWidth : x - boxWidth / 2;
    return { text, left, right: left + boxWidth, top: y - 1.08 * size, bottom: y + 0.24 * size };
  });
  return { width, height, texts };
}

function assertReadableLayer(svg: string) {
  const { width, height, texts } = textBoxes(svg);
  expect(width).toBe(360);
  expect(height).toBeGreaterThanOrEqual(170);
  expect(texts.length).toBeGreaterThan(0);
  for (const box of texts) {
    expect(box.left, `${box.text} 左越界`).toBeGreaterThanOrEqual(-2);
    expect(box.right, `${box.text} 右越界`).toBeLessThanOrEqual(width + 2);
    expect(box.top, `${box.text} 上越界`).toBeGreaterThanOrEqual(-2);
    expect(box.bottom, `${box.text} 下越界`).toBeLessThanOrEqual(height + 2);
  }
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i]!;
      const b = texts[j]!;
      const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      // 与探针同口径：两轴重叠都超过 2px 才算压字。
      expect(overlapX > 2 && overlapY > 2, `${a.text} 与 ${b.text} 文字框相交`).toBe(false);
    }
  }
}

describe('移动层几何（360 宽，SSR 产物）', () => {
  it('同一 figure 内两层 SVG 并存；移动层文字框两两不交且不越界', async () => {
    const { buildScatterChart, buildCompositionChart, buildHistoryChart, buildUsageCostChart } = await import('../src/lib/pricing-chart-data');
    const { tokenPlans, DATA_VERIFIED_AT } = await import('../src/lib/data');
    const html = await renderProps('PricingChartsSection', {
      scatter: buildScatterChart(apiPrices, benchmarkDoc),
      composition: buildCompositionChart(apiPrices),
      history: buildHistoryChart(read('src/data/history/price-history.jsonl'), apiPrices, undefined, DATA_VERIFIED_AT),
      usageCost: buildUsageCostChart(tokenPlans, apiPrices),
    });
    expect(html).not.toMatch(/NaN|Infinity|undefined/);
    expect((html.match(/chart-layer chart-layer-desktop/g) ?? [])).toHaveLength(7);
    expect((html.match(/chart-layer chart-layer-mobile/g) ?? [])).toHaveLength(7);
    // 移动层代表标签：散点每币种 5 个。
    expect((html.match(/chart-mobile-label/g) ?? [])).toHaveLength(10);
    const mobileSvgs = html.match(/<svg class="chart-layer chart-layer-mobile"[\s\S]*?<\/svg>/g) ?? [];
    expect(mobileSvgs).toHaveLength(7);
    for (const svg of mobileSvgs) assertReadableLayer(svg);
  });
  it('走势就绪态的移动层同样不越界、不压字', async () => {
    const { buildHistoryChart } = await import('../src/lib/pricing-chart-data');
    const item = apiPrices[0]!;
    const state = { inputPrice: 2, outputPrice: 6, billingCurrency: 'USD' };
    const lines = Array.from({ length: 42 }, (_, i) => {
      const date = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      return i
        ? JSON.stringify({ date, kind: 'delta', entries: { [item.id]: { after: { ...state, inputPrice: 2 + i } } } })
        : JSON.stringify({ date, kind: 'baseline', entries: { [item.id]: state } });
    }).join('\n');
    const html = await render('HistoryChart', buildHistoryChart(lines, [item], undefined, '2026-02-20'));
    const mobileSvgs = html.match(/<svg class="chart-layer chart-layer-mobile"[\s\S]*?<\/svg>/g) ?? [];
    expect(mobileSvgs).toHaveLength(1);
    expect(mobileSvgs[0]).toContain('data-history-line');
    assertReadableLayer(mobileSvgs[0]!);
  });
});
