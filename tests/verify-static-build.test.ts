import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

/**
 * 产物门禁自己的回归测试。
 *
 * 为什么门禁也要测：一个「永远扫 0 条、永远 PASS」的门比没有门更危险——
 * 它会让人以为已经验证过。这里用变异法造正例与反例，
 * 每条判据都必须能被对应的反例抓红。
 */

const GATE = join(process.cwd(), 'scripts', 'verify-static-build.mjs');
const ROUTES = ['', 'api-pricing', 'plans', 'calculator', 'sources', 'methodology'];

let dist: string;

function pageHtml({ body, links = ['/token-price/api-pricing/'], scripts = [], seo = true, canonical = 'https://yzx4036.github.io/token-price/api-pricing/', jsonLd = true }: {
  body?: string;
  links?: string[];
  scripts?: string[];
  seo?: boolean;
  canonical?: string;
  jsonLd?: boolean;
}): string {
  const seoTags = seo
    ? [
        `<link rel="canonical" href="${canonical}" />`,
        '<meta property="og:title" content="API 比价" />',
        '<meta property="og:description" content="desc" />',
        `<meta property="og:url" content="${canonical}" />`,
        '<meta name="twitter:card" content="summary" />',
      ].join('')
    : '';
  const ldTags = jsonLd
    ? [
        '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"t"}</script>',
        '<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[]}</script>',
      ].join('')
    : '';
  return [
    '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">',
    '<meta name="description" content="这是用于门禁测试的页面描述，长度足够通过最短校验。"><title>测试页面标题</title>',
    seoTags,
    ldTags,
    ...scripts.map((s) => `<script type="module" src="${s}"></script>`),
    '</head><body><div id="app">',
    body ?? `<p>${'官方核验条目 · 内容占位'.repeat(40)}</p>`,
    links.map((l) => `<a href="${l}">link</a>`).join(''),
    '</div></body></html>',
  ].join('');
}

/** 造一份完整、应当通过的产物 */
function buildGoodDist(opts: { apiBody?: string; seo?: boolean; robots?: boolean; sitemap?: boolean; jsonLd?: boolean; llms?: boolean } = {}): void {
  mkdirSync(join(dist, 'assets'), { recursive: true });
  writeFileSync(join(dist, 'assets', 'index-abc.js'), '// bundle', 'utf8');

  if (opts.robots !== false) {
    writeFileSync(
      join(dist, 'robots.txt'),
      'User-agent: *\nAllow: /\n\nSitemap: https://yzx4036.github.io/token-price/sitemap.xml\n',
      'utf8',
    );
  }
  if (opts.sitemap !== false) {
    const locs = ROUTES.map((r) => (r === '' ? 'https://yzx4036.github.io/token-price/' : `https://yzx4036.github.io/token-price/${r}/`));
    writeFileSync(
      join(dist, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?><urlset>${locs.map((l) => `<url><loc>${l}</loc></url>`).join('')}</urlset>`,
      'utf8',
    );
  }
  if (opts.llms !== false) {
    writeFileSync(
      join(dist, 'llms.txt'),
      `# 站点\n\n${'本站每条价格标注「官方核验」或「聚合数据」，汇率每日自动抓取。'.repeat(10)}\n`,
      'utf8',
    );
  }

  for (const route of ROUTES) {
    const isHome = route === '';
    const body =
      route === 'api-pricing'
        ? opts.apiBody ??
          `<div><span>$0.15</span><span>≈ ¥1.00 估算</span><b>官方原价 ¥12</b></div>`.repeat(60)
        : undefined;
    const dir = isHome ? dist : join(dist, route);
    mkdirSync(dir, { recursive: true });
    const canonical = isHome ? 'https://yzx4036.github.io/token-price/' : `https://yzx4036.github.io/token-price/${route}/`;
    let html = pageHtml({ body, scripts: ['/token-price/assets/index-abc.js'], seo: opts.seo, canonical, jsonLd: opts.jsonLd });
    // 首页要额外声明 WebSite + Dataset（门禁 P7 会查）
    if (isHome && opts.jsonLd !== false) {
      html = html.replace(
        '</head>',
        '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite","name":"s"}</script>'
        + '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dataset","name":"d"}</script></head>',
      );
    }
    writeFileSync(join(dir, 'index.html'), html, 'utf8');
  }
}

/** 跑门禁，返回 { code, stdout, stderr } */
function runGate(target: string, base = '/token-price/') {
  try {
    const stdout = execFileSync(
      process.execPath,
      [GATE, '--dist', target, '--base', base],
      { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

beforeEach(() => {
  dist = mkdtempSync(join(tmpdir(), 'tp-gate-'));
});

afterEach(() => {
  rmSync(dist, { recursive: true, force: true });
});

describe('产物门禁：正例必须通过', () => {
  it('六路由齐全 + 真实价格 + base 前缀 + 资源存在 => 通过', () => {
    buildGoodDist();
    const r = runGate(dist);
    expect(r.code, r.stderr).toBe(0);
    expect(r.stdout).toContain('结论：通过');
  });
});

describe('产物门禁：反例必须抓红（每条判据一个变异）', () => {
  it('P1 缺一条路由 => 失败', () => {
    buildGoodDist();
    rmSync(join(dist, 'plans'), { recursive: true, force: true });
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P1 缺少路由产物');
  });

  it('P2 空壳 SPA（无预渲染内容）=> 失败', () => {
    buildGoodDist();
    writeFileSync(
      join(dist, 'methodology', 'index.html'),
      pageHtml({ body: '<!--empty-->' }),
      'utf8',
    );
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P2');
  });

  it('P2 API 页价格未进静态 HTML => 失败', () => {
    buildGoodDist({ apiBody: `<p>${'只有说明没有价格'.repeat(60)}</p>` });
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P2');
  });

  it('P2 缺少「官方原价」标注 => 失败（口径被破坏）', () => {
    buildGoodDist({ apiBody: `<span>$0.15</span><span>≈ ¥1.00 估算</span>`.repeat(60) });
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('官方原价');
  });

  it('P3 站内链接缺 base 前缀 => 失败', () => {
    buildGoodDist();
    writeFileSync(
      join(dist, 'plans', 'index.html'),
      pageHtml({ links: ['/api-pricing/'], scripts: ['/token-price/assets/index-abc.js'] }),
      'utf8',
    );
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P3');
  });

  it('P3 一条链接都没扫到时不许当通过（禁止空扫假绿）', () => {
    buildGoodDist();
    for (const route of ROUTES) {
      const dir = route === '' ? dist : join(dist, route);
      writeFileSync(join(dir, 'index.html'), '<html><body><div id="app">纯文本内容没有链接也没有脚本</div></body></html>', 'utf8');
    }
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('一条站内链接都没扫到');
  });

  it('P4 残留未替换的占位符 => 失败', () => {
    buildGoodDist();
    writeFileSync(
      join(dist, 'calculator', 'index.html'),
      pageHtml({ body: `<!--app-html-->${'内容'.repeat(200)}` }),
      'utf8',
    );
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P4');
  });

  it('P5 泄漏 localhost / _astro => 失败', () => {
    buildGoodDist();
    writeFileSync(
      join(dist, 'sources', 'index.html'),
      pageHtml({ body: `<p>发表于 http://localhost:4321/_astro/x.css ${'内容'.repeat(100)}</p>` }),
      'utf8',
    );
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P5');
  });

  it('P6 缺 canonical => 失败', () => {
    buildGoodDist({ seo: false });
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P6');
    expect(r.stderr).toContain('canonical');
  });

  it('P6 canonical 不是绝对 URL => 失败', () => {
    buildGoodDist();
    writeFileSync(
      join(dist, 'plans', 'index.html'),
      pageHtml({ canonical: '/token-price/plans/', scripts: ['/token-price/assets/index-abc.js'] }),
      'utf8',
    );
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P6');
    expect(r.stderr).toContain('绝对 URL');
  });

  it('P6 canonical 缺 base 前缀 => 失败', () => {
    buildGoodDist();
    writeFileSync(
      join(dist, 'plans', 'index.html'),
      pageHtml({ canonical: 'https://yzx4036.github.io/plans/', scripts: ['/token-price/assets/index-abc.js'] }),
      'utf8',
    );
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P6');
    expect(r.stderr).toContain('base 前缀');
  });

  it('P6 缺 robots.txt => 失败', () => {
    buildGoodDist({ robots: false });
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('robots.txt');
  });

  it('P6 robots.txt 全站 Disallow => 失败', () => {
    buildGoodDist();
    writeFileSync(join(dist, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Disallow');
  });

  it('P6 缺 sitemap.xml => 失败', () => {
    buildGoodDist({ sitemap: false });
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('sitemap.xml');
  });

  it('P6 sitemap 条目数与路由数不一致 => 失败', () => {
    buildGoodDist();
    writeFileSync(
      join(dist, 'sitemap.xml'),
      '<?xml version="1.0"?><urlset><url><loc>https://yzx4036.github.io/token-price/</loc></url></urlset>',
      'utf8',
    );
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('不一致');
  });

  it('P7 缺 JSON-LD => 失败（AI 引擎读不到页面语义）', () => {
    buildGoodDist({ jsonLd: false });
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('P7');
    expect(r.stderr).toContain('JSON-LD');
  });

  it('P7 JSON-LD 不是合法 JSON => 失败', () => {
    buildGoodDist();
    writeFileSync(
      join(dist, 'plans', 'index.html'),
      pageHtml({ scripts: ['/token-price/assets/index-abc.js'] }).replace(
        '{&quot;',
        '{',
      ).replace(
        /<script type="application\/ld\+json">\{"@context":"https:\/\/schema\.org","@type":"WebPage","name":"t"\}<\/script>/,
        '<script type="application/ld+json">{ not json }</script>',
      ),
      'utf8',
    );
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('不是合法 JSON');
  });

  it('P7 首页缺 WebSite / Dataset => 失败', () => {
    buildGoodDist();
    // 把首页换成只有 WebPage + 面包屑的样子
    writeFileSync(
      join(dist, 'index.html'),
      pageHtml({ scripts: ['/token-price/assets/index-abc.js'], canonical: 'https://yzx4036.github.io/token-price/' }),
      'utf8',
    );
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('WebSite');
  });

  it('P7 缺 llms.txt => 失败', () => {
    buildGoodDist({ llms: false });
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('llms.txt');
  });

  it('P7 llms.txt 空壳（没有口径说明）=> 失败', () => {
    buildGoodDist();
    writeFileSync(join(dist, 'llms.txt'), `# 站点\n\n${'占位'.repeat(200)}\n`, 'utf8');
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('溯源等级');
  });

  it('引用了不存在的资源（新旧产物混杂）=> 失败', () => {
    buildGoodDist();
    unlinkSync(join(dist, 'assets', 'index-abc.js'));
    const r = runGate(dist);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('引用不存在的资源');
  });

  it('产物目录不存在 => 无法判定（退出码 2，不是 0）', () => {
    const r = runGate(join(dist, 'nope'));
    expect(r.code).toBe(2);
    expect(r.stderr).toContain('无法判定');
  });
});
