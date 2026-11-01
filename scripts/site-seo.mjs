#!/usr/bin/env node
/**
 * 站点 SEO 基建：生成 robots.txt 与 sitemap.xml。
 *
 * 为什么要单独一步而不是放进 public/：
 *   - 两者都必须写**绝对 URL**（robots 的 Sitemap 行、sitemap 的 loc）。
 *     绝对 URL 由「域名 + 子路径」决定，而这两样都随部署环境变：
 *     GitHub Pages 子路径是 /token-price/，将来换自定义域名后 origin 也变。
 *   - 写死在 public/ 里迟早会和实际部署对不上，而且不会有任何报错，
 *     只会静默产出一个指向不存在域名的 sitemap。
 *
 * origin 推导顺序（单一真源，不新增配置项）：
 *   1) site.config.json 的 customDomain  → https://<customDomain>
 *   2) 环境变量 SITE_ORIGIN             → 显式覆盖（本地预览用）
 *   3) 兜底                              → https://yzx4036.github.io
 *
 * 用法：node scripts/site-seo.mjs --dist dist --base /token-price/
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const ROOT = resolve(import.meta.dirname, '..');
const distDir = resolve(ROOT, arg('--dist', 'dist'));

const rawBase = arg('--base', process.env.PUBLIC_BASE_PATH ?? '/');
const trimmed = rawBase.replace(/^\/+|\/+$/g, '');
const base = trimmed === '' ? '/' : `/${trimmed}/`;

async function resolveOrigin() {
  try {
    const raw = await readFile(join(ROOT, 'site.config.json'), 'utf8');
    const config = JSON.parse(raw);
    if (config.customDomain) return `https://${config.customDomain}`;
  } catch {
    // 配置缺失或损坏时不阻断：兜底 origin 仍能产出可用的 sitemap
  }
  if (process.env.SITE_ORIGIN) return process.env.SITE_ORIGIN.replace(/\/+$/, '');
  return 'https://yzx4036.github.io';
}

const origin = await resolveOrigin();
const absolute = (route) => (route === '/' ? `${origin}${base}` : `${origin}${base}${route.replace(/^\/+/, '')}`);

/**
 * 路由清单从 dist 里实际产出的 index.html 反推，而不是从源码 import。
 * 这样「sitemap 里的页面」和「真的存在的页面」天然一致：
 * 哪个路由预渲染失败/被删掉，sitemap 里就不会多出一条死链。
 */
async function listRoutes() {
  const { readdir } = await import('node:fs/promises');
  const routes = ['/'];
  const entries = await readdir(distDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'assets') continue;
    routes.push(`/${entry.name}/`);
  }
  return routes.sort();
}

const routes = await listRoutes();

// —— robots.txt ——
// 不限流：这是一个只读的公开比价站，没有需要保护的接口，也没有登录态。
// 明确列出 Sitemap 是让搜索引擎不必靠爬链发现子页面的唯一可靠办法。
const robots = [
  'User-agent: *',
  'Allow: /',
  '',
  `Sitemap: ${origin}${base}sitemap.xml`,
  '',
].join('\n');

await mkdir(distDir, { recursive: true });
await writeFile(join(distDir, 'robots.txt'), robots, 'utf8');

// —— sitemap.xml ——
// lastmod 用构建当天：本站内容是「按数据核验日期更新」的，
// 没有逐页的独立修改时间，用构建日期是唯一不会说谎的近似。
const today = new Date().toISOString().slice(0, 10);
const urlNodes = routes
  .map((route) => {
    const priority = route === '/' ? '1.0' : route === '/api-pricing/' || route === '/plans/' ? '0.9' : '0.6';
    return [
      '  <url>',
      `    <loc>${absolute(route)}</loc>`,
      `    <lastmod>${today}</lastmod>`,
      '    <changefreq>weekly</changefreq>',
      `    <priority>${priority}</priority>`,
      '  </url>',
    ].join('\n');
  })
  .join('\n');

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  urlNodes,
  '</urlset>',
  '',
].join('\n');

await writeFile(join(distDir, 'sitemap.xml'), sitemap, 'utf8');

console.log(`[site-seo] origin=${origin} base=${base}`);
console.log(`[site-seo] robots.txt -> ${origin}${base}sitemap.xml`);
console.log(`[site-seo] sitemap.xml 收录 ${routes.length} 条：${routes.join(' ')}`);
