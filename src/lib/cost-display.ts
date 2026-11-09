import { PRICE_PLACEHOLDER, convertAmount, formatCny, formatRate } from './fx';
import { formatUsdAmount, modelLabel } from './format';
import { OFFICIAL_PRICE_LABEL } from './copy';
import { calculateMonthlyCost, parseUsageInput, type UsageInput } from './pricing';
import type { ApiPrice, FxRate } from './schema';

export type CostDisplay = {
  ok: boolean;
  /** 主值：厂商账单币种 */
  main: string;
  /** 副值：国际厂商给「≈ ¥…（汇率 …，日期）」，国内厂商标价给「官方标价 …」 */
  sub: string;
  /** 结算口径说明（含汇率缺失等 fail-closed 原因） */
  detail: string;
};

/**
 * 计算器展示层：把「模型 + 四类用量」算成三段文案。
 * 纯函数，计算器页面与既有客户端脚本共用同一份口径，避免两处各写一套格式化。
 */
export function computeCostDisplay(model: ApiPrice, usageInput: UsageInput, fx: FxRate | null): CostDisplay {
  const fxOk = fx !== null && Number.isFinite(fx.rate) && fx.rate > 0;

  const parsed = parseUsageInput(usageInput);
  if (!parsed.ok) return { ok: false, main: '无法完整计算', sub: '', detail: parsed.reason };

  // 先按价格数字自身的币种结算（不需要汇率），汇率只影响人民币副值
  const result = calculateMonthlyCost(model, parsed.usage);
  if (!result.ok) return { ok: false, main: '无法完整计算', sub: '', detail: result.reason };

  let main: string;
  let sub: string;
  if (model.billingCurrency === 'USD') {
    // 国际厂商：主值美元标价；人民币只作为副值出现，且必须带 ≈（结果标签已写明「估算月成本」）
    main = formatUsdAmount(result.total);
    if (!fxOk) {
      sub = '汇率缺失，无法估算';
    } else {
      const cny = convertAmount(result.total, result.currency, 'CNY', fx);
      // 汇率与日期跟着结果走：计算器没有表级声明，这一行就是它唯一的换算凭据
      sub = cny === null ? '汇率缺失，无法估算' : `≈ ${formatCny(cny)}（汇率 ${formatRate(fx.rate)}，${fx.date}）`;
    }
  } else if (result.currency === 'CNY') {
    // 国内厂商官方人民币挂牌价：完全不需要汇率
    main = formatCny(result.total);
    sub = `${OFFICIAL_PRICE_LABEL} · 人民币挂牌，无需换汇`;
  } else {
    // 国内厂商的聚合条目：数字由聚合源以 USD 发布，人民币是折算值
    const cny = convertAmount(result.total, result.currency, model.billingCurrency, fx);
    main = cny === null ? PRICE_PLACEHOLDER : formatCny(cny);
    sub = cny === null || !fxOk ? '汇率缺失，无法估算' : `聚合源 USD 折算 · 汇率 ${formatRate(fx.rate)}（${fx.date}）`;
  }

  const settleNote = model.billingCurrency === 'USD'
    ? '按 USD 标价结算，账单以美元为准'
    : result.currency === 'CNY'
      ? '按 CNY 官方标价结算，无需汇率'
      : '账单币种 CNY，数值由聚合源 USD 折算';
  return { ok: true, main, sub, detail: `${modelLabel(model.provider, model.model)}；${settleNote}；${sub}；${model.pricingCondition}` };
}
