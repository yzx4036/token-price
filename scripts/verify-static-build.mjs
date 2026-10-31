#!/usr/bin/env node
/**
 * 静态产物门禁（编排层所写，执行体不要改这个文件——它定义验收契约）。
 *
 * 核的是「构建产物」，不是「源码」：源码写得再漂亮，产物不对就是不对。
 * 判据来源：docs/.hermes/tasks/20261031-v0.3.0-vue-responsive/requirements.md §5 P1–P5。
 *
 * 用法：
 *   node scripts/verify-static-build.mjs [--dist dist] [--base /token-price/]
 *
 * 退出码：0 全过；1 有失败项；2 无法判定（产物不存在等）。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROUTES = [
  'index.html',
  'api-pricing/index.html',
  'plans/index.html',
  'calculator/index.html',
  'sources/index.html',
  'methodology/index.html',
];

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}

const distDir = resolve(arg('--dist', 'dist'));
const base = (() => {
  const raw = arg('--base', process.env.PUBLIC_BASE_PATH || '/');
  return raw.endsWith('/') ? raw : `${raw}/`;
})();

const failures = [];
const notes = [];
const fail = (msg) => failures.push(msg);

if (!existsSync(distDir)) {
  console.error(`[无法判定] 产物目录不存在：${distDir}（先跑构建）`);
  process.exit(2);
}

// ---------- P1 六条路由产物齐全 ----------
const pages = [];
for (const rel of ROUTES) {
  const p = join(distDir, rel);
  if (!existsSync(p)) {
    fail(`P1 缺少路由产物：dist/${rel}`);
    continue;
  }
  pages.push({ rel, path: p, html: readFileSync(p, 'utf8'), size: statSync(p).size });
}

// ---------- P2 无需 JS 即有真实内容 ----------
for (const page of pages) {
  const appBody = page.html.match(/<div id="app"[^>]*>([\s\S]*?)<\/div>\s*(?:<script|<\/body>)/);
  const inner = appBody ? appBody[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
  if (inner.length < 200) {
    fail(`P2 dist/${page.rel} 预渲染内容过少（${inner.length} 字符）——可能是空壳 SPA，未做预渲染`);
  }
}

const api = pages.find((p) => p.rel === 'api-pricing/index.html');
if (api) {
  const usd = (api.html.match(/\$/g) || []).length;
  const cny = (api.html.match(/¥/g) || []).length;
  if (usd < 50) fail(`P2 API 页美元符号仅 ${usd} 个（期望 ≥50），价格未进入静态 HTML`);
  if (cny < 50) fail(`P2 API 页人民币符号仅 ${cny} 个（期望 ≥50），≈¥ 估算副列未渲染`);
  if (!api.html.includes('官方原价')) fail('P2 API 页缺少「官方原价」标注（口径 I4 被破坏）');
  if (!api.html.includes('估算')) fail('P2 API 页缺少「估算」字样（汇率口径 I4 被破坏）');
  notes.push(`API 页：$${usd} 处 / ¥${cny} 处`);
}

// ---------- P3 base 前缀一致 ----------
// 只核「站内绝对路径」：以 / 开头且不是 //（协议相对）
let scannedLinks = 0;
for (const page of pages) {
  const links = [...page.html.matchAll(/(?:href|src)="(\/[^"]*)"/g)].map((m) => m[1]);
  scannedLinks += links.length;
  const bad = links.filter((l) => !l.startsWith(base) && l !== base && !l.startsWith(`${base}#`));
  if (bad.length > 0) {
    const uniq = [...new Set(bad)].slice(0, 6);
    fail(`P3 dist/${page.rel} 有 ${bad.length} 处链接缺少 base 前缀 ${base}：${uniq.join(' , ')}`);
  }
}
if (scannedLinks === 0) {
  fail('P3 一条站内链接都没扫到——链接写法可能不是 href="/..."/src="/..."，本门无法判定（禁止当作通过）');
}
notes.push(`P3 扫描站内链接 ${scannedLinks} 条，base=${base || '(根)'}`);

// ---------- P4 占位符已被替换 ----------
for (const page of pages) {
  if (page.html.includes('<!--app-html-->')) {
    fail(`P4 dist/${page.rel} 仍含未替换的 <!--app-html--> 占位符——预渲染没跑到这条路由`);
  }
}

// ---------- P5 无 dev 泄漏 / 无 Astro 残留 ----------
const leakPatterns = [
  ['localhost', /localhost/],
  ['127.0.0.1', /127\.0\.0\.1/],
  ['/src/ 源码路径', /(?:href|src)="\/src\//],
  ['_astro 残留', /_astro\//],
];
for (const page of pages) {
  for (const [label, re] of leakPatterns) {
    if (re.test(page.html)) fail(`P5 dist/${page.rel} 含 ${label} 泄漏`);
  }
}

// ---------- 附带：资源目录存在且非空 ----------
if (!existsSync(join(distDir, 'assets'))) {
  fail('产物缺少 assets/ 目录（Vite 默认资源目录）');
} else {
  const n = readdirSync(join(distDir, 'assets')).length;
  if (n === 0) fail('assets/ 为空');
  notes.push(`assets 文件数 ${n}`);
}

// ---------- 附带：HTML 引用的每个站内资源都必须真实存在 ----------
// 抓「新旧产物混杂」：上一次构建残留的 HTML 引用已删掉的旧 hash 资源时，
// 页面会白屏或功能崩，而构建命令本身 rc=0（实测踩过：遗留 http.server 锁住 dist，
// clearOutDir 清不干净，产物新旧混在一起，计算器页面直接崩溃）。
let checkedAssets = 0;
for (const page of pages) {
  const refs = [...page.html.matchAll(/(?:href|src)="(\/assets\/[^"]+|\/token-price\/assets\/[^"]+)"/g)]
    .map((m) => m[1])
    .map((u) => u.replace(/^\/token-price/, ''));
  for (const ref of new Set(refs)) {
    checkedAssets += 1;
    const p = join(distDir, ref.replace(/^\//, ''));
    if (!existsSync(p)) fail(`产物引用不存在的资源：dist${ref}（可能残留了上一次构建的旧 HTML）存在于 ${page.rel}`);
  }
}
if (checkedAssets === 0) {
  notes.push('未在 HTML 中扫到 /assets/ 引用（若资源目录名为别的，本项跳过）');
} else {
  notes.push(`资源引用完整性：${checkedAssets} 个引用全部存在`);
}

// ---------- 输出 ----------
console.log('==> 静态产物门禁');
console.log(`产物目录：${distDir}`);
for (const n of notes) console.log(`  · ${n}`);
if (failures.length === 0) {
  console.log(`结论：通过（${pages.length} 条路由全过 P1–P5）`);
  process.exit(0);
}
console.error(`\n失败 ${failures.length} 项：`);
for (const f of failures) console.error(`  ✗ ${f}`);
console.error('\n结论：不通过');
process.exit(1);
