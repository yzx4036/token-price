#!/usr/bin/env node
/**
 * 静态预渲染：把 client 产物里的空壳模板逐路由填成真实 HTML。
 *
 * 链路（req §2 F16–F18）：
 *   1. npm run build:client → dist/（模板里保留 <div id="app"><!--app-html--></div>）
 *   2. npm run build:ssr    → dist-server/entry-server.js（render / PRERENDER_ROUTES）
 *   3. 本脚本逐路由 renderToString，替换占位符后写 dist/<route>/index.html
 *
 * ⚠️ 占位符断言：模板里必须存在 <!--app-html-->。缺了就直接失败退出，
 * 否则第二次运行时占位符已被上一次吃掉，脚本会静默产出上一版的陈旧页面。
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const distDir = resolve(ROOT, arg('--dist', 'dist'));
const ssrEntry = resolve(ROOT, arg('--ssr', join('dist-server', 'entry-server.js')));
const HTML_PLACEHOLDER = '<!--app-html-->';
const TITLE_PLACEHOLDER = '<!--app-title-->';
const DESCRIPTION_PLACEHOLDER = '<!--app-description-->';
const SEO_PLACEHOLDER = '<!--app-seo-->';

// —— canonical / Open Graph 需要的绝对 URL ——
// origin 与 base 必须与实际部署一致：子路径站点的 canonical 少了 /token-price/，
// 搜索引擎会把子页面当成别的站点的首页。
const rawBase = process.env.PUBLIC_BASE_PATH ?? arg('--base', '/');
const trimmedBase = rawBase.replace(/^\/+|\/+$/g, '');
const BASE = trimmedBase === '' ? '/' : `/${trimmedBase}/`;

async function resolveOrigin() {
  try {
    const raw = await readFile(join(ROOT, 'site.config.json'), 'utf8');
    const config = JSON.parse(raw);
    if (config.customDomain) return `https://${config.customDomain}`;
  } catch {
    // 配置缺失不阻断：兜底 origin 仍能产出合法的绝对 URL
  }
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN.replace(/\/+$/, '');
  return 'https://yzx4036.github.io';
}
const ORIGIN = await resolveOrigin();

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function seoBlock(route, meta) {
  const url = route === '/' ? `${ORIGIN}${BASE}` : `${ORIGIN}${BASE}${route.replace(/^\/+/, '')}`;
  return [
    `<link rel="canonical" href="${url}" />`,
    '<meta property="og:type" content="website" />',
    '<meta property="og:site_name" content="Token Price" />',
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    '<meta name="twitter:card" content="summary" />',
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
  ].join('\n    ');
}

const templatePath = join(distDir, 'index.html');
const template = await readFile(templatePath, 'utf8');

if (!template.includes(HTML_PLACEHOLDER)) {
  console.error(`[prerender] 失败：${templatePath} 里找不到 ${HTML_PLACEHOLDER} 占位符。`);
  console.error('[prerender] 常见原因：上一轮预渲染已经把占位符替换成了真实页面，而 client 构建没有重新生成模板。');
  console.error('[prerender] 处理方式：重新跑完整的 npm run build（先 build:client 再 build:ssr 再 prerender），不要单独重跑本脚本。');
  process.exit(1);
}

if (!template.includes(SEO_PLACEHOLDER)) {
  console.error(`[prerender] 失败：${templatePath} 里找不到 ${SEO_PLACEHOLDER} 占位符。`);
  console.error('[prerender] 缺它就产不出 canonical / Open Graph，页面照样能看但分享与索引会退化，所以直接失败而不是静默跳过。');
  process.exit(1);
}

const { render, documentMeta, PRERENDER_ROUTES } = await import(pathToFileURL(ssrEntry).href);

if (!Array.isArray(PRERENDER_ROUTES) || PRERENDER_ROUTES.length === 0) {
  console.error('[prerender] 失败：SSR 入口没有导出 PRERENDER_ROUTES（路由清单为空）。');
  process.exit(1);
}

const written = [];
for (const route of PRERENDER_ROUTES) {
  const meta = documentMeta(route);
  if (!meta || !meta.title || !meta.description) {
    console.error(`[prerender] 失败：路由 ${route} 没有 title / description，违反 I7（每路由独立头部信息）。`);
    process.exit(1);
  }

  const appHtml = await render(route);
  const probe = appHtml.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (probe.length < 200) {
    console.error(`[prerender] 失败：路由 ${route} 渲染结果只有 ${probe.length} 字符，疑似空壳。`);
    process.exit(1);
  }

  const page = template
    .replace(HTML_PLACEHOLDER, () => appHtml)
    .replace(TITLE_PLACEHOLDER, () => escapeHtml(meta.title))
    .replace(DESCRIPTION_PLACEHOLDER, () => escapeHtml(meta.description))
    .replace(SEO_PLACEHOLDER, () => seoBlock(route, meta));

  const outPath = route === '/' ? join(distDir, 'index.html') : join(distDir, route.replace(/^\/+|\/+$/g, ''), 'index.html');
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, page, 'utf8');
  written.push({ route, outPath, size: page.length });
}

console.log(`[prerender] 已写出 ${written.length} 条路由：`);
for (const item of written) {
  const rel = item.outPath.slice(distDir.length + 1).replaceAll('\\', '/');
  console.log(`  · /${item.route === '/' ? '' : item.route.slice(1)} -> dist/${rel} (${item.size} 字节)`);
}
