import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalizePrices, diffOfficialPrices, formatOfficialPriceDriftReport, officialPriceBasis,
  OFFICIAL_PRICE_SOURCES, parseAliyunPrices, parseDeepseekPrices, parseVolcenginePrices,
  priceFingerprint, runOfficialPriceDriftCommand,
  type OfficialPriceDriftResult,
} from '../scripts/data/lib/official-price-drift.mjs';

const fixtureDir = resolve('tests/fixtures/official-price-drift');
const fixture = (name: string) => readFileSync(join(fixtureDir, `${name}.md`), 'utf8');
const entries = JSON.parse(readFileSync('src/data/entries/api.json', 'utf8'));
const specs = [
  { id: 'deepseek', parse: parseDeepseekPrices, count: 4, from: '1元', to: '1.5元', model: 'deepseek-flash', condition: '空闲时段', old: 1, next: 1.5 },
  { id: 'aliyun', parse: parseAliyunPrices, count: 11, from: '12元', to: '15元', model: 'qwen3.8-max', condition: '0<Token≤1M', old: 12, next: 15 },
  { id: 'volcengine', parse: parseVolcenginePrices, count: 10, from: '|6.00 |', to: '|7.50 |', model: 'doubao-seed-evolving', condition: '[0,1024]', old: 6, next: 7.5 },
];
const sourceId = (url: string) => OFFICIAL_PRICE_SOURCES.find((x) => x.url === url)!.providerId;
const response = (text: string, status = 200) => ({ status, text: async () => text });
const cleanFetch = async (url: string) => response(fixture(sourceId(url)));
const tempDirs: string[] = [];
afterEach(() => { for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function cli(mode: 'normal' | 'changed' | 'failed' | 'invalid', args: string[] = []) {
  const dir = mkdtempSync(join(tmpdir(), 'official-price-cli-'));
  tempDirs.push(dir);
  const preload = join(dir, 'fetch-fixture.mjs');
  // 子进程仍执行真实 CLI；只替换网络输入，不增加生产命令的 fixture 开关。
  writeFileSync(preload, `
    import { readFileSync } from 'node:fs';
    import { join } from 'node:path';
    const sources = ${JSON.stringify(OFFICIAL_PRICE_SOURCES)};
    const specs = ${JSON.stringify(specs.map(({ id, from, to }) => ({ id, from, to })))};
    globalThis.fetch = async (url) => {
      if (${JSON.stringify(mode)} === 'failed') throw new Error('fixture timeout');
      const id = sources.find(x => x.url === url).providerId;
      let text = readFileSync(join(${JSON.stringify(fixtureDir)}, ${JSON.stringify(mode)} === 'invalid' ? 'invalid.md' : id + '.md'), 'utf8');
      if (${JSON.stringify(mode)} === 'changed') { const s = specs.find(x => x.id === id); text = text.replace(s.from, s.to); }
      return new Response(text, {status: 200});
    };
  `, 'utf8');
  return spawnSync(process.execPath, ['--import', pathToFileURL(preload).href, 'scripts/data/cli.mjs', 'official-price-drift', ...args], { encoding: 'utf8' });
}

describe('价格基准损坏必须非 0（v0.11.0 裁定 R15）', () => {
  it('基准不是合法 JSON：抛 CliError，与「官网抓不到」区分开', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'official-price-basis-'));
    tempDirs.push(dir);
    const bad = join(dir, 'api.json');
    writeFileSync(bad, '{ not json', 'utf8');
    await expect(runOfficialPriceDriftCommand({ entriesFile: bad, fetchPage: cleanFetch })).rejects.toThrow(/价格基准/);
  });

  it('基准字段缺失：同样非 0，不允许退化成 unavailable', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'official-price-basis-'));
    tempDirs.push(dir);
    const thin = join(dir, 'api.json');
    writeFileSync(thin, JSON.stringify([{ id: 'x' }]), 'utf8');
    await expect(runOfficialPriceDriftCommand({ entriesFile: thin, fetchPage: cleanFetch })).rejects.toThrow();
  });

  it('官网侧失败仍是 unavailable + exit 0（不误伤数据刷新）', () => {
    const result = cli('failed');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('unavailable');
  });
});

describe('官方价格 Markdown 显式解析', () => {
  it.each(specs)('解析 $id 官方 Markdown 的全部已收录模型', ({ id, parse, count }) => {
    const basis = officialPriceBasis(entries, id);
    const actual = parse(fixture(id), basis);
    expect(actual).toHaveLength(count);
    expect(actual).toEqual(basis);
    expect(actual.every((x) => x.currency === 'CNY')).toBe(true);
  });

  it.each(specs)('$id 输入改价逐字段报旧新值，缓存和输出保持原值', ({ id, parse, from, to, model, condition, old, next }) => {
    const basis = officialPriceBasis(entries, id);
    const original = fixture(id);
    const changed = original.replace(from, to);
    expect(changed).not.toBe(original);
    const actual = parse(changed, basis);
    expect(diffOfficialPrices(basis, actual)).toEqual([{ model, condition, field: 'input', recorded: old, official: next }]);
    expect(priceFingerprint(actual)).not.toBe(priceFingerprint(basis));
  });

  it('改价 fixture 报告 DeepSeek 输入变化，且输出变动也能发现', () => {
    const basis = officialPriceBasis(entries, 'deepseek');
    const changed = parseDeepseekPrices(fixture('changed'), basis);
    expect(diffOfficialPrices(basis, changed)).toEqual([{ model: 'deepseek-flash', condition: '空闲时段', field: 'input', recorded: 1, official: 1.5 }]);
    const output = parseDeepseekPrices(fixture('deepseek').replace('13.5元', '14.5元'), basis);
    expect(diffOfficialPrices(basis, output)).toEqual([{ model: 'deepseek-v4-pro', condition: '空闲时段', field: 'output', recorded: 13.5, official: 14.5 }]);
  });

  it('百炼不读取境外价、促销折扣或高阶梯，且不模糊匹配型号', () => {
    const basis = officialPriceBasis(entries, 'aliyun');
    const md = fixture('aliyun');
    const foreign = md.replaceAll('华北2（北京）', '美国（弗吉尼亚）').replaceAll('12元', '999元');
    expect(parseAliyunPrices(`${foreign}\n${md}`, basis)).toEqual(basis);
    expect(parseAliyunPrices(md.replaceAll('原价6元', '原价999元'), basis)).toEqual(basis);
    expect(() => parseAliyunPrices(md.replaceAll('qwen3.8-max', 'qwen3.8-max-preview'), basis)).toThrow(/缺少/);
  });

  it('方舟不读取低延迟/批量/音频/缓存存储价，高阶梯不覆盖首档', () => {
    const basis = officialPriceBasis(entries, 'volcengine');
    const md = fixture('volcengine');
    expect(parseVolcenginePrices(md.replaceAll('|0.017 |', '|999 |').replaceAll('|12.00 |', '|888 |') + '\n## 在线推理（低延迟）\n' + md.replace('## 在线推理（常规）', ''), basis)).toEqual(basis);
  });

  it.each(specs)('$id 日期和无关说明变化不改变指纹', ({ id, parse }) => {
    const basis = officialPriceBasis(entries, id);
    const changed = '# 更新时间：2030-01-01\n无关说明已修改。\n' + fixture(id).replaceAll('2026-11-09', '2030-01-01');
    expect(priceFingerprint(parse(changed, basis))).toBe(priceFingerprint(basis));
  });

  it.each(specs)('$id 重复价格键必须拒绝', ({ id, parse }) => {
    const md = fixture(id);
    const duplicate = id === 'volcengine'
      ? md.replace(/^(\|doubao\\-seed\\-evolving.*)$/m, '$1\n$1')
      : `${md}\n${md}`;
    expect(duplicate).not.toBe(md);
    expect(() => parse(duplicate, officialPriceBasis(entries, id))).toThrow(/重复/);
  });

  it.each(specs)('$id 表头缺失/非有限价格必须拒绝', ({ id, parse, from }) => {
    const basis = officialPriceBasis(entries, id);
    expect(() => parse(fixture('invalid'), basis)).toThrow();
    expect(() => parse(fixture(id).replace(from, from.replace(/\d+(?:\.\d+)?/, 'Infinity')), basis)).toThrow(/价格/);
  });

  it('结构排序和数值规范化后的 SHA-256 确定且不丢精度', () => {
    const basis = officialPriceBasis(entries, 'deepseek');
    const variants = [...basis].reverse().map((x) => ({ ...x, input: x.input.toFixed(6), output: x.output.toFixed(6), cacheRead: x.cacheRead?.toFixed(6) ?? null }));
    expect(canonicalizePrices(variants)).toEqual(basis);
    expect(priceFingerprint(variants)).toBe(priceFingerprint(basis));
    expect(priceFingerprint(basis)).toMatch(/^[a-f0-9]{64}$/);
    expect(priceFingerprint(basis)).toBe(createHash('sha256').update(JSON.stringify(basis)).digest('hex'));
    expect(priceFingerprint([{ ...basis[0], input: basis[0].input + 0.000001 }, ...basis.slice(1)])).not.toBe(priceFingerprint(basis));
  });
});

describe('官方价格漂移 report-only 与 CLI', () => {
  it('规范化集合一致时 unchanged，不产生字段差异', async () => {
    const r = await runOfficialPriceDriftCommand({ fetchPage: cleanFetch });
    expect(r.providers.map((x) => x.status)).toEqual(['unchanged', 'unchanged', 'unchanged']);
    expect(r.providers.map((x) => x.parsedRows)).toEqual([4, 11, 10]);
    expect(r.providers.every((x) => x.diffs.length === 0)).toBe(true);
  });

  it('逐厂商失败隔离，成功厂商仍继续对拍', async () => {
    const r = await runOfficialPriceDriftCommand({ fetchPage: async (url) => {
      if (sourceId(url) === 'aliyun') throw new Error('connection refused');
      return cleanFetch(url);
    } });
    expect(r.providers.map((x) => x.status)).toEqual(['unchanged', 'unavailable', 'unchanged']);
    expect(r.providers[1]).toMatchObject({ httpStatus: null, reason: 'connection refused', url: OFFICIAL_PRICE_SOURCES[1].url });
  });

  it('抓取与读取响应正文均受超时约束', async () => {
    for (const fetchPage of [async () => new Promise<never>(() => {}), async () => ({ status: 200, text: () => new Promise<string>(() => {}) })]) {
      const r = await runOfficialPriceDriftCommand({ fetchPage, timeoutMs: 5 });
      expect(r.providers.every((x) => x.status === 'unavailable' && x.reason?.includes('超时'))).toBe(true);
    }
  });

  it('非 200 与坏表格报告 URL、HTTP 与原因，绝不回填仓库值', async () => {
    for (const fetchPage of [async () => response('unavailable', 503), async () => response(fixture('invalid'))]) {
      const r = await runOfficialPriceDriftCommand({ fetchPage });
      expect(r.providers.every((x) => x.status === 'unavailable' && x.parsedRows === 0 && x.officialHash === null && x.reason)).toBe(true);
      const text = formatOfficialPriceDriftReport(r);
      for (const source of OFFICIAL_PRICE_SOURCES) expect(text).toContain(source.url);
      expect(text).toContain('无法判定');
    }
  });

  it.each(['normal', 'changed', 'failed', 'invalid'] as const)('真实 CLI %s 输入退出 0，且价格文件字节不变', (mode) => {
    const dataHashes = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const path = join(dir, e.name);
      return e.isDirectory() ? dataHashes(path) : [`${path}:${createHash('sha256').update(readFileSync(path)).digest('hex')}`];
    });
    const before = dataHashes('src/data');
    const run = cli(mode, ['--json']);
    expect(run.status, run.stderr).toBe(0);
    const r = JSON.parse(run.stdout) as OfficialPriceDriftResult;
    expect(r.readOnly).toBe(true);
    const expected = mode === 'normal' ? 'unchanged' : mode === 'changed' ? 'changed' : 'unavailable';
    expect(r.providers.map((x) => x.status)).toEqual([expected, expected, expected]);
    if (mode === 'changed') for (const p of r.providers) expect(p.diffs).toHaveLength(1);
    if (mode === 'failed' || mode === 'invalid') for (const p of r.providers) expect(p.reason).toBeTruthy();
    expect(dataHashes('src/data')).toEqual(before);
  });

  it('文本报告同时包含状态、两个 hash 和逐字段旧新值', () => {
    const run = cli('changed');
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('qwen3.8-max | 0<Token≤1M | input | 12 | 15');
    expect(run.stdout).toContain('doubao-seed-evolving | [0,1024] | input | 6 | 7.5');
    expect(run.stdout).toContain('deepseek-flash | 空闲时段 | input | 1 | 1.5');
    expect(run.stdout).toContain('SHA-256 官网');
  });

  it.each([['--unknown'], ['extra'], ['--json=oops'], ['--timeout-ms', '0'], ['--timeout-ms', 'NaN'], ['--entries-file'], ['--entries-file', 'missing-no-file.json'], ['--entries-file', 'src/data']])('参数错误 %s 才非 0', (...args) => {
    const run = cli('normal', args.flat());
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/参数|路径/);
  });
});
