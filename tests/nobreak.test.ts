import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitUnbreakableTail } from '../src/lib/format';

describe('副行尾部不可断片段', () => {
  it('切出尾部全角括号里的日期', () => {
    const r = splitUnbreakableTail('≈ ¥0.25 · 按 6.6696 估算（2026-10-31）');
    expect(r.tail).toBe('（2026-10-31）');
    expect(r.head).toBe('≈ ¥0.25 · 按 6.6696 估算');
    // 拼回去必须与原文逐字相同（切分不许改字）
    expect(r.head + r.tail).toBe('≈ ¥0.25 · 按 6.6696 估算（2026-10-31）');
  });

  it('切出裸的 YYYY-MM-DD（核验于 2026-10-31）', () => {
    const r = splitUnbreakableTail('核验于 2026-10-31');
    expect(r.tail).toBe('2026-10-31');
    expect(r.head).toBe('核验于 ');
  });

  it('没有日期时整段当 head、tail 为空（视图走纯文本分支）', () => {
    for (const text of ['官方标价', '聚合数据', '无额度数值', '待核验', '']) {
      const r = splitUnbreakableTail(text);
      expect(r.tail).toBe('');
      expect(r.head).toBe(text);
    }
  });

  it('多个括号只切最后一组，前面的括号留在 head', () => {
    const r = splitUnbreakableTail('按 6.6696 折算（说明）（2026-10-31）');
    expect(r.tail).toBe('（2026-10-31）');
    expect(r.head).toBe('按 6.6696 折算（说明）');
  });

  it('日期不在尾部时不切（避免把中间日期钉死导致整行溢出）', () => {
    const r = splitUnbreakableTail('2026-10-31 更新 · 官方标价');
    expect(r.tail).toBe('');
  });

  it('聚合源折算那种长副行也能切对', () => {
    const r = splitUnbreakableTail('聚合数据 · 聚合源 USD 折算 · 汇率 6.6696（2026-10-31）');
    expect(r.tail).toBe('（2026-10-31）');
    expect(r.head.endsWith('6.6696')).toBe(true);
  });

  it('不引入非 ASCII 连字符：数据里的日期仍是 YYYY-MM-DD', () => {
    // 复制粘贴出去必须是普通连字符 U+002D，不能是 U+2011
    const r = splitUnbreakableTail('≈ ¥0.25（2026-10-31）');
    expect(r.tail).toContain('2026-10-31');
    expect(r.tail).not.toContain('\u2011');
    expect(r.tail).not.toContain('\u2060');
  });
});

describe('视图确实用 SubLine 渲染副行', () => {
  const files = ['src/components/PriceTable.vue', 'src/components/PriceCard.vue', 'src/views/PlansView.vue'];

  it('三个渲染点都引入了 SubLine', () => {
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      expect(src, `${rel} 没有引入 SubLine`).toMatch(/import SubLine from/);
    }
  });

  it('price-sub 里不再直接插值副行字符串（否则又会被劈开）', () => {
    // 反例形态：<span class="price-sub">{{ cell.sub }}</span>
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      const raw = src.match(/class="price-sub">\{\{/g) ?? [];
      expect(raw, `${rel} 里有 ${raw.length} 处绕过 SubLine 的裸插值`).toEqual([]);
    }
  });

  it('.nobreak 是 nowrap，不是别的（写成 normal 等于没修）', () => {
    const css = readFileSync(join(process.cwd(), 'src/styles/global.css'), 'utf8');
    const rule = css.match(/\.nobreak \{[^}]*\}/);
    expect(rule, '缺少 .nobreak 规则').not.toBeNull();
    expect(rule![0]).toContain('white-space: nowrap');
  });
});
