import { filterAndSortApiPrices, type PriceField } from '../lib/pricing';
import type { ApiPrice, FxRate } from '../lib/schema';

type Payload = { models: ApiPrice[]; fx: FxRate | null };

/**
 * 既有客户端脚本的 DOM 契约（#api-controls / #api-rows / #api-data / #api-empty）。
 * ⚠️ v0.3.0 起页面已改为 Vue（ApiPricingView.vue / FilterBar.vue 直接复用 src/lib/pricing.ts），
 * 本文件只作为 tests/client-scripts.test.ts 的夹具保留，运行时不加载。
 * 筛选与排序完全复用 src/lib/pricing.ts 的 filterAndSortApiPrices，构建期与运行时同源。
 * 浏览器里引入时自动绑定；SSR 阶段没有 document，直接跳过。
 */
export function bindApiTableDom(doc: Document): void {
  const form = doc.querySelector<HTMLFormElement>('#api-controls');
  const body = doc.querySelector<HTMLTableSectionElement>('#api-rows');
  const dataNode = doc.querySelector<HTMLScriptElement>('#api-data');
  const empty = doc.querySelector<HTMLElement>('#api-empty');

  if (!form || !body || !dataNode || !empty) return;

  const payload = JSON.parse(dataNode.textContent ?? '{}') as Payload;
  const models = payload.models ?? [];
  const rows = new Map<string, HTMLTableRowElement>();
  for (const row of body.querySelectorAll<HTMLTableRowElement>('tr')) {
    const id = row.dataset.id;
    if (id) rows.set(id, row);
  }

  const update = (): void => {
    const values = new FormData(form);
    const filtered = filterAndSortApiPrices(
      models,
      {
        query: String(values.get('query') ?? ''),
        provider: String(values.get('provider') ?? ''),
        provenance: String(values.get('provenance') ?? 'all') as 'official' | 'aggregate' | 'all',
        sortBy: String(values.get('sort') ?? 'inputPrice') as PriceField,
      },
      payload.fx ?? null,
    );
    const visible = new Set(filtered.map((item) => item.id));
    for (const item of filtered) {
      const row = rows.get(item.id);
      if (row) body.append(row);
    }
    for (const [id, row] of rows) row.hidden = !visible.has(id);
    empty.hidden = filtered.length !== 0;
  };

  form.addEventListener('input', update);
  update();
}

if (typeof document !== 'undefined') bindApiTableDom(document);
