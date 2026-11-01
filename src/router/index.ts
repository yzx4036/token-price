import { createRouter, type Router, type RouterHistory, type RouteRecordRaw } from 'vue-router';
import ApiPricingView from '../views/ApiPricingView.vue';
import CalculatorView from '../views/CalculatorView.vue';
import HomeView from '../views/HomeView.vue';
import MethodologyView from '../views/MethodologyView.vue';
import PlansView from '../views/PlansView.vue';
import SourcesView from '../views/SourcesView.vue';
import { SITE_SHORT } from '../lib/site-meta';

export type RouteDocumentMeta = {
  /** 完整 title（含站点后缀），预渲染直接写进 <title> */
  title: string;
  description: string;
};

/**
 * 每条路由独立 title / description（I7）：预渲染写入产物 head，客户端导航时同步更新。
 *
 * 四条硬规则，都在实测里踩过：
 * 1. 页面名放最前——搜索引擎按字符数截断 title，站点后缀放前面会把最有区分度的信息截掉。
 * 2. 后缀走 SITE_SHORT 单一真源——写死站名会和 site-meta.ts 漂移。
 * 3. title ≤ 60 字符、description ≤ 160 字符，门禁会测。
 * 4. **关键词必须真的出现在文本里**。2026-11-01 实测：把首页 title 换成纯品牌名后，
 *    首页「对比」出现 0 次、「AI API」0 次，Bing 搜「token plan 对比」直接掉出前 10；
 *    而「比价」还残留 2 次、仍有排名。搜索词不是靠品牌名命中的。
 */
export const ROUTE_DOCUMENT_META: Record<string, RouteDocumentMeta> = {
  '/': {
    // 关键词前置：目标词「Token Plan 价格对比」打头，再覆盖 AI API / 套餐 / 比价三组词
    title: `Token Plan 价格对比 · AI API 与套餐比价 | ${SITE_SHORT}`,
    description:
      '对比国内外 AI 大模型 API 与 Token Plan / Coding Plan 套餐价格：国内厂商给人民币官方原价，国际厂商以美元原价为主、人民币为按汇率估算的参考值，逐条标注溯源等级。',
  },
  '/api-pricing/': {
    title: `AI API 价格表 · 输入输出单价对比 | ${SITE_SHORT}`,
    description:
      'AI API 按量价格对比表：输入、输出、缓存读写单价与上下文长度逐列展示；美元条目以厂商美元原价为主、人民币为按汇率估算的参考值，逐条标注溯源等级。',
  },
  '/plans/': {
    title: `Token Plan / Coding Plan 套餐对比 | ${SITE_SHORT}`,
    description:
      'Token Plan 与 Coding Plan 套餐价格对比：月费、额度语义、可用模型与用途限制逐项列出；未核验条目不参与比较。',
  },
  '/calculator/': {
    title: `Token 成本计算器 · API 用量费用对比 | ${SITE_SHORT}`,
    description:
      '按每月输入、输出与缓存 Token 用量计算已核验模型的 API 成本：国际厂商以美元原价结算，人民币为按汇率估算的参考值；国内厂商给人民币原价。',
  },
  '/sources/': {
    title: `数据来源与溯源覆盖率 | ${SITE_SHORT}`,
    description:
      '每个厂商的价格来源链接、官方核验与聚合数据占比、汇率来源与抓取时间，以及如何自行更新数据。',
  },
  '/methodology/': {
    title: `数据口径与免责声明 | ${SITE_SHORT}`,
    description: '了解本站的来源分级、核验流程、成本公式、人民币换算口径和免责声明。',
  },
};

/** 预渲染要逐条跑的路由（与 ROUTE_DOCUMENT_META 同源，避免两处各写一份） */
export const PRERENDER_ROUTES = Object.keys(ROUTE_DOCUMENT_META);

export const routes: RouteRecordRaw[] = [
  { path: '/', name: 'home', component: HomeView },
  { path: '/api-pricing/', name: 'api-pricing', component: ApiPricingView },
  { path: '/plans/', name: 'plans', component: PlansView },
  { path: '/calculator/', name: 'calculator', component: CalculatorView },
  { path: '/sources/', name: 'sources', component: SourcesView },
  { path: '/methodology/', name: 'methodology', component: MethodologyView },
];

/**
 * client 与 ssr 共用同一个路由表工厂。
 * SSR 侧必须传 createMemoryHistory(import.meta.env.BASE_URL)，否则 RouterLink 的 href
 * 不带 base 前缀，深链会 404（req §2 F17）。
 */
export function createAppRouter(history: RouterHistory): Router {
  return createRouter({
    history,
    routes,
    scrollBehavior: () => ({ top: 0 }),
  });
}

/** 去掉 base 前缀与查询串，统一成带尾斜杠的站内路径 */
export function normalizeRoutePath(path: string): string {
  const base = import.meta.env.BASE_URL || '/';
  let value = path.split(/[?#]/)[0] ?? '/';
  if (base !== '/' && value.startsWith(base)) value = value.slice(base.length - 1);
  const clean = value.replace(/^\/+|\/+$/g, '');
  return clean === '' ? '/' : `/${clean}/`;
}

export function resolveDocumentMeta(path: string): RouteDocumentMeta | undefined {
  return ROUTE_DOCUMENT_META[normalizeRoutePath(path)];
}
