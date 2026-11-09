import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildBenchmarkCandidates, parseRscModels, runPullBenchmarksCommand, selectHighestTiers, validateModels, writeBenchmarkDocuments } from '../scripts/data/lib/benchmarks-pull.mjs';

const fixture = (name: string) => `tests/fixtures/benchmarks/${name}`;
const load = (name: string) => JSON.parse(readFileSync(fixture(name), 'utf8'));
const html = readFileSync(fixture('aa-rsc.html'), 'utf8');
const page = (models: unknown) => `<script>self.__next_f.push([1,${JSON.stringify(`1:{"initialModels":${JSON.stringify(models)}}`)}]);</script>`;
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
const dirs: string[] = [];
function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'token-price-benchmarks-')); dirs.push(dir);
  const basisFile = join(dir, 'basis.json'); copyFileSync(fixture('basis.json'), basisFile);
  const entriesFile = join(dir, 'api.json'); writeFileSync(entriesFile, '[]');
  return { dir, basisFile, entriesFile, cacheFile: join(dir, 'cache.json'), candidatesFile: join(dir, 'candidates.json'), now: new Date('2026-11-09T12:00Z') };
}
function mockFetch(body = html) {
  return vi.stubGlobal('fetch', vi.fn(async () => new Response(body)));
}
function assertBasisCrlf(text: string) {
  expect((text.match(/\r\n/g) ?? []).length).toBeGreaterThan(0);
  expect(text.replaceAll('\r\n', '')).not.toContain('\n');
}
function assertCliRejectsWithoutWrites(options: ReturnType<typeof setup>, body: string, code: string) {
  const preload = join(options.dir, 'observe-writes.mjs');
  writeFileSync(preload, `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
let mutations = 0;
for (const name of ['mkdirSync', 'writeFileSync', 'renameSync', 'rmSync']) {
  const original = fs[name];
  fs[name] = (...args) => { mutations += 1; return original(...args); };
}
syncBuiltinESMExports();
globalThis.fetch = async () => new Response(${JSON.stringify(body)});
process.on('exit', () => process.stderr.write('FS_MUTATIONS=' + mutations + '\\n'));
`, 'utf8');
  const files = [options.cacheFile, options.candidatesFile];
  const snapshot = () => files.map((file) => ({ sha256: hash(file), mtime: statSync(file).mtimeMs }));
  const before = snapshot(); const names = readdirSync(options.dir).sort();
  const result = spawnSync(process.execPath, ['--import', pathToFileURL(preload).href,
    'scripts/data/pull-benchmarks.mjs', '--basis-file', options.basisFile, '--entries-file', options.entriesFile,
    '--cache-file', options.cacheFile, '--candidates-file', options.candidatesFile], { encoding: 'utf8' });
  expect(result.status).not.toBeNull(); expect(result.status).not.toBe(0);
  expect(result.stderr).toContain(`[失败] ${code}:`);
  expect(result.stderr).toContain('FS_MUTATIONS=0\n');
  expect(snapshot()).toEqual(before);
  expect(readdirSync(options.dir).sort()).toEqual(names);
}
afterEach(() => { vi.unstubAllGlobals(); dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })); });

describe('AA 取数与失败原子性', () => {
  it('多段 JSON 解码、嵌套数组、转义引号与括号不截断', () => {
    const models = parseRscModels(html);
    expect(models).toHaveLength(4);
    expect(models.find((row) => row.scores)).toMatchObject({ scores: { nested: [{ items: [1, 2] }] } });
    expect(selectHighestTiers(models).get('claude-opus-5-5')?.intelligenceIndex).toBe(59.11);
  });

  it('B2 单个合法 initialModels 与相同重复载荷解析成功', () => {
    const models = load('aa-models-previous.json').models;
    const expected = validateModels(models);
    expect(parseRscModels(page(models))).toEqual(expected);
    expect(parseRscModels(page(models) + page(models))).toEqual(expected);
    expect(parseRscModels(page(models) + page([...models].reverse()))).toEqual(expected);
  });

  it('B2 两份合法但冲突的 initialModels 必须报歧义，CLI 非 0 且零写入', async () => {
    const options = setup(); mockFetch(); await runPullBenchmarksCommand(options);
    const first = load('aa-models-previous.json').models;
    const second = structuredClone(first); second[1].intelligenceIndex = 60;
    const conflicting = page(first) + page(second);
    expect(() => parseRscModels(conflicting)).toThrow(/歧义/);
    assertCliRejectsWithoutWrites(options, conflicting, 'BENCH_RSC_AMBIGUOUS');
  });

  it('B2 首处 initialModels 为 null 即拒绝，即使后面有合法数组', () => {
    expect(() => parseRscModels(page(null) + page(load('aa-models-previous.json').models)))
      .toThrow(/initialModels/);
  });

  it.each(['null', 'false', '0', '\"\"', '{broken'])('B1 已有坏缓存 %s 必须结构错误、CLI 非 0、两文件 SHA256/mtime 不变且零写入', async (content) => {
    const options = setup();
    writeFileSync(options.cacheFile, content, 'utf8');
    writeFileSync(options.candidatesFile, 'existing candidates\n', 'utf8');
    assertCliRejectsWithoutWrites(options, html, 'BENCHMARKS_INVALID');
    const fetchPage = vi.fn(async () => ({ text: async () => html }));
    await expect(runPullBenchmarksCommand({ ...options, fetchPage })).rejects.toMatchObject({
      name: 'Error', constructor: expect.objectContaining({ name: 'CliError' }), code: 'BENCHMARKS_INVALID',
    });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it.each([
    '<html>no payload</html>', '<script>self.__next_f.push([1,"bad\\q"]);</script>',
    '<script>self.__next_f.push([1,"unterminated', page([]), page({}),
    page([{ slug: 'x' }]), page([{ slug: 'x', name: 'x', modelCreatorName: 'x', intelligenceIndex: '9' }]),
    `self.__next_f.push([1,${JSON.stringify('"initialModels":[{"slug":"x"}') }]);`,
  ])('拒绝坏 RSC / 空列表 / 坏结构：%s', (bad) => expect(() => parseRscModels(bad)).toThrow());

  it('只一次 HTTP、固定 UA、精确 slug、多档取最高；同日重跑和 check 不写', async () => {
    const options = setup(); mockFetch();
    const basisBefore = hash(options.basisFile);
    const first = await runPullBenchmarksCommand(options);
    expect(first).toMatchObject({ written: true, modelCount: 4, candidateCount: 2 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://artificialanalysis.ai/leaderboards/models', expect.objectContaining({ headers: expect.objectContaining({ 'user-agent': 'token-price-data-cli/0.2 (+https://github.com/yzx4036/token-price)' }) }));
    const before = [hash(options.cacheFile), hash(options.candidatesFile)];
    const times = [statSync(options.cacheFile).mtimeMs, statSync(options.candidatesFile).mtimeMs];
    const doc = JSON.parse(readFileSync(options.candidatesFile, 'utf8'));
    expect(doc.candidates.map((row: any) => row.displayModel)).toEqual(['Claude Opus 5.5', 'GPT-6 Astra']);
    expect(doc.candidates[0]).toMatchObject({ score: 59.11, tierUsed: 'Max', inBasis: true });
    expect(doc.candidates[1].inBasis).toBe(false);
    expect(JSON.stringify(doc)).not.toContain('GPT-6 Luna');
    expect(doc.source.fetchedAt).toBe('2026-11-09');
    expect((await runPullBenchmarksCommand({ ...options, now: new Date('2026-11-09T23:59Z') })).written).toBe(false);
    expect((await runPullBenchmarksCommand({ ...options, check: true })).written).toBe(false);
    expect([hash(options.cacheFile), hash(options.candidatesFile)]).toEqual(before);
    expect([statSync(options.cacheFile).mtimeMs, statSync(options.candidatesFile).mtimeMs]).toEqual(times);
    expect(hash(options.basisFile)).toBe(basisBefore);
  });

  it.each(['network', 'http', 'bad-page', 'bad-shape', 'missing-slug', 'drop', 'semantic', 'creator', 'policy', 'bad-cache', 'bad-entries'])('失败 %s 时两份目标哈希不变并抛 CliError', async (failure) => {
    const options = setup(); mockFetch(); await runPullBenchmarksCommand(options);
    const before = [hash(options.cacheFile), hash(options.candidatesFile)];
    const models = load('aa-models-previous.json').models;
    if (failure === 'network') vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    else if (failure === 'http') vi.stubGlobal('fetch', vi.fn(async () => new Response('blocked', { status: 403 })));
    else if (failure === 'bad-page') mockFetch(readFileSync(fixture('aa-rsc-bad.html'), 'utf8'));
    else if (failure === 'bad-shape') { models[0].intelligenceIndex = '59'; mockFetch(page(models)); }
    else if (failure === 'missing-slug') { models[2].slug = 'gpt-6-luna-near-name'; mockFetch(page(models)); }
    else if (failure === 'drop') mockFetch(page(models.slice(0, 2)));
    else if (failure === 'creator') { models[1].modelCreatorName = 'OpenAI'; mockFetch(page(models)); }
    else if (failure === 'bad-cache') writeFileSync(options.cacheFile, '{"models":[],"modelCount":0}');
    else if (failure === 'bad-entries') writeFileSync(options.entriesFile, '[null]');
    else {
      const basis = load('basis.json');
      if (failure === 'semantic') basis.mapping = { 'GPT-6 Luna': 'claude-opus-5-5' };
      else { delete basis.tierPolicy; basis.methodology.tierPolicy = { mode: 'highest-score' }; }
      writeFileSync(options.basisFile, JSON.stringify(basis));
    }
    const expected = failure === 'bad-cache' ? [hash(options.cacheFile), before[1]] : before;
    await expect(runPullBenchmarksCommand(options)).rejects.toMatchObject({ constructor: expect.objectContaining({ name: 'CliError' }) });
    expect([hash(options.cacheFile), hash(options.candidatesFile)]).toEqual(expected);
    expect(readdirSync(options.dir).some((name) => name.includes('.tmp-'))).toBe(false);
  });

  it('降幅恰 30% 允许，30.1% 拒绝；首次无缓存允许；缓存计数须自洽', async () => {
    const options = setup();
    const base = load('aa-models-previous.json').models;
    const models = Array.from({ length: 1000 }, (_, index) => ({ ...base[index % 4], slug: index < 4 ? base[index].slug : `extra-${index}` }));
    writeFileSync(options.cacheFile, JSON.stringify({ fetchedAt: '2026-11-08', modelCount: 1000, models }));
    mockFetch(page(models.slice(0, 699)));
    const before = hash(options.cacheFile);
    await expect(runPullBenchmarksCommand(options)).rejects.toMatchObject({ code: 'BENCH_COUNT_DROP' });
    expect(hash(options.cacheFile)).toBe(before); expect(existsSync(options.candidatesFile)).toBe(false);
    mockFetch(page(models.slice(0, 700)));
    expect((await runPullBenchmarksCommand(options)).modelCount).toBe(700);
  });

  it('缺分保持 null，不能用近名替代，provider 白名单拒绝错配，排序不依赖输入顺序', () => {
    const basis = load('basis.json'); const models = load('aa-models-previous.json').models;
    expect(validateModels([models[2]])[0].intelligenceIndex).toBeNull();
    const missing = { ...models[2] }; delete missing.intelligenceIndex;
    expect(validateModels([missing])[0].intelligenceIndex).toBeNull();
    expect(() => buildBenchmarkCandidates(basis, models.filter((row: any) => row.slug !== 'gpt-6-luna'))).toThrow(/slug/);
    expect(() => buildBenchmarkCandidates(basis, models, { apiEntries: [{ provenance: 'official', providerId: 'google', model: 'GPT-6 Astra' }] })).toThrow(/白名单/);
    expect(buildBenchmarkCandidates(basis, models, { now: new Date('2026-11-09Z') })).toEqual(buildBenchmarkCandidates(basis, [...models].reverse(), { now: new Date('2026-11-09Z') }));
    expect(() => validateModels([{ ...models[0], contextWindowTokens: -1 }])).toThrow();
  });

  it('check 陈旧 / 缺失必须失败且不创建文件；写入故障不会留下半份新快照', async () => {
    const options = setup(); mockFetch();
    await expect(runPullBenchmarksCommand({ ...options, check: true })).rejects.toMatchObject({ code: 'OUT_STALE' });
    expect(existsSync(options.cacheFile)).toBe(false); expect(existsSync(options.candidatesFile)).toBe(false);
    await runPullBenchmarksCommand(options);
    const before = [hash(options.cacheFile), hash(options.candidatesFile)];
    const models = load('aa-models-previous.json').models; models[1].intelligenceIndex += 1; mockFetch(page(models));
    await expect(runPullBenchmarksCommand({ ...options, check: true })).rejects.toMatchObject({ code: 'OUT_STALE' });
    expect([hash(options.cacheFile), hash(options.candidatesFile)]).toEqual(before);
    let calls = 0;
    expect(() => writeBenchmarkDocuments([[options.cacheFile, 'new cache'], [options.candidatesFile, 'new candidates']], { rename: (from: string, to: string) => {
      calls += 1; if (calls === 2) throw new Error('rename denied'); renameSync(from, to);
    } })).toThrow('rename denied');
    expect([hash(options.cacheFile), hash(options.candidatesFile)]).toEqual(before);
    expect(readdirSync(options.dir).some((name) => name.includes('.tmp-'))).toBe(false);
    await expect(runPullBenchmarksCommand({ ...options, candidatesFile: join(options.entriesFile, 'blocked') })).rejects.toThrow();
    expect(hash(options.cacheFile)).toBe(before[0]);
  });

  it('CLI 成功 / check / 断网 / 坏页面：退出码与磁盘保护均实测', () => {
    const options = setup();
    const preload = join(options.dir, 'mock-fetch.mjs');
    const args = ['--import', pathToFileURL(preload).href, 'scripts/data/pull-benchmarks.mjs', '--basis-file', options.basisFile, '--cache-file', options.cacheFile, '--candidates-file', options.candidatesFile, '--entries-file', options.entriesFile];
    writeFileSync(preload, `globalThis.fetch = async () => new Response(${JSON.stringify(html)});`);
    expect(spawnSync(process.execPath, args, { encoding: 'utf8' }).status).toBe(0);
    expect(spawnSync(process.execPath, [...args, '--check'], { encoding: 'utf8' }).status).toBe(0);
    const before = [hash(options.cacheFile), hash(options.candidatesFile)];
    for (const source of ['globalThis.fetch = async () => { throw new Error("offline"); };', 'globalThis.fetch = async () => new Response("bad page");']) {
      writeFileSync(preload, source);
      expect(spawnSync(process.execPath, args, { encoding: 'utf8' }).status).not.toBe(0);
      expect([hash(options.cacheFile), hash(options.candidatesFile)]).toEqual(before);
    }
  });

  it('R1 根级政策且 methodology 字符串未变，CRLF 未破坏，生成文档结构不变', () => {
    const bytes = readFileSync('src/data/estimates/benchmark-basis.json'); const text = bytes.toString('utf8'); const basis = JSON.parse(text);
    expect(basis.tierPolicy).toEqual({ mode: 'highest-score' });
    expect(Object.values(basis.methodology).every((value) => typeof value === 'string')).toBe(true);
    assertBasisCrlf(text);
    const generated = JSON.parse(readFileSync('src/data/generated/benchmarks.generated.json', 'utf8'));
    expect(generated).not.toHaveProperty('tierPolicy');
  });

  it('B5-b 单行 JSON 虽无裸 LF，CRLF=0 也必须让行尾守卫失败', () => {
    const text = JSON.stringify(JSON.parse(readFileSync('src/data/estimates/benchmark-basis.json', 'utf8')));
    expect(text.match(/\r\n/g) ?? []).toHaveLength(0);
    expect(() => assertBasisCrlf(text)).toThrow();
  });
});
