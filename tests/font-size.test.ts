import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8');

/** 取出所有 font-size: <n>rem 声明 */
function remSizes(source: string): number[] {
  return [...source.matchAll(/font-size:\s*([0-9.]+)rem/g)].map((m) => Number(m[1]));
}

describe('字号下限', () => {
  it('没有任何字形小于 0.7rem（11.2px）', () => {
    // 0.6rem = 9.6px 在 320 屏上基本看不清。历史上 .58rem/.62rem 曾出现在
    // 结论卡与表格副行里，读者反馈「看着累」，2026-11 整体上调后加这条兜底。
    const tiny = remSizes(css).filter((size) => size < 0.7);
    expect(tiny).toEqual([]);
  });

  it('表格正文不小于 0.9rem（14.4px）', () => {
    // 表格是本站的主阅读面，正文比这更小就不该叫比价表了
    const bodyCell = css.match(/\.cell-price \.price-main \{[^}]*font-size:\s*([0-9.]+)rem/);
    expect(bodyCell, '找不到价格主行字号').not.toBeNull();
    expect(Number(bodyCell![1])).toBeGreaterThanOrEqual(0.9);
  });

  it('币种折算副行不小于 0.76rem（12.2px）', () => {
    // 副行承载「≈ ¥x · 按 6.6696 估算（日期）」，是数据纪律的一部分，
    // 小到看不清等于没写，但也不能大到抢主价的位置
    const sub = css.match(/\.cell-price \.price-sub \{[^}]*font-size:\s*([0-9.]+)rem/);
    expect(sub, '找不到价格副行字号').not.toBeNull();
    expect(Number(sub![1])).toBeGreaterThanOrEqual(0.76);
    expect(Number(sub![1])).toBeLessThan(0.9);
  });

  it('移动端压缩只动行高与留白，不回退字号', () => {
    // 移动端为了首屏见价格会压 spacing。允许压 padding/margin/gap/line-height，
    // 不允许在媒体查询里把 font-size 调小 —— 那等于「小屏用户看得累」。
    const mobileBlocks = [...css.matchAll(/@media[^{]*max-width[^{]*\{([\s\S]*?)\n\}/g)].map((m) => m[1]);
    expect(mobileBlocks.length).toBeGreaterThan(0);
    for (const block of mobileBlocks) {
      const sizes = remSizes(block);
      // 媒体查询里只允许「维持或放大」：不许出现小于主规则下限的值
      const tooSmall = sizes.filter((s) => s < 0.7);
      expect(tooSmall).toEqual([]);
    }
  });
});

describe('国际版标注', () => {
  it('徽章样式存在且是虚线描边（不是实心荣誉标记）', () => {
    const rule = css.match(/\.market-badge \{[^}]*\}/);
    expect(rule, '缺少 .market-badge 样式').not.toBeNull();
    expect(rule![0]).toContain('dashed');
  });

  it('徽章文案不小于 0.76rem（12.2px）', () => {
    const rule = css.match(/\.market-badge \{[^}]*font-size:\s*([0-9.]+)rem/);
    expect(rule, '徽章没有独立字号').not.toBeNull();
    expect(Number(rule![1])).toBeGreaterThanOrEqual(0.76);
  });
});
