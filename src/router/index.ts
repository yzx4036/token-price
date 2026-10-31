import { createRouter, type Router, type RouterHistory, type RouteRecordRaw } from 'vue-router';
import ApiPricingView from '../views/ApiPricingView.vue';
import CalculatorView from '../views/CalculatorView.vue';
import HomeView from '../views/HomeView.vue';
import MethodologyView from '../views/MethodologyView.vue';
import PlansView from '../views/PlansView.vue';
import SourcesView from '../views/SourcesView.vue';

export type RouteDocumentMeta = {
  /** 完整 title（含站点后缀），预渲染直接写进 <title> */
  title: string;
  description: string;
};

/** 每条路由独立 title / description（I7）：预渲染写入产物 head，客户端导航时同步更新 */
export const ROUTE_DOCUMENT_META: Record<string, RouteDocumentMeta> = {
  '/': {
    title: 'AI API 与 Token Plan 比价（原币种原价 + 人民币估算） | Token Price',
    description:
      'AI API 价格表：国内厂商给人民币官方原价，国际厂商以美元原价为主、人民币为按汇率估算的参考值，逐条标注溯源等级。',
  },
  '/api-pricing/': {
    title: 'API 比价（原币种原价 + 人民币估算） | Token Price',
    description:
      'AI API 价格表：美元条目以厂商美元原价为主、人民币为按汇率估算的参考值；人民币条目给官方原价，逐条标注溯源等级。',
  },
  '/plans/': {
    title: 'Token Plan 比价 | Token Price',
    description: '独立比较订阅型 Token 与 Coding Plan；未核验条目不参与比较。',
  },
  '/calculator/': {
    title: '成本计算器 | Token Price',
    description:
      '按每月输入、输出与缓存 Token 用量计算已核验模型的成本：国际厂商以美元原价结算，人民币为按汇率估算的参考值；国内厂商给人民币原价。',
  },
  '/sources/': {
    title: '数据来源与溯源覆盖率 | Token Price',
    description:
      '每个厂商的价格来源、官方核验与聚合数据占比、汇率来源与抓取时间，以及如何自行更新数据。',
  },
  '/methodology/': {
    title: '数据口径与免责声明 | Token Price',
    description: '了解 Token Price 的来源、溯源分级、核验、成本公式、人民币换算口径和免责声明。',
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
