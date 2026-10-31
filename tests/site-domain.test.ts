import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DomainError,
  GITHUB_PAGES_IPV4,
  checkDns,
  normalizeDomain,
  readSiteConfig,
  syncCname,
  writeSiteConfig,
} from '../scripts/site-domain.mjs';

let dir: string;
let distDir: string;
let configPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tp-domain-'));
  distDir = join(dir, 'dist');
  configPath = join(dir, 'site.config.json');
  mkdirSync(distDir);
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('域名规范化与校验', () => {
  it('接受裸域名并转小写、去掉尾点', () => {
    expect(normalizeDomain('TokenPrice.COM')).toBe('tokenprice.com');
    expect(normalizeDomain('  a.b.dev.  ')).toBe('a.b.dev');
    expect(normalizeDomain('xn--fiqs8s.cn')).toBe('xn--fiqs8s.cn');
  });

  it.each([
    ['https://tokenprice.com', '带协议'],
    ['tokenprice.com/path', '带路径'],
    ['tokenprice.com:8080', '带端口'],
    ['token price.com', '带空格'],
    ['*.tokenprice.com', '泛域名'],
    ['localhost', '只有一段'],
    ['-bad.com', '标签以连字符开头'],
    ['bad-.com', '标签以连字符结尾'],
    ['bad_domain.com', '含下划线'],
    ['tokenprice.c', '顶级域过短'],
    ['', '空串'],
  ])('拒绝 %s（%s）', (input) => {
    expect(() => normalizeDomain(input)).toThrow(DomainError);
  });

  it('拒绝非字符串而不抛 TypeError', () => {
    expect(() => normalizeDomain(null)).toThrow(DomainError);
    expect(() => normalizeDomain(123)).toThrow(DomainError);
  });
});

describe('CNAME 同步', () => {
  it('配置了域名就写入 dist/CNAME（带换行）', () => {
    const r = syncCname('tokenprice.com', distDir);
    expect(r.action).toBe('written');
    expect(readFileSync(join(distDir, 'CNAME'), 'utf8')).toBe('tokenprice.com\n');
  });

  it('未配置域名且无残留时不写文件', () => {
    const r = syncCname(null, distDir);
    expect(r.action).toBe('absent');
    expect(existsSync(join(distDir, 'CNAME'))).toBe(false);
  });

  it('未配置域名时清掉上一次构建残留的 CNAME（否则站点被钉在老域名上）', () => {
    writeFileSync(join(distDir, 'CNAME'), 'old.example.com\n', 'utf8');
    const r = syncCname(null, distDir);
    expect(r.action).toBe('removed');
    expect(existsSync(join(distDir, 'CNAME'))).toBe(false);
  });

  it('dist 不存在时明确报错，而不是静默跳过', () => {
    expect(() => syncCname('tokenprice.com', join(dir, 'nope'))).toThrow(DomainError);
  });
});

describe('配置文件读写', () => {
  it('文件不存在时视为未配置', () => {
    expect(readSiteConfig(configPath).customDomain).toBeNull();
  });

  it('写入后能读回，且是原子替换（不留下 .tmp）', () => {
    writeSiteConfig('tokenprice.com', configPath);
    expect(readSiteConfig(configPath).customDomain).toBe('tokenprice.com');
    expect(existsSync(`${configPath}.tmp`)).toBe(false);
    const raw = JSON.parse(readFileSync(configPath, 'utf8'));
    expect(raw.customDomain).toBe('tokenprice.com');
    expect(typeof raw.note).toBe('string');
  });

  it('清空域名写回 null', () => {
    writeSiteConfig('tokenprice.com', configPath);
    writeSiteConfig(null, configPath);
    expect(readSiteConfig(configPath).customDomain).toBeNull();
  });

  it('配置文件里的非法域名读出来就报错，不把脏数据带到构建', () => {
    writeFileSync(configPath, JSON.stringify({ customDomain: 'https://bad.com/x' }), 'utf8');
    expect(() => readSiteConfig(configPath)).toThrow(DomainError);
  });

  it('配置文件 JSON 损坏时报错并指出路径', () => {
    writeFileSync(configPath, '{ not json', 'utf8');
    expect(() => readSiteConfig(configPath)).toThrow(/不是合法 JSON/);
  });
});

describe('GitHub Pages IP 常量', () => {
  it('四个 A 记录齐全且格式正确（少一条 Pages 就判未配置）', () => {
    expect(GITHUB_PAGES_IPV4).toHaveLength(4);
    for (const ip of GITHUB_PAGES_IPV4) {
      expect(ip).toMatch(/^185\.199\.1\d\d\.153$/);
    }
  });
});

describe('DNS 就绪检查（注入假解析器，不联网）', () => {
  const fake = (lookupResult: string[] | Error, cname: string[] = []) => ({
    lookup: async () => {
      if (lookupResult instanceof Error) throw lookupResult;
      return lookupResult.map((address) => ({ address, family: 4 }));
    },
    resolveCname: async () => {
      if (cname === null) throw new Error('ENODATA');
      return cname;
    },
  });

  it('四条 A 记录齐全 -> 通过', async () => {
    const r = await checkDns('tokenprice.com', { resolver: fake([...GITHUB_PAGES_IPV4]) });
    expect(r.ok).toBe(true);
    expect(r.note).toContain('已指向 GitHub Pages');
  });

  it('只有部分 GitHub IP -> 未就绪，并列出缺的', async () => {
    const r = await checkDns('tokenprice.com', { resolver: fake([GITHUB_PAGES_IPV4[0]]) });
    expect(r.ok).toBe(false);
    expect(r.note).toContain('缺少');
    expect(r.note).toContain(GITHUB_PAGES_IPV4[3]);
  });

  it('解析到完全无关的 IP -> 未就绪', async () => {
    const r = await checkDns('tokenprice.com', { resolver: fake(['93.184.216.34']) });
    expect(r.ok).toBe(false);
    expect(r.note).toContain('不是 GitHub Pages 的地址');
  });

  it('子域 CNAME 到 github.io 同样能判就绪（走 lookup 跟随链）', async () => {
    const r = await checkDns('www.tokenprice.com', {
      resolver: fake([...GITHUB_PAGES_IPV4], ['yzx4036.github.io']),
    });
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('CNAME');
    expect(r.cnameChain).toEqual(['yzx4036.github.io']);
  });

  it('解析器报错 -> 不伪装成功，标记 error', async () => {
    const r = await checkDns('tokenprice.com', { resolver: fake(new Error('ECONNREFUSED')) });
    expect(r.ok).toBe(false);
    expect(r.mode).toBe('error');
  });

  it('无任何记录 -> 给出 apex / 子域各自的配置提示', async () => {
    const apex = await checkDns('tokenprice.com', { resolver: fake([]) });
    expect(apex.mode).toBe('none');
    expect(apex.note).toContain('4 条 A 记录');
    const sub = await checkDns('www.tokenprice.com', { resolver: fake([]) });
    expect(sub.note).toContain('CNAME');
  });
});
