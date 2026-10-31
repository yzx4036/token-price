import { filterAndSortApiPrices, type PriceField } from '../lib/pricing';
import type { ApiPrice, FxRate } from '../lib/schema';

type Payload = { models: ApiPrice[]; fx: FxRate | null };

const form = document.querySelector<HTMLFormElement>('#api-controls');
const body = document.querySelector<HTMLTableSectionElement>('#api-rows');
const dataNode = document.querySelector<HTMLScriptElement>('#api-data');
const empty = document.querySelector<HTMLElement>('#api-empty');

if (form && body && dataNode && empty) {
  const payload = JSON.parse(dataNode.textContent ?? '{}') as Payload;
  const models = payload.models ?? [];
  const rows = new Map<string, HTMLTableRowElement>();
  for (const row of body.querySelectorAll<HTMLTableRowElement>('tr')) {
    const id = row.dataset.id;
    if (id) rows.set(id, row);
  }
  const update = () => {
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
