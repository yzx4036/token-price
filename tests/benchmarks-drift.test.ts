import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { compareBenchmarks, formatBenchmarksDriftReport, runBenchmarksDriftCommand } from '../scripts/data/lib/benchmarks-drift.mjs';

const basisFile = 'tests/fixtures/benchmarks/basis.json';
const cacheFile = 'tests/fixtures/benchmarks/drift-current.json';
const basis = () => JSON.parse(readFileSync(basisFile, 'utf8'));
const snapshot = () => JSON.parse(readFileSync(cacheFile, 'utf8'));

describe('AA 漂移只读报告', () => {
  it('Opus +0.70 入列；分数、档位切换、slug 消失独立列出且不写输入', () => {
    const before = [readFileSync(basisFile), readFileSync(cacheFile)];
    const result = runBenchmarksDriftCommand({ basisFile, cacheFile });
    expect(result).toMatchObject({ ok: true, readOnly: true, threshold: 0.5 });
    expect(result.scoreChanges).toEqual([expect.objectContaining({ aaName: 'Claude Opus 5.5 (High)', before: 58.41, after: 59.11, difference: 0.7 })]);
    expect(result.tierChanges).toEqual([expect.objectContaining({ before: 'High', after: 'Max' })]);
    expect(formatBenchmarksDriftReport(result)).toContain('Claude Opus 5.5');
    const current = snapshot(); current.models = current.models.filter((row: any) => row.slug !== 'claude-opus-5-5'); current.modelCount = current.models.length;
    expect(compareBenchmarks(basis(), current).missingSlugs).toHaveLength(1);
    expect([readFileSync(basisFile), readFileSync(cacheFile)]).toEqual(before);
  });

  it.each([[-0.51, 1], [-0.5, 0], [0, 0], [0.5, 0], [0.50000000001, 1], [0.51, 1]])('分差 %s：应报告 %s 条', (difference, count) => {
    const current = snapshot(); current.models = [current.models[1]]; current.modelCount = 1;
    current.models[0].intelligenceIndex = 58.41 + difference;
    expect(compareBenchmarks(basis(), current).scoreChanges).toHaveLength(count);
    expect(compareBenchmarks(basis(), current).tierChanges).toHaveLength(1);
  });

  it('未评测不造 0 分；错误 basis、错误快照必须失败', () => {
    const current = snapshot(); current.models.forEach((row: any) => { row.intelligenceIndex = null; });
    expect(compareBenchmarks(basis(), current).scoreChanges).toEqual([]);
    expect(compareBenchmarks(basis(), current).tierChanges).toEqual([]);
    expect(() => compareBenchmarks({}, current)).toThrow();
    expect(() => compareBenchmarks(basis(), { ...current, modelCount: 999 })).toThrow();
    const wrong = basis(); wrong.benchmarks[0].score = '58';
    expect(() => compareBenchmarks(wrong, current)).toThrow();
  });

  it('CLI JSON 分发成功，漂移仍为 0；输入损坏非 0，帮助包含新命令', () => {
    const args = ['scripts/data/cli.mjs', 'benchmarks-drift', '--json', '--basis-file', basisFile, '--cache-file', cacheFile];
    const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
    expect(result.status).toBe(0); expect(JSON.parse(result.stdout).scoreChanges).toHaveLength(1);
    const dir = mkdtempSync(join(tmpdir(), 'token-price-bench-drift-'));
    try {
      const broken = join(dir, 'broken.json'); writeFileSync(broken, '{}');
      const bad = spawnSync(process.execPath, [...args, '--cache-file', broken], { encoding: 'utf8' });
      expect(bad.status).not.toBe(0); expect(JSON.parse(bad.stdout).ok).toBe(false);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    expect(spawnSync(process.execPath, ['scripts/data/cli.mjs', '--help'], { encoding: 'utf8' }).stdout).toContain('benchmarks-drift');
  });
});
