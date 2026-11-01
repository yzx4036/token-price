import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  IndexNowError,
  collectUrls,
  ensureKey,
  explainStatus,
  generateKey,
  readKey,
  submitUrls,
  validateKey,
  writeKeyFile,
} from '../scripts/indexnow.mjs';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tp-indexnow-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('IndexNow key 规范', () => {
  it('接受 8–128 位的字母数字与连字符', () => {
    expect(validateKey('abcdefgh')).toBe(true);
    expect(validateKey('bb6ae8e13185b14607a82a48a312da44')).toBe(true);
    expect(validateKey('ABC-123-def')).toBe(true);
  });

  it('拒绝过短、过长、非法字符', () => {
    expect(validateKey('short')).toBe(false); // 7 位
    expect(validateKey('a'.repeat(129))).toBe(false);
    expect(validateKey('has space')).toBe(false);
    expect(validateKey('has_underscore')).toBe(false);
    expect(validateKey('has.dot')).toBe(false);
    expect(validateKey('')).toBe(false);
    expect(validateKey(null)).toBe(false);
  });

  it('生成的 key 本身必须通过校验（防生成器写错规则）', () => {
    for (let i = 0; i < 20; i += 1) {
      expect(validateKey(generateKey())).toBe(true);
    }
  });
});

describe('key 的生成与持久化', () => {
  it('首次运行生成并写回配置，保留原有字段', () => {
    const cfg = join(dir, 'site.config.json');
    writeFileSync(cfg, JSON.stringify({ customDomain: 'example.com', note: 'keep' }), 'utf8');

    const r = ensureKey(cfg);
    expect(r.created).toBe(true);
    expect(validateKey(r.key)).toBe(true);

    const raw = JSON.parse(readFileSync(cfg, 'utf8'));
    expect(raw.indexNowKey).toBe(r.key);
    // 改 key 不能把域名和说明抹掉
    expect(raw.customDomain).toBe('example.com');
    expect(raw.note).toBe('keep');
    expect(existsSync(`${cfg}.tmp`)).toBe(false);
  });

  it('再次运行复用已有 key（换 key 会让搜索引擎重新验证，提交白费）', () => {
    const cfg = join(dir, 'site.config.json');
    writeFileSync(cfg, JSON.stringify({ indexNowKey: 'existing-key-123' }), 'utf8');
    const r = ensureKey(cfg);
    expect(r.created).toBe(false);
    expect(r.key).toBe('existing-key-123');
    expect(readKey(cfg)).toBe('existing-key-123');
  });

  it('配置里的 key 不合规时重新生成（不让脏值进提交）', () => {
    const cfg = join(dir, 'site.config.json');
    writeFileSync(cfg, JSON.stringify({ indexNowKey: 'bad key!' }), 'utf8');
    const r = ensureKey(cfg);
    expect(r.created).toBe(true);
    expect(validateKey(r.key)).toBe(true);
  });

  it('没有配置文件时返回 null 而不是抛错', () => {
    expect(readKey(join(dir, 'nope.json'))).toBeNull();
  });
});

describe('key 文件必须能通过搜索引擎的抓取校验', () => {
  it('文件名是 <key>.txt，内容是 key 本身，且不带 BOM', () => {
    const key = 'bb6ae8e13185b14607a82a48a312da44';
    const r = writeKeyFile({ key, siteDir: dir });
    expect(r.path.endsWith(`${key}.txt`)).toBe(true);

    const bytes = readFileSync(r.path);
    // BOM（EF BB BF）会让部分引擎读到的内容与 key 不等，直接 403
    expect(bytes[0]).not.toBe(0xef);
    expect(bytes.toString('utf8')).toBe(key);
  });

  it('key 不合规时拒绝写文件（避免产出必然被拒的 key）', () => {
    expect(() => writeKeyFile({ key: 'bad', siteDir: dir })).toThrow(IndexNowError);
  });
});

describe('URL 收集与提交', () => {
  function makeDist(locs: string[]) {
    const distDir = join(dir, 'dist');
    mkdirSync(distDir, { recursive: true });
    writeFileSync(
      join(distDir, 'sitemap.xml'),
      `<?xml version="1.0"?><urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`,
      'utf8',
    );
    return distDir;
  }

  it('从 sitemap 取全部 URL，不自己拼路由', () => {
    const distDir = makeDist([
      'https://example.com/',
      'https://example.com/token-price/',
      'https://example.com/token-price/plans/',
    ]);
    const urls = collectUrls('https://example.com', distDir);
    expect(urls).toHaveLength(3);
    expect(urls).toContain('https://example.com/token-price/plans/');
  });

  it('可以指定站点仓根那份 sitemap（含主页，比 dist 那份多一条）', () => {
    // 发布流程传的是站点仓根的 sitemap：那里才有站点主页 https://example.com/，
    // 只读 dist 那份会漏掉主页，而主页是品牌词最该被收录的页面
    const distDir = makeDist(['https://example.com/token-price/', 'https://example.com/token-price/plans/']);
    const rootSitemap = join(dir, 'root-sitemap.xml');
    writeFileSync(
      rootSitemap,
      '<?xml version="1.0"?><urlset><url><loc>https://example.com/</loc></url>'
      + '<url><loc>https://example.com/token-price/</loc></url>'
      + '<url><loc>https://example.com/token-price/plans/</loc></url></urlset>',
      'utf8',
    );
    const fromDist = collectUrls('https://example.com', distDir);
    const fromRoot = collectUrls('https://example.com', distDir, rootSitemap);
    expect(fromDist).not.toContain('https://example.com/');
    expect(fromRoot).toContain('https://example.com/');
    expect(fromRoot).toHaveLength(fromDist.length + 1);
  });

  it('sitemap 缺失时报错而不是静默提交空列表', () => {
    expect(() => collectUrls('https://example.com', join(dir, 'nope'))).toThrow(/sitemap\.xml/);
  });

  it('payload 的 host 是裸域名，不是完整 URL', () => {
    // 官方要求 host 不带协议：写成 https://example.com 会返回 422
    return submitUrls({
      key: 'bb6ae8e13185b14607a82a48a312da44',
      urls: ['https://whyzero.studio/token-price/'],
      dryRun: true,
    }).then((r) => {
      expect(r.payload.host).toBe('whyzero.studio');
      expect(r.payload.host).not.toContain('https');
      expect(r.payload.keyLocation).toBe('https://whyzero.studio/bb6ae8e13185b14607a82a48a312da44.txt');
      expect(r.payload.urlList).toEqual(['https://whyzero.studio/token-price/']);
    });
  });

  it('拒绝混入其他 host 的 URL（同一批必须同源）', async () => {
    await expect(
      submitUrls({
        key: 'bb6ae8e13185b14607a82a48a312da44',
        urls: ['https://whyzero.studio/', 'https://evil.com/x'],
        dryRun: true,
      }),
    ).rejects.toThrow(/同一 host/);
  });

  it('超过 10000 条时报错（官方单次上限）', async () => {
    const urls = Array.from({ length: 10001 }, (_, i) => `https://example.com/p${i}`);
    await expect(
      submitUrls({ key: 'bb6ae8e13185b14607a82a48a312da44', urls, dryRun: true }),
    ).rejects.toThrow(/10000/);
  });

  it('空列表被拒绝，不发无意义的请求', async () => {
    await expect(
      submitUrls({ key: 'bb6ae8e13185b14607a82a48a312da44', urls: [], dryRun: true }),
    ).rejects.toThrow(/没有要提交/);
  });

  it('真实请求发 POST 到 api.indexnow.org，且 Content-Type 带 charset', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fakeFetch = async (url: string, init: RequestInit) => {
      captured = { url, init };
      return { status: 200 } as Response;
    };
    const r = await submitUrls({
      key: 'bb6ae8e13185b14607a82a48a312da44',
      urls: ['https://whyzero.studio/'],
      fetchImpl: fakeFetch as typeof fetch,
    });
    expect(r.status).toBe(200);
    expect(captured!.url).toBe('https://api.indexnow.org/indexnow');
    expect(captured!.init.method).toBe('POST');
    expect(String(captured!.init.headers && (captured!.init.headers as Record<string, string>)['Content-Type']))
      .toContain('charset=utf-8');
  });

  it('状态码能被翻译成人话（官方只回码不给原因）', () => {
    expect(explainStatus(200)).toContain('成功');
    expect(explainStatus(202)).toContain('待完成');
    expect(explainStatus(403)).toContain('key 无效');
    expect(explainStatus(422)).toContain('host');
    expect(explainStatus(429)).toContain('限流');
  });
});
