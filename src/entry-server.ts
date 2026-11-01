import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory } from 'vue-router';
import App from './App.vue';
import { PRERENDER_ROUTES, createAppRouter, normalizeRoutePath, resolveDocumentMeta } from './router';
import { apiPrices, DATA_VERIFIED_AT } from './lib/data';
import { buildStructuredData, type JsonLd } from './lib/structured-data';
import { SITE_NAME, SITE_TAGLINE } from './lib/site-meta';

export { PRERENDER_ROUTES };

/**
 * 站名与定位传给预渲染脚本。
 *
 * prerender.mjs / gen-llms-txt.mjs 是 .mjs（Node 直接执行），没法 import
 * 这份 .ts 常量。从 SSR 入口转出一份，是让「站名只有一个真源」的最短路径——
 * 否则改站名要同时改 CLI 脚本里的硬编码，线上就出现过 og:site_name 与 title 对不上。
 */
export const SITE_INFO = { name: SITE_NAME, tagline: SITE_TAGLINE };

/**
 * 构建期预渲染入口。路由 history 必须带 base（req §2 F17），
 * 否则 RouterLink 生成的 href 不带 /token-price/ 前缀，发布后深链全 404。
 */
export async function render(url: string): Promise<string> {
  const app = createSSRApp(App);
  const router = createAppRouter(createMemoryHistory(import.meta.env.BASE_URL));
  app.use(router);
  await router.push(url);
  await router.isReady();
  return renderToString(app);
}

/** 逐路由标题与描述，供 scripts/prerender.mjs 写进产物 head */
export function documentMeta(url: string): { title: string; description: string } | undefined {
  return resolveDocumentMeta(url);
}

/**
 * 逐路由的结构化数据（JSON-LD）。
 *
 * 由预渲染脚本序列化后注入 head。之所以在 SSR 侧算而不是客户端算：
 * 静态产物里就必须有这段 JSON，否则 AI 爬虫（多数不执行 JS）拿不到任何结构化信息。
 */
export function structuredData(url: string, origin: string): JsonLd[] {
  const route = normalizeRoutePath(url);
  const meta = resolveDocumentMeta(url);
  if (!meta) return [];

  const base = origin.endsWith('/') ? origin : `${origin}/`;
  const pageUrl = route === '/' ? base : `${base}${route.replace(/^\/+/, '')}`;

  const stats = {
    entries: apiPrices.length,
    providers: new Set(apiPrices.map((entry) => entry.providerId)).size,
    official: apiPrices.filter((entry) => entry.provenance === 'official').length,
    aggregate: apiPrices.filter((entry) => entry.provenance === 'aggregate').length,
  };

  return buildStructuredData(
    {
      origin: base,
      url: pageUrl,
      title: meta.title,
      description: meta.description,
      route,
      dateModified: DATA_VERIFIED_AT,
    },
    stats,
    route === '/',
  );
}
