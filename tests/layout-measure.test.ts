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

/**
 * 信息密度守卫（v0.6.0）。
 *
 * 实测基线（1440×900 真实 Chrome）：API 行高 68px → 首屏只能完整看到 7 行，
 * 套餐行高 65px 超过 60px 上限。压完行距与 padding 后 API 58px / 套餐 57px，
 * 两页首屏都是 8 行。
 *
 * 这里锁的是**决定行高的那几个量**，不是最终像素：像素要靠浏览器量，
 * 而这几个量一旦回退（line-height 1.3 / padding 4px），行高必然跟着回去。
 */
describe('表格信息密度（首屏 8 行 / 单行 ≤60px 的结构前提）', () => {
  it('表格单元格上下 padding ≤2px', () => {
    const body = ruleBody('.pricing-table td, .plan-table td');
    const m = body.match(/padding:\s*(\d+)px\s+(\d+)px/);
    expect(m, '找不到 td 的 padding 声明').not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(2);
  });

  it('主列三行（厂商 / 模型 / 元信息）行距 ≤1.2', () => {
    for (const selector of ['.cell-provider', '.cell-model-name', '.cell-meta']) {
      const body = ruleBody(selector);
      const m = body.match(/line-height:\s*([0-9.]+)/);
      expect(m, `${selector} 缺少 line-height`).not.toBeNull();
      expect(Number(m![1])).toBeLessThanOrEqual(1.2);
    }
  });

  it('价格副行行距 ≤1.25（它常折成两行，是第二大行高来源）', () => {
    const body = ruleBody('.cell-price .price-sub');
    const m = body.match(/line-height:\s*([0-9.]+)/);
    expect(m, '找不到价格副行 line-height').not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(1.25);
  });

  it('压行高不得靠缩小字号（字号归 font-size.test.ts 管，这里只防倒退手法）', () => {
    // 主列字号必须仍是 1rem / .96rem / .88rem —— 压密度只许动 line-height 与 padding
    expect(ruleBody('.cell-provider')).toContain('font-size: 1rem');
    expect(ruleBody('.cell-model-name')).toContain('font-size: .96rem');
    expect(ruleBody('.cell-meta')).toContain('font-size: .88rem');
  });
});

/**
 * 页脚常驻（v0.5.1，issue #11）。
 *
 * 需求是「页脚浮在内容之上，让二维码一直可见」。实测落点：
 * - 桌面 1440x900：footer 高 157px，sticky bottom 后 top 恒为 743，六个路由三个滚动位置都常驻
 * - 移动端 375x667：footer 254px（占屏 38%），必须保持 static，
 *   否则吃掉四成正文区；而且手机无法扫自己屏幕上的二维码，常驻没有收益
 */
describe('页脚常驻策略（issue #11）', () => {
  /** 取出所有 @media (min-width: 1024px) 块的完整内容（花括号配对，不能用 indexOf 猜） */
  function desktopMediaBlocks(source: string): string[] {
    const blocks: string[] = [];
    const re = /@media\s*\(min-width:\s*1024px\)\s*\{/g;
    for (let m = re.exec(source); m; m = re.exec(source)) {
      const start = m.index + m[0].length;
      let depth = 1;
      let i = start;
      while (i < source.length && depth > 0) {
        if (source[i] === '{') depth += 1;
        else if (source[i] === '}') depth -= 1;
        i += 1;
      }
      blocks.push(source.slice(start, i - 1));
    }
    return blocks;
  }

  it('只在桌面断点启用 sticky，移动端保持静态', () => {
    // 文件里有多个 1024px 断点，必须找出「含 .site-footer 且带 sticky」的那一个，
    // 不能简单 slice 第一个 —— 之前这样写过，抓到的是无关的 media block
    const stickyFooterBlocks = desktopMediaBlocks(css).filter(
      (b) => b.includes('.site-footer') && b.includes('position: sticky'),
    );
    expect(stickyFooterBlocks, '缺少 @media (min-width: 1024px) 里的 .site-footer sticky 规则').toHaveLength(1);

    const rule = stickyFooterBlocks[0];
    expect(rule).toContain('bottom: 0');

    // 反证：不能出现在无条件的全局位置，否则手机上也会常驻
    const globalRule = css.slice(css.indexOf('.site-footer {'), css.indexOf('}', css.indexOf('.site-footer {')));
    expect(globalRule).not.toContain('sticky');
  });

  it('不用 fixed（fixed 需要手工补 padding，猜错就永久遮住末行）', () => {
    const idx = css.indexOf('.site-footer {');
    expect(idx).toBeGreaterThan(-1);
    const mainRule = css.slice(idx, css.indexOf('}', idx));
    expect(mainRule).not.toContain('position: fixed');
    // 全文件也不许对 footer 用 fixed
    expect(css).not.toMatch(/\.site-footer[^{]*\{[^}]*position:\s*fixed/);
  });

  it('常驻层要盖过表格行内浮层与页头，否则会被压住', () => {
    // 表格详情浮层 z-index: 15，页头 z-index: 20 —— footer 必须更高
    expect(css).toContain('z-index: 15');
    expect(css).toContain('z-index: 20');
    const block = desktopMediaBlocks(css).find(
      (b) => b.includes('.site-footer') && b.includes('position: sticky'),
    )!;
    const rule = block.slice(block.indexOf('.site-footer {'), block.indexOf('}', block.indexOf('.site-footer {')));
    const z = Number(rule.match(/z-index:\s*(\d+)/)?.[1] ?? 0);
    expect(z).toBeGreaterThanOrEqual(25);
  });
});
