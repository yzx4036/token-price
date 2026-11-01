/**
 * 把 Token Plan 的额度折成「实际可用 token 量」。
 *
 * 设计原则（issue #8）：
 *   1. 依据与计算分离 —— 手写部分只记「官方原文的数字与来源」，
 *      算数值一律由本脚本产出，任何人可重跑复现。
 *   2. 可信度分档且不许混 —— 官方锚定货币 / 官方折算表 / 官方 token 表 /
 *      按官方货币额度折 / 只有相对倍率 / 只有次数 / 无兑换率 / 不限量。
 *   3. 拿不出可信数的，宁可不出数 —— 不出数值好过出一个假数值。
 */

const WEEK_PER_MONTH = 52 / 12;
const BLEND_RATIO = 3; // 输入:输出 = 3:1（按 token 数）

/** 分档定义，与前端徽章一一对应 */
export const TIERS = {
  official_currency: {
    label: '官方货币锚定',
    precision: 'exact',
    note: '官方把额度直接锚定到货币，换算无需假设',
  },
  official_credit_rate: {
    label: '官方折算表',
    precision: 'near_exact',
    note: '官方公布「积分 ↔ Token」折算数（标注为约值）',
  },
  official_token_table: {
    label: '官方额度表',
    precision: 'exact',
    note: '官方直接公布每周/每月可用 token 量',
  },
  derived_from_currency: {
    label: '按官方货币额度折算',
    precision: 'exact',
    note: '官方给 $ API 额度，除以基准模型单价得 token 量',
  },
  unknown_rate: {
    label: '兑换率未公开',
    precision: 'none',
    note: '积分是 token 计价单位，但官方未给兑换率，不同模型换算率还不同',
  },
  count_only: {
    label: '仅请求次数',
    precision: 'none',
    note: '官方只给请求次数，换算成 token 需假设单次用量，误差过大',
  },
  relative_only: {
    label: '仅相对倍率',
    precision: 'none',
    note: '官方只给「为某档的 N 倍」，缺可锚定的绝对基准',
  },
  qualitative: {
    label: '仅定性描述',
    precision: 'none',
    note: '官方只写 Expanded / 更高额度，无数字',
  },
  unavailable: {
    label: '无额度数值',
    precision: 'none',
    note: '官方标注不限量或仅限流',
  },
};

/** 一条 (ratio 输入 + 1 输出) 的成本，用于给定预算求总 token 数 */
function blendTokens(budget, priceIn, priceOut, ratio = BLEND_RATIO) {
  const perUnit = (ratio * priceIn + priceOut) / 1e6;
  return (budget / perUnit) * (ratio + 1);
}

function round(n) {
  return n === null ? null : Math.round(n);
}

/**
 * @param {{conventions: object, currencyPrices: object, plans: object[]}} basis
 * @param {Map<string, object>} plansById
 */
export function computeEstimates(basis, plansById) {
  const prices = basis.currencyPrices;

  const byId = new Map();
  for (const row of basis.plans) {
    const plan = plansById.get(row.planId);
    if (!plan) continue; // 依据里写了但套餐已删：静默跳过，生成物只跟着现有套餐走
    const price = row.basisModel ? prices[row.basisModel] : null;
    const out = {
      planId: row.planId,
      tier: row.tier,
      tierMeta: TIERS[row.tier],
      basisModel: row.basisModel,
      sourceUrl: row.sourceUrl,
      method: row.method,
      // token 量统一用「百万」为单位，前端直接显示，不必再除
      // inputOnly/outputOnly 是「全部当输入/全部当输出」的上下界；
      // blendedMillion 是可比较的主指标，valueKind 说明它是怎么来的：
      //   official_total      官方直接给的总量（智谱）
      //   official_blend      按官方单积分折算率 + 3:1 混合算（百度）
      //   estimated_blend     按货币额度 ÷ 单价 + 3:1 混合算（阶跃 / $ 额度类）
      inputOnlyMillion: null,
      outputOnlyMillion: null,
      blendedMillion: null,
      valueKind: null,
      monthlyMillion: null,
    };

    if (row.tier === 'official_currency') {
      // 额度锚定货币：把 Credit 先换成本币金额，再按基准模型单价折
      const budget = row.raw.megaCredit * (row.creditToCny ?? 1);
      out.inputOnlyMillion = budget / price.inputPerM;
      out.outputOnlyMillion = budget / price.outputPerM;
      out.blendedMillion = blendTokens(budget, price.inputPerM, price.outputPerM) / 1e6;
      out.valueKind = 'estimated_blend';
    } else if (row.tier === 'official_credit_rate') {
      const { credits } = row.raw;
      out.inputOnlyMillion = (credits * row.tokensPerCreditInput) / 1e6;
      out.outputOnlyMillion = (credits * row.tokensPerCreditOutput) / 1e6;
      // 混合：一组 (ratio 输入 + 1 输出) 要花掉多少积分，再反推每积分能换几个 token
      const creditsPerGroup = BLEND_RATIO / row.tokensPerCreditInput + 1 / row.tokensPerCreditOutput;
      out.blendedMillion = ((credits / creditsPerGroup) * (BLEND_RATIO + 1)) / 1e6;
      out.valueKind = 'official_blend';
    } else if (row.tier === 'official_token_table') {
      // 官方按周给量；取「最多」端（全非高峰 + 98% 缓存命中）作为可达成上限。
      // ⚠️ 这是官方口径下的「总 token」，不是「纯输入」——不要塞进 inputOnlyMillion，
      //    那会让读者以为全部按输入价算，得到的量会虚高一截。
      const weekly = row.raw.yiPerWeekMax * 1e8;
      const monthly = weekly * WEEK_PER_MONTH;
      out.blendedMillion = monthly / 1e6;
      out.valueKind = 'official_total';
      out.monthlyMillion = monthly / 1e6;
      out.weeklyMinMillion = (row.raw.yiPerWeekMin * 1e8) / 1e6;
      out.weeklyMaxMillion = weekly / 1e6;
    } else if (row.tier === 'derived_from_currency') {
      const budget = row.raw.usdCredits;
      out.inputOnlyMillion = budget / price.inputPerM;
      out.outputOnlyMillion = budget / price.outputPerM;
      out.blendedMillion = blendTokens(budget, price.inputPerM, price.outputPerM) / 1e6;
      out.valueKind = 'estimated_blend';
    }

    for (const k of ['inputOnlyMillion', 'outputOnlyMillion', 'blendedMillion', 'monthlyMillion',
                     'weeklyMinMillion', 'weeklyMaxMillion']) {
      if (k in out && out[k] !== null && out[k] !== undefined) out[k] = round(out[k]);
    }
    byId.set(row.planId, out);
  }
  return byId;
}

export function buildDocument(basis, plansById) {
  const estimates = computeEstimates(basis, plansById);
  const counted = [...estimates.values()].filter((e) => e.blendedMillion !== null);
  const tiers = {};
  for (const e of estimates.values()) {
    tiers[e.tier] = (tiers[e.tier] ?? 0) + 1;
  }
  return {
    generatedAt: basis.generatedAt,
    conventions: {
      ...basis.conventions,
      blendRatio: `${BLEND_RATIO}:1`,
      weekPerMonth: WEEK_PER_MONTH,
    },
    coverage: {
      plans: estimates.size,
      withNumbers: counted.length,
      withoutNumbers: estimates.size - counted.length,
      byTier: tiers,
    },
    currencyPrices: basis.currencyPrices,
    estimates: Object.fromEntries([...estimates.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}
