import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createMemoryHistory } from 'vue-router';
import App from './App.vue';
import { PRERENDER_ROUTES, createAppRouter, resolveDocumentMeta } from './router';

export { PRERENDER_ROUTES };

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
