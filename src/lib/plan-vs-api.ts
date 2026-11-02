/**
 * 套餐 ↔ API 的折算桥（issue #6，方向 A：反向保本点）。
 *
 * 要回答的实际问题：**「我一个月大概用 X 百万 token，到底该订阅还是按量付费？」**
 *
 * 为什么用「反向保本点」而不是「正向额度折算」：
 * 绝大多数订阅套餐不公开 token 额度 —— ChatGPT Plus 只写「Expanded」、
 * Claude Pro 只写「每 5 小时额度上限」、国内 Coding Plan 只给「XX 次请求」。
 * 正向折算会让页面上大半是「无法折算」，读者会以为是我们没查。
 * 反向算法只用「月费」+「该模型的 API 单价」两个已知量，能覆盖全部套餐。
 *
 * ⚠️ 口径必须写在明面上：这是**我们按单价反推的等效量**，
 * 不是官方披露的额度。两者语义完全不同，混在一处不标注就是误导。
 */
import type { ApiPrice, FxRate, TokenPlan } from './schema';
import { normalizeModelName } from './schema';

/** 混合预算假设：输入 : 输出 = 3 : 1（按 token 数），与 token-basis.json 的 conventions 同源 */
export const DEFAULT_BLEND_RATIO = 3;

/** 保本点计算所需的单价（统一换到同一币种后使用） */
export type BreakEvenBasis = {
  /** 用作基准的 API 条目 */
  model: ApiPrice;
  /** 输入单价（百万 token） */
  inputPrice: number;
  /** 输出单价（百万 token） */
  outputPrice: number;
  /** 定价币种 */
  currency: 'CNY' | 'USD';
};

export type BreakEvenResult = {
  /** 等效输出 token 百万数（超过这个量，订阅才比按量便宜） */
  outputMillion: number;
  /** 等效输入 token 百万数（= outputMillion × ratio） */
  inputMillion: number;
  /** 等效总 token 百万数 */
  totalMillion: number;
  /** 用的基准模型 */
  model: ApiPrice;
  /** 月费 */
  monthlyPrice: number;
  ratio: number;
};

export type PlanVsApiOutcome =
  | { kind: 'break_even'; result: BreakEvenResult }
  | { kind: 'no_price'; reason: string }
  | { kind: 'no_model'; reason: string };

/**
 * 取某条 API 条目的价格（必须是有正价格的官方页条目）。
 *
 * 为什么只认 official：聚合数据未逐条核过官方页，用它算保本点等于
 * 把误差放大到「订阅 vs 按量」的结论上，而这类结论读者会直接拿去花钱。
 */
export function breakEvenBasisOf(model: ApiPrice): BreakEvenBasis | null {
  if (model.provenance !== 'official') return null;
  if (model.inputPrice === null || model.outputPrice === null) return null;
  if (model.inputPrice <= 0 || model.outputPrice <= 0) return null;
  // 报价币种与账单币种不一致时，数字本身不是该厂商实际的计价单位，不能直接拿来算
  if (model.reportedCurrency !== model.billingCurrency) return null;
  return {
    model,
    inputPrice: model.inputPrice,
    outputPrice: model.outputPrice,
    currency: model.billingCurrency,
  };
}

/**
 * 给某个套餐挑基准模型。
 *
 * **只在本厂商内选，绝不跨厂商兜底。**
 *
 * 踩过的坑（2026-11-02 实测）：最初允许「同地区同币种」兜底 + 取最便宜，
 * 结果百度千帆 Token Plan 按智谱 GLM-Z1-FlashX 算出「¥9.9 ≈ 99M」、
 * 腾讯 CodeBuddy 按智谱算出「¥99 ≈ 990M」。这两个数字毫无意义 ——
 * 读者会以为买腾讯套餐能享受到智谱的低价，实际根本用不到。
 * 宁可标「无同厂商 API 可比」，也不要给一个算法上成立、语义上错误的数。
 *
 * 第二层筛选：**优先用套餐自己列出的可用模型**。
 * 踩过的第二个坑：智谱 GLM Coding Plan 只提供 GLM-5.3 / 5.3-Flash，
 * 但按单价中位数选中了 GLM-4-Plus，页面上就出现「按 GLM-4-Plus 反推」
 * 而套餐根本用不了这个模型 —— 读者一眼就能看出不对，信任直接崩。
 *
 * 档位选择用**输出价中位数**而不是最低价：
 * 最便宜的往往是该厂商最小的模型（Claude Haiku、GPT-6 Luna、GLM-FlashX），
 * 用它会系统性高估套餐价值（Claude Pro 按 Haiku 算 100M，按 Sonnet 只有十几 M）。
 * 中位数代表「该厂商的中档模型」，与读者实际使用分布更接近。
 */
export function pickBasisModel(
  plan: TokenPlan,
  candidates: readonly ApiPrice[],
): ApiPrice | null {
  const officialWithPrice = candidates.filter((item) => breakEvenBasisOf(item) !== null);
  if (officialWithPrice.length === 0) return null;

  // 同厂商 + 同币种：币种一致才能直接相除，跨币种要换汇，那是另一层假设
  const own = officialWithPrice.filter(
    (item) => item.providerId === plan.providerId && item.billingCurrency === plan.billingCurrency,
  );
  if (own.length === 0) return null;

  // 套餐列了可用模型时，先缩到这些模型；缩不到（套餐写的是「最新 Grok 模型」这类模糊描述）才用全厂商
  // 两档匹配：先要「完全相同」的那档，一个都没有才放宽到子串 —— 见 matchStrength 注释
  const strengthOf = (item: ApiPrice) =>
    Math.max(0, ...plan.availableModels.map((name) => matchStrength(item.model, name)));
  const exact = own.filter((item) => strengthOf(item) === 2);
  if (exact.length > 0) return medianByOutput(exact);
  const loose = own.filter((item) => strengthOf(item) === 1);
  return medianByOutput(loose.length > 0 ? loose : own);
}

/**
 * 判断某条 API 条目的模型名是否对应套餐里写的某个「可用模型」。
 *
 * 两侧命名风格不同（API 表用 `Claude Sonnet 4.6` / `grok-4.20-multi-agent-0309（prompt<200K）`，
 * 套餐表用 `Sonnet` / `最新 Grok 模型`），所以做归一化后双向子串匹配：
 * 去掉空格、连字符、下划线和小写化，再判断谁包含谁。
 *
 * 长度下限 4 字符：防止 `Pro`、`Max`、`Go` 这类短词把不相关模型拽进来
 * （实测套餐名里常见 `GLM Coding Plan Pro`，不去下限会让 `Pro` 匹配到任意含 pro 的模型）。
 */
export function modelMatchesAvailability(apiModelName: string, planModelName: string): boolean {
  return matchStrength(apiModelName, planModelName) > 0;
}

/**
 * 匹配强度：2 = 归一化后完全相同，1 = 双向子串命中，0 = 不匹配。
 *
 * 分两档而不是一刀切子串，是因为智谱这类厂商的模型名互相包含：
 * `GLM-5.3-FlashX-Legal` 包含 `GLM-5.3-Flash`，只做子串就会把「法律版」
 * 当成套餐里的 Flash 档算进去（实测选中过它，而套餐只卖 GLM-5.3 / 5.3-Flash）。
 * 先比完全相同，比不到才放宽到子串，避免被名字更像的那个带偏。
 */
export function matchStrength(apiModelName: string, planModelName: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[\s\-_/·（）()]/g, '');
  const a = norm(apiModelName);
  const b = norm(planModelName);
  // 长度下限 4 字符：防止 `Pro`、`Max`、`Go` 这类短词把不相关模型拽进来
  // （实测套餐名里常见 `GLM Coding Plan Pro`，不去下限会让 `Pro` 匹配到任意含 pro 的模型）
  if (a.length < 4 || b.length < 4) return 0;
  if (a === b) return 2;
  return a.includes(b) || b.includes(a) ? 1 : 0;
}

/**
 * 按输出单价取中位数那条，代表该厂商的中档模型。
 *
 * 先**按模型名去重**再取中位数。同一模型常有多条变体条目
 * （长上下文溢价档、峰谷时段档、按输入长度分档），不去重会让中位数
 * 偏到奇怪的位置 —— 实测 OpenAI 曾选中「GPT-6.1 Sol（长上下文 >272K）」，
 * 那是高价位特例，不代表读者日常用量。
 *
 * 去重时每个模型取**最便宜**那条：同一模型的多个档位里，低价档是基础价，
 * 高价档是超过阈值后的溢价，用基础价参与比较才公平。
 */
function medianByOutput(items: readonly ApiPrice[]): ApiPrice {
  const cheapestPerModel = new Map<string, ApiPrice>();
  for (const item of items) {
    const key = normalizeModelName(item.model);
    const existing = cheapestPerModel.get(key);
    if (!existing || (item.outputPrice ?? Infinity) < (existing.outputPrice ?? Infinity)) {
      cheapestPerModel.set(key, item);
    }
  }
  const perModel = [...cheapestPerModel.values()].sort(
    (a, b) => (a.outputPrice ?? Infinity) - (b.outputPrice ?? Infinity),
  );
  return perModel[Math.floor(perModel.length / 2)];
}

/**
 * 计算反向保本点。
 *
 * 混合口径（输入 : 输出 = ratio : 1）而非纯输出口径：
 * 纯输出价会忽略输入成本，把保本点算得过高 —— 读者会以为「这个套餐能覆盖更多用量」，
 * 而实际一旦把输入算进去就不划算。这里把输入按比例计入，结论更保守也更接近真实账单。
 *
 * 推导：
 *   设每月消耗输出 Q 百万，则输入为 Q × ratio 百万
 *   按量成本 = Q × outputPrice + Q × ratio × inputPrice = Q × (outputPrice + ratio × inputPrice)
 *   令按量成本 = 月费，得 Q = 月费 / (outputPrice + ratio × inputPrice)
 */
export function computeBreakEven(
  plan: TokenPlan,
  model: ApiPrice,
  ratio = DEFAULT_BLEND_RATIO,
): PlanVsApiOutcome {
  if (plan.monthlyPrice === null || plan.monthlyPrice <= 0) {
    return { kind: 'no_price', reason: '官方未公布月费，无法折算' };
  }
  const basis = breakEvenBasisOf(model);
  if (!basis) {
    return { kind: 'no_model', reason: `${model.provider} ${model.model} 没有可用的官方单价` };
  }
  // 币种必须一致才能直接相除：跨币种要先换汇，而换汇会引入汇率假设，
  // 那是另一层不确定性，不该混进「保本点」这个已经很粗的估算里
  if (basis.currency !== plan.billingCurrency) {
    return {
      kind: 'no_model',
      reason: `套餐为 ${plan.billingCurrency}、基准模型为 ${basis.currency}，跨币种不做折算`,
    };
  }

  const perMillionOutputCost = basis.outputPrice + ratio * basis.inputPrice;
  if (perMillionOutputCost <= 0) {
    return { kind: 'no_model', reason: '基准模型单价为 0，无法算保本点' };
  }

  const outputMillion = plan.monthlyPrice / perMillionOutputCost;
  return {
    kind: 'break_even',
    result: {
      outputMillion,
      inputMillion: outputMillion * ratio,
      totalMillion: outputMillion * (1 + ratio),
      model,
      monthlyPrice: plan.monthlyPrice,
      ratio,
    },
  };
}

export type CompareOutcome =
  | {
      kind: 'ok';
      /** 按量付费月成本 */
      apiCost: number;
      /** 套餐月费 */
      planCost: number;
      /** 差额 = 套餐 - 按量，正数表示套餐更贵 */
      delta: number;
      /** 该用量下更省的一方 */
      cheaper: 'plan' | 'api' | 'tie';
      currency: 'CNY' | 'USD';
      /** 折算用的假设 */
      basisModel: ApiPrice;
      ratio: number;
    }
  | { kind: 'fail'; reason: string };

/**
 * 给定用量，比较「订阅套餐」与「按量付费」。
 *
 * 用途：计算器页的对比区块。读者输入自己每月的输入/输出 token 数，
 * 直接看到两边价格和谁更省，不用自己算保本点。
 */
export function comparePlanVsApi(
  plan: TokenPlan,
  model: ApiPrice,
  usage: { inputMillion: number; outputMillion: number },
): CompareOutcome {
  if (plan.monthlyPrice === null || plan.monthlyPrice <= 0) {
    return { kind: 'fail', reason: '该套餐没有公开月费' };
  }
  const basis = breakEvenBasisOf(model);
  if (!basis) return { kind: 'fail', reason: '基准模型没有可用的官方单价' };
  if (basis.currency !== plan.billingCurrency) {
    return { kind: 'fail', reason: '套餐与基准模型币种不同，不做跨币种比较' };
  }
  if (!Number.isFinite(usage.inputMillion) || !Number.isFinite(usage.outputMillion)) {
    return { kind: 'fail', reason: '用量输入不合法' };
  }
  if (usage.inputMillion < 0 || usage.outputMillion < 0) {
    return { kind: 'fail', reason: '用量不能为负' };
  }

  const apiCost = usage.inputMillion * basis.inputPrice + usage.outputMillion * basis.outputPrice;
  const planCost = plan.monthlyPrice;
  const delta = planCost - apiCost;
  // 用相对阈值判「持平」：金额是浮点的，直接用 === 会永远判不出 tie
  const tolerance = Math.max(planCost, apiCost) * 0.005;
  const cheaper: 'plan' | 'api' | 'tie' =
    Math.abs(delta) <= tolerance ? 'tie' : delta > 0 ? 'api' : 'plan';

  return {
    kind: 'ok',
    apiCost,
    planCost,
    delta,
    cheaper,
    currency: basis.currency,
    basisModel: model,
    ratio: DEFAULT_BLEND_RATIO,
  };
}

/** 把百万 token 数格式化成人类可读（451.2M / 0.4M） */
export function formatMillionTokens(value: number): string {
  if (!Number.isFinite(value) || value < 0) return '—';
  if (value >= 100) return `${Math.round(value)}M`;
  if (value >= 10) return `${(Math.round(value * 10) / 10).toFixed(1)}M`;
  if (value >= 1) return `${(Math.round(value * 100) / 100).toFixed(2)}M`;
  if (value >= 0.01) return `${(Math.round(value * 1000) / 1000).toFixed(3)}M`;
  return `${value.toExponential(2)}M`;
}

/** 币种符号 */
export function currencySymbol(currency: 'CNY' | 'USD'): string {
  return currency === 'CNY' ? '¥' : '$';
}

/** 金额格式化（保本点与对比共用，避免两处各写一套） */
export function formatMoney(value: number, currency: 'CNY' | 'USD'): string {
  const symbol = currencySymbol(currency);
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${symbol}${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

/**
 * 保本点的一句话结论（套餐详情与页面共用）。
 *
 * 必须同时说清三件事，缺一件就会被误读：
 * 1. 这是**反推的临界用量**，不是官方额度
 * 2. 用的是哪个模型的单价
 * 3. 输入输出按什么比例假设
 */
export function breakEvenSentence(outcome: PlanVsApiOutcome): string {
  if (outcome.kind === 'no_price') return outcome.reason;
  if (outcome.kind === 'no_model') return outcome.reason;
  const { result } = outcome;
  const name = `${result.model.provider} ${result.model.model}`;
  return `按 ${name} 的 API 单价反推：每月混合 token 超过 ${formatMillionTokens(result.totalMillion)}`
    + `（输入 ${formatMillionTokens(result.inputMillion)} / 输出 ${formatMillionTokens(result.outputMillion)}，按 ${result.ratio}:1 假设）时，`
    + `订阅才比按量付费便宜。月费 ${formatMoney(result.monthlyPrice, result.model.billingCurrency)}。`;
}

/**
 * 官方额度「用满值多少」的一句话。
 *
 * ⚠️ 这句话存在的唯一原因：套餐表里已经有一列「折算可用 token」（= 官方额度换算成多少 token），
 * 而保本点是**另一回事**。实测两者能差 10 倍以上（智谱 Coding Plan Lite：
 * 官方额度折算 338M，保本点只有 23.6M）。两个数字并排又不解释，读者一定认为其中一个算错了。
 *
 * 所以这里把官方额度换成「按量付费要花多少钱」，直接得出「用满相当于省下多少」：
 * 读者一眼看到「用满 ≈ 按量 ¥4970（月费 12 倍）」，就知道套餐划算；
 * 再看保本点 23.6M，就知道用量低于这个数还是按量划算。两个数各就各位，不再打架。
 *
 * 官方额度本身已是混合口径（token-basis 的 3:1 约定），这里按同一比例拆输入/输出。
 */
export function allowanceValueSentence(
  officialTotalMillion: number,
  model: ApiPrice,
  plan: TokenPlan,
  ratio = DEFAULT_BLEND_RATIO,
): string | null {
  const basis = breakEvenBasisOf(model);
  if (!basis) return null;
  if (plan.monthlyPrice === null || plan.monthlyPrice <= 0) return null;
  if (basis.currency !== plan.billingCurrency) return null;
  if (!Number.isFinite(officialTotalMillion) || officialTotalMillion <= 0) return null;

  const inputMillion = (officialTotalMillion * ratio) / (1 + ratio);
  const outputMillion = officialTotalMillion / (1 + ratio);
  const apiCost = inputMillion * basis.inputPrice + outputMillion * basis.outputPrice;
  if (!Number.isFinite(apiCost) || apiCost <= 0) return null;

  const multiple = apiCost / plan.monthlyPrice;
  const cny = currencySymbol(basis.currency);
  // 倍数向下取整到 1 位，避免「12.0 倍」这种看似精确的数字
  const multText = multiple >= 1 ? `${Math.round(multiple * 10) / 10} 倍` : '低于月费';
  return `用满官方额度 ≈ 按量付费 ${cny}${Math.round(apiCost).toLocaleString('en-US')}`
    + `（约月费的 ${multText}）。`;
}

/** 与 fx 打通：把保本点金额换算成人民币副值（国际套餐用） */
export function cnySubline(value: number, currency: 'CNY' | 'USD', fx: FxRate | null): string | null {
  if (currency !== 'USD') return null;
  if (!fx || !Number.isFinite(fx.rate) || fx.rate <= 0) return null;
  return `≈ ${formatMoney(value * fx.rate, 'CNY')}（按 ${fx.rate.toFixed(4)} 估算 · ${fx.date}）`;
}

export type PlanComparisonRow = {
  plan: TokenPlan;
  /** 套餐月费（格式化好，视图不再读原始字段） */
  planCostText: string;
  /** 按量成本（格式化好） */
  apiCostText: string;
  /** 结论文案：谁更省、差多少 */
  verdictText: string;
  /** 套餐侧还是按量侧胜出，用于上色 */
  winner: 'plan' | 'api' | 'tie' | 'none';
  /** 差额原始值，用于排序（金额本身另有格式化字段给视图） */
  deltaValue: number;
  /** 人民币副值（国际套餐才有） */
  cnySub: string | null;
};

/**
 * 计算器页的批量对比：给定用量，把每个「有月费」的套餐与按量成本比一遍。
 *
 * 为什么在这里统一算：视图层不许直接读 monthlyPrice（有守卫测试盯着），
 * 而且「谁更省」的判定必须与 lib 里同一套容差逻辑，否则会出现
 * 表格说 A 便宜、卡片说 B 便宜的两套结论。
 */
export function comparePlansForUsage(
  plans: readonly TokenPlan[],
  model: ApiPrice,
  usage: { inputMillion: number; outputMillion: number },
  fx: FxRate | null,
): PlanComparisonRow[] {
  const rows: PlanComparisonRow[] = [];
  for (const plan of plans) {
    const outcome = comparePlanVsApi(plan, model, usage);
    if (outcome.kind !== 'ok') {
      // 免费档没有月费、跨币种不可比 —— 这些行不进对比列表，避免整屏「无法比较」
      continue;
    }
    const { apiCost, planCost, delta, cheaper, currency } = outcome;
    let verdictText: string;
    if (cheaper === 'tie') {
      verdictText = '两者接近持平';
    } else if (cheaper === 'api') {
      verdictText = `按量更省 ${formatMoney(Math.abs(delta), currency)}/月`;
    } else {
      verdictText = `订阅更省 ${formatMoney(Math.abs(delta), currency)}/月`;
    }
    rows.push({
      plan,
      planCostText: formatMoney(planCost, currency),
      apiCostText: formatMoney(apiCost, currency),
      verdictText,
      winner: cheaper,
      deltaValue: delta,
      cnySub: cnySubline(planCost, currency, fx),
    });
  }
  // 排序：先把「订阅更省」的排在前面（那是读者最关心的结论），
  // 同组内按差额绝对值降序 —— 差距越大越值得先看。
  // 最初按厂商名拼音排，结果默认用量下列表里全是「按量更省 ¥199」这类
  // 无区分度的行，读者看不出这份对比想说什么。
  const rank = (w: PlanComparisonRow['winner']) => (w === 'plan' ? 0 : w === 'api' ? 1 : 2);
  return rows.sort((a, b) => {
    const byRank = rank(a.winner) - rank(b.winner);
    if (byRank !== 0) return byRank;
    return Math.abs(b.deltaValue) - Math.abs(a.deltaValue);
  });
}

/** 把「token 数」用量转成百万数（计算器页面输入的是原始 token 数） */
export function toMillion(tokens: number): number {
  if (!Number.isFinite(tokens) || tokens < 0) return 0;
  return tokens / 1_000_000;
}
