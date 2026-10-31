import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { formatContextTokens, formatPricePair, formatUsdPrice } from '../src/lib/format';

describe('价格展示格式化', () => {
  it('渲染已核验价格', () => {
    expect(formatUsdPrice(0.3)).toBe('$0.3');
    expect(formatUsdPrice(2.5)).toBe('$2.5');
    expect(formatUsdPrice(0.003)).toBe('$0.003');
    expect(formatUsdPrice(0)).toBe('$0');
  });

  it('缺价与非法值一律渲染占位文案，绝不出现 $null', () => {
    for (const value of [null, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const text = formatUsdPrice(value as number | null);
      expect(text).toBe('待核验');
      expect(text).not.toMatch(/null|undefined|NaN/);
    }
  });

  it('上下文长度缺值渲染占位文案', () => {
    expect(formatContextTokens(1_000_000)).toBe('1M');
    expect(formatContextTokens(null)).toBe('待核验');
    expect(formatContextTokens(0)).toBe('待核验');
  });

  it('摘要行同时处理两处缺价', () => {
    expect(formatPricePair(0.3, 2.5)).toBe('输入 $0.3/1M · 输出 $2.5/1M');
    expect(formatPricePair(null, 2.5)).toBe('输入 待核验/1M · 输出 $2.5/1M');
    expect(formatPricePair(null, null)).not.toMatch(/null|undefined/);
  });
});

describe('页面不得直接把 nullable 价格拼进文本', () => {
  const pagesDir = join(process.cwd(), 'src', 'pages');
  const pageSources = readdirSync(pagesDir)
    .filter((file) => file.endsWith('.astro'))
    .map((file) => ({ file, text: readFileSync(join(pagesDir, file), 'utf8') }));

  it('扫描到了页面文件（防空扫假绿）', () => {
    expect(pageSources.length).toBeGreaterThanOrEqual(5);
  });

  it('没有任何页面在文本模板里直接插值 nullable 价格字段', () => {
    const offenders = pageSources
      .filter(({ text }) => /\$\{(?:item|price)\.(?:inputPrice|outputPrice|cacheReadPrice|cacheWritePrice|contextTokens|monthlyPrice)\}/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('页面也不再用裸 $ 前缀拼接价格字段', () => {
    const offenders = pageSources
      .filter(({ text }) => /\$\{.*(?:inputPrice|outputPrice|monthlyPrice)\}/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });
});
