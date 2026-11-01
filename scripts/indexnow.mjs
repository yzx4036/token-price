#!/usr/bin/env node
/**
 * IndexNow：内容变更后主动通知搜索引擎，不必等爬虫自己回来。
 *
 * 为什么需要它：静态站改完 title / 正文，Google 与 Bing 往往是「几天到几周」才重抓。
 * 本站 2026-11-01 就因为改标题后 Bing 索引里还挂着旧标题，关键词排名迟迟不更新。
 * IndexNow 是 Bing / Yandex / Seznam 共同遵守的协议（Google 不参与），
 * 推一次通常几分钟到几小时就能触发重抓。
 *
 * 关键约束（来自官方规范，实现时逐条对应）：
 * 1. key 必须是 8–128 位的 [a-zA-Z0-9-]；
 * 2. key 文件必须是 UTF-8 纯文本、文件名为 `<key>.txt`、内容就是 key 本身，
 *    **不能带 BOM、不能有 HTML**；
 * 3. key 文件放在**站点根目录**时，可以提交该 host 下任意 URL，且无需 keyLocation；
 *    放在子目录则必须每次传 keyLocation，且只能提交该目录下的 URL。
 *    本站工具在 /token-price/ 子路径，若把 key 放进子目录就得一直传 keyLocation，
 *    所以放根目录更省事也更稳。
 *
 * 用法：
 *   node scripts/indexnow.mjs --ensure-key            # 确保 key 存在并写回配置
 *   node scripts/indexnow.mjs --write-site <站点仓>   # 把 key 文件写到站点仓根目录
 *   node scripts/indexnow.mjs --submit                # 提交 sitemap 里的全部 URL
 *   node scripts/indexnow.mjs --submit --dry-run      # 只打印不发请求
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const CONFIG_PATH = join(ROOT, 'site.config.json');
const DIST_DIR = join(ROOT, 'dist');

/** IndexNow 官方端点。一次提交会由它分发给所有参与引擎。 */
const ENDPOINT = 'https://api.indexnow.org/indexnow';

export class IndexNowError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IndexNowError';
  }
}

/**
 * 校验 key 是否合规。
 *
 * 长度 8–128、只允许 [a-zA-Z0-9-]，这两条是官方硬要求；
 * 不合规的 key 提交会拿到 422，而且报错信息不会告诉你具体哪一位不对。
 */
export function validateKey(key) {
  if (typeof key !== 'string' || key.length < 8 || key.length > 128) return false;
  return /^[a-zA-Z0-9-]+$/.test(key);
}

/** 生成 32 位十六进制 key（官方示例同款长度，足够避免碰撞） */
export function generateKey() {
  return randomBytes(16).toString('hex');
}

/**
 * 确保配置里有合法 key；没有就生成并原子写回。
 *
 * key 必须**固定不变**：换了 key 就要换 key 文件，搜索引擎会重新走一遍验证，
 * 期间提交全部失效。所以它是配置项，不是每次构建现算的随机值。
 */
export function ensureKey(configPath = CONFIG_PATH) {
  const raw = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {};
  if (raw.indexNowKey && validateKey(raw.indexNowKey)) {
    return { key: raw.indexNowKey, created: false };
  }
  const key = generateKey();
  const next = { ...raw, indexNowKey: key };
  const tmp = `${configPath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmp, configPath);
  return { key, created: true };
}

export function readKey(configPath = CONFIG_PATH) {
  if (!existsSync(configPath)) return null;
  const key = JSON.parse(readFileSync(configPath, 'utf8')).indexNowKey;
  return key && validateKey(key) ? key : null;
}

/**
 * 把 `<key>.txt` 写到站点仓根目录。
 *
 * 必须写到 `siteDir` 根、而不是子路径：IndexNow 用 key 文件的**位置**判定
 * 「这个 key 能提交哪些 URL」。放根目录才能覆盖 /token-price/ 下的所有页面；
 * 放进子目录就只能提交子目录内的 URL，且每次都要带 keyLocation。
 *
 * 内容只写 key 本身，不加换行之外的任何东西 —— 带 BOM 或多余空格会导致 403。
 */
export function writeKeyFile({ key, siteDir }) {
  if (!validateKey(key)) throw new IndexNowError(`key 不合规：${key}`);
  const path = join(siteDir, `${key}.txt`);
  writeFileSync(path, key, 'utf8');
  return { path, key };
}

/**
 * 从 sitemap.xml 取要提交的 URL。
 *
 * 默认读 dist 里那份（子路径的 6 条），但那只覆盖 /token-price/。
 * 对外真正声明的是站点仓**根目录**的 sitemap（含站点主页，7 条），
 * 所以发布流程会通过 --sitemap 指到那份。读错会漏掉主页，
 * 而主页恰恰是「AI Token Pricing」这个词最该被收录的页面。
 */
export function collectUrls(canonicalSiteUrl, distDir = DIST_DIR, sitemapPath = null) {
  const path = sitemapPath ?? join(distDir, 'sitemap.xml');
  if (!existsSync(path)) {
    throw new IndexNowError(`找不到 ${path}（先跑 npm run build）`);
  }
  const xml = readFileSync(path, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  if (locs.length === 0) throw new IndexNowError(`${path} 里没有任何 <loc>`);
  return locs;
}

/**
 * 提交 URL 列表。
 *
 * 只取 host 部分放进 payload：IndexNow 要求 `host` 是裸域名
 * （不带协议、不带路径），写成 https://... 会返回 422。
 */
export async function submitUrls({ key, urls, fetchImpl = fetch, dryRun = false }) {
  if (!validateKey(key)) throw new IndexNowError(`key 不合规：${key}`);
  if (!Array.isArray(urls) || urls.length === 0) throw new IndexNowError('没有要提交的 URL');
  if (urls.length > 10000) throw new IndexNowError(`单次最多 10000 条，收到 ${urls.length}`);

  const host = new URL(urls[0]).host;
  const mismatched = urls.filter((u) => new URL(u).host !== host);
  if (mismatched.length > 0) {
    throw new IndexNowError(`同一批只能提交同一 host，混入了：${mismatched.slice(0, 3).join(', ')}`);
  }

  const payload = { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls };
  if (dryRun) return { status: 0, dryRun: true, payload };

  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return { status: res.status, payload };
}

/** 把响应码翻译成人话：官方只回状态码，不给原因 */
export function explainStatus(status) {
  switch (status) {
    case 200: return '提交成功';
    case 202: return '已接收，key 验证待完成';
    case 400: return '请求格式错误';
    case 403: return 'key 无效（文件缺失 / 内容不含 key / 带 BOM）';
    case 422: return 'URL 不属于该 host，或 key 不符合规范';
    case 429: return '提交过于频繁，被限流';
    default: return `未预期的状态码 ${status}`;
  }
}

function argValue(argv, name, fallback) {
  const idx = argv.indexOf(name);
  if (idx === -1) return fallback;
  const v = argv[idx + 1];
  if (v === undefined || v.startsWith('--')) throw new IndexNowError(`${name} 需要一个值`);
  return v;
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`IndexNow 主动推送（Bing / Yandex / Seznam）

  node scripts/indexnow.mjs --ensure-key
  node scripts/indexnow.mjs --write-site <站点仓路径>
  node scripts/indexnow.mjs --submit [--dry-run]

key 存在 site.config.json 的 indexNowKey，首次运行自动生成。`);
    return 0;
  }

  if (args.includes('--ensure-key')) {
    const r = ensureKey();
    console.log(r.created ? `[indexnow] 已生成 key：${r.key}` : `[indexnow] key 已存在：${r.key}`);
    return 0;
  }

  if (args.includes('--write-site')) {
    const siteDir = resolve(argValue(args, '--write-site', '.'));
    const key = readKey();
    if (!key) throw new IndexNowError('配置里没有 key，先跑 --ensure-key');
    const r = writeKeyFile({ key, siteDir });
    console.log(`[indexnow] key 文件已写入站点仓根：${r.path}`);
    return 0;
  }

  if (args.includes('--submit')) {
    const key = readKey();
    if (!key) throw new IndexNowError('配置里没有 key，先跑 --ensure-key');
    const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    const domain = config.customDomain;
    if (!domain) throw new IndexNowError('没有自定义域名，无法提交（IndexNow 需要真实 host）');
    const sitemapArg = argValue(args, '--sitemap', null);
    const urls = collectUrls(`https://${domain}`, DIST_DIR, sitemapArg ? resolve(sitemapArg) : null);
    const dryRun = args.includes('--dry-run');
    const r = await submitUrls({ key, urls, dryRun });
    if (dryRun) {
      console.log('[indexnow] dry-run，未发送：');
      console.log(JSON.stringify(r.payload, null, 2));
    } else {
      console.log(`[indexnow] ${r.status} ${explainStatus(r.status)}（${urls.length} 条）`);
      if (r.status !== 200 && r.status !== 202) process.exitCode = 1;
    }
    return 0;
  }

  console.log('[indexnow] 没有指定动作，用 --help 查看用法');
  return 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv)
    .then((code) => process.exit(code))
    .catch((error) => {
      console.error(`[失败] ${error.message}`);
      process.exit(1);
    });
}
