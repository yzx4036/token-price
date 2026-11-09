import { blendPerMillion, buildRowScore, formatCostPerPoint, type BenchmarkDoc } from './benchmark-view';
import { logTicks, mapLinear, mapLog, paretoFrontier, polylineIntersections, stackSegments, toSvgPath, type Domain } from './chart-geometry';
import { comparePlanVsApi, computeBreakEven, DEFAULT_BLEND_RATIO, formatMoney, pickBasisModel } from './plan-vs-api';
import type { ApiPrice, BillingCurrency, TokenPlan } from './schema';
import { modelLabel } from './format';

export type ChartFrame = { width: number; height: number; left: number; right: number; top: number; bottom: number };

/** 桌面层：640 宽；1440 视口下 svg 实测 663px（缩放 1.035），按 640 排版等于 1:1。 */
export const DEFAULT_CHART_FRAME: ChartFrame = { width: 640, height: 360, left: 64, right: 32, top: 30, bottom: 68 };
/**
 * 移动层：375 视口下 .pricing-chart 内 svg 实测 325px，viewBox 取 360 → 缩放 0.90，
 * 文字接近 1:1 渲染。继续沿用 640 宽会被缩到 0.51，字号与行距一起被压扁且互相重叠。
 */
export const MOBILE_CHART_FRAME: ChartFrame = { width: 360, height: 330, left: 60, right: 16, top: 40, bottom: 56 };
export const MOBILE_COMPOSITION_FRAME: ChartFrame = { width: 360, height: 170, left: 60, right: 16, top: 30, bottom: 8 };
export const MOBILE_HISTORY_FRAME: ChartFrame = { width: 360, height: 300, left: 60, right: 16, top: 40, bottom: 56 };
export const MOBILE_USAGE_FRAME: ChartFrame = { width: 360, height: 320, left: 60, right: 16, top: 40, bottom: 56 };

export type ChartTickAnchor = 'start' | 'middle' | 'end';
/** 刻度文字的位置由数据层给出，anchor 由排版算法给出：贴边的刻度不能再用 middle，否则右边界会被 svg 裁掉。 */
export type ChartTick = { position: number; text: string; anchor: ChartTickAnchor };
export type ChartAxes = {
  xTicks: ChartTick[]; yTicks: ChartTick[]; xLabel: string; yLabel: string;
  xTickY: number; yTickX: number; xLabelX: number; xLabelY: number; yLabelX: number; yLabelY: number;
};
export type LabelPlacement = { x: number; y: number; anchor: ChartTickAnchor };

/* ---------- 文字包围盒估算 ----------
   判据是「同一图内的 text 包围盒两两不相交」。SVG 没有测量接口可用（构建期禁止 JS），
   因此按字号估宽高：ASCII 0.62em、中日韩与全角 1.02em、上伸 1.08em、下伸 0.25em。
   实测 Segoe UI 14px 的字符宽约 0.50em、行盒高 1.31em，这里统一取偏大的值，
   宁可少放一个标签，也不让两个标签真的压在一起。 */
const ASCII_EM = 0.62;
const WIDE_EM = 1.02;
const ASCENT_EM = 1.08;
const DESCENT_EM = 0.25;
const GAP = 1;
const WIDE_CHAR = /[\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/;
const charEm = (ch: string): number => WIDE_CHAR.test(ch) ? WIDE_EM : ASCII_EM;
const textWidth = (text: string, size: number): number => [...text].reduce((sum, ch) => sum + charEm(ch), 0) * size;
type Box = { left: number; right: number; top: number; bottom: number };
function textBox(x: number, y: number, text: string, size: number, anchor: ChartTickAnchor): Box {
  const width = textWidth(text, size);
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return { left, right: left + width, top: y - ASCENT_EM * size, bottom: y + DESCENT_EM * size };
}
const apart = (a: Box, b: Box): boolean => a.right + GAP <= b.left || b.right + GAP <= a.left || a.bottom + GAP <= b.top || b.bottom + GAP <= a.top;
const inFrame = (box: Box, frame: ChartFrame): boolean => box.left >= 0 && box.right <= frame.width && box.top >= 0 && box.bottom <= frame.height;
/** 贴边时改用 start/end，文字仍落在 svg 内。 */
function tickAnchor(position: number, text: string, size: number, width: number): ChartTickAnchor {
  const half = textWidth(text, size) / 2;
  if (position - half < 1) return 'start';
  if (position + half > width - 1) return 'end';
  return 'middle';
}
/** 按估算宽度截断，保证移动层表格化文字不会压到右侧的缺价提示。 */
function fitText(text: string, maxWidth: number, size: number): string {
  if (textWidth(text, size) <= maxWidth) return text;
  let out = '';
  for (const ch of [...text]) {
    if (textWidth(`${out}${ch}…`, size) > maxWidth) break;
    out += ch;
  }
  return `${out}…`;
}
/** 轴文字先占位，点标签再挑空位；两者都不会互相压住。 */
function axesBoxes(axes: ChartAxes, size: number): Box[] {
  return [
    ...axes.xTicks.map((tick) => textBox(tick.position, axes.xTickY, tick.text, size, tick.anchor)),
    ...axes.yTicks.map((tick) => textBox(axes.yTickX, tick.position, tick.text, size, tick.anchor)),
    textBox(axes.xLabelX, axes.xLabelY, axes.xLabel, size, 'middle'),
    textBox(axes.yLabelX, axes.yLabelY, axes.yLabel, size, 'start'),
  ];
}
type LabelItem = { id: string; x: number; y: number; text: string };
/** 依次尝试上、下、右、左四个位置，取第一个不与已占位框相交且在画布内的位置。 */
function planLabels(items: readonly LabelItem[], limit: number, size: number, occupied: Box[], frame: ChartFrame): Map<string, LabelPlacement> {
  const chosen = new Map<string, LabelPlacement>();
  for (const item of items) {
    if (chosen.size >= limit) break;
    const candidates: LabelPlacement[] = [
      { x: item.x, y: item.y - size * 0.75, anchor: 'middle' },
      { x: item.x, y: item.y + size * 1.5, anchor: 'middle' },
      { x: item.x + size * 0.6, y: item.y + size * 0.4, anchor: 'start' },
      { x: item.x - size * 0.6, y: item.y + size * 0.4, anchor: 'end' },
    ];
    for (const candidate of candidates) {
      const box = textBox(candidate.x, candidate.y, item.text, size, candidate.anchor);
      if (!inFrame(box, frame) || occupied.some((other) => !apart(box, other))) continue;
      chosen.set(item.id, candidate);
      occupied.push(box);
      break;
    }
  }
  return chosen;
}

const DESKTOP_AXIS_TEXT = 14;
/** 桌面层 `.chart-label` 的 12px 被 `.pricing-chart text { font-size: 14px }` 覆盖，实测渲染就是 14px，估算必须同口径。 */
const DESKTOP_LABEL_TEXT = 14;
const MOBILE_AXIS_TEXT = 14;
const MOBILE_LABEL_TEXT = 14;

const currencies: BillingCurrency[] = ['USD', 'CNY'];
const numeric = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const symbol = (c: BillingCurrency) => c === 'USD' ? '$' : '¥';
const numberText = (n: number) => Number(n.toPrecision(4)).toString();
const viewBox = (f: ChartFrame) => `0 0 ${f.width} ${f.height}`;
const xRange = (f: ChartFrame): Domain => [f.left, f.width - f.right];
const yRange = (f: ChartFrame): Domain => [f.height - f.bottom, f.top];
const shortName = (s: string) => s.length > 19 ? `${s.slice(0, 18)}…` : s;
function linearTicks(domain: Domain, range: Domain): Array<{ position: number; text: string }> {
  return Array.from({ length: 5 }, (_, i) => {
    const value = domain[0] + (domain[1] - domain[0]) * i / 4;
    return { position: mapLinear(value, domain, range)!, text: numberText(value) };
  });
}
/** 桌面轴版式：与改造前逐项一致（x 刻度 y=314、y 刻度 x=54、轴标题 320/347 与 100/18）。 */
function desktopAxes(xTicks: Array<{ position: number; text: string }>, yTicks: Array<{ position: number; text: string }>,
  xLabel: string, yLabel: string, size: number, width: number): ChartAxes {
  return {
    xTicks: xTicks.map((tick) => ({ ...tick, anchor: tickAnchor(tick.position, tick.text, size, width) })),
    yTicks: yTicks.map((tick) => ({ ...tick, anchor: 'end' })),
    xLabel, yLabel, xTickY: 314, yTickX: 54, xLabelX: 320, xLabelY: 347, yLabelX: 100, yLabelY: 18,
  };
}
/**
 * 移动轴版式：刻度紧随绘图区。纵轴标题放在 x 轴上方的左上角（x=left+36），
 * 不再与顶部刻度争夺 x<left 的窄栏；x 轴标题压到画布底边上方 8px。
 */
function mobileAxes(xTicks: Array<{ position: number; text: string }>, yTicks: Array<{ position: number; text: string }>,
  xLabel: string, yLabel: string, frame: ChartFrame, size: number): ChartAxes {
  return {
    xTicks: xTicks.map((tick) => ({ ...tick, anchor: tickAnchor(tick.position, tick.text, size, frame.width) })),
    yTicks: yTicks.map((tick) => ({ ...tick, anchor: 'end' })),
    xLabel, yLabel,
    xTickY: frame.height - frame.bottom + 22, yTickX: frame.left - 4,
    xLabelX: frame.width / 2, xLabelY: frame.height - 8, yLabelX: frame.left + 36, yLabelY: 18,
  };
}

export type ScatterPoint = {
  id: string; name: string; x: number; y: number; price: number; score: number;
  costPerPoint: number; costText: string; title: string; label: string;
  frontier: boolean; desktopLabel: LabelPlacement | null; mobileLabel: LabelPlacement | null; provenance: string;
  /** 移动层坐标：同一份数据按 360 宽重新映射，桌面层坐标不动。 */
  mx: number; my: number;
};
export type ScatterGroup = { currency: BillingCurrency; points: ScatterPoint[]; path: string | null; axes: ChartAxes };
export type ScatterChartModel = {
  viewBox: string; groups: ScatterGroup[];
  /** 移动层与桌面层同时 SSR，只由媒体查询切换显示。 */
  mobile: { viewBox: string; groups: ScatterGroup[] };
  excluded: number; unscored: number; invalidPrice: number; description: string;
};

export function buildScatterChart(api: readonly ApiPrice[], benchmark: BenchmarkDoc,
  frame: ChartFrame = DEFAULT_CHART_FRAME, mobileFrame: ChartFrame = MOBILE_CHART_FRAME): ScatterChartModel {
  let unscored = 0;
  let invalidPrice = 0;
  const values = api.flatMap((item) => {
    const row = buildRowScore(item, benchmark);
    const price = blendPerMillion(item);
    if (!row || !numeric(row.score) || row.score <= 0) { unscored++; return []; }
    // 聚合源可能以 USD 报 CNY 账单价；不能把 USD 数字画到 CNY 轴上。
    if (!numeric(item.inputPrice) || !numeric(item.outputPrice) || !numeric(price) || price <= 0
      || item.reportedCurrency !== item.billingCurrency || !numeric(row.costPerPoint)) { invalidPrice++; return []; }
    return [{ item, row, price }];
  });
  const desktopGroups: ScatterGroup[] = [];
  const mobileGroups: ScatterGroup[] = [];
  for (const currency of currencies) {
    const entries = values.filter((v) => v.item.billingCurrency === currency);
    if (!entries.length) continue;
    const prices = entries.map((v) => v.price);
    const domain: Domain = [Math.min(...prices), Math.max(...prices)];
    const scores: Domain = [0, Math.max(...entries.map((v) => v.row.score))];
    const frontierIds = new Set(paretoFrontier(entries, (v) => v.price, (v) => v.row.score).map((v) => v.item.id));
    const points: ScatterPoint[] = entries.map(({ item, row, price }) => ({
      id: item.id, name: modelLabel(item.provider, item.model),
      x: mapLog(price, domain, xRange(frame))!, y: mapLinear(row.score, scores, yRange(frame))!,
      mx: mapLog(price, domain, xRange(mobileFrame))!, my: mapLinear(row.score, scores, yRange(mobileFrame))!,
      price, score: row.score, costPerPoint: row.costPerPoint, costText: formatCostPerPoint(row.costPerPoint),
      title: `${modelLabel(item.provider, item.model)} · ${item.provenance === 'official' ? '官方标价' : '聚合数据'} · ${symbol(currency)}${numberText(price)}/百万 token · 智能指数 ${row.score} · 每分智能成本 ${formatCostPerPoint(row.costPerPoint)}`,
      label: shortName(item.model), frontier: frontierIds.has(item.id), desktopLabel: null, mobileLabel: null, provenance: item.provenance,
    }));
    // 完全重合点共享坐标，原生标题包含所有名称。
    const titles = points.map((p) => p.title);
    for (const p of points) p.title = points.flatMap((q, i) => q.x === p.x && q.y === p.y ? [titles[i]!] : []).join('；');
    const xRaw = (f: ChartFrame) => logTicks(domain, 6).map((value) => ({ position: mapLog(value, domain, xRange(f))!, text: `${symbol(currency)}${numberText(value)}` }));
    const yRaw = (f: ChartFrame) => linearTicks(scores, yRange(f));
    const desktop = desktopAxes(xRaw(frame), yRaw(frame), '3:1 混合单价 / 百万 token（对数）', '智能指数', DESKTOP_AXIS_TEXT, frame.width);
    const mobile = mobileAxes(xRaw(mobileFrame), yRaw(mobileFrame), '3:1 混合单价 / 百万 token（对数）', '智能指数', mobileFrame, MOBILE_AXIS_TEXT);
    // 标签优先前沿与极值，再按稳定 ID；位置由包围盒排斥决定。
    const ordered = (target: (p: ScatterPoint) => number) => [...points].sort((a, b) => a.id.localeCompare(b.id, 'en'))
      .sort((a, b) => target(a) - target(b));
    const labelOrder = [...points].sort((a, b) => a.id.localeCompare(b.id, 'en'));
    const extremes = [ordered((p) => p.price)[0], ordered((p) => -p.price)[0], ordered((p) => -p.score)[0], ordered((p) => p.score)[0]]
      .filter((p): p is ScatterPoint => !!p);
    const sequence: LabelItem[] = [...labelOrder.filter((p) => p.frontier), ...extremes, ...labelOrder]
      .filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i)
      .map((p) => ({ id: p.id, x: p.x, y: p.y, text: p.label }));
    const mobileSequence: LabelItem[] = [...labelOrder.filter((p) => p.frontier), ...extremes, ...labelOrder]
      .filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i)
      .map((p) => ({ id: p.id, x: p.mx, y: p.my, text: p.label }));
    const desktopLabels = planLabels(sequence, 12, DESKTOP_LABEL_TEXT, axesBoxes(desktop, DESKTOP_AXIS_TEXT), frame);
    const mobileLabels = planLabels(mobileSequence, 5, MOBILE_LABEL_TEXT, axesBoxes(mobile, MOBILE_AXIS_TEXT), mobileFrame);
    for (const p of points) {
      p.desktopLabel = desktopLabels.get(p.id) ?? null;
      p.mobileLabel = mobileLabels.get(p.id) ?? null;
    }
    const frontier = points.filter((p) => p.frontier).sort((a, b) => a.price - b.price);
    desktopGroups.push({
      currency, points, axes: desktop,
      path: toSvgPath(frontier.map((p) => ({ x: p.x, y: p.y })), 'line'),
    });
    mobileGroups.push({
      currency, points: points.map((p) => ({ ...p, x: p.mx, y: p.my })), axes: mobile,
      path: toSvgPath(frontier.map((p) => ({ x: p.mx, y: p.my })), 'line'),
    });
  }
  return { viewBox: viewBox(frame), groups: desktopGroups, mobile: { viewBox: viewBox(mobileFrame), groups: mobileGroups },
    excluded: api.length - values.length, unscored, invalidPrice,
    description: '各账单币种独立分面；同币种 Pareto 前沿表示价格不高且能力不低的非支配条目；人民币为原币标价，非汇率估算。' };
}

export type CompositionRow = {
  id: string; label: string; title: string; y: number; missingWrite: boolean; missingText: string;
  segments: Array<{ index: number; x: number; width: number; value: number; title: string }>;
};
export type CompositionGroup = {
  currency: BillingCurrency; total: number; shown: number; rows: CompositionRow[];
  /** 行内左侧模型名与右侧缺价提示的锚点：两层各自按自己的 frame 取值。 */
  labelX: number; missingX: number;
};
export type CompositionChartModel = {
  viewBox: string; legend: string[];
  groups: CompositionGroup[];
  mobile: { viewBox: string; groups: CompositionGroup[] };
};

/** 桌面 8 行 / 行距 31；移动 4 行 / 行距 36（字号 14 的行盒高约 18.6，36 才能让相邻两行不碰）。 */
function compositionGroups(api: readonly ApiPrice[], frame: ChartFrame, limit: number, pitch: number, mobile: boolean): CompositionGroup[] {
  const legend = ['输入', '输出', '缓存读', '缓存写'];
  return currencies.flatMap((currency) => {
    const candidates = api.filter((item) => item.billingCurrency === currency && item.reportedCurrency === currency
      && numeric(item.inputPrice) && numeric(item.outputPrice)
      && [item.cacheReadPrice, item.cacheWritePrice].every((v) => v === null || numeric(v)))
      .map((item) => ({ item, blend: blendPerMillion(item)! }))
      .filter((v) => numeric(v.blend) && v.blend > 0)
      .sort((a, b) => a.blend - b.blend);
    if (!candidates.length) return [];
    const chosen = candidates.slice(0, limit);
    const valuesOf = (item: ApiPrice) => [item.inputPrice, item.outputPrice, item.cacheReadPrice, item.cacheWritePrice];
    const max = Math.max(...chosen.map(({ item }) => valuesOf(item).reduce<number>((sum, v) => sum + (v ?? 0), 0)));
    const rows = chosen.map(({ item }, i) => {
      const missingNames = valuesOf(item).flatMap((v, j) => v === null ? [legend[j]!] : []);
      // 移动层行内左侧是模型名、右侧是缺价提示，两者同基线：提示用「无缓存读/缓存写价」的紧凑写法，
      // 把宽度留给模型名，避免出现「Command R7…」这种丢掉后缀的截断。
      const missingText = mobile
        ? (missingNames.length ? `无${missingNames.join('/')}价` : '')
        : missingNames.map((name) => `无${name}价`).join(' · ');
      const labelWidth = frame.width - frame.right - frame.left - (missingText ? textWidth(missingText, MOBILE_LABEL_TEXT) + 12 : 4);
      return {
        id: item.id,
        label: mobile ? fitText(shortName(item.model), labelWidth, MOBILE_LABEL_TEXT) : shortName(item.model),
        title: `${modelLabel(item.provider, item.model)} · ${currency} · ${item.provenance === 'official' ? '官方标价' : '聚合数据'}`,
        y: frame.top + i * pitch, missingWrite: item.cacheWritePrice === null, missingText,
        segments: stackSegments(valuesOf(item), (v) => mapLinear(v, [0, max], xRange(frame))).map((segment) => ({
          index: segment.index, x: segment.x0, width: segment.x1 - segment.x0, value: segment.value,
          title: `${legend[segment.index]}：${symbol(currency)}${numberText(segment.value)}/百万 token`,
        })),
      };
    });
    return [{ currency, total: candidates.length, shown: rows.length, rows, labelX: frame.left, missingX: frame.width - frame.right }];
  });
}

export function buildCompositionChart(api: readonly ApiPrice[], frame: ChartFrame = DEFAULT_CHART_FRAME,
  mobileFrame: ChartFrame = MOBILE_COMPOSITION_FRAME): CompositionChartModel {
  return {
    viewBox: viewBox(frame), legend: ['输入', '输出', '缓存读', '缓存写'],
    groups: compositionGroups(api, frame, 8, 31, false),
    mobile: { viewBox: viewBox(mobileFrame), groups: compositionGroups(api, mobileFrame, 4, 36, true) },
  };
}

type HistoryState = { inputPrice: number | null; outputPrice: number | null; billingCurrency: BillingCurrency };
type HistoryEvent = { date: string; kind: 'baseline' | 'full' | 'delta'; entries: Record<string, HistoryState | { after: HistoryState | null }> };
export type HistorySeries = {
  id: string; name: string; path: string | null; comparison: string | null;
  points: Array<{ x: number; y: number; date: string; price: number; title: string }>;
};
export type HistoryGroup = { currency: BillingCurrency; axes: ChartAxes; series: HistorySeries[] };
export type HistoryChartModel = {
  viewBox: string; days: number; ready: boolean; status: string; expectedDate: string | null; snapshotDates: string[];
  groups: HistoryGroup[];
  mobile: { viewBox: string; groups: HistoryGroup[] };
};
const dayMs = 86_400_000;
const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;

/** 仅记录实际快照中的观察；delta 不为未变化条目生成日期或插值点。`today` 必须由调用方注入数据侧日期；不读构建机时区。 */
export function buildHistoryChart(historyText: string, api: readonly ApiPrice[], frame: ChartFrame = DEFAULT_CHART_FRAME, today: string,
  mobileFrame: ChartFrame = MOBILE_HISTORY_FRAME): HistoryChartModel {
  if (!validDate(today)) throw new Error('历史图日期非法');
  const parsed: HistoryEvent[] = historyText.trim().split(/\r?\n/).filter(Boolean).map((line) => {
    const event = JSON.parse(line) as HistoryEvent;
    if (!event || !validDate(event.date) || !['baseline', 'full', 'delta'].includes(event.kind)
      || !event.entries || typeof event.entries !== 'object' || Array.isArray(event.entries)) throw new Error('历史快照结构非法');
    return event;
  });
  // 快照日期按抓取日记录，可能晚于价格抓取日（DATA_VERIFIED_AT）：注入日期只做上限，
  // 当日快照本身永远有效，否则构建在 UTC 未跨日时会切掉当日快照、页面写「已 0 天」。
  const newest = parsed.map((event) => event.date).sort().at(-1);
  const cutoff = newest && newest > today ? newest : today;
  const events = parsed.filter((event) => event.date <= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date) || Number(a.kind === 'delta') - Number(b.kind === 'delta'));
  const dates = [...new Set(events.map((event) => event.date))];
  const first = dates[0];
  const last = dates.at(-1);
  const days = first && last ? Math.floor((Date.parse(last) - Date.parse(first)) / dayMs) + 1 : 0;
  const ready = days >= 42;
  const expectedDate = first ? new Date(Date.parse(first) + 41 * dayMs).toISOString().slice(0, 10) : null;
  const names = new Map(api.map((item) => [item.id, modelLabel(item.provider, item.model)]));
  type Observation = { date: string; price: number };
  const tracks: Array<{ id: string; currency: BillingCurrency; observations: Observation[] }> = [];
  const active = new Map<string, typeof tracks[number]>();
  for (const event of events) {
    if (event.kind !== 'delta') {
      for (const id of active.keys()) if (!Object.hasOwn(event.entries, id)) active.delete(id);
    }
    for (const [id, value] of Object.entries(event.entries)) {
      const state = event.kind === 'delta' ? (value as { after: HistoryState | null })?.after : value as HistoryState;
      if (state === null) { active.delete(id); continue; }
      if (!state || !['USD', 'CNY'].includes(state.billingCurrency)
        || ![state.inputPrice, state.outputPrice].every((v) => v === null || numeric(v))) throw new Error('历史价格状态非法');
      const price = blendPerMillion(state);
      if (!numeric(price) || price <= 0) { active.delete(id); continue; }
      let track = active.get(id);
      if (!track || track.currency !== state.billingCurrency) {
        track = { id, currency: state.billingCurrency, observations: [] };
        tracks.push(track); active.set(id, track);
      }
      // 同日 baseline + delta 是一次观察，以后者为准。
      if (track.observations.at(-1)?.date === event.date) track.observations.pop();
      track.observations.push({ date: event.date, price });
    }
  }
  const groupsFor = (target: ChartFrame, mobile: boolean): HistoryGroup[] => currencies.flatMap((currency) => {
    const selected = tracks.filter((track) => track.currency === currency && names.has(track.id));
    if (!selected.length) return [];
    const prices = selected.flatMap((track) => track.observations.map((point) => point.price));
    const domain: Domain = [0, Math.max(...prices)];
    const timeDomain: Domain = [Date.parse(first!), Date.parse(last!)];
    const series = selected.map((track, i) => {
      const name = names.get(track.id)!;
      const points = track.observations.map((point) => ({
        ...point, x: mapLinear(Date.parse(point.date), timeDomain, xRange(target))!, y: mapLinear(point.price, domain, yRange(target))!,
        title: `${name} · ${point.date} · ${symbol(currency)}${numberText(point.price)}/百万 token`,
      }));
      const previous = points.at(-2);
      const current = points.at(-1)!;
      return { id: `${track.id}-${i}`, name, points,
        path: ready && points.length >= 2 ? toSvgPath(points, 'line') : null,
        comparison: previous ? `${name}：${previous.date} ${symbol(currency)}${numberText(previous.price)} → ${current.date} ${symbol(currency)}${numberText(current.price)}/百万 token` : null,
      };
    });
    const xTicks = [first!, last!].filter((date, i, all) => all.indexOf(date) === i)
      .map((date) => ({ position: mapLinear(Date.parse(date), timeDomain, xRange(target))!, text: date }));
    const yTicks = linearTicks(domain, yRange(target));
    const axes = mobile
      ? mobileAxes(xTicks, yTicks, '实际快照日期', `${currency} / 百万 token（3:1）`, target, MOBILE_AXIS_TEXT)
      : desktopAxes(xTicks, yTicks, '实际快照日期', `${currency} / 百万 token（3:1）`, DESKTOP_AXIS_TEXT, target.width);
    return [{ currency, series, axes }];
  });
  return { viewBox: viewBox(frame), days, ready, expectedDate, snapshotDates: dates,
    groups: groupsFor(frame, false),
    mobile: { viewBox: viewBox(mobileFrame), groups: groupsFor(mobileFrame, true) },
    status: ready ? `价格历史（已 ${days} 天，仅连接真实观察点）` : `历史积累中（已 ${days} 天，需 6 周）`,
  };
}

export type UsageCostPair = {
  id: string; modelId: string; name: string; title: string; breakEvenMillion: number; thresholdText: string;
  apiPath: string | null; planPath: string | null;
  samples: Array<{ usageMillion: number; apiCost: number; planCost: number; x: number; apiY: number; planY: number; title: string }>;
};
export type UsageCostIntersection = {
  x: number; y: number; usageMillion: number; cost: number; label: string; title: string;
  /** 只有在不与刻度、当前用量标注、其他交点标注冲突时才给位置。 */
  labelPlacement: LabelPlacement | null;
};
export type UsageCostGroup = {
  currency: BillingCurrency; total: number; shown: number; axes: ChartAxes;
  pairs: UsageCostPair[]; intersections: UsageCostIntersection[];
};
export type UsageCostChartModel = {
  viewBox: string; usageMillion: number; currentX: number; currentLabel: string;
  /** 当前用量标线与文字：桌面与移动层各按自己的 frame 排版。 */
  currentY: number; lineTop: number; lineBottom: number;
  exactLegend: string; estimateLegend: string; note: string;
  groups: UsageCostGroup[];
  mobile: { viewBox: string; currentX: number; currentY: number; lineTop: number; lineBottom: number; groups: UsageCostGroup[] };
};

export function buildUsageCostChart(plans: readonly TokenPlan[], api: readonly ApiPrice[], usageMillion = 50,
  frame: ChartFrame = DEFAULT_CHART_FRAME, mobileFrame: ChartFrame = MOBILE_USAGE_FRAME): UsageCostChartModel {
  const usage = Number.isFinite(usageMillion) && usageMillion >= 1 && usageMillion <= 1000 ? usageMillion : 50;
  const logDomain: Domain = [1, 1000];
  const matched = plans.flatMap((plan) => {
    const model = pickBasisModel(plan, api);
    if (!model) return [];
    const outcome = computeBreakEven(plan, model);
    if (outcome.kind !== 'break_even' || !numeric(outcome.result.totalMillion) || outcome.result.totalMillion <= 0) return [];
    const comparison = comparePlanVsApi(plan, model, { inputMillion: 0, outputMillion: 0 });
    if (comparison.kind !== 'ok' || !numeric(comparison.planCost)) return [];
    return [{ plan, model, threshold: outcome.result.totalMillion }];
  });
  const groupsFor = (target: ChartFrame, pairLimit: number, mobile: boolean): UsageCostGroup[] => currencies.flatMap((currency) => {
    const candidates = matched.filter(({ plan }) => plan.billingCurrency === currency);
    if (!candidates.length) return [];
    const chosen = candidates.slice(0, pairLimit);
    // 对数采样并加入保本点，精确标出同组 API 与月费的反转位置。
    const sampleUsage = [...new Set([
      ...Array.from({ length: 25 }, (_, i) => 10 ** (3 * i / 24)), usage,
      ...chosen.map((pair) => pair.threshold).filter((v) => v >= 1 && v <= 1000),
    ])].sort((a, b) => a - b);
    const raw = chosen.map(({ plan, model, threshold }) => ({
      plan, model, threshold,
      samples: sampleUsage.flatMap((total) => {
        const outputMillion = total / (DEFAULT_BLEND_RATIO + 1);
        const result = comparePlanVsApi(plan, model, { inputMillion: outputMillion * DEFAULT_BLEND_RATIO, outputMillion });
        return result.kind === 'ok' && numeric(result.apiCost) && numeric(result.planCost)
          && result.apiCost > 0 && result.planCost > 0
          ? [{ usageMillion: total, apiCost: result.apiCost, planCost: result.planCost }] : [];
      }),
    }));
    // 纵轴必须取对数：1M 与 1000M 的成本差 3 个数量级，线性刻度会把 1M–100M 段全部压进
    // 图底 10px 内（实测线上就是这样，曲线看起来像"没画"）。对数刻度下全区间可读。
    const costs = raw.flatMap((pair) => pair.samples.flatMap((point) => [point.apiCost, point.planCost]))
      .filter((value) => Number.isFinite(value) && value > 0);
    if (!costs.length) return [];
    const costDomain: Domain = [Math.min(...costs) * 0.8, Math.max(...costs) * 1.25];
    const pairs = raw.map(({ plan, model, threshold, samples }) => {
      const name = modelLabel(plan.provider, plan.plan);
      const points = samples.map((point) => ({ ...point,
        x: mapLog(point.usageMillion, logDomain, xRange(target))!,
        apiY: mapLog(point.apiCost, costDomain, yRange(target))!, planY: mapLog(point.planCost, costDomain, yRange(target))!,
        title: `${name} · ${numberText(point.usageMillion)}M · API ${formatMoney(point.apiCost, currency)}/月 · 套餐 ${formatMoney(point.planCost, currency)}/月（反推估算，非官方 token 额度）`,
      }));
      return { id: plan.id, modelId: model.id, name, title: `${name} · API 基准：${modelLabel(model.provider, model.model)}`,
        breakEvenMillion: threshold, thresholdText: `${name} · 反推保本点 ${numberText(threshold)}M`, samples: points,
        apiPath: toSvgPath(points.map((point) => ({ x: point.x, y: point.apiY })), 'line'),
        // 既有比较函数只给固定月费：step 退化为水平平台，不能捏造 token 阶梯或叠购成本。
        planPath: toSvgPath(points.map((point) => ({ x: point.x, y: point.planY })), 'step'),
      };
    });
    const curves = pairs.flatMap((pair) => [
      { name: `${pair.name} API`, points: pair.samples.map((point) => ({ x: point.x, y: point.apiY })) },
      { name: `${pair.name} 套餐（估算）`, points: pair.samples.map((point) => ({ x: point.x, y: point.planY })) },
    ]);
    const intersections: UsageCostIntersection[] = [];
    for (let i = 0; i < curves.length; i++) {
      for (let j = i + 1; j < curves.length; j++) {
        for (const point of polylineIntersections(curves[i]!.points, curves[j]!.points)) {
          const total = 10 ** mapLinear(point.x, xRange(target), [0, 3])!;
          const cost = 10 ** mapLinear(point.y, yRange(target), [Math.log10(costDomain[0]), Math.log10(costDomain[1])])!;
          const title = `${curves[i]!.name} × ${curves[j]!.name} · 约 ${numberText(total)}M · ${formatMoney(cost, currency)}/月；采样曲线交点，仅同币种`;
          const same = intersections.find((p) => Math.abs(p.x - point.x) < 0.01 && Math.abs(p.y - point.y) < 0.01);
          if (same) same.title += `；${title}`;
          else intersections.push({ ...point, usageMillion: total, cost, label: `≈${numberText(total)}M`, title, labelPlacement: null });
        }
      }
    }
    const xRaw = [1, 10, 100, 1000].map((v) => ({ position: mapLog(v, logDomain, xRange(target))!, text: `${v}M` }));
    const yRaw = logTicks(costDomain, 6).map((value) => ({ position: mapLog(value, costDomain, yRange(target))!, text: `${symbol(currency)}${numberText(value)}` }));
    const yLabel = `${currency} / 月（对数）`;
    const axes = mobile
      ? mobileAxes(xRaw, yRaw, '月 Token 用量（对数，输入:输出 = 3:1）', yLabel, target, MOBILE_AXIS_TEXT)
      : desktopAxes(xRaw, yRaw, '月 Token 用量（对数，输入:输出 = 3:1）', yLabel, DESKTOP_AXIS_TEXT, target.width);
    // 当前用量标注先占位，交点标注再挑空位；两者都不与刻度或彼此重叠。
    const currentX = mapLog(usage, logDomain, xRange(target))!;
    const currentAnchor: ChartTickAnchor = usage > 500 ? 'end' : 'start';
    const currentY = target.height - target.bottom - (mobile ? 6 : 7);
    const occupied: Box[] = [...axesBoxes(axes, mobile ? MOBILE_AXIS_TEXT : DESKTOP_AXIS_TEXT),
      textBox(currentX, currentY, `当前用量 ${numberText(usage)}M`, mobile ? MOBILE_LABEL_TEXT : DESKTOP_LABEL_TEXT, currentAnchor)];
    const placed = planLabels(intersections.map((point, index) => ({ id: String(index), x: point.x, y: point.y, text: point.label })),
      mobile ? 3 : 5, mobile ? MOBILE_LABEL_TEXT : DESKTOP_LABEL_TEXT, occupied, target);
    intersections.forEach((point, index) => { point.labelPlacement = placed.get(String(index)) ?? null; });
    return [{ currency, total: candidates.length, shown: pairs.length, pairs, intersections, axes }];
  });
  const desktopGroups = groupsFor(frame, 5, false);
  const mobileGroups = groupsFor(mobileFrame, 3, true);
  return { viewBox: viewBox(frame), usageMillion: usage,
    currentX: mapLog(usage, logDomain, xRange(frame))!, currentLabel: `当前用量 ${numberText(usage)}M`,
    currentY: frame.height - frame.bottom - 7, lineTop: frame.top, lineBottom: frame.height - frame.bottom,
    groups: desktopGroups,
    mobile: {
      viewBox: viewBox(mobileFrame), currentX: mapLog(usage, logDomain, xRange(mobileFrame))!,
      currentY: mobileFrame.height - mobileFrame.bottom - 6, lineTop: mobileFrame.top, lineBottom: mobileFrame.height - mobileFrame.bottom,
      groups: mobileGroups,
    },
    exactLegend: 'API 单价精确折算', estimateLegend: '套餐按月费与 API 单价反推估算',
    note: 'API 不含缓存费用，按单价精确计算后对数采样连线。套餐按固定月费绘制虚线阶梯平台；反推保本点不是官方 token 额度，不表示可按 token 阶梯叠购。交点只在同币种内比较，采样交点标约数，不做跨币种排名。',
  };
}
