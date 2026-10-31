import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiPrices } from '../src/lib/data';

type CalculatorValues = Record<'model' | 'input' | 'output' | 'cacheRead' | 'cacheWrite', string>;

async function runCalculator(values: CalculatorValues) {
  const form = { addEventListener: vi.fn() };
  const dataNode = { textContent: JSON.stringify(apiPrices) };
  const output = { textContent: '' };
  const detail = { textContent: '' };
  const nodes: Record<string, unknown> = {
    '#cost-form': form,
    '#calculator-data': dataNode,
    '#cost-result': output,
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
  return { output, detail };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('计算器客户端脚本', () => {
  it('空白输入显示 fail-closed 提示', async () => {
    const result = await runCalculator({
      model: apiPrices[0].id,
      input: '',
      output: '0',
      cacheRead: '0',
      cacheWrite: '0',
    });
    expect(result.output.textContent).toBe('无法完整计算');
    expect(result.detail.textContent).toMatch(/必须填写/);
  });

  it('把 0.3 × 3 的浮点结果格式化为展示金额', async () => {
    const result = await runCalculator({
      model: apiPrices[0].id,
      input: '3000000',
      output: '0',
      cacheRead: '0',
      cacheWrite: '0',
    });
    expect(result.output.textContent).toBe('$0.90');
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
      '#api-data': { textContent: JSON.stringify(apiPrices) },
      '#api-empty': empty,
    };

    vi.stubGlobal('document', { querySelector: (selector: string) => nodes[selector] ?? null });
    vi.stubGlobal('FormData', class {
      get(key: string) {
        return { query: 'GEMINI', provider: '', sort: 'outputPrice' }[key as 'query' | 'provider' | 'sort'] ?? null;
      }
    });
    vi.resetModules();
    await import('../src/scripts/api-table');

    expect(appended).toEqual([apiPrices[0].id]);
    expect(rows.find((row) => row.dataset.id === apiPrices[0].id)?.hidden).toBe(false);
    expect(rows.filter((row) => row.dataset.id !== apiPrices[0].id).every((row) => row.hidden)).toBe(true);
    expect(empty.hidden).toBe(true);
  });
});
