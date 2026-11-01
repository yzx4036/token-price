/**
 * 把 Artificial Analysis 的智能评分挂到我们的 API 条目上。
 *
 * 设计原则（issue #5）：
 *   1. 映射是**人工核验**的显式表，不做模糊匹配 —— 匹配错会把 A 的分数安到 B 头上，
 *      比没有数据更糟。
 *   2. 同一模型的多个价格变体（时段 / 上下文长度）共享同一个分数，因为
 *      评分是**模型级**的，不是价格变体级的。
 *   3. 匹配不上的标 null（未评测），绝不猜。
 */

/** 去掉价格变体后缀，得到唯一模型名。必须与 token-estimate 的归一口径一致 */
export function baseModelName(model) {
  let s = String(model ?? '');
  s = s.replace(/（[^）]*时段）$/u, '');
  s = s.replace(/（长上下文[^）]*）$/u, '');
  s = s.replace(/（prompt[^）]*）$/u, '');
  s = s.replace(/（[≥≤>][^）]*）$/u, '');
  s = s.replace(/（>100k prompt）$/u, '');
  s = s.replace(/\s*\(<272K Context Length\)$/u, '');
  return s.trim();
}

/** 覆盖率按「唯一模型」统计，而不是按条目 —— 否则同一模型的 6 个变体会把覆盖率算虚高 */
export function computeCoverage(entries) {
  const uniq = new Set(entries.map((e) => baseModelName(e.model)));
  return { uniqueModels: uniq.size };
}

/**
 * @param {object} basis  benchmark-basis.json
 * @param {Array}  apiEntries  api.json
 */
export function buildBenchmarkDocument(basis, apiEntries) {
  const bySlug = new Map(basis.benchmarks.map((b) => [b.aaSlug, b]));
  const mapping = basis.mapping ?? {};

  // 依据自检：映射里指向的 slug 必须真在 benchmarks 里
  const dangling = Object.entries(mapping)
    .filter(([, slug]) => !bySlug.has(slug))
    .map(([model]) => model);

  const models = {};
  const unscoredModels = new Set();
  for (const entry of apiEntries) {
    const base = baseModelName(entry.model);
    if (models[base] !== undefined) continue; // 已处理过
    const slug = mapping[base];
    const bench = slug ? bySlug.get(slug) : null;
    if (!bench) {
      unscoredModels.add(base);
      models[base] = null; // 明确写 null：未评测，不是「忘了填」
      continue;
    }
    models[base] = {
      aaSlug: bench.aaSlug,
      aaName: bench.aaName,
      creator: bench.creator,
      score: bench.score,
      tierUsed: bench.tierUsed,
      isEstimated: bench.isEstimated,
    };
  }

  // 按条目 id 展开，前端直接用 id 查
  const byEntryId = {};
  for (const entry of apiEntries) {
    const base = baseModelName(entry.model);
    const m = models[base];
    byEntryId[entry.id] = m
      ? { score: m.score, aaSlug: m.aaSlug, tierUsed: m.tierUsed, baseModel: base }
      : null;
  }

  const scoredModels = Object.values(models).filter(Boolean).length;

  return {
    generatedAt: basis.source.fetchedAt,
    source: basis.source,
    methodology: basis.methodology,
    coverage: {
      uniqueModels: Object.keys(models).length,
      scoredModels,
      unscoredModels: Object.keys(models).length - scoredModels,
      apiEntries: apiEntries.length,
      apiEntriesScored: Object.values(byEntryId).filter(Boolean).length,
      danglingMappings: dangling,
    },
    models,
    byEntryId,
  };
}

/**
 * 性价比：每 1 分智能指数要花多少钱。
 *
 * 为什么要单独当一等函数：单价高低本身说明不了值不值。
 * GPT-6 Luna 输入 $0.10 比 GPT-6 Astra 的 $10 便宜 100 倍，
 * 但 Luna 智能指数 27.76 vs Astra 56.85 —— 只差 2 倍。
 * 「每分智能多少钱」才是读者真正要的那个比值。
 *
 * 口径：
 *   - 价格取 3:1 混合（与 token 估算同一口径），单位「每百万 token」
 *   - **只在同币种内可比**：USD 组与 CNY 组各自排名，不跨币种合并
 *     （汇率随时变，跨币种排名会把汇率波动变成「性价比变化」）
 *   - 缺价格或缺评分一律返回 null，不猜
 */
const BLEND_INPUT_WEIGHT = 3;
const BLEND_TOTAL = 4;

/** 3:1 混合后每百万 token 的标价（仍按原币种） */
export function blendedPricePerMillion(entry) {
  const inP = entry?.inputPrice;
  const outP = entry?.outputPrice;
  if (typeof inP !== 'number' || typeof outP !== 'number') return null;
  return (BLEND_INPUT_WEIGHT * inP + outP) / BLEND_TOTAL;
}

/**
 * @returns {{ pricePerMillion: number, costPerScorePoint: number, currency: string } | null}
 *   costPerScorePoint 的单位是「每 1 分智能指数 × 百万 token」的货币成本，
 *   数值小 = 同样的钱买到更多智能。
 */
export function computeValueScore(entry, score) {
  if (typeof score !== 'number' || score <= 0) return null;
  const price = blendedPricePerMillion(entry);
  if (price === null || price <= 0) return null;
  return {
    pricePerMillion: Math.round(price * 1000) / 1000,
    costPerScorePoint: Math.round((price / score) * 10000) / 10000,
    currency: entry.billingCurrency,
  };
}

/** 同币种内按性价比排序（便宜且够用在前）；跨币种各自分组 */
export function rankByValue(rows) {
  const groups = {};
  for (const r of rows) {
    const v = computeValueScore(r.entry, r.score);
    if (!v) continue;
    (groups[v.currency] ??= []).push({ ...r, value: v });
  }
  for (const k of Object.keys(groups)) {
    groups[k].sort((a, b) => a.value.costPerScorePoint - b.value.costPerScorePoint);
  }
  return groups;
}

/**
 * 防「张冠李戴」：校验映射两端语义一致。
 *
 * 为什么必须有：映射表是手写的，一条 `"GPT-6 Luna": "claude-opus-5-5"` 的笔误
 * 会让 Luna 拿到 Opus 的 58.41 分 —— slug 存在、分数在区间、所有结构断言都过，
 * 但结论彻底错了。这是本数据源最危险的错误类型，比缺数据严重得多。
 *
 * 判据：AA 的 slug（去掉推理档后缀）里最后一个「非数字 token」，
 * 必须出现在我们模型名的归一化形式里。
 *   gpt-6-luna          → 'luna'   ∈ 'gpt6luna'      ✓
 *   claude-opus-5-5     → 'opus'   ∉ 'gpt6luna'      ✗ 被拦
 *   qwen3-8-max         → 'max'    ∈ 'qwen38max'     ✓
 *   grok-4-7-high       → 去 high → 'grok' ∈ 'grok47' ✓
 */
const TIER_SUFFIX = /-(xhigh|high|medium|low|non-reasoning|max|reasoning)$/;

function slugCore(slug) {
  let s = String(slug).toLowerCase();
  s = s.replace(TIER_SUFFIX, '');
  const tokens = s.split('-').filter(Boolean).filter((t) => !/^\d+$/.test(t));
  return tokens[tokens.length - 1] ?? '';
}

function nameKey(model) {
  return String(model).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * @returns {string[]} 语义不一致的映射项，形如 "我们的模型 → slug（核心词 xxx 不在模型名里）"
 */
export function findSemanticMismatches(basis) {
  const bySlug = new Map(basis.benchmarks.map((b) => [b.aaSlug, b]));
  const bad = [];
  for (const [ourModel, aaSlug] of Object.entries(basis.mapping ?? {})) {
    const core = slugCore(aaSlug);
    const key = nameKey(ourModel);
    if (!core) continue;
    if (!key.includes(core)) {
      const bench = bySlug.get(aaSlug);
      bad.push(`${ourModel} → ${aaSlug}（AA 名为「${bench?.aaName ?? '?'}」，核心词 "${core}" 不在模型名里）`);
    }
  }
  return bad;
}
