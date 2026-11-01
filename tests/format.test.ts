import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiPrices, fxRate } from '../src/lib/data';
import { formatRate } from '../src/lib/fx';
import {
  formatContextTokens,
  formatCnyPrice,
  formatDualPrice,
  formatPricePair,
  formatUsdPrice,
  priceBasisLabel,
  priceCells,
  provenanceLabel,
} from '../src/lib/format';

describe('价格展示格式化', () => {
  it('渲染已核验的美元价格', () => {
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

  it('渲染人民币价格：整数保留两位，小额保留四位', () => {
    expect(formatCnyPrice(1)).toBe('¥1.00');
    expect(formatCnyPrice(2.1)).toBe('¥2.10');
    expect(formatCnyPrice(0.3)).toBe('¥0.30');
    expect(formatCnyPrice(0.6669)).toBe('¥0.6669');
    expect(formatCnyPrice(null)).toBe('待核验');
    expect(formatCnyPrice(-1)).toBe('待核验');
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

  it('国内厂商标注官方原价，国际厂商主值美元原价、人民币只作估算副行', () => {
    expect(formatDualPrice(1, 'CNY', fxRate)).toBe('¥1.00/1M · 官方原价');
    const usd = formatDualPrice(0.3, 'USD', fxRate);
    expect(usd.startsWith('$0.3/1M')).toBe(true);
    expect(usd).toContain('≈ ¥');
    expect(usd).toContain(`按 ${formatRate(fxRate.rate)} 估算（${fxRate.date}）`);
    expect(usd).not.toContain('官方原价');
  });

  it('缺汇率时美元原价照常输出，人民币位置明说缺失', () => {
    const text = formatDualPrice(0.3, 'USD', null);
    expect(text.startsWith('$0.3/1M')).toBe(true);
    expect(text).toContain('汇率数据缺失');
    expect(text).not.toContain('¥');
  });

  it('单元格：USD 条目主行美元、副行 ≈ 人民币估算（6.6696 / 2026-10-31）', () => {
    const usdCells = priceCells(
      { inputPrice: 0.3, outputPrice: 2.5, cacheReadPrice: null, cacheWritePrice: null, billingCurrency: 'USD' },
      fxRate,
    );
    expect(usdCells.input.main.startsWith('$')).toBe(true);
    expect(usdCells.input.main).toBe('$0.3');
    expect(usdCells.input.sub).toContain('≈');
    expect(usdCells.input.sub).toContain('估算');
    expect(usdCells.input.sub).toContain(fxRate.date);
    expect(usdCells.input.sub).toContain(formatRate(fxRate.rate));
    expect(JSON.stringify(usdCells)).not.toContain('官方原价');
    expect(usdCells.cacheRead.main).toBe('待核验');
  });

  it('单元格：CNY 官方条目主行人民币、副行「官方原价」', () => {
    const cnyCells = priceCells(
      { inputPrice: 1, outputPrice: 4, cacheReadPrice: 0.02, cacheWritePrice: null, billingCurrency: 'CNY' },
      fxRate,
    );
    expect(cnyCells.input).toEqual({ main: '¥1.00', sub: '官方原价' });
    expect(cnyCells.cacheWrite).toEqual({ main: '待核验', sub: '' });
  });

  it('缺汇率时 USD 条目：主行仍是美元原价，副行说明缺失，不抛错也不给 0', () => {
    const cells = () => priceCells(
      { inputPrice: 2, outputPrice: 8, cacheReadPrice: null, cacheWritePrice: null, billingCurrency: 'USD' },
      null,
    );
    expect(cells).not.toThrow();
    const built = cells();
    expect(built.input.main).toBe('$2');
    expect(built.input.sub).toContain('汇率数据缺失');
    expect(built.input.main).not.toContain('¥');
    expect(built.input.sub).not.toContain('¥0');
  });

  it('溯源标注按等级区分文案', () => {
    expect(provenanceLabel({ provenance: 'official', verifiedAt: '2026-10-31', aggregateFetchedAt: null, aggregateSource: null }))
      .toBe('官方核验 · 2026-10-31');
    expect(provenanceLabel({ provenance: 'aggregate', verifiedAt: '2026-10-31', aggregateFetchedAt: '2026-10-31', aggregateSource: 'models.dev' }))
      .toBe('聚合数据 · 未逐条核官方 · models.dev · 抓取于 2026-10-31');
  });

  it('聚合 + 账单 CNY + 报价 USD 的单元标注聚合折算，且按 USD 乘汇率', () => {
    const cells = priceCells(
      {
        inputPrice: 1.9437,
        outputPrice: 10.1671,
        cacheReadPrice: 0.1944,
        cacheWritePrice: 1.9437,
        billingCurrency: 'CNY',
        reportedCurrency: 'USD',
        provenance: 'aggregate',
      },
      fxRate,
    );
    expect(cells.input.main).toBe(`¥${(1.9437 * fxRate.rate).toFixed(2)}`);
    expect(cells.input.main).not.toBe('¥1.94');
    expect(cells.input.sub).toContain('折算');
    expect(cells.input.sub).toContain(formatRate(fxRate.rate));
    expect(JSON.stringify(cells)).not.toContain('官方原价');
    // 国内厂商行不用「估算」措辞：人民币列只在美元条目上写「估算」
    expect(JSON.stringify(cells)).not.toContain('估算');
    expect(priceBasisLabel({ billingCurrency: 'CNY', reportedCurrency: 'USD', provenance: 'aggregate' }, fxRate))
      .not.toContain('官方原价');
    expect(priceBasisLabel({ billingCurrency: 'CNY', reportedCurrency: 'USD', provenance: 'aggregate' }, fxRate))
      .toContain('聚合数据');
  });

  it('聚合 USD 条目标注含「聚合数据」，官方 CNY 条目才标「官方原价」', () => {
    const usdAggregate = priceCells(
      {
        inputPrice: 1,
        outputPrice: 2,
        cacheReadPrice: null,
        cacheWritePrice: null,
        billingCurrency: 'USD',
        reportedCurrency: 'USD',
        provenance: 'aggregate',
      },
      fxRate,
    );
    expect(usdAggregate.input.sub).toContain('聚合数据');
    expect(JSON.stringify(usdAggregate)).not.toContain('官方原价');
    expect(priceBasisLabel({ billingCurrency: 'USD', reportedCurrency: 'USD', provenance: 'aggregate' }, fxRate))
      .toContain('聚合数据');

    expect(priceBasisLabel({ billingCurrency: 'CNY', reportedCurrency: 'CNY', provenance: 'official' }, fxRate))
      .toContain('官方原价');
    expect(priceBasisLabel({ billingCurrency: 'USD', reportedCurrency: 'USD', provenance: 'official' }, fxRate))
      .toContain('汇率估算');
  });

  it('仓库里全部 USD 账单条目：主行美元原价、副行 ≈ 人民币估算，绝不写「官方原价」', () => {
    const usdEntries = apiPrices.filter((entry) => entry.billingCurrency === 'USD');
    expect(usdEntries.length).toBeGreaterThan(0);
    for (const entry of usdEntries) {
      const cells = priceCells(entry, fxRate);
      for (const cell of Object.values(cells)) {
        if (cell.main === '待核验') continue;
        expect(cell.main.startsWith('$')).toBe(true);
        expect(cell.sub).toContain('≈');
        expect(cell.sub).toContain('估算');
        expect(cell.sub).toContain(fxRate.date);
        expect(cell.sub).not.toContain('官方原价');
      }
    }
  });

  it('仓库里全部 CNY 账单条目：主行人民币，且不出现「官方原价 ¥」这种写法', () => {
    const cnyEntries = apiPrices.filter((entry) => entry.billingCurrency === 'CNY');
    expect(cnyEntries.length).toBeGreaterThan(0);
    for (const entry of cnyEntries) {
      const cells = priceCells(entry, fxRate);
      for (const cell of Object.values(cells)) {
        if (cell.main === '待核验') continue;
        expect(cell.main.startsWith('¥')).toBe(true);
        expect(`${cell.main}${cell.sub}`).not.toContain('官方原价 ¥');
      }
      if (entry.reportedCurrency === 'USD') {
        expect(JSON.stringify(cells)).toContain('折算');
        expect(JSON.stringify(cells)).not.toContain('估算');
      }
    }
  });

  it('仓库里全部聚合条目在展示层都不出现「官方原价」', () => {
    const offenders = apiPrices
      .filter((entry) => entry.provenance === 'aggregate')
      .filter((entry) => {
        const cells = priceCells(entry, fxRate);
        const text = `${JSON.stringify(cells)}${priceBasisLabel(entry, fxRate)}`;
        return text.includes('官方原价');
      })
      .map((entry) => entry.id);
    expect(offenders).toEqual([]);
    expect(apiPrices.some((entry) => entry.provenance === 'aggregate')).toBe(true);
  });
});

describe('页面不得直接把 nullable 价格拼进文本', () => {
  // v0.3.0：页面从 Astro 迁到 Vue，扫描目标换成 src/views + src/components，
  // 判据（禁裸插值、禁裸 $ 拼接、四页共用 RATE_DISCLAIMER）一条不改。
  const sourceDirs = [join(process.cwd(), 'src', 'views'), join(process.cwd(), 'src', 'components')];
  const pageSources = sourceDirs.flatMap((dir) =>
    readdirSync(dir)
      .filter((file) => file.endsWith('.vue'))
      .map((file) => ({ file, text: readFileSync(join(dir, file), 'utf8') })),
  );

  it('扫描到了页面文件（防空扫假绿）', () => {
    expect(pageSources.length).toBeGreaterThanOrEqual(6);
  });

  it('没有任何页面用裸插值输出 nullable 价格字段', () => {
    const offenders = pageSources
      .filter(({ text }) => /\{\s*(?:item|price|entry)\.(?:inputPrice|outputPrice|cacheReadPrice|cacheWritePrice|monthlyPrice|contextTokens)\s*\}/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('价格字段只允许出现在格式化函数调用里', () => {
    // estimateCell 与 monthlyCell 同级：都是 lib 里把 nullable 价格算成展示文案的函数
    // （issue #8 的折算列需要 monthlyPrice 才算得出单位成本，逻辑在 lib 不在视图）
    const wrapper = /(priceCells|formatDualPrice|formatCnyPrice|formatUsdPrice|cnyValue|monthlyCell|toCny|formatPricePair|estimateCell)/;
    const offenders = pageSources
      .filter(({ text }) => text
        .split('\n')
        .filter((line) => /\.(?:inputPrice|outputPrice|cacheReadPrice|cacheWritePrice|monthlyPrice)\b/.test(line))
        .some((line) => !wrapper.test(line)))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('页面不出现裸 $ 前缀拼接价格字段', () => {
    const offenders = pageSources
      .filter(({ text }) => /\$\{[^}]*\.(?:inputPrice|outputPrice|monthlyPrice)\b/.test(text))
      .map(({ file }) => file);
    expect(offenders).toEqual([]);
  });

  it('比价表 / 计算器 / 口径 / 来源四页共用同一句汇率免责文案', () => {
    for (const file of ['ApiPricingView.vue', 'CalculatorView.vue', 'MethodologyView.vue', 'SourcesView.vue']) {
      const text = pageSources.find((page) => page.file === file)?.text ?? '';
      expect(text, `${file} 未渲染 RATE_DISCLAIMER`).toMatch(/\{RATE_DISCLAIMER\}/);
      expect(text).toContain("from '../lib/fx'");
    }
  });
});
