import { computeCostDisplay } from '../lib/cost-display';
import type { UsageInput } from '../lib/pricing';
import type { ApiPrice, FxRate } from '../lib/schema';

type Payload = { models: ApiPrice[]; fx: FxRate | null };

/**
 * 既有客户端脚本的 DOM 契约（#cost-form / #calculator-data / #cost-result / #cost-sub / #cost-detail）。
 * ⚠️ v0.3.0 起页面已改为 Vue（CalculatorView.vue 直接用 src/lib/cost-display.ts），
 * 本文件只作为 tests/client-scripts.test.ts 的夹具保留，运行时不加载。
 * 展示口径已抽到 src/lib/cost-display.ts，Vue 页面与本脚本共用同一份实现。
 * 浏览器里引入时自动绑定；SSR 阶段没有 document，直接跳过。
 */
export function bindCalculatorDom(doc: Document): void {
  const form = doc.querySelector<HTMLFormElement>('#cost-form');
  const dataNode = doc.querySelector<HTMLScriptElement>('#calculator-data');
  const output = doc.querySelector<HTMLElement>('#cost-result');
  const sub = doc.querySelector<HTMLElement>('#cost-sub');
  const detail = doc.querySelector<HTMLElement>('#cost-detail');

  if (!form || !dataNode || !output || !detail) return;

  const payload = JSON.parse(dataNode.textContent ?? '{}') as Payload;
  const models = payload.models ?? [];
  const fx = payload.fx ?? null;

  const update = (): void => {
    const values = new FormData(form);
    const model = models.find((item) => item.id === values.get('model'));
    if (!model) return;
    const usageInput = Object.fromEntries(
      (['input', 'output', 'cacheRead', 'cacheWrite'] as const).map((key) => {
        const value = values.get(key);
        return [key, typeof value === 'string' ? value : null];
      }),
    ) as UsageInput;

    const display = computeCostDisplay(model, usageInput, fx);
    output.textContent = display.main;
    if (sub) sub.textContent = display.sub;
    detail.textContent = display.detail;
  };

  form.addEventListener('input', update);
  update();
}

if (typeof document !== 'undefined') bindCalculatorDom(document);
