import { calculateMonthlyCost, parseUsageInput, type UsageInput } from '../lib/pricing';
import type { ApiPrice } from '../lib/schema';

const form = document.querySelector<HTMLFormElement>('#cost-form');
const dataNode = document.querySelector<HTMLScriptElement>('#calculator-data');
const output = document.querySelector<HTMLElement>('#cost-result');
const detail = document.querySelector<HTMLElement>('#cost-detail');

if (form && dataNode && output && detail) {
  const models = JSON.parse(dataNode.textContent ?? '[]') as ApiPrice[];
  const update = () => {
    const values = new FormData(form);
    const model = models.find((item) => item.id === values.get('model'));
    if (!model) return;
    const usageInput = Object.fromEntries(
      (['input', 'output', 'cacheRead', 'cacheWrite'] as const).map((key) => {
        const value = values.get(key);
        return [key, typeof value === 'string' ? value : null];
      }),
    ) as UsageInput;
    const parsed = parseUsageInput(usageInput);
    if (!parsed.ok) {
      output.textContent = '无法完整计算';
      detail.textContent = parsed.reason;
      return;
    }
    const result = calculateMonthlyCost(model, parsed.usage);
    if (!result.ok) {
      output.textContent = '无法完整计算';
      detail.textContent = result.reason;
      return;
    }
    output.textContent = result.total.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 6 });
    detail.textContent = `${model.provider} · ${model.model}；${model.pricingCondition}`;
  };
  form.addEventListener('input', update);
  update();
}
