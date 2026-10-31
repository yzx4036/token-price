import { filterAndSortApiPrices, type PriceField } from '../lib/pricing';
import type { ApiPrice } from '../lib/schema';

const form = document.querySelector<HTMLFormElement>('#api-controls');
const body = document.querySelector<HTMLTableSectionElement>('#api-rows');
const dataNode = document.querySelector<HTMLScriptElement>('#api-data');
const empty = document.querySelector<HTMLElement>('#api-empty');

if (form && body && dataNode && empty) {
  const models = JSON.parse(dataNode.textContent ?? '[]') as ApiPrice[];
  const rows = new Map([...body.querySelectorAll<HTMLTableRowElement>('tr')].map((row) => [row.dataset.id, row]));
  const update = () => {
    const values = new FormData(form);
    const filtered = filterAndSortApiPrices(
      models,
      String(values.get('query') ?? ''),
      String(values.get('provider') ?? ''),
      String(values.get('sort') ?? 'inputPrice') as PriceField,
    );
    for (const model of filtered) {
      const row = rows.get(model.id);
      if (row) body.append(row);
    }
    for (const [id, row] of rows) row.hidden = !filtered.some((item) => item.id === id);
    empty.hidden = filtered.length !== 0;
  };
  form.addEventListener('input', update);
  update();
}
