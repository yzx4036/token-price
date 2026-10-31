import { calculateMonthlyCost, parseUsageInput, type UsageInput } from '../lib/pricing';
import { PRICE_PLACEHOLDER, convertAmount, formatCny, formatRate } from '../lib/fx';
import { formatUsdAmount } from '../lib/format';
import type { ApiPrice, FxRate } from '../lib/schema';

type Payload = { models: ApiPrice[]; fx: FxRate | null };

const form = document.querySelector<HTMLFormElement>('#cost-form');
const dataNode = document.querySelector<HTMLScriptElement>('#calculator-data');
const output = document.querySelector<HTMLElement>('#cost-result');
const sub = document.querySelector<HTMLElement>('#cost-sub');
const detail = document.querySelector<HTMLElement>('#cost-detail');

if (form && dataNode && output && detail) {
  const payload = JSON.parse(dataNode.textContent ?? '{}') as Payload;
  const models = payload.models ?? [];
  const fx = payload.fx ?? null;
  const fxOk = fx !== null && Number.isFinite(fx.rate) && fx.rate > 0;
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
      if (sub) sub.textContent = '';
      detail.textContent = parsed.reason;
      return;
    }
    // 先按价格数字自身的币种结算（不需要汇率），汇率只影响人民币副值
    const result = calculateMonthlyCost(model, parsed.usage);
    if (!result.ok) {
      output.textContent = '无法完整计算';
      if (sub) sub.textContent = '';
      detail.textContent = result.reason;
      return;
    }

    let subText: string;
    if (model.billingCurrency === 'USD') {
      // 国际厂商：主值美元原价；人民币只作为副值出现，且必须带 ≈ 与「估算」
      output.textContent = formatUsdAmount(result.total);
      if (!fxOk) {
        subText = '汇率缺失，无法估算';
      } else {
        const cny = convertAmount(result.total, result.currency, 'CNY', fx);
        subText = cny === null
          ? '汇率缺失，无法估算'
          : `≈ ${formatCny(cny)}（按 ${formatRate(fx.rate)} 估算 · ${fx.date}）`;
      }
    } else if (result.currency === 'CNY') {
      // 国内厂商官方人民币挂牌价：完全不需要汇率
      output.textContent = formatCny(result.total);
      subText = '官方原价 · 人民币挂牌，无需换汇';
    } else {
      // 国内厂商的聚合条目：数字由聚合源以 USD 发布，人民币是折算值
      const cny = convertAmount(result.total, result.currency, model.billingCurrency, fx);
      output.textContent = cny === null ? PRICE_PLACEHOLDER : formatCny(cny);
      subText = cny === null || !fxOk
        ? '汇率缺失，无法估算'
        : `聚合源 USD 折算 · 汇率 ${formatRate(fx.rate)}（${fx.date}）`;
    }

    if (sub) sub.textContent = subText;
    const settleNote = model.billingCurrency === 'USD'
      ? '按 USD 原价结算，账单以美元为准'
      : result.currency === 'CNY'
        ? '按 CNY 官方原价结算，无需汇率'
        : '账单币种 CNY，数值由聚合源 USD 折算';
    detail.textContent = `${model.provider} · ${model.model}；${settleNote}；${subText}；${model.pricingCondition}`;
  };
  form.addEventListener('input', update);
  update();
}
