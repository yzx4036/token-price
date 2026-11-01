#!/usr/bin/env node
/**
 * 自定义域名管理：把 site.config.json 里的域名同步成 dist/CNAME。
 *
 * 为什么要在构建之后写 CNAME：`astro build` 会清空 dist/，把 CNAME 放在 public/
 * 也只是每次被复制一份；集中在这里写，域名只有一个真源（site.config.json），
 * 换域名不用改任何代码，也不会出现「public/CNAME 和配置打架」的第二份事实。
 *
 * 用法：
 *   node scripts/site-domain.mjs --write              # 构建后同步 dist/CNAME（默认行为）
 *   node scripts/site-domain.mjs --show               # 看当前配置
 *   node scripts/site-domain.mjs --set tokenprice.com # 设置域名（会校验并写入配置）
 *   node scripts/site-domain.mjs --clear              # 清空，回到 github.io
 *   node scripts/site-domain.mjs --check              # 查 DNS 是否已指向 GitHub Pages
 *
 * 注意：填了域名后 GitHub Pages 会把 yzx4036.github.io 301 到新域名，
 * 必须先配好 DNS 再发布，否则站点会变成 404。
 */
import { promises as dns } from 'node:dns';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, '..');
export const DEFAULT_CONFIG_PATH = join(ROOT, 'site.config.json');
export const DEFAULT_DIST_DIR = join(ROOT, 'dist');

/** GitHub Pages 的 apex 域名 A 记录（官方文档口径，实测解析一致） */
export const GITHUB_PAGES_IPV4 = Object.freeze([
  '185.199.108.153',
  '185.199.109.153',
  '185.199.110.153',
  '185.199.111.153',
]);

export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DomainError';
  }
}

/**
 * 校验并规范化域名。只接受裸域名（不带协议、路径、端口、通配符）。
 * 返回小写、去掉尾点的形式；非法直接抛 DomainError。
 */
export function normalizeDomain(input) {
  if (typeof input !== 'string') throw new DomainError('域名必须是字符串');
  const raw = input.trim();
  if (raw === '') throw new DomainError('域名不能为空');
  if (/^https?:\/\//i.test(raw)) throw new DomainError('只填域名，不要带 http:// 或 https://');
  if (raw.includes('/')) throw new DomainError('只填域名，不要带路径');
  if (raw.includes(':')) throw new DomainError('只填域名，不要带端口');
  if (/\s/.test(raw)) throw new DomainError('域名不能包含空格');
  if (raw.startsWith('*')) throw new DomainError('不支持泛域名（*.）；请填具体域名');

  const domain = raw.replace(/\.+$/, '').toLowerCase();
  const labels = domain.split('.');
  if (labels.length < 2) throw new DomainError(`域名至少要有两段（如 example.com），收到：${raw}`);
  if (domain.length > 253) throw new DomainError('域名超过 253 个字符');

  for (const label of labels) {
    if (label.length === 0) throw new DomainError(`域名有空标签：${raw}`);
    if (label.length > 63) throw new DomainError(`单个标签超过 63 个字符：${label}`);
    if (!/^[a-z0-9-]+$/.test(label)) throw new DomainError(`标签只能用小写字母、数字与连字符：${label}`);
    if (label.startsWith('-') || label.endsWith('-')) throw new DomainError(`标签不能以连字符开头或结尾：${label}`);
  }

  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,}$/.test(tld) && !tld.startsWith('xn--')) {
    throw new DomainError(`顶级域不合法：${tld}`);
  }
  return domain;
}

export function readSiteConfig(configPath = DEFAULT_CONFIG_PATH) {
  if (!existsSync(configPath)) return { customDomain: null };
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    throw new DomainError(`配置文件不是合法 JSON：${configPath}（${error.message}）`);
  }
  const value = parsed?.customDomain ?? null;
  return { customDomain: value === null ? null : normalizeDomain(value), raw: parsed };
}

/** 原子写入：先写临时文件再 rename，失败不留半截文件 */
export function writeSiteConfig(domain, configPath = DEFAULT_CONFIG_PATH) {
  const previous = readSiteConfig(configPath);
  const next = {
    // 先展开旧配置：--set 只负责改域名，不能把 siteVerification 之类
    // 后来新增的字段一并抹掉（那会让站点验证悄悄失效）
    ...(previous.raw ?? {}),
    customDomain: domain,
    note: previous.raw?.note
      ?? '自定义域名。置 null 时站点继续用 https://yzx4036.github.io/ 访问；填写后构建会产出 dist/CNAME，GitHub Pages 随即把站点切到该域名。用 `node scripts/site-domain.mjs --set <域名>` 修改，不要手改这里以外的位置。',
  };
  const tmp = `${configPath}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  renameSync(tmp, configPath);
  return next.customDomain;
}

/**
 * 按域名同步 dist/CNAME：
 * - 有域名 -> 写入（内容为域名 + 换行）
 * - 无域名 -> 删除可能残留的 CNAME（否则站点会被钉在上一个域名上）
 */
export function syncCname(domain, distDir = DEFAULT_DIST_DIR) {
  if (!existsSync(distDir)) {
    throw new DomainError(`dist 目录不存在：${distDir}（先跑 npm run build）`);
  }
  const cnamePath = join(distDir, 'CNAME');
  if (domain === null) {
    if (existsSync(cnamePath)) {
      unlinkSync(cnamePath);
      return { action: 'removed', path: cnamePath };
    }
    return { action: 'absent', path: cnamePath };
  }
  writeFileSync(cnamePath, `${domain}\n`, 'utf8');
  return { action: 'written', path: cnamePath, domain };
}

/**
 * 解析域名看是否已指向 GitHub Pages。
 *
 * 用 `dns.lookup`（走系统解析器，会跟随 CNAME 链）而不是 `dns.resolve4`
 * （c-ares 直连查询）：实践中有机器上 c-ares 查询会 ECONNREFUSED，
 * lookup 仍正常；而判断「是否指向 GitHub」本来就该看最终地址。
 */
export async function checkDns(domain, options = {}) {
  const resolver = options.resolver ?? dns;
  const result = {
    domain,
    ok: false,
    mode: null,
    records: [],
    expected: [...GITHUB_PAGES_IPV4],
    note: '',
  };

  const addresses = await resolver
    .lookup(domain, { all: true })
    .then((rows) => rows.map((row) => row.address))
    .catch(() => null);

  if (addresses === null) {
    result.mode = 'error';
    result.note = 'DNS 解析失败（可能是域名不存在，或本机解析器不可用）';
    return result;
  }
  if (addresses.length === 0) {
    result.mode = 'none';
    result.note = domain.split('.').length === 2
      ? '没有任何地址记录，DNS 尚未配置（apex 需要 4 条 A 记录）'
      : `没有任何地址记录；子域应加 CNAME 指向 yzx4036.github.io.`;
    result.expected = domain.split('.').length === 2
      ? [...GITHUB_PAGES_IPV4]
      : ['yzx4036.github.io.'];
    return result;
  }

  const cname = await resolver.resolveCname(domain).catch(() => []);
  result.mode = cname.length > 0 ? 'CNAME' : 'address';
  result.records = addresses;
  result.cnameChain = cname;

  const missing = GITHUB_PAGES_IPV4.filter((ip) => !addresses.includes(ip));
  result.ok = missing.length === 0;
  if (result.ok) {
    result.note = '已指向 GitHub Pages 全部四个 IP';
  } else if (addresses.some((ip) => GITHUB_PAGES_IPV4.includes(ip))) {
    result.note = `只解析到部分 GitHub IP，缺少：${missing.join(', ')}（apex 要求四条齐全）`;
  } else {
    result.note = `解析到 ${addresses.join(', ')}，不是 GitHub Pages 的地址（185.199.108-111.153）`;
  }
  return result;
}

function dnsHint(domain) {
  const isApex = domain.split('.').length === 2;
  const rows = isApex
    ? GITHUB_PAGES_IPV4.map((ip) => `  A      @     ${ip}`).join('\n')
    : '  CNAME  主机记录填子域名前缀（如 www / tokenprice），记录值填 yzx4036.github.io.';
  return [
    `域名：${domain}（${isApex ? 'apex 裸域，用 A 记录' : '子域，用 CNAME'}）`,
    '',
    '在华为云「云解析 DNS」添加：',
    rows,
    '',
    '四条 A 记录缺一不可（GitHub 官方要求），只配一条会被 Pages 判为未配置。',
  ].join('\n');
}

const HELP = `自定义域名管理（AI Token Pricing）

用法：
  node scripts/site-domain.mjs --write              构建后同步 dist/CNAME（默认行为）
  node scripts/site-domain.mjs --show               查看当前域名配置
  node scripts/site-domain.mjs --set <域名>         设置域名（会校验、原子写入）
  node scripts/site-domain.mjs --clear              清空，回到 yzx4036.github.io
  node scripts/site-domain.mjs --check              查 DNS 是否已指向 GitHub Pages

说明：
  域名只有一个真源：site.config.json。
  GitHub Pages 一旦拿到 CNAME，会把 yzx4036.github.io 301 到新域名，
  所以务必先配好 DNS、确认解析生效，再发布带 CNAME 的构建。`;

async function main(argv) {
  const args = argv.slice(2);
  const flag = args.find((a) => a.startsWith('--')) ?? '--write';
  const value = args.find((a) => !a.startsWith('--'));

  if (flag === '--help' || flag === '-h') {
    console.log(HELP);
    return 0;
  }
  if (flag === '--show') {
    const { customDomain } = readSiteConfig();
    console.log(customDomain ? `当前域名：${customDomain}` : '当前未配置自定义域名（站点走 https://yzx4036.github.io/）');
    return 0;
  }
  if (flag === '--set') {
    if (!value) {
      console.error('[失败] --set 需要一个域名参数，例如：--set tokenprice.com');
      return 1;
    }
    const domain = normalizeDomain(value);
    writeSiteConfig(domain);
    console.log(`[完成] 已设置域名：${domain}`);
    console.log('');
    console.log(dnsHint(domain));
    console.log('');
    console.log('配好 DNS 并确认解析生效后，跑 npm run publish 让 CNAME 上线。');
    return 0;
  }
  if (flag === '--clear') {
    writeSiteConfig(null);
    console.log('[完成] 已清空域名，站点回到 https://yzx4036.github.io/');
    return 0;
  }
  if (flag === '--check') {
    const { customDomain } = readSiteConfig();
    if (!customDomain) {
      console.log('未配置自定义域名，无需检查 DNS。');
      return 0;
    }
    const r = await checkDns(customDomain);
    console.log(`域名：${r.domain}`);
    console.log(`解析：${r.mode} -> ${r.records.length ? r.records.join(', ') : '(无)'}`);
    if (r.cnameChain?.length) console.log(`CNAME 链：${r.cnameChain.join(' -> ')}`);
    if (!r.ok && r.expected?.length) console.log(`期望：${r.expected.join(', ')}`);
    console.log(`${r.ok ? '[通过]' : '[未就绪]'} ${r.note}`);
    return r.ok ? 0 : 1;
  }
  if (flag === '--write') {
    const { customDomain } = readSiteConfig();
    const r = syncCname(customDomain);
    if (customDomain) {
      console.log(`==> dist/CNAME 写入 ${customDomain}`);
    } else if (r.action === 'removed') {
      console.log('==> 未配置域名，已移除残留的 dist/CNAME');
    } else {
      console.log('==> 未配置域名，dist 无 CNAME（站点继续走 yzx4036.github.io）');
    }
    return 0;
  }

  console.error(`[失败] 未知参数：${flag}\n\n${HELP}`);
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
