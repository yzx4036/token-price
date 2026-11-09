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
  modelLabel,
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
      expect(text).toBe('缺价');
      expect(text).not.toMatch(/null|undefined|NaN/);
    }
  });

  it('渲染人民币价格：整数保留两位，小额保留四位', () => {
    expect(formatCnyPrice(1)).toBe('¥1.00');
    expect(formatCnyPrice(2.1)).toBe('¥2.10');
    expect(formatCnyPrice(0.3)).toBe('¥0.30');
    expect(formatCnyPrice(0.6669)).toBe('¥0.6669');
    expect(formatCnyPrice(null)).toBe('缺价');
    expect(formatCnyPrice(-1)).toBe('缺价');
  });

  it('上下文长度缺值渲染占位文案（用「未公开」，与价格的「缺价」区分）', () => {
    expect(formatContextTokens(1_000_000)).toBe('1M');
    expect(formatContextTokens(null)).toBe('未公开');
    expect(formatContextTokens(0)).toBe('未公开');
  });

  it('摘要行同时处理两处缺价', () => {
    expect(formatPricePair(0.3, 2.5)).toBe('输入 $0.3/1M · 输出 $2.5/1M');
    expect(formatPricePair(null, 2.5)).toBe('输入 缺价/1M · 输出 $2.5/1M');
    expect(formatPricePair(null, null)).not.toMatch(/null|undefined/);
  });

  it('国内厂商标注官方标价，国际厂商主值美元标价、人民币只作估算副行', () => {
    expect(formatDualPrice(1, 'CNY', fxRate)).toBe('¥1.00/1M · 官方标价');
    const usd = formatDualPrice(0.3, 'USD', fxRate);
    expect(usd.startsWith('$0.3/1M')).toBe(true);
    expect(usd).toContain('≈ ¥');
    expect(usd).toContain(`按 ${formatRate(fxRate.rate)} 估算（${fxRate.date}）`);
    expect(usd).not.toContain('官方标价');
  });

  it('缺汇率时美元标价照常输出，人民币位置明说缺失', () => {
    const text = formatDualPrice(0.3, 'USD', null);
    expect(text.startsWith('$0.3/1M')).toBe(true);
    expect(text).toContain('汇率数据缺失');
    expect(text).not.toContain('¥');
  });

  it('单元格：USD 条目主行美元、副行只留 ≈ 人民币（汇率与日期上提到表级）', () => {
    const usdCells = priceCells(
      { inputPrice: 0.3, outputPrice: 2.5, cacheReadPrice: null, cacheWritePrice: null, billingCurrency: 'USD' },
      fxRate,
    );
    expect(usdCells.input.main.startsWith('$')).toBe(true);
    expect(usdCells.input.main).toBe('$0.3');
    expect(usdCells.input.sub).toContain('≈');
    // 估算日期不再逐格重复：表级 FX_TABLE_NOTE 写一次，单元格只留数值
    expect(usdCells.input.sub).not.toContain(fxRate.date);
    expect(usdCells.input.sub).not.toContain('估算');
    expect(JSON.stringify(usdCells)).not.toContain('官方标价');
    expect(usdCells.cacheRead.main).toBe('缺价');
  });

  it('单元格：CNY 官方条目主行人民币、副行「官方标价」', () => {
    const cnyCells = priceCells(
      { inputPrice: 1, outputPrice: 4, cacheReadPrice: 0.02, cacheWritePrice: null, billingCurrency: 'CNY' },
      fxRate,
    );
    expect(cnyCells.input).toEqual({ main: '¥1.00', sub: '官方标价' });
    expect(cnyCells.cacheWrite).toEqual({ main: '缺价', sub: '' });
  });

  it('缺汇率时 USD 条目：主行仍是美元标价，副行说明缺失，不抛错也不给 0', () => {
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
      .toBe('官方页抓取 · 2026-10-31');
    expect(provenanceLabel({ provenance: 'aggregate', verifiedAt: '2026-10-31', aggregateFetchedAt: '2026-10-31', aggregateSource: 'models.dev' }))
      .toBe('聚合数据 · 未核官方页 · models.dev · 抓取于 2026-10-31');
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
    expect(JSON.stringify(cells)).not.toContain('官方标价');
    // 国内厂商行不用「估算」措辞：人民币列只在美元条目上写「估算」
    expect(JSON.stringify(cells)).not.toContain('估算');
    expect(priceBasisLabel({ billingCurrency: 'CNY', reportedCurrency: 'USD', provenance: 'aggregate' }, fxRate))
      .not.toContain('官方标价');
    expect(priceBasisLabel({ billingCurrency: 'CNY', reportedCurrency: 'USD', provenance: 'aggregate' }, fxRate))
      .toContain('聚合数据');
  });

  it('聚合 USD 条目标注含「聚合数据」，官方 CNY 条目才标「官方标价」', () => {
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
    expect(JSON.stringify(usdAggregate)).not.toContain('官方标价');
    expect(priceBasisLabel({ billingCurrency: 'USD', reportedCurrency: 'USD', provenance: 'aggregate' }, fxRate))
      .toContain('聚合数据');

    expect(priceBasisLabel({ billingCurrency: 'CNY', reportedCurrency: 'CNY', provenance: 'official' }, fxRate))
      .toContain('官方标价');
    expect(priceBasisLabel({ billingCurrency: 'USD', reportedCurrency: 'USD', provenance: 'official' }, fxRate))
      .toContain('汇率估算');
  });

  it('仓库里全部 USD 账单条目：主行美元标价、副行 ≈ 人民币，绝不写「官方标价」也不重复日期', () => {
    const usdEntries = apiPrices.filter((entry) => entry.billingCurrency === 'USD');
    expect(usdEntries.length).toBeGreaterThan(0);
    for (const entry of usdEntries) {
      const cells = priceCells(entry, fxRate);
      for (const cell of Object.values(cells)) {
        if (cell.main === '缺价') continue;
        expect(cell.main.startsWith('$')).toBe(true);
        expect(cell.sub).toContain('≈');
        expect(cell.sub).not.toContain('估算');
        expect(cell.sub).not.toContain(fxRate.date);
        expect(cell.sub).not.toContain('官方标价');
      }
    }
  });

  it('仓库里全部 CNY 账单条目：主行人民币，且不出现「官方标价 ¥」这种写法', () => {
    const cnyEntries = apiPrices.filter((entry) => entry.billingCurrency === 'CNY');
    expect(cnyEntries.length).toBeGreaterThan(0);
    for (const entry of cnyEntries) {
      const cells = priceCells(entry, fxRate);
      for (const cell of Object.values(cells)) {
        if (cell.main === '缺价') continue;
        expect(cell.main.startsWith('¥')).toBe(true);
        expect(`${cell.main}${cell.sub}`).not.toContain('官方标价 ¥');
      }
      if (entry.reportedCurrency === 'USD') {
        expect(JSON.stringify(cells)).toContain('折算');
        expect(JSON.stringify(cells)).not.toContain('估算');
      }
    }
  });

  it('仓库里全部聚合条目在展示层都不出现「官方标价」', () => {
    const offenders = apiPrices
      .filter((entry) => entry.provenance === 'aggregate')
      .filter((entry) => {
        const cells = priceCells(entry, fxRate);
        const text = `${JSON.stringify(cells)}${priceBasisLabel(entry, fxRate)}`;
        return text.includes('官方标价');
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
      expect(text, `${file} 未渲染 RATE_DISCLAIMER`).toMatch(/\{\{\s*RATE_DISCLAIMER\s*\}\}/);
      expect(text).toContain("from '../lib/fx'");
    }
  });
});

describe('modelLabel：厂商名与模型名不重复拼接', () => {
  it('厂商末词与模型首词相同（连字符 / 大小写 / 空白三种边界）只保留一次', () => {
    expect(modelLabel('智谱 GLM', 'GLM-5.3')).toBe('智谱 GLM-5.3');
    expect(modelLabel('智谱 GLM', 'GLM-Z1-FlashX')).toBe('智谱 GLM-Z1-FlashX');
    expect(modelLabel('xAI Grok', 'grok-4.7（prompt<200K）')).toBe('xAI Grok-4.7（prompt<200K）');
    expect(modelLabel('MiniMax', 'MiniMax-M3.1-Flash')).toBe('MiniMax-M3.1-Flash');
    expect(modelLabel('月之暗面 Kimi', 'Kimi K3.1 Pro')).toBe('月之暗面 Kimi K3.1 Pro');
  });

  it('不重复时原样拼接，不做任何猜测', () => {
    expect(modelLabel('Anthropic', 'Claude Fable 5.1')).toBe('Anthropic Claude Fable 5.1');
    expect(modelLabel('OpenAI', 'GPT-6 Astra')).toBe('OpenAI GPT-6 Astra');
    // 厂商末词是「AI」，不是模型首词「Mistral」：判据只看末词，不猜品牌别名
    expect(modelLabel('Mistral AI', 'Mistral Small 4')).toBe('Mistral AI Mistral Small 4');
  });

  it('空值不抛异常、不产出多余空格', () => {
    expect(modelLabel('', 'GLM-5.3')).toBe('GLM-5.3');
    expect(modelLabel('智谱 GLM', '')).toBe('智谱 GLM');
  });

  it('全量数据：命中去重的条数与独立判据一致，且没有任何标签出现相邻重复词', () => {
    // 期望值在测试里独立算一遍（不复用 modelLabel 的实现），否则等于自证
    const shouldDedupe = (provider: string, model: string): boolean => {
      const lastWord = provider.trim().split(/\s+/).pop() ?? '';
      if (!lastWord) return false;
      const rest = model.trim().slice(lastWord.length);
      const sameHead = model.trim().slice(0, lastWord.length).toLowerCase() === lastWord.toLowerCase();
      return sameHead && /^([\s\-_/（(]|$)/.test(rest);
    };
    const expected = apiPrices.filter((entry) => shouldDedupe(entry.provider, entry.model)).length;
    const deduped = apiPrices.filter((entry) => modelLabel(entry.provider, entry.model) !== `${entry.provider} ${entry.model}`).length;
    expect(expected).toBeGreaterThan(0);
    expect(deduped).toBe(expected);

    const repeated: string[] = [];
    for (const entry of apiPrices) {
      const label = modelLabel(entry.provider, entry.model);
      const lastWord = entry.provider.trim().split(/\s+/).pop() ?? '';
      if (lastWord && new RegExp(`${lastWord}\\s+${lastWord}`, 'i').test(label)) repeated.push(label);
    }
    expect(repeated).toEqual([]);
  });
});
