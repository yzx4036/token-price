import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * issue #7：宽度必须按「内容类型」分级，不能整页一个宽度。
 *
 * 背景：数据页为了放 1375px 的宽表格，把 .hero-compact 的 max-width 设成 none，
 * 结果同一页的说明盒子也被放开到 1377px，内文却被 .lede 卡在 720px，
 * 中间白出 657px —— 大空盒子里装半宽的字。
 *
 * 这些断言守的是「分级规则本身」，不是某一处的当前数值，
 * 否则下次为了加宽表格还会把它推开。
 */

const css = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8');

/** 取某个选择器在样式表里的第一条规则块内容 */
function ruleBody(selector: string): string {
  const idx = css.indexOf(`${selector} {`);
  expect(idx, `找不到选择器 ${selector}`).toBeGreaterThan(-1);
  const end = css.indexOf('}', idx);
  return css.slice(idx, end);
}

describe('#7 宽度分级', () => {
  it('说明类区块的阅读宽度由 --measure 统一控制，且不超过可读性上限 800px', () => {
    const m = css.match(/--measure:\s*(\d+)px/);
    expect(m, '缺少 --measure 变量').not.toBeNull();
    const value = Number(m![1]);
    // 800px 是 .prose 的宽度；超过它中文行宽会突破 45 字/行的舒适区
    expect(value).toBeLessThanOrEqual(800);
    expect(value).toBeGreaterThanOrEqual(600);
  });

  it('.fold 消费 --measure，不再铺满容器', () => {
    const body = ruleBody('.fold');
    expect(body).toContain('max-width: var(--measure)');
  });

  it('.fold 内的导语跟随盒子宽度，不残留 .lede 的 720px 空带', () => {
    expect(css).toContain('.fold .lede { max-width: 100%; }');
  });

  it('.hero-compact 仍不限宽（宽表格需要），但说明盒子已单独限宽', () => {
    const body = ruleBody('.hero-compact');
    expect(body).toContain('max-width: none');
    // 两者并存才是正解：表格全宽 + 说明收敛，靠的是 .fold 自己限宽
    expect(ruleBody('.fold')).toContain('max-width: var(--measure)');
  });

  it('表格内的行级折叠（.fold-cell）不受 --measure 影响（204px 不能被封顶到更小）', () => {
    // max-width 只封顶不撑开：表格里的 fold 本来就窄于 --measure，
    // 这条断言防的是以后有人把 .fold 改成 width: var(--measure)（那会把单元格撑爆）
    const body = ruleBody('.fold');
    expect(body).not.toMatch(/(^|[^-])width:\s*var\(--measure\)/);
  });

  it('套餐页筛选栏的 auto 轨道不被容器拉宽（控件宽度不该由容器宽度决定）', () => {
    // grid 的 auto 轨道会吸收剩余空间：容器 1160→1600 后，
    // 三个 auto 列被摊成每个 ~460px，「↑ 升序」按钮单独拉到 402px
    const block = css.slice(css.indexOf('.filter-bar-plans { grid-template-columns: auto auto auto'));
    expect(block.slice(0, 200)).toContain('justify-content: start');
  });
});
