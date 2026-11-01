#!/usr/bin/env node
/**
 * 站点仓发布：把构建产物放到站点仓的**子路径**，同时不动站点仓根目录。
 *
 * 为什么要单独一个模块：站点仓根目录现在是（将来也是）通用主页的地盘，
 * 比价站只是它的一个子页面。部署脚本如果继续「清空站点仓根目录再铺 dist」，
 * 会直接删掉主页。这里的规则是：
 *
 *   <site>/                 <- 通用主页等，只有 site-root/ 里的文件会覆盖，从不删除
 *   <site>/token-price/     <- 由本模块整体替换（清空后重建）
 *   <site>/CNAME            <- 自定义域名，域名级，放站点仓根目录（子目录里的 CNAME 无效）
 *   <site>/.nojekyll        <- 必须存在，否则 Jekyll 吞掉 _astro 目录
 *
 * 用法（一般由 scripts/deploy-site.sh 调用，不直接跑）：
 *   node scripts/site-publish.mjs --dist dist --site ../yzx4036.github.io \
 *     --subpath token-price --home site-root --domain example.com
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');

export class PublishError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PublishError';
  }
}

/**
 * 校验子路径：只允许单段安全名称（token-price 这种）。
 * 拒绝空串、绝对路径、.. 越权、带斜杠的多段路径 —— 这些都可能把 dist 铺到站点仓外面。
 */
export function validateSubpath(subpath, { allowEmpty = false } = {}) {
  if (typeof subpath !== 'string') throw new PublishError('子路径必须是字符串');
  const trimmed = subpath.trim().replace(/^\/+|\/+$/g, '');
  if (trimmed === '') {
    if (allowEmpty) return '';
    throw new PublishError('子路径不能为空');
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    throw new PublishError(`子路径只能是一段（如 token-price），收到：${subpath}`);
  }
  if (trimmed === '.' || trimmed === '..') throw new PublishError(`非法子路径：${subpath}`);
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(trimmed)) {
    throw new PublishError(`子路径只能包含字母、数字、点、下划线与连字符，且以字母数字开头：${subpath}`);
  }
  if (/^[a-z0-9._-]*\.\./i.test(trimmed)) throw new PublishError(`非法子路径：${subpath}`);
  return trimmed;
}

/** 递归复制 dir -> dest，并统计文件数；skipNames 跳过根层指定文件名 */
export function copyTree(srcDir, destDir, { skipNames = [] } = {}) {
  if (!existsSync(srcDir)) throw new PublishError(`源目录不存在：${srcDir}`);
  let files = 0;
  const walk = (from, to, isRoot) => {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from, { withFileTypes: true })) {
      if (isRoot && skipNames.includes(entry.name)) continue;
      const src = join(from, entry.name);
      const dest = join(to, entry.name);
      if (entry.isDirectory()) {
        walk(src, dest, false);
      } else if (entry.isFile()) {
        copyFileSync(src, dest);
        files += 1;
      }
    }
  };
  walk(srcDir, destDir, true);
  return files;
}

/**
 * 把 dist 整体替换到 <site>/<subpath>。
 * 只清空这一个子目录，站点仓其它内容（主页、未来新增的文件）一律不动。
 */
export function syncSubpath({ distDir, siteDir, subpath }) {
  const safe = validateSubpath(subpath);
  const target = join(siteDir, safe);
  const resolvedTarget = resolve(target);
  const resolvedSite = resolve(siteDir);
  // 双保险：目标必须真的在站点仓内部
  if (resolvedTarget === resolvedSite || !resolvedTarget.startsWith(resolvedSite + sep)) {
    throw new PublishError(`拒绝写入站点仓外部：${resolvedTarget}`);
  }
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  // dist/CNAME 是构建脚本给「整站根目录发布」准备的；发到子路径时它必须待在站点仓根目录，
  // 跟进子目录反而会被 Pages 忽略（还可能让人误以为生效了）。
  const files = copyTree(distDir, target, { skipNames: ['CNAME'] });
  return { target, files };
}

/**
 * 把 site-root/ 里的文件铺到站点仓根目录，**只覆盖同名文件，从不删除**。
 * 这样主页可以随时手工改，也不会因为部署把用户自己加的文件删掉。
 */
export function syncHome({ homeDir, siteDir }) {
  if (!existsSync(homeDir)) return { files: 0, skipped: true };
  let files = 0;
  for (const entry of readdirSync(homeDir, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const src = join(homeDir, entry.name);
    const dest = join(siteDir, entry.name);
    if (entry.isDirectory()) {
      files += copyTree(src, dest);
    } else if (entry.isFile()) {
      copyFileSync(src, dest);
      files += 1;
    }
  }
  return { files, skipped: false };
}

/**
 * 从构建产物反推路由清单（与 site-seo.mjs 同一口径：产物里有什么，sitemap 就写什么）。
 * 这样预渲染失败或被删掉的路由不会在根 sitemap 里留下死链。
 */
export function listDistRoutes(distDir) {
  const routes = ['/'];
  for (const entry of readdirSync(distDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (entry.name === 'assets') continue;
    if (existsSync(join(distDir, entry.name, 'index.html'))) routes.push(`/${entry.name}/`);
  }
  return routes.sort();
}

/**
 * 在站点仓**根目录**写 robots.txt 与 sitemap.xml，覆盖「整个域名」而不只是子路径。
 *
 * 为什么必须写在根目录：子路径的 robots.txt 只对 /token-price/ 生效，搜索引擎
 * 访问 https://example.com/robots.txt 时拿到 404 就找不到任何 sitemap 指引，
 * 只能靠爬链发现子站。根目录这一份才是域名级的入口。
 *
 * 主页 `/` 也要进 sitemap：它不在 dist 里（由 site-root/ 提供），
 * 但它是域名的门面，必须能被抓到。
 */
export function writeSiteSeo({ origin, subpath, routes, siteDir }) {
  const base = subpath ? `/${subpath}/` : '/';
  const abs = (route) => (route === '/' ? `${origin}${base}` : `${origin}${base}${route.replace(/^\/+/, '')}`);

  const robots = ['User-agent: *', 'Allow: /', '', `Sitemap: ${origin}/sitemap.xml`, ''].join('\n');
  writeFileSync(join(siteDir, 'robots.txt'), robots, 'utf8');

  /**
   * 条目要区分三个不同的「首页」，这里最容易被写错：
   *
   * 1. `origin/`            —— 站点仓根的主页（来自 site-root/），域名的门面
   * 2. `origin/token-price/`—— 工具自己的首页（dist 的 `/`），最有价值的入口页
   * 3. 其余子路由           —— dist 里除 `/` 之外的页面
   *
   * 之前只按 dist 的路由表映射，dist 的 `/` 被当成了 `origin/`，
   * 结果 /token-price/ 这个小站入口在根 sitemap 里彻底消失（实测缺失）。
   */
  const entries = [
    { loc: `${origin}/`, priority: '1.0' }, // 站点主页
    { loc: `${origin}${base}`, priority: '0.9' }, // 工具首页
    ...routes
      .filter((route) => route !== '/')
      .map((route) => ({
        loc: abs(route),
        priority: route === '/api-pricing/' || route === '/plans/' ? '0.9' : '0.6',
      })),
  ];

  // 去重：站点部署在域名根时（subpath 为空），`origin/` 与工具首页是同一个 URL。
  // 重复 <loc> 会被搜索引擎判为低质 sitemap，保留首次出现的（优先级更高那条）。
  const seen = new Set();
  const unique = entries.filter((e) => {
    if (seen.has(e.loc)) return false;
    seen.add(e.loc);
    return true;
  });

  const today = new Date().toISOString().slice(0, 10);
  const urlNodes = unique
    .map(({ loc, priority }) =>
      [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${today}</lastmod>`,
        '    <changefreq>weekly</changefreq>',
        `    <priority>${priority}</priority>`,
        '  </url>',
      ].join('\n'),
    )
    .join('\n');

  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urlNodes,
    '</urlset>',
    '',
  ].join('\n');
  writeFileSync(join(siteDir, 'sitemap.xml'), sitemap, 'utf8');

  return { robots: `${origin}/robots.txt`, sitemap: `${origin}/sitemap.xml`, urls: unique.length };
}

/** CNAME 必须在站点仓根目录；子目录里的 CNAME 对 GitHub Pages 无效 */
export function writeSiteCname({ domain, siteDir }) {
  const path = join(siteDir, 'CNAME');
  if (!domain) {
    if (existsSync(path)) {
      unlinkSync(path);
      return { action: 'removed', path };
    }
    return { action: 'absent', path };
  }
  writeFileSync(path, `${domain}\n`, 'utf8');
  return { action: 'written', path, domain };
}

/** Pages 跑 Jekyll 会吞掉下划线开头的目录（Astro 的 _astro），必须放 .nojekyll */
export function ensureNoJekyll(siteDir) {
  const path = join(siteDir, '.nojekyll');
  if (existsSync(path)) return { action: 'present', path };
  writeFileSync(path, '', 'utf8');
  return { action: 'created', path };
}

function argValue(argv, name, fallback) {
  const idx = argv.indexOf(name);
  if (idx === -1) return fallback;
  const v = argv[idx + 1];
  if (v === undefined || v.startsWith('--')) throw new PublishError(`${name} 需要一个值`);
  return v;
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`站点仓发布（把构建产物放到子路径，不动站点仓根目录）

  node scripts/site-publish.mjs --site <站点仓路径> --dist <dist> --subpath <子路径>
      [--home <站点根模板目录>] [--domain <域名>]

所有路径参数都相对当前工作目录。`);
    return 0;
  }
  const siteDir = resolve(argValue(args, '--site', null) ?? (() => { throw new PublishError('缺少 --site'); })());
  const distDir = resolve(argValue(args, '--dist', 'dist'));
  const subpath = argValue(args, '--subpath', 'token-price');
  const homeDir = argValue(args, '--home', null);
  const domain = argValue(args, '--domain', '') || null;

  if (!existsSync(siteDir)) throw new PublishError(`站点仓不存在：${siteDir}`);
  if (!existsSync(join(distDir, 'index.html'))) {
    throw new PublishError(`构建产物不完整（缺 index.html）：${distDir}`);
  }

  if (homeDir) {
    const r = syncHome({ homeDir: resolve(homeDir), siteDir });
    console.log(r.skipped ? '==> 无 site-root 模板，跳过主页同步' : `==> 主页同步：${r.files} 个文件（不删除既有文件）`);
  }

  const { target, files } = syncSubpath({ distDir, siteDir, subpath });
  console.log(`==> 子站发布：${files} 个文件 -> ${relative(resolve(siteDir, '..'), target).split(sep).join('/')}/`);

  const cname = writeSiteCname({ domain, siteDir });
  if (cname.action === 'written') console.log(`==> CNAME 写站点根：${domain}`);
  else if (cname.action === 'removed') console.log('==> 无自定义域名，已移除站点根 CNAME');

  // 根域 robots/sitemap：没有域名时跳过——指向 localhost 或 github.io 的
  // 根 sitemap 都是错的，不如不生成（GitHub Pages 自身不提供根 robots）。
  if (domain) {
    const routes = listDistRoutes(distDir);
    const seo = writeSiteSeo({ origin: `https://${domain}`, subpath, routes, siteDir });
    console.log(`==> 根域 SEO：${seo.sitemap}（${seo.urls} 条），robots 指向它`);
  }

  const nj = ensureNoJekyll(siteDir);
  if (nj.action === 'created') console.log('==> 补 .nojekyll');

  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv)
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`[失败] ${error.message}`);
      process.exit(1);
    });
}
