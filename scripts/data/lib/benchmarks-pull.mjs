import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { baseModelName, findSemanticMismatches } from './benchmark.mjs';
import { fetchWithTimeout } from './http.mjs';
import { CliError, PATHS, ROOT, readJson, todayIso } from './io.mjs';

export const AA_URL = 'https://artificialanalysis.ai/leaderboards/models';
export const BENCHMARK_BASIS_FILE = resolve(ROOT, 'src/data/estimates/benchmark-basis.json');
export const AA_CACHE_FILE = resolve(ROOT, '.cache/aa-models.json');
export const CANDIDATES_FILE = resolve(ROOT, 'src/data/generated/benchmark-candidates.generated.json');
const CREATORS = {
  anthropic: ['Anthropic'], openai: ['OpenAI'], google: ['Google'], xai: ['SpaceXAI', 'xAI'],
  aliyun: ['Alibaba'], deepseek: ['DeepSeek'], minimax: ['MiniMax'], moonshot: ['Kimi', 'Moonshot AI'],
  zhipu: ['Z AI'], mistral: ['Mistral'], stepfun: ['StepFun'], volcengine: ['ByteDance'],
};
const invalid = (message, code = 'BENCHMARKS_INVALID') => { throw new CliError(message, { code }); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (object(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
const serialize = (value) => `${JSON.stringify(canonical(value), null, 2)}\n`;

// 正则只定位调用边界；字符串与数组各自按 JSON 转义规则扫描。
export function parseRscModels(html) {
  if (typeof html !== 'string' || !html) invalid('AA 页面正文为空或结构异常');
  const boundary = /\bself\.__next_f\.push\(\s*\[\s*1\s*,\s*/g;
  const chunks = [];
  let match;
  while ((match = boundary.exec(html)) !== null) {
    const start = boundary.lastIndex;
    if (html[start] !== '"') invalid('RSC 载荷不是字符串');
    let index = start + 1;
    for (; index < html.length; index += 1) {
      if (html[index] === '\\') { index += 1; continue; }
      if (html[index] === '"') break;
    }
    if (index >= html.length || !/^\s*\]\s*\)/.test(html.slice(index + 1))) invalid('RSC 字符串未闭合');
    try { chunks.push(JSON.parse(html.slice(start, index + 1))); } catch { invalid('RSC JSON 字符串解码失败'); }
    boundary.lastIndex = index + 1;
  }
  const payload = chunks.join('');
  const marker = /"initialModels"\s*:\s*/g;
  const candidates = [];
  while (marker.exec(payload)) {
    // 任一 marker 不是合法数组（包括 null）即拒绝，不跳过坏载荷猜选后面的数组。
    if (payload[marker.lastIndex] !== '[') invalid('initialModels 不是数组');
    const start = marker.lastIndex;
    let depth = 0; let quoted = false; let end = -1;
    for (let index = start; index < payload.length; index += 1) {
      const char = payload[index];
      if (quoted) {
        if (char === '\\') index += 1;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') quoted = true;
      else if (char === '[') depth += 1;
      else if (char === ']' && --depth === 0) { end = index + 1; break; }
    }
    if (end < 0) invalid('initialModels 数组未闭合');
    try { candidates.push(validateModels(JSON.parse(payload.slice(start, end)))); }
    catch (error) { if (error instanceof CliError) throw error; invalid('initialModels 不是合法 JSON'); }
    marker.lastIndex = end;
  }
  if (!candidates.length) invalid('页面缺少 initialModels 数组');
  const normalized = JSON.stringify(candidates[0]);
  if (candidates.some((models) => JSON.stringify(models) !== normalized)) invalid('initialModels 多份载荷内容冲突，无法消除歧义', 'BENCH_RSC_AMBIGUOUS');
  return candidates[0];
}

export function validateModels(models) {
  if (!Array.isArray(models) || !models.length) invalid('AA 模型列表为空或结构异常');
  return models.map((model) => {
    if (!object(model) || !nonempty(model.slug) || !nonempty(model.name) || !nonempty(model.modelCreatorName)) invalid('AA 模型缺少 slug/name/modelCreatorName');
    const score = model.intelligenceIndex ?? null;
    if (score !== null && (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100)) invalid(`AA 分数异常：${model.slug}`);
    const context = model.contextWindowTokens ?? null;
    if (context !== null && (typeof context !== 'number' || !Number.isSafeInteger(context) || context <= 0)) invalid(`AA 上下文异常：${model.slug}`);
    return canonical({ ...model, intelligenceIndex: score, contextWindowTokens: context });
  }).sort((a, b) => compare(a.slug, b.slug) || compare(serialize(a), serialize(b)));
}

export function validateBasis(basis) {
  if (!object(basis) || !Array.isArray(basis.benchmarks) || !object(basis.mapping)
    || basis.tierPolicy?.mode !== 'highest-score') invalid('basis 结构或根级 tierPolicy 异常');
  const slugs = new Set();
  for (const benchmark of basis.benchmarks) {
    if (!object(benchmark) || !nonempty(benchmark.aaSlug) || !nonempty(benchmark.creator)
      || !nonempty(benchmark.tierUsed) || typeof benchmark.score !== 'number' || !Number.isFinite(benchmark.score)
      || benchmark.score <= 0 || benchmark.score > 100 || slugs.has(benchmark.aaSlug)) invalid('basis benchmark 结构异常');
    slugs.add(benchmark.aaSlug);
  }
  if (Object.entries(basis.mapping).some(([name, slug]) => !nonempty(name) || !nonempty(slug))) invalid('basis mapping 异常');
  const mismatches = findSemanticMismatches(basis);
  if (mismatches.length) invalid(`映射语义不一致：${mismatches.join('；')}`, 'BENCH_MISMATCH');
  return basis;
}

export function selectHighestTiers(models) {
  const selected = new Map();
  for (const model of validateModels(models)) {
    const previous = selected.get(model.slug);
    if (!previous || (model.intelligenceIndex !== null && (previous.intelligenceIndex === null || model.intelligenceIndex > previous.intelligenceIndex))) selected.set(model.slug, model);
  }
  return selected;
}

export function tierFor(model) {
  return model.name.match(/\(([^()]*)\)\s*$/)?.[1] || '唯一档';
}

export function buildBenchmarkCandidates(basis, models, { now = new Date(), apiEntries = [] } = {}) {
  validateBasis(basis);
  const selected = selectHighestTiers(models);
  const bySlug = new Map(basis.benchmarks.map((row) => [row.aaSlug, row]));
  const candidates = [];
  for (const [displayModel, aaSlug] of Object.entries(basis.mapping).sort(([a], [b]) => compare(a, b))) {
    const model = selected.get(aaSlug);
    if (!model) invalid(`映射 slug 在 AA 快照中消失：${displayModel} → ${aaSlug}`, 'BENCH_DANGLING');
    const expected = bySlug.get(aaSlug)?.creator;
    if (expected && model.modelCreatorName !== expected) invalid(`AA creator 与已核验依据不一致：${aaSlug}`);
    for (const entry of apiEntries.filter((entry) => entry.provenance === 'official' && baseModelName(entry.model) === displayModel)) {
      if (!CREATORS[entry.providerId]?.includes(model.modelCreatorName)) invalid(`provider/creator 白名单不匹配：${entry.providerId} → ${model.modelCreatorName}`);
    }
    if (model.intelligenceIndex === null) continue;
    candidates.push({ displayModel, aaSlug, aaName: model.name, creator: model.modelCreatorName,
      score: model.intelligenceIndex, tierUsed: tierFor(model), contextWindowTokens: model.contextWindowTokens,
      inBasis: bySlug.has(aaSlug) });
  }
  const date = todayIso(now);
  return { generatedAt: date, source: { name: 'Artificial Analysis', url: AA_URL, fetchedAt: date, modelCount: models.length },
    tierPolicy: { mode: basis.tierPolicy.mode }, candidates };
}

export function validateSnapshot(snapshot) {
  if (!object(snapshot) || !nonempty(snapshot.fetchedAt) || !Number.isSafeInteger(snapshot.modelCount)) invalid('AA 缓存结构异常');
  const models = validateModels(snapshot.models);
  if (snapshot.modelCount !== models.length) invalid('AA 缓存 modelCount 与列表不符');
  return models;
}

// 两个文件均先暂存，第二次 rename 失败时恢复第一次写入前的字节。
export function writeBenchmarkDocuments(documents, { rename = renameSync } = {}) {
  const staged = [];
  const committed = [];
  try {
    for (const [file, content] of documents) {
      const previous = existsSync(file) ? readFileSync(file) : null;
      mkdirSync(dirname(file), { recursive: true });
      const temporary = `${file}.tmp-${randomUUID()}`;
      staged.push({ file, temporary, previous });
      writeFileSync(temporary, content, 'utf8');
    }
    for (const item of staged) { rename(item.temporary, item.file); committed.push(item); }
  } catch (error) {
    for (const item of committed.reverse()) {
      if (item.previous === null) rmSync(item.file, { force: true });
      else { writeFileSync(item.temporary, item.previous); renameSync(item.temporary, item.file); }
    }
    throw error;
  } finally { for (const item of staged) rmSync(item.temporary, { force: true }); }
}

export async function runPullBenchmarksCommand({ basisFile = BENCHMARK_BASIS_FILE, cacheFile = AA_CACHE_FILE,
  candidatesFile = CANDIDATES_FILE, entriesFile = PATHS.apiEntries, check = false, now = new Date(), fetchPage = fetchWithTimeout } = {}) {
  const basis = validateBasis(readJson(basisFile));
  const hasPrevious = existsSync(cacheFile);
  let previous;
  if (hasPrevious) {
    try { previous = readJson(cacheFile); }
    catch (error) { if (error instanceof SyntaxError) invalid('AA 缓存不是合法 JSON'); throw error; }
    validateSnapshot(previous);
  }
  const entries = readJson(entriesFile);
  if (!Array.isArray(entries) || entries.some((entry) => !object(entry) || !nonempty(entry.model)
    || !nonempty(entry.providerId) || !['official', 'aggregate'].includes(entry.provenance))) invalid('API 条目结构异常');
  let html;
  try { html = await (await fetchPage(AA_URL, { headers: { accept: 'text/html' } })).text(); }
  catch (error) { throw new CliError(`AA 抓取失败：${error.message}`, { code: 'HTTP_FAILED' }); }
  const models = parseRscModels(html);
  if (hasPrevious && models.length * 10 < previous.modelCount * 7) invalid(`AA 模型数降幅超过 30%：${previous.modelCount} → ${models.length}`, 'BENCH_COUNT_DROP');
  const candidates = buildBenchmarkCandidates(basis, models, { now, apiEntries: entries });
  const snapshot = { fetchedAt: todayIso(now), source: { name: 'Artificial Analysis', url: AA_URL }, modelCount: models.length, models };
  const documents = [[cacheFile, serialize(snapshot)], [candidatesFile, serialize(candidates)]];
  const changed = documents.some(([file, content]) => !existsSync(file) || readFileSync(file, 'utf8') !== content);
  if (check && changed) invalid('AA 缓存或 candidates 产物陈旧/缺失', 'OUT_STALE');
  if (!check && changed) writeBenchmarkDocuments(documents);
  return { ok: true, check, written: !check && changed, modelCount: models.length, candidateCount: candidates.candidates.length };
}
