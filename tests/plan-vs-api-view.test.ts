import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * v0.6.0 / issue #6「套餐与 API 折算对比」的视图层守卫。
 *
 * 这两处改动最容易在后续重构中被静默丢掉，而且丢了不会报错、只会少显示一栏：
 *   1) 套餐详情里的「等效 API 用量」必须与「额度原文（厂商披露）」并存且标注来源
 *   2) 计算器页必须有「订阅 vs 按量」对比区
 */
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

describe('套餐详情：等效 API 用量', () => {
  const plans = read('src/views', 'PlansView.vue');

  it('表格与卡片两种形态都渲染等效用量', () => {
    // 只数 <dt> 标签：注释里也提到这个词，按纯文本数会虚高
    const hits = plans.match(/<dt>保本点（订阅 vs 按量）<\/dt>/g) ?? [];
    // 桌面表格 + 移动卡片各一处，少一处就有一半用户看不到
    expect(hits.length).toBe(2);
  });

  it('「额度原文」必须标注为厂商披露，与反推值区分', () => {
    const hits = plans.match(/\{\{ ALLOWANCE_SOURCE_LABEL \}\}（厂商披露）/g) ?? [];
    expect(hits.length).toBe(2);
    // 若只剩「额度原文」而无「（厂商披露）」后缀，读者会把反推量当成厂商公布的额度
    expect(plans).not.toMatch(/<dt>\{\{ ALLOWANCE_SOURCE_LABEL \}\}<\/dt>/);
  });

  it('无基准模型时给出可读说明，不留空白', () => {
    expect(plans).toContain('无同厂商按量 API 条目可比');
  });

  it('视图不直接读月费字段算折算（口径必须走 lib）', () => {
    // 折算列已有守卫禁止直接读价格；这里补一条同类的：保本点也必须来自 lib
    expect(plans).toContain('computeBreakEven');
    expect(plans).toContain('pickBasisModel');
    expect(plans).toContain('breakEvenSentence');
  });
});

describe('计算器页：订阅 vs 按量', () => {
  const calc = read('src/views', 'CalculatorView.vue');

  it('对比区与标题都存在', () => {
    expect(calc).toContain('plan-compare');
    expect(calc).toContain('订阅套餐 vs 按量付费');
  });

  it('说清按量成本的口径（输入+输出，不含缓存）', () => {
    // 不说清口径，读者会拿计算器主结果（含缓存）来对，发现对不上就以为算错了
    expect(calc).toContain('不含缓存读写费用');
  });

  it('说明跨币种不比较、免费档不参与', () => {
    expect(calc).toContain('跨币种不做比较');
    expect(calc).toContain('免费档没有月费');
  });

  it('默认只展开部分行，提供展开全部', () => {
    expect(calc).toContain('showAllComparisons');
    expect(calc).toContain('展开全部');
  });

  it('对比复用统一解析与换算，不另写一套', () => {
    expect(calc).toContain('parseUsageInput');
    expect(calc).toContain('toMillion');
    expect(calc).toContain('comparePlansForUsage');
  });
});

describe('样式：区分反推值与官方值', () => {
  const css = read('src', 'styles', 'global.css');

  it('breakeven-row 有视觉区分（左侧竖线），不能与普通行长得一样', () => {
    expect(css).toContain('.detail-list .breakeven-row');
    expect(css).toMatch(/\.detail-list \.breakeven-row\s*\{[^}]*border-left/);
  });

  it('算不出时整行降级为灰色（类挂在行级 div 上，不是 dd）', () => {
    // 踩过的坑：最初把 breakeven-none 加在 <dd> 上，但 border-left-color 是
    // 画在行级 div 上的，加在 dd 上样式完全不生效，两种状态长得一样
    expect(css).toContain('.detail-list .breakeven-row.breakeven-none');
    const plans = read('src', 'views', 'PlansView.vue');
    expect(plans).toContain(`class="breakeven-row" :class="{ 'breakeven-none': !plan.hasBreakEven }"`);
    // dd 上不许再挂这个类
    expect(plans).not.toMatch(/<dd :class="\{ 'breakeven-none'/);
  });

  it('保本点与官方折算并存时，必须补「用满值多少钱」把两者串起来', () => {
    // 实测智谱 Coding Plan Lite：官方额度折算 338M，保本点只有 23.6M（差 14 倍）。
    // 两个数并排不解释，读者一定认为其中一个算错 —— 所以必须有这句桥接文案
    const view = read('src', 'views', 'PlansView.vue');
    expect(view).toContain('allowanceWorth');
    expect(view).toContain('allowanceValueSentence');
    expect(css).toContain('.breakeven-worth');
  });

  it('暗色主题下 ghost 按钮文字必须可见（透明底不能配深字）', () => {
    // 踩过的坑：暗色块里 `.button { color: #08111f }` 是为「浅蓝底实心按钮」配的深字，
    // ghost 按钮是透明底，继承深字后落在深色页面背景上等于隐形 ——
    // 计算器页「展开全部」按钮因此渲染成一个空框（实测 computed color rgb(8,17,31)）
    const dark = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    expect(dark).toMatch(/\.button-ghost\s*\{[^}]*color:\s*var\(--brand\)/);
  });

  it('对比行按胜出侧上色', () => {
    expect(css).toContain('.plan-compare-row.winner-plan');
    expect(css).toContain('.plan-compare-row.winner-tie');
  });

  it('窄屏下对比行改为单列，避免数字被挤出视口', () => {
    const narrow = css.slice(css.indexOf('.plan-compare-row.winner-tie'));
    expect(narrow).toMatch(/@media \(max-width: 767px\)[\s\S]{0,400}\.plan-compare-row\s*\{\s*grid-template-columns: minmax\(0, 1fr\)/);
  });
});
