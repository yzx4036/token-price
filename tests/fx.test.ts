import { describe, expect, it } from 'vitest';
import { fxRate } from '../src/lib/data';
import { FX_DISCLAIMER, formatCny, formatRate, fxNote, fxSourceLine, toCny } from '../src/lib/fx';

describe('币种换算', () => {
  it('CNY 条目原样返回，不做二次换算', () => {
    expect(toCny(4.5, 'CNY', fxRate)).toBe(4.5);
    expect(toCny(4.5, 'CNY', null)).toBe(4.5);
  });

  it('USD 条目乘以汇率', () => {
    expect(toCny(1, 'USD', fxRate)).toBeCloseTo(fxRate.rate, 10);
    expect(toCny(0.3, 'USD', fxRate)).toBeCloseTo(0.3 * fxRate.rate, 10);
  });

  it('缺价格返回 null，不返回 0', () => {
    expect(toCny(null, 'USD', fxRate)).toBeNull();
    expect(toCny(Number.NaN, 'USD', fxRate)).toBeNull();
    expect(toCny(-1, 'CNY', fxRate)).toBeNull();
  });

  it('缺汇率或汇率非法时抛错（fail closed）', () => {
    expect(() => toCny(1, 'USD', null)).toThrow(/汇率/);
    expect(() => toCny(1, 'USD', { ...fxRate, rate: 0 })).toThrow(/汇率/);
    expect(() => toCny(1, 'USD', { ...fxRate, rate: Number.NaN })).toThrow(/汇率/);
  });

  it('汇率标注文案包含四位小数与日期', () => {
    // 汇率是每日定时刷新的数据，断言具体数值会让「数据刷新」和「代码正确」绑死：
    // 定时任务一提交新汇率，test 就挂，自动发布随之失败（2026-11-01 实际发生过）。
    // 这里只锁「格式契约」——四位小数 + ISO 日期，数值本身由数据层校验负责。
    expect(formatRate(fxRate.rate)).toMatch(/^\d+\.\d{4}$/);
    expect(fxRate.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(fxNote(fxRate)).toBe(`按 ${formatRate(fxRate.rate)} 估算（${fxRate.date}）`);
    expect(fxNote(null)).toMatch(/缺少汇率/);
  });

  it('汇率来源行与免责声明可供页面直接渲染', () => {
    expect(fxSourceLine(fxRate)).toContain(fxRate.source);
    expect(fxSourceLine(fxRate)).toContain(fxRate.date);
    expect(FX_DISCLAIMER).toBe('汇率非实时，仅用于横向比较');
    expect(formatCny(0.02)).toBe('¥0.02');
  });
});
