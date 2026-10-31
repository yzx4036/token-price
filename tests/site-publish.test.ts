import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PublishError,
  copyTree,
  ensureNoJekyll,
  syncHome,
  syncSubpath,
  validateSubpath,
  writeSiteCname,
} from '../scripts/site-publish.mjs';

let root: string;
let siteDir: string;
let distDir: string;
let homeDir: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tp-publish-'));
  siteDir = join(root, 'site');
  distDir = join(root, 'dist');
  homeDir = join(root, 'home');
  mkdirSync(siteDir);
  mkdirSync(join(distDir, '_astro'), { recursive: true });
  mkdirSync(homeDir);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('子路径校验', () => {
  it('接受正常子路径，并去掉首尾斜杠', () => {
    expect(validateSubpath('token-price')).toBe('token-price');
    expect(validateSubpath('/token-price/')).toBe('token-price');
    expect(validateSubpath('Token_Price.2')).toBe('Token_Price.2');
  });

  it.each([
    ['../etc', '越权'],
    ['a/b', '多段'],
    ['a\\b', '反斜杠多段'],
    ['..', '双点'],
    ['.', '单点'],
    ['', '空串'],
    ['-bad', '以连字符开头'],
    ['bad name', '含空格'],
    ['token..price', '含双点'],
  ])('拒绝 %s（%s）', (input) => {
    expect(() => validateSubpath(input)).toThrow(PublishError);
  });

  it('allowEmpty 时才允许空串', () => {
    expect(validateSubpath('', { allowEmpty: true })).toBe('');
  });
});

describe('发布到子路径时不能伤到站点仓根目录', () => {
  it('只替换子目录，站点根的主页与其它文件原样保留', () => {
    // 站点仓根：通用主页 + 用户自己加的文件
    writeFileSync(join(siteDir, 'index.html'), '<h1>我的通用主页</h1>', 'utf8');
    writeFileSync(join(siteDir, 'about.html'), '<h1>关于</h1>', 'utf8');
    mkdirSync(join(siteDir, 'blog'));
    writeFileSync(join(siteDir, 'blog', 'post.html'), 'post', 'utf8');
    // 上一次部署留下的旧子站
    mkdirSync(join(siteDir, 'token-price'), { recursive: true });
    writeFileSync(join(siteDir, 'token-price', 'stale.html'), 'old', 'utf8');
    // 本次构建产物
    writeFileSync(join(distDir, 'index.html'), '<h1>比价站</h1>', 'utf8');
    writeFileSync(join(distDir, '_astro', 'a.css'), 'body{}', 'utf8');

    syncSubpath({ distDir, siteDir, subpath: 'token-price' });

    // 主页面必须活着 —— 这是本条最重要的断言
    expect(readFileSync(join(siteDir, 'index.html'), 'utf8')).toBe('<h1>我的通用主页</h1>');
    expect(existsSync(join(siteDir, 'about.html'))).toBe(true);
    expect(existsSync(join(siteDir, 'blog', 'post.html'))).toBe(true);
    // 子站被整体替换：旧文件清掉，新文件到位
    expect(existsSync(join(siteDir, 'token-price', 'stale.html'))).toBe(false);
    expect(readFileSync(join(siteDir, 'token-price', 'index.html'), 'utf8')).toBe('<h1>比价站</h1>');
    expect(existsSync(join(siteDir, 'token-price', '_astro', 'a.css'))).toBe(true);
  });

  it('子目录不存在时直接创建', () => {
    writeFileSync(join(distDir, 'index.html'), 'x', 'utf8');
    const r = syncSubpath({ distDir, siteDir, subpath: 'token-price' });
    expect(r.files).toBe(1);
    expect(existsSync(join(siteDir, 'token-price', 'index.html'))).toBe(true);
  });

  it('dist 缺失时报错，不留下半截目录', () => {
    expect(() => syncSubpath({ distDir: join(root, 'nope'), siteDir, subpath: 'token-price' }))
      .toThrow(PublishError);
    expect(existsSync(join(siteDir, 'token-price'))).toBe(false);
  });

  it('复制目录返回真实文件数（递归计数）', () => {
    writeFileSync(join(distDir, 'index.html'), 'a', 'utf8');
    writeFileSync(join(distDir, '_astro', 'a.css'), 'b', 'utf8');
    writeFileSync(join(distDir, '_astro', 'b.js'), 'c', 'utf8');
    const n = copyTree(distDir, join(root, 'out'));
    expect(n).toBe(3);
  });

  it('dist/CNAME 不会被塞进子目录（CNAME 只认站点仓根目录）', () => {
    writeFileSync(join(distDir, 'index.html'), 'x', 'utf8');
    writeFileSync(join(distDir, 'CNAME'), 'example.com\n', 'utf8');
    syncSubpath({ distDir, siteDir, subpath: 'token-price' });
    expect(existsSync(join(siteDir, 'token-price', 'CNAME'))).toBe(false);
    expect(existsSync(join(siteDir, 'token-price', 'index.html'))).toBe(true);
  });
});

describe('站点根主页同步：只覆盖，不删除', () => {
  it('把模板文件铺上去，但保留站点仓里模板没有的文件', () => {
    writeFileSync(join(homeDir, 'index.html'), '<h1>新主页</h1>', 'utf8');
    writeFileSync(join(siteDir, 'keep-me.html'), 'user file', 'utf8');

    const r = syncHome({ homeDir, siteDir });

    expect(r.skipped).toBe(false);
    expect(r.files).toBe(1);
    expect(readFileSync(join(siteDir, 'index.html'), 'utf8')).toBe('<h1>新主页</h1>');
    expect(readFileSync(join(siteDir, 'keep-me.html'), 'utf8')).toBe('user file');
  });

  it('模板目录不存在时安全跳过（不报错）', () => {
    const r = syncHome({ homeDir: join(root, 'none'), siteDir });
    expect(r).toEqual({ files: 0, skipped: true });
  });

  it('跳过 .git', () => {
    mkdirSync(join(homeDir, '.git'));
    writeFileSync(join(homeDir, '.git', 'config'), 'x', 'utf8');
    writeFileSync(join(homeDir, 'index.html'), 'home', 'utf8');
    const r = syncHome({ homeDir, siteDir });
    expect(r.files).toBe(1);
    expect(existsSync(join(siteDir, '.git'))).toBe(false);
  });
});

describe('部署脚本与子路径保持一致（base 不等于子路径会全站 404）', () => {
  const script = readFileSync(new URL('../scripts/deploy-site.sh', import.meta.url), 'utf8');

  it('deploy 脚本的 base 由 SITE_SUBPATH 推导，不是写死 /', () => {
    expect(script).toContain('SITE_SUBPATH="${SITE_SUBPATH:-token-price}"');
    expect(script).toContain('PUBLIC_BASE_PATH="${PUBLIC_BASE_PATH:-/$SITE_SUBPATH}"');
    // 写死根路径会让子站资源全部 404，这条禁止回退
    expect(script).not.toMatch(/PUBLIC_BASE_PATH="\$\{PUBLIC_BASE_PATH:-\/\}"/);
  });

  it('发布时把域名交给 site-publish 写到站点仓根，而不是靠 dist/CNAME', () => {
    expect(script).toContain('--subpath "$SITE_SUBPATH"');
    expect(script).toContain('--domain "$CUSTOM_DOMAIN"');
  });

  it('传站点仓路径给 node 前先转成原生路径（MSYS /e/... 会被 node 当成 E:\\e\\...）', () => {
    expect(script).toContain('cygpath -w "$SITE_DIR"');
  });
});

describe('CNAME 与 .nojekyll 放在站点仓根目录', () => {
  it('有域名时写在站点根，而不是子目录', () => {
    const r = writeSiteCname({ domain: 'example.com', siteDir });
    expect(r.action).toBe('written');
    expect(readFileSync(join(siteDir, 'CNAME'), 'utf8')).toBe('example.com\n');
    expect(existsSync(join(siteDir, 'token-price', 'CNAME'))).toBe(false);
  });

  it('无域名时清掉残留 CNAME（否则站点被钉在老域名）', () => {
    writeFileSync(join(siteDir, 'CNAME'), 'old.com\n', 'utf8');
    const r = writeSiteCname({ domain: null, siteDir });
    expect(r.action).toBe('removed');
    expect(existsSync(join(siteDir, 'CNAME'))).toBe(false);
  });

  it('.nojekyll 缺失时补齐，已存在时不重复写', () => {
    expect(ensureNoJekyll(siteDir).action).toBe('created');
    expect(ensureNoJekyll(siteDir).action).toBe('present');
    expect(existsSync(join(siteDir, '.nojekyll'))).toBe(true);
  });
});
