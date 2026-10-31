import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiPrices, fxRate } from '../src/lib/data';

type CalculatorValues = Record<'model' | 'input' | 'output' | 'cacheRead' | 'cacheWrite', string>;

async function runCalculator(values: CalculatorValues, fx: typeof fxRate | null = fxRate) {
  const form = { addEventListener: vi.fn() };
  const dataNode = { textContent: JSON.stringify({ models: apiPrices, fx }) };
  const output = { textContent: '' };
  const sub = { textContent: '' };
  const detail = { textContent: '' };
  const nodes: Record<string, unknown> = {
    '#cost-form': form,
    '#calculator-data': dataNode,
    '#cost-result': output,
    '#cost-sub': sub,
    '#cost-detail': detail,
  };

  vi.stubGlobal('document', { querySelector: (selector: string) => nodes[selector] ?? null });
  vi.stubGlobal('FormData', class {
    get(key: string) {
      return values[key as keyof CalculatorValues] ?? null;
    }
  });
  vi.resetModules();
  await import('../src/scripts/calculator');
  return { output, sub, detail };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('计算器客户端脚本', () => {
  it('空白输入显示 fail-closed 提示', async () => {
    const result = await runCalculator({
      model: 'google-gemini-3-5-flash-lite',
      input: '',
      output: '0',
      cacheRead: '0',
      cacheWrite: '0',
    });
    expect(result.output.textContent).toBe('无法完整计算');
    expect(result.detail.textContent).toMatch(/必须填写/);
  });

  it('USD 模型：主值美元，副值 ≈ 人民币（带汇率与日期）', async () => {
    const result = await runCalculator({
      model: 'google-gemini-3-5-flash-lite',
      input: '3000000',
      output: '0',
      cacheRead: '0',
      cacheWrite: '0',
    });
    expect(result.output.textContent.startsWith('$')).toBe(true);
    expect(result.output.textContent).toBe('$0.90');
    expect(result.sub.textContent).toContain('≈ ¥');
    expect(result.sub.textContent).toContain('估算');
    expect(result.sub.textContent).toContain(String(fxRate.date));
    expect(result.detail.textContent).toContain('USD');
  });

  it('国内厂商直接显示人民币官方原价，且不带估算标注', async () => {
    const cnyEntry = apiPrices.find((item) => item.billingCurrency === 'CNY' && item.reportedCurrency === 'CNY' && item.id === 'deepseek-deepseek-flash-idle')!;
    const result = await runCalculator({
      model: cnyEntry.id,
      input: '1000000',
      output: '0',
      cacheRead: '0',
      cacheWrite: '0',
    });
    expect(result.output.textContent.startsWith('¥')).toBe(true);
    expect(result.output.textContent).toBe('¥1.00');
    expect(result.sub.textContent).toContain('官方原价');
    expect(`${result.output.textContent}${result.sub.textContent}`).not.toContain('≈');
    expect(`${result.output.textContent}${result.sub.textContent}`).not.toContain('估算');
  });

  it('缺汇率时美元结果照常给出，人民币位置说明「汇率缺失，无法估算」', async () => {
    const result = await runCalculator({
      model: 'google-gemini-3-5-flash-lite',
      input: '1000000',
      output: '0',
      cacheRead: '0',
      cacheWrite: '0',
    }, null);
    expect(result.output.textContent.startsWith('$')).toBe(true);
    expect(result.output.textContent).toBe('$0.30');
    expect(result.sub.textContent).toBe('汇率缺失，无法估算');
    expect(result.detail.textContent).toContain('汇率');
  });

  it('缺汇率且模型是人民币条目时完全不需要汇率，不报错', async () => {
    const cnyEntry = apiPrices.find((item) => item.billingCurrency === 'CNY' && item.reportedCurrency === 'CNY' && item.id === 'deepseek-deepseek-flash-idle')!;
    const result = await runCalculator({
      model: cnyEntry.id,
      input: '1000000',
      output: '0',
      cacheRead: '0',
      cacheWrite: '0',
    }, null);
    expect(result.output.textContent).toBe('¥1.00');
    expect(result.sub.textContent).toContain('官方原价');
    expect(result.detail.textContent).not.toContain('汇率缺失');
  });
});

describe('API 表格客户端脚本', () => {
  it('按筛选结果重排行并隐藏不匹配行', async () => {
    const rows = apiPrices.map((item) => ({ dataset: { id: item.id }, hidden: false }));
    const appended: string[] = [];
    const form = { addEventListener: vi.fn() };
    const body = {
      querySelectorAll: () => rows,
      append: (row: (typeof rows)[number]) => appended.push(row.dataset.id),
    };
    const empty = { hidden: true };
    const nodes: Record<string, unknown> = {
      '#api-controls': form,
      '#api-rows': body,
      '#api-data': { textContent: JSON.stringify({ models: apiPrices, fx: fxRate }) },
      '#api-empty': empty,
    };

    vi.stubGlobal('document', { querySelector: (selector: string) => nodes[selector] ?? null });
    vi.stubGlobal('FormData', class {
      get(key: string) {
        return { query: 'GEMINI', provider: 'google', provenance: 'all', sort: 'outputPrice' }[
          key as 'query' | 'provider' | 'provenance' | 'sort'
        ] ?? null;
      }
    });
    vi.resetModules();
    await import('../src/scripts/api-table');

    const googleIds = apiPrices.filter((item) => item.providerId === 'google').map((item) => item.id);
    expect(appended).toHaveLength(googleIds.length);
    expect(appended.every((id) => googleIds.includes(id))).toBe(true);
    // 最便宜的 Google 输出价（Gemini 2.5 Flash-Lite，$0.40）应排在首位
    expect(appended[0]).toBe('google-gemini-2-5-flash-lite');
    expect(rows.find((row) => row.dataset.id === 'google-gemini-2-5-flash-lite')?.hidden).toBe(false);
    expect(rows.filter((row) => row.dataset.id === 'deepseek-deepseek-flash-idle').every((row) => row.hidden)).toBe(true);
    expect(empty.hidden).toBe(true);
  });

  it('溯源筛选生效：只看官方核验时聚合行被隐藏', async () => {
    const rows = apiPrices.map((item) => ({ dataset: { id: item.id }, hidden: false }));
    const appended: string[] = [];
    const nodes: Record<string, unknown> = {
      '#api-controls': { addEventListener: vi.fn() },
      '#api-rows': {
        querySelectorAll: () => rows,
        append: (row: (typeof rows)[number]) => appended.push(row.dataset.id),
      },
      '#api-data': { textContent: JSON.stringify({ models: apiPrices, fx: fxRate }) },
      '#api-empty': { hidden: true },
    };
    vi.stubGlobal('document', { querySelector: (selector: string) => nodes[selector] ?? null });
    vi.stubGlobal('FormData', class {
      get(key: string) {
        return { query: '', provider: '', provenance: 'aggregate', sort: 'inputPrice' }[key] ?? null;
      }
    });
    vi.resetModules();
    await import('../src/scripts/api-table');

    const aggregateIds = apiPrices
      .filter((item) => item.provenance === 'aggregate')
      .map((item) => item.id);
    expect(appended).toHaveLength(aggregateIds.length);
    expect(appended.every((id) => aggregateIds.includes(id))).toBe(true);
  });
});
