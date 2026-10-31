import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * 桌面留白与主页身份的门禁。
 *
 * 背景：通用主页原本用博客正文的阅读宽度（固定 640px）做容器，
 * 在 1920 屏上两侧各空 640px；比价站容器又硬顶在 1160px。
 * 这里把「多宽算合格」写成可计算的断言，避免以后又被改窄回去。
 */

const root = process.cwd();
const home = readFileSync(join(root, 'site-root', 'index.html'), 'utf8');
const css = readFileSync(join(root, 'src', 'styles', 'global.css'), 'utf8');

/** 取出主页 main 的宽度规则：min(<max>px, 100%) */
function homeMainMax(): number | null {
  const m = home.match(/main\s*\{[^}]*width:\s*min\((\d+)px,\s*100%\)/);
  return m ? Number(m[1]) : null;
}

/** 取出 .shell 的所有 min(<max>px, calc(100% - <gutter>px)) 声明，按出现顺序 */
function shellRules(): Array<{ max: number; gutter: number }> {
  return [...css.matchAll(/\.shell\s*\{[^}]*width:\s*min\((\d+)px,\s*calc\(100%\s*-\s*(\d+)px\)\)/g)].map(
    (m) => ({ max: Number(m[1]), gutter: Number(m[2]) }),
  );
}

/** 按 shell 规则算某视口下的实际内容宽度 */
function shellWidthAt(vw: number): number {
  const rules = shellRules();
  const wide = vw >= 768 && rules[1] ? rules[1] : rules[0];
  return Math.min(wide.max, vw - wide.gutter);
}

describe('通用主页：身份标识', () => {
  it('标题与主标题都是 WhyZero', () => {
    expect(home).toMatch(/<title>WhyZero<\/title>/);
    expect(home).toMatch(/<h1>WhyZero<\/h1>/);
  });

  it('不得出现真实姓名或昵称', () => {
    for (const word of ['小贤哥', '贤哥']) {
      expect(home, `主页里不该出现「${word}」`).not.toContain(word);
    }
  });
});

describe('通用主页：桌面宽度', () => {
  it('容器宽度 ≥ 1000px（不再是 640px 的阅读宽度）', () => {
    const max = homeMainMax();
    expect(max, '找不到 main 的 min(Npx, 100%) 宽度规则').not.toBeNull();
    expect(max!).toBeGreaterThanOrEqual(1000);
  });

  it('不再用 rem 固定阅读宽度做容器', () => {
    expect(home).not.toMatch(/max-width:\s*40rem/);
    expect(home).not.toMatch(/max-width:\s*640px/);
  });

  it('条目用可折叠轨道的网格（条数少时卡片铺满，不留一排空位）', () => {
    expect(home).toContain('auto-fit');
    expect(home).not.toContain('auto-fill');
  });

  it('卡片内部两列排布（文字左、箭头右），宽卡片不会只占左侧三分之一', () => {
    expect(home).toMatch(/\.cards a\s*\{[^}]*grid-template-columns:\s*1fr auto/);
    expect(home).toContain('class="text"');
    expect(home).toContain('class="tag"');
  });

  it('1920 屏两侧各留白不超过 400px', () => {
    const content = Math.min(homeMainMax()!, 1920);
    const side = (1920 - content) / 2;
    expect(side).toBeLessThanOrEqual(400);
  });
});

describe('比价站容器：桌面放宽', () => {
  it('基础规则保持移动端 32px 边距，桌面规则放宽到 ≥ 1400px', () => {
    const rules = shellRules();
    expect(rules.length, '.shell 应同时有基础规则与桌面覆盖规则').toBeGreaterThanOrEqual(2);
    expect(rules[0].gutter, '移动端边距不该被改窄').toBe(32);
    expect(rules[0].max).toBeGreaterThanOrEqual(1400);
    expect(rules[1].max).toBeGreaterThanOrEqual(1400);
  });

  it('1920 屏内容宽度 ≥ 1500px，两侧各 ≤ 210px', () => {
    const w = shellWidthAt(1920);
    expect(w).toBeGreaterThanOrEqual(1500);
    expect((1920 - w) / 2).toBeLessThanOrEqual(210);
  });

  it('1440 屏内容宽度 ≥ 1300px', () => {
    expect(shellWidthAt(1440)).toBeGreaterThanOrEqual(1300);
  });

  it('小屏不被加宽破坏：375 下仍保留边距且不溢出', () => {
    const w = shellWidthAt(375);
    expect(w).toBe(375 - 32);
    expect(w).toBeLessThanOrEqual(375);
  });

  it('长正文仍有限宽，加宽容器不会拉长阅读行宽', () => {
    expect(css).toMatch(/\.prose\s*\{[^}]*max-width:\s*800px/);
  });
});
