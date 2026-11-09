import { fetchWithTimeout } from './http.mjs';
import { CliError, PATHS, readJson } from './io.mjs';
import { extractPriceTokens, normalizePage } from './plans-drift.mjs';

const invalid = (message) => { throw new CliError(message, { code: 'PLANS_SHAPE' }); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const normalizeText = (value) => normalizePage(String(value).replace(/<\/(?:td|th|tr|p|div|li|h\d)>/gi, '$& '))
  .replace(/[‐‑–—]/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function validatePlans(plans) {
  if (!Array.isArray(plans)) invalid('plans.json 不是数组');
  const ids = new Set();
  for (const plan of plans) {
    if (!object(plan) || typeof plan.id !== 'string' || !plan.id || ids.has(plan.id)
      || typeof plan.provider !== 'string' || !plan.provider || typeof plan.plan !== 'string' || !plan.plan
      || typeof plan.monthlyPrice !== 'number' || !Number.isFinite(plan.monthlyPrice) || plan.monthlyPrice < 0
      || !['CNY', 'USD'].includes(plan.billingCurrency)
      || (plan.sourceUrl != null && typeof plan.sourceUrl !== 'string')
      || (plan.allowance !== undefined && typeof plan.allowance !== 'string')
      || (plan.availableModels !== undefined && (!Array.isArray(plan.availableModels) || plan.availableModels.some((name) => typeof name !== 'string' || !name)))
      || (plan.allowanceNature !== undefined && !['mixed', 'quota', 'undisclosed'].includes(plan.allowanceNature))) invalid('套餐结构异常或 id 重复');
    ids.add(plan.id);
  }
  return plans;
}

function modelEvidence(plan) {
  return [...new Set((plan.availableModels ?? []).flatMap((name) => {
    const match = name.replace(/（[^）]*）|\([^)]*\)/g, '').match(/[a-z][a-z0-9.+ -]*/i);
    if (!match || /^auto(?:\s|$)/i.test(match[0])) return [];
    return [normalizeText(match[0])];
  }))];
}

function hasModel(text, model) {
  return new RegExp(`(?<![a-z0-9])${escape(model)}(?![a-z0-9.-])`, 'i').test(text);
}

// 只使用有单位的额度数字，避免拿模型版本号或月费充当额度证据。
export function quantityEvidence(text) {
  const units = { '积分': 'credits', credit: 'credits', credits: 'credits', '次': 'requests', request: 'requests', requests: 'requests', token: 'tokens', tokens: 'tokens', '倍': 'x' };
  const tokens = new Set();
  const re = /(\d[\d,]*(?:\.\d+)?)\s*(积分|credits?\b|requests?\b|tokens?\b|次|倍|x\b|小时|天|周|月)/gi;
  for (const match of String(text).matchAll(re)) {
    const unit = match[2].toLowerCase();
    tokens.add(`${Number(match[1].replaceAll(',', ''))}:${units[unit] ?? unit}`);
  }
  return tokens;
}

function allowanceDifferences(plan, raw, text) {
  const changes = [];
  const quantities = quantityEvidence(text);
  const missingNumbers = [...quantityEvidence(plan.allowance ?? '')].filter((token) => !quantities.has(token));
  if (missingNumbers.length) changes.push({ field: 'allowance', missingEvidence: missingNumbers });
  const tables = [...raw.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((table) =>
    [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<(td|th)\b([^>]*)>([\s\S]*?)<\/\1>/gi)].map((cell) => ({
        header: cell[1].toLowerCase() === 'th', text: normalizeText(cell[3]),
        spans: /\b(?:colspan|rowspan)\s*=/i.test(cell[2]),
      }))));
  const missingModels = [];
  for (const model of modelEvidence(plan)) {
    if (!hasModel(text, model)) { missingModels.push(model); continue; }
    const availability = [];
    for (const rows of tables) {
      const header = rows.find((row) => row.length > 0 && row.every((cell) => cell.header));
      for (const row of rows.filter((cells) => cells.some((cell) => hasModel(cell.text, model)))) {
        // 单个可用性单元格沿用原规则；多套餐列必须唯一匹配表头且无跨行/跨列。
        if (row.length <= 2 && (!header || header.length <= 2) && !row.some((cell) => cell.spans)) {
          availability.push(row.map((cell) => cell.text).join(' '));
          continue;
        }
        const columns = header?.flatMap((cell, index) => cell.text === normalizeText(plan.plan) ? [index] : []) ?? [];
        if (columns.length !== 1 || header.length !== row.length || [...header, ...row].some((cell) => cell.spans)) {
          return { changes: [], reason: `可用表多列无法定位本套餐列：${plan.plan} / ${model}` };
        }
        const value = row[columns[0]].text;
        if (!/\b(?:yes|no|unlimited|expanded)\b|不可用|不支持/.test(value)) {
          return { changes: [], reason: `可用表多列无法定位本套餐列的可用性值：${plan.plan} / ${model}` };
        }
        availability.push(value);
      }
    }
    if (availability.length > 0 && availability.every((value) => /\bno\b|不可用|不支持/.test(value)
      && !/\byes\b|\bunlimited\b|\bexpanded\b/.test(value))) missingModels.push(model);
  }
  if (missingModels.length) changes.push({ field: 'availableModels', missingEvidence: missingModels });
  const quota = /\b(?:quota|limited|limits?|capped)\b|额度|上限|限量|积分|\d[\d,]*(?:\.\d+)?\s*(?:credits?\b|requests?\b|tokens?\b|次)/.test(text);
  const unlimited = /\bunlimited\b|不限量|无限制|无限量/.test(text);
  if ((plan.allowanceNature === 'quota' && !quota) || (plan.allowanceNature === 'mixed' && (!quota || !unlimited))) {
    changes.push({ field: 'allowanceNature', recorded: plan.allowanceNature,
      missingEvidence: [!quota ? 'quota' : null, plan.allowanceNature === 'mixed' && !unlimited ? 'unlimited' : null].filter(Boolean) });
  }
  return { changes };
}

export async function runPlansStructureDriftCommand({ plans = null, plansFile = PATHS.planEntries, fetchPage = null, timeoutMs = 25_000 } = {}) {
  const list = validatePlans(plans ?? readJson(plansFile));
  const fetchImpl = fetchPage ?? (async (url) => {
    const response = await fetchWithTimeout(url, { timeoutMs, headers: { accept: 'text/html,application/xhtml+xml' } });
    return { text: await response.text() };
  });
  const pages = new Map(); const groups = new Map();
  const result = { ok: true, readOnly: true, coverage: { total: list.length, checked: 0, unknown: 0 },
    missingTiers: [], mergedTiers: [], removedTiers: [], allowanceChanges: [], unknown: [] };
  for (const plan of list) {
    const url = plan.sourceUrl ?? '';
    let validUrl = false;
    try { validUrl = ['http:', 'https:'].includes(new URL(url).protocol); } catch { /* 归入无法判定 */ }
    if (!validUrl) { result.unknown.push({ id: plan.id, plan: plan.plan, reason: '缺少可抓取的 sourceUrl', url }); continue; }
    if (!pages.has(url)) {
      try {
        const response = await fetchImpl(url);
        if (!object(response) || typeof response.text !== 'string' || response.error) pages.set(url, { error: response?.error || '页面正文结构异常' });
        else {
          const text = normalizeText(response.text);
          const prices = new Set([...extractPriceTokens(normalizePage(response.text))].map(Number));
          pages.set(url, { raw: response.text, text, prices });
        }
      } catch (error) { pages.set(url, { error: error.message || 'FETCH_FAILED' }); }
    }
    const page = pages.get(url);
    if (page.error || !page.prices.size) {
      result.unknown.push({ id: plan.id, plan: plan.plan, reason: page.error ? `抓取失败：${page.error}` : '页面无可解析价格（纯前端渲染或无价格 token）', url });
      continue;
    }
    const key = JSON.stringify([plan.providerId ?? plan.provider, url]);
    if (!groups.has(key)) groups.set(key, { provider: plan.provider, providerId: plan.providerId ?? null, url, plans: [], page });
    groups.get(key).plans.push(plan);
    // 价格证据仍供价格集合比较使用；额度语义缺证据时单独归无法判定。
    const hasSemantics = quantityEvidence(page.text).size > 0
      || /\b(?:quota|limited|limits?|capped|unlimited)\b|额度|上限|限量|积分|不限量|无限制|无限量/.test(page.text)
      || modelEvidence(plan).some((model) => hasModel(page.text, model));
    if (!hasSemantics) {
      result.unknown.push({ id: plan.id, plan: plan.plan, reason: '价格可解析但额度语义未渲染', url });
      continue;
    }
    const { changes, reason } = allowanceDifferences(plan, page.raw, page.text);
    if (reason) { result.unknown.push({ id: plan.id, plan: plan.plan, reason, url }); continue; }
    result.coverage.checked += 1;
    if (changes.length) result.allowanceChanges.push({ id: plan.id, plan: plan.plan, provider: plan.provider, url, changes });
  }
  for (const group of groups.values()) {
    const { provider, providerId, url, plans: recorded, page } = group;
    const prices = new Set(recorded.map((plan) => plan.monthlyPrice));
    const paid = [...prices].filter((price) => price > 0);
    const pagePaid = [...page.prices].filter((price) => price > 0).sort((a, b) => a - b);
    const missing = recorded.filter((plan) => plan.monthlyPrice > 0 && !page.prices.has(plan.monthlyPrice));
    const matching = paid.filter((price) => page.prices.has(price));
    const extra = pagePaid.filter((price) => !prices.has(price));
    if (extra.length) result.missingTiers.push({ provider, providerId, url, pagePrices: extra, recordedPrices: [...prices].sort((a, b) => a - b) });
    if (paid.length > 1 && matching.length === 1) {
      result.mergedTiers.push({ provider, providerId, url, ids: recorded.filter((plan) => plan.monthlyPrice > 0).map((plan) => plan.id), recordedPrices: paid.sort((a, b) => a - b), pagePrices: pagePaid });
    } else for (const plan of missing) result.removedTiers.push({ id: plan.id, plan: plan.plan, provider, providerId, url, recordedPrice: plan.monthlyPrice, pagePrices: pagePaid });
  }
  result.coverage.unknown = result.unknown.length;
  return result;
}

export function formatPlansStructureDriftReport(result) {
  const { total, checked, unknown } = result.coverage;
  const lines = ['== 套餐结构与额度漂移（待人工确认，只读） ==', `覆盖率：可判 ${checked}/${total} 档 · 无法判定 ${unknown} 档`,
    `疑似漏档 ${result.missingTiers.length} · 疑似合并 ${result.mergedTiers.length} · 疑似下架 ${result.removedTiers.length} · 额度语义变化 ${result.allowanceChanges.length}`];
  for (const [label, rows] of [['疑似漏档', result.missingTiers], ['疑似合并', result.mergedTiers], ['疑似下架', result.removedTiers], ['额度语义变化', result.allowanceChanges], ['无法判定', result.unknown]]) {
    for (const row of rows) lines.push(`${label}：${JSON.stringify(row)}`);
  }
  return lines.join('\n');
}
