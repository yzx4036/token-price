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

/**
 * @typedef {object} CurrencyPrice
 * @property {'CNY'|'USD'} currency
 * @property {number} inputPerM
 * @property {number} outputPerM
 * @property {string} sourceUrl
 * @property {string} [apiEntryId] 指向 api.json 的条目 id —— 有测试校验两者单价一致，
 *   防止「改了 API 单价、折算基准没跟着改」这种静默过期
 */

/** 分档定义，与前端徽章一一对应 */
export const TIERS = {
  official_currency: {
    label: '官方货币锚定',
    precision: 'exact',
    note: '官方把额度直接锚定到货币，换算无需假设',
    assumption: '零缓存命中 + 标准时段价 + 输入输出 3:1',
  },
  official_credit_rate: {
    label: '官方折算表',
    precision: 'near_exact',
    note: '官方公布「积分 ↔ Token」折算数（标注为约值）',
    assumption: '官方折算率（约值）+ 输入输出 3:1',
  },
  official_token_table: {
    label: '官方额度表',
    precision: 'exact',
    note: '官方直接公布每周/每月可用 token 量',
    // 这一档是唯一「偏乐观」的：官方区间两端都含 98% 缓存命中假设
    assumption: '官方区间中点 + 官方自带的 98% 缓存命中假设（相对其它档偏乐观）',
  },
  derived_from_currency: {
    label: '按官方货币额度折算',
    precision: 'exact',
    note: '官方给 $ API 额度，除以基准模型单价得 token 量',
    assumption: '零缓存命中 + 标准时段价 + 输入输出 3:1',
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

/** @typedef {object} TokenBasis
 *  @property {object} conventions
 *  @property {Record<string, CurrencyPrice>} currencyPrices
 *  @property {object[]} plans */

/**
 * @param {TokenBasis} basis
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
      assumption: TIERS[row.tier]?.assumption ?? null,
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
      // 官方按周给一个区间（0.52~1.04 亿/周 = 全高峰 ~ 全非高峰）。
      //
      // 取区间中点作为主值，**不取上限**：上限那端对应「全非高峰」，而同列其它
      // 估算用的都是标准价（相当于全高峰侧）。过去取上限，造成 6 档用最乐观假设、
      // 14 档用中性假设，同一列里混着两种乐观程度（智谱 Lite 上限 451M vs 中点 338M）。
      //
      // ⚠️ 两件事必须知道，且不该被中点掩盖：
      //   1. 官方这个区间的两端都假设「98% 缓存命中」，而其它厂商的估算用的是
      //      零缓存。所以即便取中点，这一档相对其它档仍是偏乐观的 —— 界面上必须写明。
      //   2. 这是官方口径下的「总 token」，不是「纯输入」——不要塞进 inputOnlyMillion，
      //      那会让读者以为全部按输入价算，得到的量会虚高一截。
      const weeklyMin = row.raw.yiPerWeekMin * 1e8;
      const weeklyMax = row.raw.yiPerWeekMax * 1e8;
      const weekly = (weeklyMin + weeklyMax) / 2;
      const monthly = weekly * WEEK_PER_MONTH;
      out.blendedMillion = monthly / 1e6;
      out.valueKind = 'official_total';
      out.monthlyMillion = monthly / 1e6;
      out.weeklyMinMillion = weeklyMin / 1e6;
      out.weeklyMaxMillion = weeklyMax / 1e6;
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
      // 缓存口径是全表最大的不一致来源：官方额度表那档自带 98% 缓存命中，
      // 其余档按零缓存算。编码场景缓存读单价通常是输入价的 1/10，
      // 所以「零缓存」的估算会系统性偏低，而官方额度表那档偏高。
      cacheAssumption: '除官方额度表（自带 98% 缓存命中）外，其余口径一律按零缓存命中估算',
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
