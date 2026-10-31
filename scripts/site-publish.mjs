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
