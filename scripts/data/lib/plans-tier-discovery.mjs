/**
 * 套餐档位发现（#19 / v0.12.0）。
 *
 * 与 `plans-structure-drift` 的区别：那个命令只做「全页价格数字集合差集」，
 * 页面上一堆 token 单价会被当成候选档位（实测 Anthropic 页报出 29 个单价）。
 * 这里先把每个价格**归类到语境**（月费 / 单价 / 额度 / 年付 / 席位 / 促销 / 多价 / 异常），
 * 只有「干净的月费证据」才有资格进候选，且已录值与未录值采用不对称判据。
 *
 * 只读：不写任何数据文件，不改仓库数据；网络只在 CLI 层发生（由调用方注入 fetchPage）。
 */
import { fetchWithTimeout } from './http.mjs';
import { CliError, PATHS, readJson } from './io.mjs';
import { normalizePage } from './plans-drift.mjs';
import { validatePlans } from './plans-structure-drift.mjs';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const MAX_PLAUSIBLE_MONTHLY = 100000;

/** 月费词：紧贴数字之后判断最稳（`$10 per month`、`¥200/月`） */
const MONTHLY_WORDS = /(\/ ?月|每月|月付|\/ ?mo(?:nth)?\b|per month|monthly|按月|月费)/i;
/** 单价词：出现即排除（单位通常在数字之后） */
const UNIT_WORDS = /(\/ ?mtok|\/ ?million|per 1m|\/ ?千 ?token|\/ ?1k token|\/ ?token|per hour|per session|\/ ?小时|百万|每百万|\/m token)/i;
/** 额度词：出现在属性 / 行标签 / 列头里时，这个数字是额度不是月费 */
const ALLOWANCE_WORDS = /(allowance|allotment|usage|credits?\b|requests?\b|额度|积分|用量|上限|次数)/i;
const ANNUAL_WORDS = /(annual|per year|\/ ?年|年付|按年|季付|季度|季付)/i;
const SEAT_WORDS = /(per seat|seat\b|席位|每席)/i;
const PROMO_WORDS = /(限时|首月|特惠|折扣|促销|起价|starting at|promo\b|%\s*off|折)/i;

/**
 * 从页面原文抽价格 token，分三条通道。
 *
 * C1 属性：`<p class="price" data-plan="pro_monthly">$17</p>` —— 属性串里常有 monthly/annual/allowance 线索。
 * C2 表格：列头决定「这一列是不是月费」（StepFun 的季付列只有列头能判）。
 * C3 文本：兜底通道，给前后窗口。
 */
export function collectPriceTokens(raw) {
  const html = String(raw ?? '');
  const text = normalizePage(html);
  const tokens = [];

  // ---- C1：标签属性 + 紧随其后的价格 ----
  for (const match of html.matchAll(/<([a-z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>\s*([^<]{0,80}?)([¥$])\s*(\d[\d,]*(?:\.\d+)?)/gi)) {
    tokens.push({
      value: Number(match[5].replaceAll(',', '')),
      currency: match[4] === '¥' ? 'CNY' : 'USD',
      channel: 'attr',
      attrs: match[2].toLowerCase(),
      label: match[3].toLowerCase(),
      before: '',
      after: match[3].toLowerCase(),
      header: '',
      rowLabel: '',
      rowPrices: 1,
      snippet: `${match[4]}${match[5]} ${match[3].trim()}`.trim(),
    });
  }

  // ---- C2：表格（列头 + 行首格 + 同行价格数）----
  for (const table of html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
    const rows = [...table[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<(td|th)\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/\1>/gi)].map((cell) => ({
        header: cell[1].toLowerCase() === 'th',
        attrs: cell[2].toLowerCase(),
        text: normalizePage(cell[3]).replace(/\s+/g, ' ').trim(),
      })));
    const headerRow = rows.find((cells) => cells.length > 0 && cells.every((cell) => cell.header)) ?? [];
    const headerText = headerRow.map((cell) => cell.text).join(' | ').toLowerCase();
    for (const cells of rows) {
      const rowPrices = cells.reduce((sum, cell) => sum + [...cell.text.matchAll(/[¥$]\s*\d/g)].length, 0);
      const rowLabel = cells[0] ? cells[0].text.toLowerCase() : '';
      for (const cell of cells) {
        for (const price of cell.text.matchAll(/([¥$])\s*(\d[\d,]*(?:\.\d+)?)/g)) {
          tokens.push({
            value: Number(price[2].replaceAll(',', '')),
            currency: price[1] === '¥' ? 'CNY' : 'USD',
            channel: 'table',
            attrs: cell.attrs,
            label: cell.text.toLowerCase(),
            before: headerText,
            after: '',
            header: headerText,
            rowLabel,
            rowPrices,
            snippet: cell.text.slice(0, 80),
          });
        }
      }
    }
  }

  // ---- C4：Markdown 管道表（官方 .md 定价页常见：表头「月付/季付/年付」决定列语义）----
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith('|') || !/\|/.test(line)) continue;
    const next = (lines[index + 1] ?? '').trim();
    if (!/^\|[\s:|-]+\|$/.test(next)) continue; // 必须是表头 + 分隔行
    const header = line.split('|').slice(1, -1).map((cell) => cell.trim().toLowerCase());
    let row = index + 2;
    for (; row < lines.length; row += 1) {
      const dataLine = lines[row].trim();
      if (!dataLine.startsWith('|')) break;
      const cells = dataLine.split('|').slice(1, -1).map((cell) => cell.trim());
      const rowPrices = cells.reduce((sum, cell) => sum + [...cell.matchAll(/[¥$]\s*\d/g)].length, 0);
      cells.forEach((cell, column) => {
        for (const price of cell.matchAll(/([¥$])\s*(\d[\d,]*(?:\.\d+)?)/g)) {
          tokens.push({
            value: Number(price[2].replaceAll(',', '')),
            currency: price[1] === '¥' ? 'CNY' : 'USD',
            channel: 'markdown-table',
            attrs: '',
            label: `${cells[0] ?? ''} ${cell}`.trim().toLowerCase(),
            before: header.join(' | '),
            after: '',
            header: `${header[column] ?? ''}`,
            headerLine: header.join(' | '),
            rowLabel: (cells[0] ?? '').toLowerCase(),
            rowPrices,
            snippet: dataLine.slice(0, 80),
          });
        }
      });
      index = row;
    }
  }

  // ---- C3：文本兜底（前后窗口）----
  for (const match of text.matchAll(/([¥$])\s?(\d[\d,]*(?:\.\d+)?)/g)) {
    const index = match.index ?? 0;
    tokens.push({
      value: Number(match[2].replaceAll(',', '')),
      currency: match[1] === '¥' ? 'CNY' : 'USD',
      channel: 'text',
      attrs: '',
      label: '',
      before: text.slice(Math.max(0, index - 90), index).toLowerCase(),
      after: text.slice(index + match[0].length, index + match[0].length + 60).toLowerCase(),
      header: '',
      rowLabel: '',
      rowPrices: 1,
      snippet: text.slice(Math.max(0, index - 40), index + 40).replace(/\s+/g, ' ').trim(),
    });
  }

  return tokens;
}

/**
 * 单次出现的语境判定（顺序即优先级，短路返回）。
 * kind ∈ monthly | annual | seat | promo | multi | allowance | unit | conflict | anomaly | noContext
 */
export function classifyToken(token) {
  const { value } = token;
  if (!Number.isFinite(value) || value < 0) return { kind: 'anomaly', reason: '非法数值' };
  if (value > MAX_PLAUSIBLE_MONTHLY) {
    const joined = `${token.before}${token.label}${token.after}`;
    const plausible = joined.includes(String(value));
    return { kind: 'anomaly', reason: plausible ? '值域超上限' : '跨标签拼接（原页面无连续数值）' };
  }

  const scope = `${token.attrs} ${token.label} ${token.rowLabel} ${token.header}`.toLowerCase();
  const window = `${token.before} ${token.after}`.toLowerCase();

  // R3 额度语境（列头/行标签/属性命中额度词）
  if (ALLOWANCE_WORDS.test(scope)) return { kind: 'allowance', reason: '额度/用量语境' };

  // R4 年付属性
  if (/amount_total|annual|per_year|yearly/.test(token.attrs)) return { kind: 'annual', reason: '属性标注为年付总额' };

  // R5 单价语境：单位总是跟在数字**后面**（`$3 / MTok`、`$0.05 per hour`）。
  // 只看前窗口会把上一个价格的单位算到本数字头上（实测：$500 的前窗口含 `/ MTok`，被误判成单价）。
  if (UNIT_WORDS.test(token.after ?? '') || UNIT_WORDS.test(token.label ?? '')) {
    return { kind: 'unit', reason: '单价语境（每 token / 每小时 / 每次）' };
  }

  // R6 月费词后紧跟额度词：`Up to $500 per month in pooled API credits`
  // 只看数字**之后**的文本：表头里的「月度 Credit」是列名，不该把整列都判成冲突。
  if (MONTHLY_WORDS.test(token.after ?? '') && ALLOWANCE_WORDS.test(token.after ?? '')) {
    return { kind: 'conflict', reason: '月费与额度证据冲突' };
  }

  // R7 表格列头为月付且不含季/年（HTML 表格与 Markdown 管道表共用）
  const headerCell = `${token.header ?? ''}`;
  if (headerCell && MONTHLY_WORDS.test(headerCell) && !ANNUAL_WORDS.test(headerCell)) {
    // 表格列头是「结构性证据」：同一行其它通道的模糊窗口不该把它降级
    return { kind: 'monthly', reason: '表格列头标注月付', strict: true };
  }
  // R7b Markdown 表头整行含季/年列时，非月付列不当作月费
  if (token.headerLine && ANNUAL_WORDS.test(headerCell)) return { kind: 'annual', reason: '表头为季付/年付列' };

  // R8 属性标注月费且非席位
  if (/amount_per_month|monthly/.test(token.attrs) && !SEAT_WORDS.test(token.attrs)) {
    return { kind: 'monthly', reason: '属性标注月费' };
  }

  // R9 有月费词但同时出现年付/季付
  if (MONTHLY_WORDS.test(window) && ANNUAL_WORDS.test(window)) return { kind: 'annual', reason: '窗口含年付/季付证据' };

  // R10 席位 / 促销
  if (MONTHLY_WORDS.test(window) && SEAT_WORDS.test(window)) return { kind: 'seat', reason: '按席位计价' };
  if (MONTHLY_WORDS.test(window) && PROMO_WORDS.test(window)) return { kind: 'promo', reason: '促销/首月价' };
  if (PROMO_WORDS.test(window) && PROMO_WORDS.test(token.label)) return { kind: 'promo', reason: '促销文案' };

  // R11 同块多价（同一行出现 ≥2 个价格，无法判断哪个是月费）
  if (token.rowPrices >= 2) return { kind: 'multi', reason: '同块多价，无法定位月费' };

  // R12 干净月费证据
  if (MONTHLY_WORDS.test(window)) return { kind: 'monthly', reason: '紧邻月费词' };

  return { kind: 'noContext', reason: '无月费证据' };
}

/**
 * 同一数值可能被多个通道命中，也会同时给出互相矛盾的证据
 * （`Up to $500 per month in pooled API credits` 既是「月费词」又是「额度」）。
 * 这里按值收集**全部**归类，交给后面的不对称判据裁决：
 * 已录值只要有一处月费证据就算「仍在」；未录值必须只有月费证据才算高置信。
 */
export function foldTokens(tokens) {
  const byValue = new Map();
  for (const token of tokens) {
    const verdict = classifyToken(token);
    const key = `${token.currency}:${token.value}`;
    const entry = byValue.get(key) ?? { value: token.value, currency: token.currency, kinds: [], reasons: [], snippet: token.snippet, strict: false };
    if (verdict.strict && !entry.strict) {
      // 表头明确写了「月付」→ 结构性证据，覆盖其它通道的模糊窗口
      entry.strict = true;
      entry.kinds = ['monthly'];
      entry.reasons = [`monthly：${verdict.reason}（结构性证据）`];
    } else if (!entry.strict && !entry.kinds.includes(verdict.kind)) {
      entry.kinds.push(verdict.kind);
      entry.reasons.push(`${verdict.kind}：${verdict.reason}`);
    }
    if (!entry.snippet && token.snippet) entry.snippet = token.snippet;
    byValue.set(key, entry);
  }
  return [...byValue.values()];
}

/**
 * volcengine 专用：该站把套餐写进页面内嵌 JSON（`"name":"Lite Plan"` + `"periodUnit":"元/月"` + `priceConfig`）。
 * 只按公开结构解析；解析不到就返回 null，由上层记 unavailable，绝不猜。
 */
export function parseVolcengineMonthly(raw) {
  // 页面里的 JSON 被转义过（`\"originalAmount\":\"40/月\"`），先统一去转义。
  const html = String(raw ?? '').replace(/\\"/g, '"');
  // 该站把「真价」放在 originalAmount（形如 `40/月`、`120/季`、`480/年`），
  // 折扣价放 discountAmount；月档卡片价在实测里是占位符（Lite/Pro 同为 40/月）。
  const rows = [...html.matchAll(/"originalAmount"\s*:\s*"(\d[\d,]*(?:\.\d+)?)\/(月|季|年)"/g)]
    .map((match) => ({ amount: Number(match[1].replaceAll(',', '')), period: match[2] }))
    .filter((row) => Number.isFinite(row.amount) && row.amount > 0);
  if (rows.length === 0) return null;
  const toMonthly = (row) => (row.period === '季' ? Math.round((row.amount / 3) * 100) / 100
    : row.period === '年' ? Math.round((row.amount / 12) * 100) / 100 : row.amount);
  const derived = [...new Set(rows.map(toMonthly))].sort((a, b) => a - b);
  const quarterly = new Set(rows.filter((row) => row.period === '季').map(toMonthly));
  const yearly = new Set(rows.filter((row) => row.period === '年').map(toMonthly));
  const crossChecked = [...quarterly].filter((price) => yearly.has(price)).sort((a, b) => a - b);
  return {
    derivedMonthly: derived,
    crossChecked,
    placeholderNote: crossChecked.length === 0 ? '季/年折算不一致，月档价按占位符处理' : null,
  };
}

const providerName = (plan) => plan.provider;

/**
 * 逐厂商评估：已录价位 vs 页面「月费」集合，带完整性守卫。
 */
export function evaluateGroup(plans, folded, extras = {}) {
  const recordedAll = [...new Set(plans.map((plan) => plan.monthlyPrice))].sort((a, b) => a - b);
  const recorded = recordedAll.filter((price) => price > 0);
  const recordedSet = new Set(recordedAll);

  // 月费证据：只有含 monthly 且不含 anomaly 的才算「在页面上有月费证据」
  const monthlyValues = folded.filter((row) => row.kinds.includes('monthly') && !row.kinds.includes('anomaly'))
    .map((row) => row.value)
    .concat(Array.isArray(extras?.derivedMonthly) ? extras.derivedMonthly : []);
  const monthlySet = new Set(monthlyValues);

  const hits = recorded.filter((price) => monthlySet.has(price));
  const remainingRecorded = recorded.filter((price) => !monthlySet.has(price));

  // 高置信新档位：未录 + 证据里**只有** monthly（没有任何排除证据）
  const candidates = folded
    .filter((row) => !recordedSet.has(row.value))
    .filter((row) => row.kinds.length === 1 && row.kinds[0] === 'monthly')
    .map((row) => ({ price: row.value, reason: row.reasons[0] ?? '', snippet: row.snippet }));

  // 低置信：有月费词但混着别的证据（年付/席位/促销/同块多价/额度冲突）
  const lowConfidence = folded
    .filter((row) => !recordedSet.has(row.value))
    .filter((row) => row.kinds.includes('monthly') && row.kinds.length > 1 && !row.kinds.includes('anomaly'))
    .map((row) => ({ price: row.value, kinds: row.kinds, reason: row.reasons.join(' / '), snippet: row.snippet }));

  const reliable = monthlySet.size >= 2 && recorded.length > 0 && hits.length / recorded.length >= 0.5;

  return {
    recordedPrices: recordedAll,
    pageMonthlyPrices: [...monthlySet].sort((a, b) => a - b),
    reliable,
    hits,
    removed: reliable ? remainingRecorded : [],
    merged: reliable && recorded.length > 1 && hits.length === 1 ? hits : [],
    candidates,
    lowConfidence,
    evidence: {
      monthly: monthlySet.size,
      anomaly: folded.filter((row) => row.kinds.includes('anomaly')).length,
      allowance: folded.filter((row) => row.kinds.includes('allowance') && !row.kinds.includes('monthly')).length,
      unit: folded.filter((row) => row.kinds.includes('unit') && !row.kinds.includes('monthly')).length,
      noContext: folded.filter((row) => row.kinds.length === 1 && row.kinds[0] === 'noContext').length,
    },
    extras,
  };
}

const isValidUrl = (url) => {
  try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
};

export async function runPlansTierDiscoveryCommand({ plans = null, plansFile = PATHS.planEntries, fetchPage = null, timeoutMs = 25000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000) {
    throw new CliError('参数 --timeout-ms 必须为 1..120000 的整数', { code: 'BAD_ARGUMENT' });
  }
  const list = validatePlans(plans ?? readJson(plansFile));
  const fetchImpl = fetchPage ?? (async (url) => {
    const response = await fetchWithTimeout(url, { timeoutMs, headers: { accept: 'text/html,application/xhtml+xml' } });
    return { text: await response.text(), status: response.status, contentType: response.headers?.get?.('content-type') ?? null };
  });

  const byUrl = new Map();
  for (const plan of list) {
    const url = plan.sourceUrl ?? '';
    if (!isValidUrl(url)) continue;
    if (!byUrl.has(url)) byUrl.set(url, []);
    byUrl.get(url).push(plan);
  }

  const result = {
    ok: true,
    readOnly: true,
    coverage: { total: list.length, consistent: 0, lowOnly: 0, unknown: 0, anomalies: 0, unavailable: 0 },
    groups: [],
    candidates: [],
    lowConfidence: [],
    anomalies: [],
    unavailable: [],
    removed: [],
    merged: [],
  };

  for (const [url, plans] of byUrl) {
    const providerId = plans[0].providerId;
    const provider = providerName(plans[0]);
    let page;
    try {
      page = await fetchImpl(url);
    } catch (error) {
      result.unavailable.push({ provider, providerId, url, httpStatus: null, kind: 'http-error', reason: error instanceof Error ? error.message : String(error), evidence: null });
      result.coverage.unknown += plans.length;
      result.coverage.unavailable += 1;
      continue;
    }
    const text = String(page?.text ?? '');

    // 纯前端渲染的壳：整页几乎没有中文价格，且带 SPA 特征
    if (/doesn't work properly without JavaScript|id="app"/i.test(text) && !/[¥$]\s?\d/.test(normalizePage(text))) {
      result.unavailable.push({ provider, providerId, url, httpStatus: page?.status ?? null, kind: 'js-rendered', reason: '纯前端渲染，无服务端价格', evidence: { bytes: text.length, contentType: page?.contentType ?? null } });
      result.coverage.unknown += plans.length;
      result.coverage.unavailable += 1;
      continue;
    }

    // volcengine：月档价是占位符，季/年折算自洽才采用（裁定 R5）
    let extras = {};
    if (providerId === 'volcengine') {
      const derived = parseVolcengineMonthly(text);
      if (derived && derived.derivedMonthly.length > 0) {
        extras = {
          source: 'json-props',
          derivedMonthly: derived.derivedMonthly,
          crossChecked: derived.crossChecked,
          placeholder: derived.placeholderNote,
        };
      }
    }

    const folded = foldTokens(collectPriceTokens(text));
    const group = evaluateGroup(plans, folded, extras);

    const anomalies = folded.filter((row) => row.kinds.includes('anomaly'))
      .map((row) => ({ provider, providerId, url, value: row.value, reason: row.reasons.find((text) => text.startsWith('anomaly')) ?? 'anomaly', snippet: row.snippet, action: '疑似解析异常' }));
    result.anomalies.push(...anomalies);

    for (const candidate of group.candidates) {
      result.candidates.push({ provider, providerId, url, price: candidate.price, recordedPrices: group.recordedPrices, confidence: 'high', action: '新增档位', reason: candidate.evidence?.reason ?? '' });
    }
    for (const low of group.lowConfidence) {
      result.lowConfidence.push({ provider, providerId, url, price: low.price, recordedPrices: group.recordedPrices, confidence: 'low', action: '新增档位', reason: low.reason, kinds: low.kinds, snippet: low.snippet });
    }
    if (group.removed.length > 0) {
      result.removed.push({ provider, providerId, url, prices: group.removed, pageMonthlyPrices: group.pageMonthlyPrices, action: '疑似下架需复核' });
    }
    if (group.merged.length > 0) {
      result.merged.push({ provider, providerId, url, prices: group.merged, pageMonthlyPrices: group.pageMonthlyPrices, action: '疑似合并' });
    }

    const clean = group.reliable && group.removed.length === 0 && group.merged.length === 0
      && group.candidates.length === 0 && group.lowConfidence.length === 0;
    if (!group.reliable) {
      result.coverage.unknown += plans.length;
      result.groups.push({ provider, providerId, url, reliable: false, reason: '月费集合不完整（命中不足或页面月费价位数 < 2）', ...group });
    } else if (clean) {
      result.coverage.consistent += plans.length;
      result.groups.push({ provider, providerId, url, reliable: true, ...group });
    } else {
      result.coverage.lowOnly += plans.length;
      result.groups.push({ provider, providerId, url, reliable: true, ...group });
    }
  }

  result.coverage.anomalies = result.anomalies.length;
  return result;
}

export function formatPlansTierDiscoveryReport(result) {
  const { coverage } = result;
  const lines = [
    '== 套餐档位发现（候选清单，只读） ==',
    `覆盖率：一致 ${coverage.consistent}/${coverage.total} · 仅有候选/低置信 ${coverage.lowOnly} · 无法判定 ${coverage.unknown} · 解析异常 ${coverage.anomalies} · 抓不到 ${coverage.unavailable}`,
  ];
  const section = (title, rows, render) => {
    lines.push(`-- ${title}（${rows.length}）--`);
    if (rows.length === 0) { lines.push('  无'); return; }
    for (const row of rows.slice(0, 20)) lines.push(`  ${render(row)}`);
    if (rows.length > 20) lines.push(`  另有 ${rows.length - 20} 条，见 --json`);
  };
  section('高置信候选（新增档位）', result.candidates, (row) => `${row.provider} · ${row.price} · ${row.reason} · 已录 ${row.recordedPrices.join('/')}`);
  section('低置信 / 需复核', result.lowConfidence, (row) => `${row.provider} · ${row.price} · ${row.reason} · 已录 ${row.recordedPrices.join('/')}`);
  section('疑似下架需复核', result.removed, (row) => `${row.provider} · 已录 ${row.prices.join('/')} 未在页面月费集合 ${row.pageMonthlyPrices.join('/')} 中`);
  section('疑似合并', result.merged, (row) => `${row.provider} · 仅剩 ${row.prices.join('/')} 命中 · 页面月费集合 ${row.pageMonthlyPrices.join('/')}`);
  section('疑似解析异常', result.anomalies, (row) => `${row.provider} · ${row.value} · ${row.reason} · ${row.snippet}`);
  section('抓不到 / 无法判定', result.unavailable, (row) => `${row.provider} · ${row.kind} · ${row.reason}`);
  lines.push('本报告不写任何文件；收录仍需人工核验官方页。');
  return lines.join('\n');
}
