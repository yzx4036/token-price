import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { CliError, PATHS } from './io.mjs';

export const OFFICIAL_PRICE_SOURCES = Object.freeze([
  Object.freeze({ providerId: 'deepseek', url: 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing.md' }),
  Object.freeze({ providerId: 'aliyun', url: 'https://help.aliyun.com/zh/model-studio/model-pricing.md' }),
  Object.freeze({ providerId: 'volcengine', url: 'https://docs.volcengine.com/docs/zh/ark/model-pricing.md' }),
]);

// 只认仓库已记录的模型与条件，不按名称相似度猜测型号或计费档位。
const ALI_CONDITIONS = Object.freeze({
  'qwen3.8-max': '0<Token≤1M', 'qwen3.7-max': '0<Token≤1M', 'qwen-max': '无阶梯',
  'qwen3.7-plus': '0<Token≤256K', 'qwen3.6-plus': '0<Token≤256K', 'qwen3.5-plus': '0<Token≤128K',
  'qwen3.8-flash': '0<Token≤1M', 'qwen3.7-flash': '0<Token≤32K', 'qwen3.6-flash': '0<Token≤256K', 'qwen-long': '无阶梯',
  'qwen3.8-omni-flash': '中国内地',
});
const PRICE_KEYS = ['input', 'output', 'cacheRead'];
const keyOf = (row) => JSON.stringify([row.providerId, row.model, row.condition]);
const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const requireThat = (ok, reason) => { if (!ok) throw new Error(reason); };

// 仅清理标记和 Markdown 转义，不吞掉区间里的 <Token，也不执行 MDX。
function textOf(value) {
  return String(value).replace(/<br\s*\/?\s*>/gi, ' ')
    .replace(/<\/?[A-Za-z][\w-]*(?:\s[^<>]*)?\/?>/g, ' ')
    .replace(/\\([\\`*{}\[\]()#+\-.!<>|])/g, '$1').replace(/[`*]/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}
const compact = (value) => textOf(value).replace(/\s+/g, '');

function price(value, { yuan = false, nullable = false } = {}) {
  const raw = compact(value);
  if (nullable && (raw === '-' || raw === '—')) return null;
  const match = yuan ? /^(?:原价)?(\d+(?:\.\d+)?)元(?:（限时\d+折）)?$/.exec(raw) : /^(\d+(?:\.\d+)?)$/.exec(raw);
  requireThat(match, `价格数值或币种不可识别：${raw}`);
  const amount = Number(match[1]);
  requireThat(Number.isFinite(amount) && amount >= 0, `价格不是有限非负数：${raw}`);
  return amount;
}

/** 将仓库条目投影到与官网相同的结构；绝不把仓库价格当作解析结果补位。 */
export function officialPriceBasis(entries, providerId) {
  requireThat(Array.isArray(entries), '价格基准不是数组');
  const rows = entries.filter((x) => x.providerId === providerId && x.provenance === 'official' && x.status === 'verified').map((x) => {
    requireThat(x.reportedCurrency === 'CNY' && x.billingCurrency === 'CNY' && x.unit === 'per_1m_tokens', `基准币种或单位不支持：${x.id}`);
    let model = x.model;
    let condition;
    if (providerId === 'deepseek') {
      const match = /^(deepseek-flash|deepseek-v4-pro)（(空闲时段|高峰时段)）$/.exec(model);
      requireThat(match, `未配置的 DeepSeek 型号或时段：${model}`);
      [, model, condition] = match;
    } else if (providerId === 'aliyun') {
      requireThat(Object.hasOwn(ALI_CONDITIONS, model), `未配置的百炼型号：${model}`);
      condition = ALI_CONDITIONS[model];
      requireThat(compact(x.pricingCondition).startsWith(condition), `百炼基准条件不支持：${model}`);
      requireThat(condition === '中国内地' || x.pricingCondition.includes('华北2（北京）'), `百炼基准地域不支持：${model}`);
    } else if (providerId === 'volcengine') {
      condition = /^输入长度 (\[[\d, ]+\]) 千 token/.exec(x.pricingCondition)?.[1].replace(/\s+/g, '');
      if (model === 'doubao-seed-translation' && x.pricingCondition.startsWith('无分段条件；')) condition = '-';
      requireThat(condition, `未配置的方舟条件：${model}`);
    } else throw new Error(`未配置的厂商：${providerId}`);
    return { providerId, model, condition, currency: 'CNY', input: x.inputPrice, output: x.outputPrice, cacheRead: x.cacheReadPrice };
  });
  requireThat(rows.length > 0, '没有 official + verified 价格基准');
  return canonicalizePrices(rows);
}

/** 固定字段顺序、集合排序、数值规范化；不包含日期、说明或页面标记。 */
export function canonicalizePrices(rows) {
  const seen = new Set();
  return rows.map((row) => {
    const record = { providerId: row.providerId, model: row.model, condition: row.condition, currency: row.currency };
    requireThat([record.providerId, record.model, record.condition].every((x) => typeof x === 'string' && x.length > 0), '缺少价格结构键');
    requireThat(record.currency === 'CNY', '币种不是 CNY');
    for (const field of PRICE_KEYS) {
      if (field === 'cacheRead' && row[field] === null) { record[field] = null; continue; }
      const raw = row[field];
      requireThat(typeof raw === 'number' || (typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw)), `非法字段 ${field}`);
      const value = Number(raw);
      requireThat(Number.isFinite(value) && value >= 0, `非法字段 ${field}`);
      record[field] = Object.is(value, -0) ? 0 : value;
    }
    const key = keyOf(record);
    requireThat(!seen.has(key), `重复价格键：${record.model} / ${record.condition}`);
    seen.add(key);
    return record;
  }).sort((a, b) => lexical(keyOf(a), keyOf(b)));
}

export function priceFingerprint(rows) {
  return createHash('sha256').update(JSON.stringify(canonicalizePrices(rows)), 'utf8').digest('hex');
}

function complete(rows, targets) {
  const result = canonicalizePrices(rows);
  const found = new Set(result.map(keyOf));
  for (const target of targets) requireThat(found.has(keyOf(target)), `缺少已收录模型/条件：${target.model} / ${target.condition}`);
  requireThat(result.length === targets.length, '解析价格集合与已收录范围不一致');
  return result;
}

/** 只读取标准 Markdown 表；保留空单元格，避免阶梯行错列。 */
function markdownTables(markdown) {
  const groups = [];
  let current = [];
  for (const line of `${markdown}\n`.split(/\r?\n/)) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      current.push(line.trim().slice(1, -1).split('|').map(textOf));
    } else if (current.length) {
      if (current.length >= 2 && current[1].every((x) => /^:?-+:?$/.test(x.replace(/\s/g, '')))) groups.push(current);
      current = [];
    }
  }
  return groups;
}

/** DeepSeek：模型在列、价格类型与峰谷在行，输入只取缓存未命中。 */
export function parseDeepseekPrices(markdown, targets) {
  const tables = markdownTables(markdown).filter((t) => t[0][0] === '模型');
  requireThat(tables.length === 1, 'DeepSeek 模型表头缺失或重复');
  const [header, , ...body] = tables[0];
  const columns = header.map((x) => x.replace(/\(\d+\)$/, ''));
  const rows = [];
  for (const target of targets) {
    const index = columns.indexOf(target.model);
    requireThat(index >= 3 && columns.lastIndexOf(target.model) === index, `DeepSeek 模型列缺失或重复：${target.model}`);
    const record = { ...target };
    for (const [field, label] of [['input', '百万tokens输入/（缓存未命中）'], ['output', '百万tokens输出'], ['cacheRead', '百万tokens输入/（缓存命中）']]) {
      const matching = body.filter((r) => compact(r[1]) === label && r[2] === target.condition);
      requireThat(matching.length === 1 && matching[0].length === header.length, `DeepSeek 价格行缺失或重复：${label} / ${target.condition}`);
      record[field] = price(matching[0][index], { yuan: true });
    }
    rows.push(record);
  }
  return complete(rows, targets);
}

// 百炼 Markdown 内嵌 MDX 表的行列展开（只识别数字 rowSpan/colSpan）。
function htmlGrid(fragment) {
  const grid = [];
  const carry = [];
  for (const match of fragment.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = [];
    for (let i = 0; i < carry.length; i++) {
      if (carry[i]?.left > 0) { row[i] = carry[i].value; carry[i].left--; }
    }
    let col = 0;
    for (const cell of match[1].matchAll(/<t[dh]\b([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
      while (row[col] !== undefined) col++;
      const span = (name) => Number(new RegExp(`${name}\\s*=\\s*(?:\\{(\\d+)\\}|["'](\\d+)["']|(\\d+))`, 'i').exec(cell[1])?.slice(1).find(Boolean) ?? 1);
      const width = span('colSpan'), height = span('rowSpan');
      requireThat(width >= 1 && width <= 20 && height >= 1 && height <= 100, '百炼表格跨度不支持');
      const value = textOf(cell[2]);
      for (let i = 0; i < width; i++) {
        requireThat(row[col] === undefined, '百炼表格合并单元格重叠');
        row[col] = value;
        if (height > 1) carry[col] = { value, left: height - 1 };
        col++;
      }
    }
    grid.push(row);
  }
  return grid;
}

/** 百炼：只读北京 Tab 的文本首档/非思考列，以及 Omni 的中国内地行。 */
export function parseAliyunPrices(markdown, targets) {
  const tabs = [...markdown.matchAll(/<Tab\s+title="华北2（北京）">([\s\S]*?)<\/Tab>/g)].map((m) => m[1]);
  requireThat(tabs.length > 0, '百炼北京 Tab 缺失');
  const wanted = new Map(targets.map((x) => [x.model, x]));
  const rows = [];
  for (const tab of tabs) {
    for (const table of tab.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)) {
      const head = /<thead>([\s\S]*?)<\/thead>/i.exec(table[1]);
      const body = /<tbody>([\s\S]*?)<\/tbody>/i.exec(table[1]);
      if (!head || !body) continue;
      const headerGrid = htmlGrid(head[1]);
      const grid = htmlGrid(body[1]);
      // 只处理含目标模型的表；无关产品改版不影响本次范围。
      if (!grid.some((r) => wanted.has(r[0]?.split(/\s/)[0]))) continue;
      const headers = (headerGrid[0] ?? []).map((_, i) => [...new Set(headerGrid.map((r) => compact(r[i] ?? '')))].join('/'));
      requireThat(headers[0]?.includes('模型ID'), '百炼模型 ID 表头缺失');
      const inputCol = headers.findIndex((h) => h === '输入单价（每百万Token）');
      const outputCol = headers.findIndex((h) => h.includes('输出单价（每百万Token）') && (!h.includes('/思考模式') || h.includes('/非思考模式')));
      const conditionCol = headers.findIndex((h) => /^单次请求的输入Token(?:数|范围)$/.test(h));
      const modeCol = headers.indexOf('模式');
      requireThat(inputCol >= 0 && outputCol >= 0, '百炼输入/输出每百万 Token 表头缺失');
      for (const r of grid) {
        const target = wanted.get(r[0]?.split(/\s/)[0]);
        if (!target || target.model === 'qwen3.8-omni-flash') continue;
        let condition = conditionCol < 0 ? '无阶梯' : compact(r[conditionCol]);
        if (/^无阶梯计[价费]$/.test(condition)) condition = '无阶梯';
        if (condition !== target.condition) continue;
        requireThat(modeCol < 0 || ['仅非思考模式', '非思考和思考模式', '非思考模式'].includes(compact(r[modeCol])), '百炼非思考模式列不可判定');
        rows.push({ providerId: 'aliyun', model: target.model, condition, currency: 'CNY', input: price(r[inputCol], { yuan: true }), output: price(r[outputCol], { yuan: true }), cacheRead: null });
      }
    }
    for (const [header, , ...body] of markdownTables(tab)) {
      if (!body.some((r) => r[0] === 'qwen3.8-omni-flash') || !wanted.has('qwen3.8-omni-flash')) continue;
      requireThat(header.map(compact).join('|') === '模型ID（ModelID）|服务部署范围|输入单价（每百万Token）|缓存命中输入单价（每百万Token）|输出单价（每百万Token）', '百炼 Omni 表头变化');
      for (const r of body.filter((r) => r[0] === 'qwen3.8-omni-flash' && r[1] === '中国内地')) {
        requireThat(r.length === 5, '百炼 Omni 列数变化');
        rows.push({ providerId: 'aliyun', model: r[0], condition: r[1], currency: 'CNY', input: price(r[2], { yuan: true }), output: price(r[4], { yuan: true }), cacheRead: price(r[3], { yuan: true }) });
      }
    }
  }
  return complete(rows, targets);
}

/** 方舟：只读在线推理（常规）非音频列，精确匹配已记录的输入长度档位。 */
export function parseVolcenginePrices(markdown, targets) {
  const sections = markdown.split(/^## 在线推理（常规）\s*$/m);
  requireThat(sections.length === 2, '方舟在线推理（常规）节缺失或重复');
  const section = sections[1].split(/^## /m)[0];
  const tables = markdownTables(section);
  requireThat(tables.length === 1, '方舟常规价格表缺失或重复');
  const [header, , ...body] = tables[0];
  const expected = ['模型名称', '条件输入长度：千token', '输入(非音频)元/百万token', '输入(音频)元/百万token', '缓存存储元/百万token/小时', '缓存命中(非音频)元/百万token', '缓存命中(音频)元/百万token', '输出元/百万token'];
  requireThat(header.map(compact).join('|') === expected.join('|'), '方舟价格表头/币种/单位变化');
  const wanted = new Map(targets.map((x) => [keyOf(x), x]));
  const rows = [];
  let model = '';
  for (const r of body) {
    if (r[0]) model = r[0];
    const condition = compact(r[1] ?? '').replace(/^输入长度/, '');
    const candidate = { providerId: 'volcengine', model, condition };
    if (!wanted.has(keyOf(candidate))) continue;
    requireThat(r.length === 8, '方舟价格列数变化');
    rows.push({ ...candidate, currency: 'CNY', input: price(r[2]), output: price(r[7]), cacheRead: price(r[5], { nullable: true }) });
  }
  return complete(rows, targets);
}

export function diffOfficialPrices(basis, official) {
  const before = new Map(canonicalizePrices(basis).map((x) => [keyOf(x), x]));
  const after = new Map(canonicalizePrices(official).map((x) => [keyOf(x), x]));
  const diffs = [];
  for (const key of [...new Set([...before.keys(), ...after.keys()])].sort(lexical)) {
    const old = before.get(key), next = after.get(key), identity = old ?? next;
    const changes = !old || !next ? [{ field: 'row', recorded: old ?? null, official: next ?? null }]
      : ['currency', ...PRICE_KEYS].filter((field) => old[field] !== next[field]).map((field) => ({ field, recorded: old[field], official: next[field] }));
    for (const change of changes) diffs.push({ model: identity.model, condition: identity.condition, ...change });
  }
  return diffs;
}

async function fetchMarkdown(url, fetchPage, timeoutMs, onResponse) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetchPage(url, { signal: controller.signal, redirect: 'follow', headers: { 'user-agent': 'token-price-official-drift/0.11', accept: 'text/markdown,text/plain' } });
        onResponse(response.status);
        requireThat(response.status === 200, `HTTP ${response.status}`);
        return await response.text();
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error(`抓取超时（${timeoutMs}ms）`)); }, timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** 只告警：每家独立捕获抓取、解析、基准问题；参数/路径错误才抛 CliError。 */
export async function runOfficialPriceDriftCommand({ entriesFile = PATHS.apiEntries, entries = null, fetchPage = fetch, timeoutMs = 25000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 120000) throw new CliError('参数 --timeout-ms 必须为 1..120000 的整数', { code: 'BAD_ARGUMENT' });
  let basisError = null;
  if (entries === null) {
    let raw;
    try {
      if (!statSync(entriesFile).isFile()) throw new Error('不是文件');
      raw = readFileSync(entriesFile, 'utf8');
    } catch (error) { throw new CliError(`非法价格基准路径：${entriesFile}（${error.message}）`, { code: 'BAD_ARGUMENT' }); }
    try { entries = JSON.parse(raw); } catch { basisError = '价格基准不是合法 JSON'; }
  }
  // 基准侧（仓库数据）出错必须非 0：否则「价格基准坏了」和「官网抓不到」在退出码上同形，
  // CI 会在基准损坏时依然变绿。只有官网侧失败才允许 unavailable + exit 0。
  if (basisError) throw new CliError(`${basisError}：${entriesFile}`, { code: 'BAD_ENTRIES' });
  const baselines = {};
  for (const source of OFFICIAL_PRICE_SOURCES) {
    try { baselines[source.providerId] = officialPriceBasis(entries, source.providerId); }
    catch (error) { throw new CliError(`价格基准不可用（${source.providerId}）：${error instanceof Error ? error.message : String(error)}`, { code: 'BAD_ENTRIES' }); }
  }
  const parsers = { deepseek: parseDeepseekPrices, aliyun: parseAliyunPrices, volcengine: parseVolcenginePrices };
  const providers = await Promise.all(OFFICIAL_PRICE_SOURCES.map(async (source) => {
    const report = { ...source, httpStatus: null, parsedRows: 0, baselineRows: 0, status: 'unavailable', baselineHash: null, officialHash: null, diffs: [], reason: null };
    try {
      const basis = baselines[source.providerId];
      report.baselineRows = basis.length;
      report.baselineHash = priceFingerprint(basis);
      const markdown = await fetchMarkdown(source.url, fetchPage, timeoutMs, (status) => { report.httpStatus = status; });
      const official = parsers[source.providerId](markdown, basis);
      report.parsedRows = official.length;
      report.officialHash = priceFingerprint(official);
      report.diffs = diffOfficialPrices(basis, official);
      report.status = report.diffs.length ? 'changed' : 'unchanged';
    } catch (error) { report.reason = error instanceof Error ? error.message : String(error); }
    return report;
  }));
  return { ok: true, readOnly: true, providers };
}

export function formatOfficialPriceDriftReport(result) {
  const lines = ['== 官方价格页漂移（只告警，不改数据） ==', '厂商 | HTTP | 解析行数 | 基准行数 | 状态'];
  for (const p of result.providers) lines.push(`${p.providerId} | ${p.httpStatus ?? '-'} | ${p.parsedRows} | ${p.baselineRows} | ${p.status}`);
  for (const p of result.providers) {
    lines.push('', `== ${p.providerId} ==`, `URL：${p.url}`);
    if (p.status === 'unavailable') { lines.push(`无法判定：${p.reason}`); continue; }
    lines.push(`SHA-256 仓库：${p.baselineHash}`, `SHA-256 官网：${p.officialHash}`);
    if (!p.diffs.length) { lines.push('未发现价格变化。'); continue; }
    lines.push('模型 | 条件 | 字段 | 仓库值 | 官网值');
    for (const d of p.diffs) lines.push(`${d.model} | ${d.condition} | ${d.field} | ${JSON.stringify(d.recorded)} | ${JSON.stringify(d.official)}`);
  }
  lines.push('', '本报告不写任何文件；改价仍需人工确认后录入。');
  return lines.join('\n');
}

/** 独立白名单解析，避免通用 parseArgs 静默吞掉未知参数。 */
export function parseOfficialPriceDriftArgs(argv) {
  const options = {};
  const seen = new Set();
  for (let i = 0; i < argv.length; i++) {
    const [flag, ...parts] = argv[i].split('=');
    if (flag === '--json' && parts.length === 0) continue;
    if (!['--entries-file', '--timeout-ms'].includes(flag) || seen.has(flag)) throw new CliError(`未知或重复参数：${argv[i]}`, { code: 'BAD_ARGUMENT' });
    seen.add(flag);
    const value = parts.length ? parts.join('=') : argv[++i];
    if (!value || value.startsWith('--')) throw new CliError(`缺少参数值：${flag}`, { code: 'BAD_ARGUMENT' });
    if (flag === '--entries-file') options.entriesFile = resolve(process.cwd(), value);
    else {
      if (!/^\d+$/.test(value)) throw new CliError('参数 --timeout-ms 必须为整数', { code: 'BAD_ARGUMENT' });
      options.timeoutMs = Number(value);
    }
  }
  return options;
}
