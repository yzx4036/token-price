import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CliError, PATHS, ROOT, readJson, todayIso } from './io.mjs';

export const HISTORY_SPLIT_THRESHOLD_LINES = 2000;
export const HISTORY_FILE = resolve(ROOT, 'src/data/history/price-history.jsonl');
const PRICES = ['inputPrice', 'outputPrice', 'cacheReadPrice', 'cacheWritePrice'];
const FIELDS = [...PRICES, 'billingCurrency', 'provenance', 'verifiedAt'];
const invalid = (message) => { throw new CliError(message, { code: 'HISTORY_INVALID' }); };
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const dateValid = (date) => typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
  && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;

function validateState(state) {
  if (!object(state) || Object.keys(state).length !== FIELDS.length || FIELDS.some((key) => !Object.hasOwn(state, key))) invalid('历史价格状态字段不完整');
  if (PRICES.some((key) => state[key] !== null && (typeof state[key] !== 'number' || !Number.isFinite(state[key]) || state[key] < 0))) invalid('历史价格必须为非负数或 null');
  if (typeof state.billingCurrency !== 'string' || !state.billingCurrency || state.provenance === undefined
    || (state.verifiedAt !== null && !dateValid(state.verifiedAt))) invalid('历史币种、溯源或核验日期异常');
}

export function extractPriceStates(entries) {
  if (!Array.isArray(entries)) invalid('价格输入必须是数组');
  const states = {};
  const seen = new Set();
  for (const entry of entries) {
    if (!object(entry) || typeof entry.id !== 'string' || !entry.id || seen.has(entry.id)) invalid('价格条目缺少唯一 id');
    seen.add(entry.id);
    if (!['official', 'aggregate'].includes(entry.provenance)) invalid('价格条目 provenance 异常');
    if (entry.provenance !== 'official') continue;
    const state = Object.fromEntries(FIELDS.map((key) => [key, entry[key] ?? null]));
    validateState(state);
    Object.defineProperty(states, entry.id, { value: state, enumerable: true, configurable: true, writable: true });
  }
  return Object.fromEntries(Object.entries(states).sort(([a], [b]) => a.localeCompare(b, 'en')));
}

// verifiedAt 留档，不参与业务比较；fetchedAt 不进入状态。
export function classifyChange(before, after) {
  if (!before) return after ? 'new' : null;
  if (!after) return 'removed';
  if (before.billingCurrency !== after.billingCurrency) return 'currency';
  if ([...PRICES, 'provenance'].some((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))) return 'price';
  return null;
}

export function parseHistory(text) {
  if (text === '') return [];
  const lines = text.trimEnd().split('\n');
  let previous = '';
  return lines.map((line, index) => {
    let event;
    try { event = JSON.parse(line); } catch { invalid(`历史第 ${index + 1} 行不是 JSON`); }
    if (!object(event) || Object.keys(event).length !== 3 || !dateValid(event.date)
      || !['baseline', 'delta'].includes(event.kind) || !object(event.entries) || !Object.keys(event.entries).length) invalid(`历史第 ${index + 1} 行结构异常`);
    const key = `${event.date}:${event.kind}`;
    if (key <= previous) invalid('历史日期/种类重复或乱序');
    previous = key;
    for (const [id, value] of Object.entries(event.entries)) {
      if (!id) invalid('历史 id 不能为空');
      if (event.kind === 'baseline') validateState(value);
      else {
        if (!object(value) || Object.keys(value).length !== 3 || !Object.hasOwn(value, 'before') || !Object.hasOwn(value, 'after')) invalid('delta 字段异常');
        if (value.before !== null) validateState(value.before);
        if (value.after !== null) validateState(value.after);
        if (!value.change || classifyChange(value.before, value.after) !== value.change) invalid('delta 类型与状态不一致');
      }
    }
    return event;
  });
}

export function replayStates(events) {
  let states = {};
  for (const event of events) {
    if (event.kind === 'baseline') states = { ...event.entries };
    else for (const [id, value] of Object.entries(event.entries)) {
      if (value.after === null) delete states[id];
      else Object.defineProperty(states, id, { value: value.after, enumerable: true, configurable: true, writable: true });
    }
  }
  return states;
}

export function buildSnapshot(events, entries, date) {
  if (!dateValid(date)) invalid('快照日期异常');
  if (events.some((event) => event.date > date)) invalid('快照日期早于已有历史');
  const current = extractPriceStates(entries);
  if (!Object.keys(current).length) invalid('快照输入缺少 official 条目');
  const latest = replayStates(events);
  const diff = (before) => Object.fromEntries([...new Set([...Object.keys(before), ...Object.keys(current)])].sort().flatMap((id) => {
    const a = Object.hasOwn(before, id) ? before[id] : null;
    const b = Object.hasOwn(current, id) ? current[id] : null;
    const change = classifyChange(a, b);
    return change ? [[id, { change, before: a, after: b }]] : [];
  }));
  const needsBaseline = date.endsWith('-01') && !events.some((event) => event.date === date && event.kind === 'baseline');
  if (!Object.keys(diff(latest)).length && !needsBaseline) return events;
  const prior = events.filter((event) => event.date < date);
  const delta = diff(replayStates(prior));
  const next = [...prior];
  if (date.endsWith('-01')) next.push({ date, kind: 'baseline', entries: current });
  if (Object.keys(delta).length) next.push({ date, kind: 'delta', entries: delta });
  return next;
}

export function runSnapshotCommand({ entriesFile = PATHS.apiEntries, historyFile = HISTORY_FILE, now = new Date() } = {}) {
  const original = existsSync(historyFile) ? readFileSync(historyFile, 'utf8') : '';
  const events = parseHistory(original);
  const next = buildSnapshot(events, readJson(entriesFile), todayIso(now));
  if (next === events) return { ok: true, written: false, events: events.length };
  const content = next.map((event) => JSON.stringify(event)).join('\n') + (next.length ? '\n' : '');
  parseHistory(content);
  if (content === original) return { ok: true, written: false, events: next.length };
  mkdirSync(dirname(historyFile), { recursive: true });
  const temporary = `${historyFile}.tmp-${process.pid}-${Date.now()}`;
  try {
    writeFileSync(temporary, content, 'utf8');
    renameSync(temporary, historyFile);
  } finally { rmSync(temporary, { force: true }); }
  return { ok: true, written: true, events: next.length };
}

export function runReplayCommand({ id, historyFile = HISTORY_FILE } = {}) {
  if (typeof id !== 'string' || !id) invalid('replay 缺少 --id');
  const events = parseHistory(readFileSync(historyFile, 'utf8'));
  const rows = new Map();
  for (const event of events) {
    if (!Object.hasOwn(event.entries, id)) continue;
    const value = event.entries[id];
    rows.set(event.date, event.kind === 'baseline'
      ? { date: event.date, change: 'baseline', before: null, after: value }
      : { date: event.date, ...value });
  }
  if (!rows.size) invalid(`历史中没有 id：${id}`);
  return { ok: true, readOnly: true, id, history: [...rows.values()] };
}
