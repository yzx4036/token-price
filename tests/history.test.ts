import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { HISTORY_SPLIT_THRESHOLD_LINES, buildSnapshot, classifyChange, extractPriceStates, parseHistory, runReplayCommand, runSnapshotCommand } from '../scripts/data/lib/history.mjs';
import type { HistoryEvent } from '../scripts/data/lib/history.mjs';

const fixture = (name: string) => `tests/fixtures/history/${name}`;
const load = (name: string) => JSON.parse(readFileSync(fixture(name), 'utf8'));
const dirs: string[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'token-price-history-')); dirs.push(dir);
  const entriesFile = join(dir, 'api.json');
  copyFileSync(fixture('api-before.json'), entriesFile);
  return { dir, entriesFile, historyFile: join(dir, 'history.jsonl'), now: new Date('2026-11-09T12:00:00Z') };
}
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
function deltaEntries(event: HistoryEvent) {
  if (event.kind !== 'delta') throw new Error('expected delta');
  return event.entries;
}
function assertSnapshotWorkflow(workflow: string) {
  const verify = workflow.indexOf('node scripts/data/cli.mjs verify');
  const snapshot = workflow.indexOf('node scripts/data/history.mjs snapshot');
  const diff = workflow.indexOf('id: diff');
  for (const position of [verify, snapshot, diff]) expect(position).toBeGreaterThanOrEqual(0);
  expect(verify).toBeLessThan(snapshot);
  expect(snapshot).toBeLessThan(diff);
  expect(workflow).toContain('node scripts/data/history.mjs snapshot || {');
  expect(workflow).toContain('echo "::warning::快照失败（不阻断数据刷新）"');
  expect(workflow).toContain('echo "快照失败（不阻断数据刷新）" >> "$GITHUB_STEP_SUMMARY"');
}
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

describe('官方价格历史', () => {
  it('同日双跑字节、mtime 不变；同日价格变化替换，不追加重复事件', () => {
    const options = setup();
    runSnapshotCommand(options);
    const before = hash(options.historyFile); const mtime = statSync(options.historyFile).mtimeMs;
    expect(runSnapshotCommand(options).written).toBe(false);
    expect(hash(options.historyFile)).toBe(before);
    expect(statSync(options.historyFile).mtimeMs).toBe(mtime);
    copyFileSync(fixture('api-price-changed.json'), options.entriesFile);
    runSnapshotCommand(options);
    expect(hash(options.historyFile)).not.toBe(before);
    const events = parseHistory(readFileSync(options.historyFile, 'utf8'));
    expect(events).toHaveLength(1);
    expect(deltaEntries(events[0]).example.after?.inputPrice).toBe(2);
    expect(readdirSync(options.dir).sort()).toEqual(['api.json', 'history.jsonl']);
  });

  it('只改 fetchedAt / verifiedAt 不写；改一条价格只生成一条完整 price delta，<500 字节', () => {
    const options = setup(); runSnapshotCommand({ ...options, now: new Date('2026-11-08Z') });
    const before = hash(options.historyFile);
    copyFileSync(fixture('api-fetched-at-only.json'), options.entriesFile);
    expect(runSnapshotCommand(options).written).toBe(false);
    const entries = load('api-fetched-at-only.json'); entries[0].verifiedAt = '2026-11-09';
    writeFileSync(options.entriesFile, JSON.stringify(entries));
    expect(runSnapshotCommand(options).written).toBe(false); expect(hash(options.historyFile)).toBe(before);
    copyFileSync(fixture('api-price-changed.json'), options.entriesFile); runSnapshotCommand(options);
    const events = parseHistory(readFileSync(options.historyFile, 'utf8'));
    const delta = events[1];
    expect(Object.keys(delta.entries)).toEqual(['example']);
    expect(deltaEntries(delta).example).toEqual({ change: 'price', before: extractPriceStates(load('api-before.json')).example, after: extractPriceStates(load('api-price-changed.json')).example });
    expect(Buffer.byteLength(JSON.stringify(delta))).toBeLessThan(500);
    expect(JSON.stringify(events)).not.toContain('fetchedAt');
    expect(JSON.stringify(events)).not.toContain('aggregate');
  });

  it('回放三个时点，未知 id / 缺 id 必须拒绝', () => {
    expect(runReplayCommand({ id: 'example', historyFile: fixture('three-points.jsonl') }).history.map((row: any) => [row.date, row.after.inputPrice]))
      .toEqual([['2026-09-01', 1], ['2026-09-02', 2], ['2026-09-03', 3]]);
    expect(() => runReplayCommand({ id: 'missing', historyFile: fixture('three-points.jsonl') })).toThrow();
    expect(() => runReplayCommand({ historyFile: fixture('three-points.jsonl') })).toThrow();
  });

  it('currency 优先、new、removed、provenance 与空变更分类', () => {
    const state = extractPriceStates(load('api-before.json')).example;
    expect(classifyChange(state, { ...state, inputPrice: 99, billingCurrency: 'USD' })).toBe('currency');
    expect(classifyChange(null, state)).toBe('new'); expect(classifyChange(state, null)).toBe('removed');
    expect(classifyChange(state, { ...state, provenance: { source: 'official' } })).toBe('price');
    expect(classifyChange(state, { ...state, verifiedAt: '2026-11-09' })).toBeNull();
    const prior: HistoryEvent[] = [{ date: '2026-10-31', kind: 'baseline', entries: { old: state } }];
    const delta = buildSnapshot(prior, load('api-before.json'), '2026-11-02')[1];
    expect(deltaEntries(delta).old.change).toBe('removed'); expect(deltaEntries(delta).example.change).toBe('new');
  });

  it('月初 baseline 与 delta 共存，后续同日重跑幂等，价格还原会去掉当日 delta', () => {
    const entries = load('api-before.json');
    const prior = buildSnapshot([], entries, '2026-10-31');
    const changed = buildSnapshot(prior, load('api-price-changed.json'), '2026-11-01');
    expect(changed.map((event: any) => event.kind)).toEqual(['delta', 'baseline', 'delta']);
    expect(buildSnapshot(changed, load('api-price-changed.json'), '2026-11-01')).toBe(changed);
    const reverted = buildSnapshot(changed, entries, '2026-11-01');
    expect(reverted.map((event: any) => event.kind)).toEqual(['delta', 'baseline']);
    expect(buildSnapshot(prior, entries, '2026-11-01').at(-1)?.kind).toBe('baseline');
    expect(HISTORY_SPLIT_THRESHOLD_LINES).toBe(2000);
  });

  it.each(['{broken\n', '{}\n', '\n', '{"date":"2026-02-30","kind":"baseline","entries":{}}\n'])('坏历史拒绝且哈希不变：%s', (text) => {
    const options = setup(); writeFileSync(options.historyFile, text);
    const before = hash(options.historyFile);
    const result = spawnSync(process.execPath, ['scripts/data/history.mjs', 'snapshot', '--entries-file', options.entriesFile, '--history-file', options.historyFile], { encoding: 'utf8' });
    expect(result.status).not.toBe(0); expect(hash(options.historyFile)).toBe(before);
  });

  it('拒绝非法价格、重复 id、重复事件、类型错误与倒退日期', () => {
    const entries = load('api-before.json');
    expect(() => extractPriceStates([{ ...entries[0], inputPrice: -1 }])).toThrow();
    expect(() => extractPriceStates([entries[0], entries[0]])).toThrow();
    expect(() => extractPriceStates({})).toThrow();
    expect(() => extractPriceStates([{ ...entries[0], provenance: 'unknown' }])).toThrow();
    const line = readFileSync(fixture('three-points.jsonl'), 'utf8').split('\n')[0];
    expect(() => parseHistory(`${line}\n${line}\n`)).toThrow();
    const events = parseHistory(readFileSync(fixture('three-points.jsonl'), 'utf8'));
    expect(() => buildSnapshot(events, entries, '2026-09-01')).toThrow();
    deltaEntries(events[1]).example.change = 'new';
    expect(() => parseHistory(events.map((event) => JSON.stringify(event)).join('\n'))).toThrow();
  });

  it('全文件校验拒绝坏状态字段、日期、币种与 delta 形状；保留有效 JSON 值', () => {
    const state = extractPriceStates(load('api-before.json')).example;
    const event = (entries: unknown, kind = 'baseline') => JSON.stringify({ date: '2026-11-01', kind, entries }) + '\n';
    for (const bad of [null, { ...state, inputPrice: '1' }, { ...state, inputPrice: -1 },
      { ...state, verifiedAt: 'bad' }, { ...state, billingCurrency: null }, { ...state, extra: true }, { inputPrice: 1 }]) {
      expect(() => parseHistory(event({ example: bad }))).toThrow();
    }
    for (const bad of [{}, [], { '': state }]) expect(() => parseHistory(event(bad))).toThrow();
    expect(() => parseHistory(event({ example: state }, 'unknown'))).toThrow();
    expect(() => parseHistory(event({ example: { before: state, after: null } }, 'delta'))).toThrow();
    expect(() => parseHistory(event({ example: { change: 'price', before: null, after: null } }, 'delta'))).toThrow();
    expect(parseHistory(event({ example: { ...state, provenance: { verified: true } } }))).toHaveLength(1);
    expect(() => buildSnapshot([], [], '2026-11-09')).toThrow();
    expect(() => buildSnapshot([], load('api-before.json'), '2026-02-30')).toThrow();
  });

  it.each([2000, 2001])('达到 %i 行仍验证并重放单文件，不提前分片', (count) => {
    const options = setup(); const entries = load('api-before.json');
    const first = { ...extractPriceStates(entries).example, verifiedAt: '2020-01-01' };
    const events = Array.from({ length: count }, (_, index) => ({
      date: new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10), kind: 'delta',
      entries: { example: { change: index ? 'price' : 'new', before: index ? { ...first, inputPrice: index - 1 } : null, after: { ...first, inputPrice: index } } },
    }));
    writeFileSync(options.historyFile, events.map((event) => JSON.stringify(event)).join('\n') + '\n');
    entries[0] = { ...entries[0], ...first, inputPrice: count - 1 }; writeFileSync(options.entriesFile, JSON.stringify(entries));
    const before = hash(options.historyFile);
    expect(runSnapshotCommand({ ...options, now: new Date(Date.UTC(2020, 0, count)) }).written).toBe(false);
    expect(hash(options.historyFile)).toBe(before); expect(readdirSync(options.dir).sort()).toEqual(['api.json', 'history.jsonl']);
  });

  it('写入目标父路径为文件时非 0、原文件不变、无临时文件残留；CLI replay 可用', () => {
    const options = setup(); const before = hash(options.entriesFile);
    const result = spawnSync(process.execPath, ['scripts/data/history.mjs', 'snapshot', '--entries-file', options.entriesFile, '--history-file', join(options.entriesFile, 'history.jsonl')], { encoding: 'utf8' });
    expect(result.status).not.toBe(0); expect(hash(options.entriesFile)).toBe(before);
    expect(readdirSync(options.dir)).toEqual(['api.json']);
    const replay = spawnSync(process.execPath, ['scripts/data/history.mjs', 'replay', '--id', 'example', '--history-file', fixture('three-points.jsonl')], { encoding: 'utf8' });
    expect(replay.status).toBe(0); expect(JSON.parse(replay.stdout).history).toHaveLength(3);
    expect(spawnSync(process.execPath, ['scripts/data/history.mjs', 'replay']).status).not.toBe(0);
  });

  it('workflow verify → snapshot → diff，失败吞码且在摘要告警；src 不引用历史', () => {
    const workflow = readFileSync('.github/workflows/data-refresh.yml', 'utf8');
    assertSnapshotWorkflow(workflow);
    expect(readFileSync('src/lib/data.ts', 'utf8')).not.toContain('price-history');
  });

  it('B5 删除 verify 行必须让同一个 workflow 守卫失败', () => {
    const workflow = readFileSync('.github/workflows/data-refresh.yml', 'utf8');
    const missingVerify = workflow.replace(/^.*node scripts\/data\/cli\.mjs verify[^\r\n]*\r?\n/m, '');
    expect(missingVerify).not.toBe(workflow);
    expect(() => assertSnapshotWorkflow(missingVerify)).toThrow();
  });

  it('B5 将 snapshot 完整步骤移到 diff 之后必须让同一个 workflow 守卫失败', () => {
    const workflow = readFileSync('.github/workflows/data-refresh.yml', 'utf8');
    const start = workflow.indexOf('      - name: 官方价格历史快照');
    const end = workflow.indexOf('      - name: 判断数据是否有实质变化', start);
    expect(start).toBeGreaterThanOrEqual(0); expect(end).toBeGreaterThan(start);
    const snapshot = workflow.slice(start, end);
    const reversed = workflow.replace(snapshot, '') + snapshot;
    expect(reversed.indexOf('node scripts/data/history.mjs snapshot')).toBeGreaterThan(reversed.indexOf('id: diff'));
    expect(() => assertSnapshotWorkflow(reversed)).toThrow();
  });
});
