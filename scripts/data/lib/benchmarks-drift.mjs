import { CliError, readJson } from './io.mjs';
import { AA_CACHE_FILE, BENCHMARK_BASIS_FILE, selectHighestTiers, tierFor, validateBasis, validateSnapshot } from './benchmarks-pull.mjs';

export function compareBenchmarks(basis, snapshot) {
  validateBasis(basis);
  const selected = selectHighestTiers(validateSnapshot(snapshot));
  const scoreChanges = []; const tierChanges = []; const missingSlugs = [];
  for (const benchmark of basis.benchmarks) {
    const model = selected.get(benchmark.aaSlug);
    const identity = { aaSlug: benchmark.aaSlug, aaName: benchmark.aaName };
    if (!model) { missingSlugs.push(identity); continue; }
    if (model.modelCreatorName !== benchmark.creator) throw new CliError(`AA creator 不一致：${benchmark.aaSlug}`, { code: 'BENCHMARKS_INVALID' });
    if (model.intelligenceIndex === null) continue;
    const difference = model.intelligenceIndex - benchmark.score;
    if (model.intelligenceIndex > benchmark.score + 0.5 || model.intelligenceIndex < benchmark.score - 0.5) scoreChanges.push({ ...identity, before: benchmark.score, after: model.intelligenceIndex, difference: Number(difference.toFixed(10)) });
    const tier = tierFor(model);
    if (tier !== benchmark.tierUsed) tierChanges.push({ ...identity, before: benchmark.tierUsed, after: tier });
  }
  return { ok: true, readOnly: true, threshold: 0.5, scoreChanges, tierChanges, missingSlugs };
}

export function runBenchmarksDriftCommand({ basisFile = BENCHMARK_BASIS_FILE, cacheFile = AA_CACHE_FILE } = {}) {
  return compareBenchmarks(readJson(basisFile), readJson(cacheFile));
}

export function formatBenchmarksDriftReport(result) {
  const lines = ['== AA 基准漂移（只读） ==', `分数变化 ${result.scoreChanges.length} · 档位切换 ${result.tierChanges.length} · slug 消失 ${result.missingSlugs.length}`];
  for (const [label, rows] of [['分数变化', result.scoreChanges], ['档位切换', result.tierChanges], ['slug 消失', result.missingSlugs]]) {
    for (const row of rows) lines.push(`${label}：${row.aaName} (${row.aaSlug})${row.before === undefined ? '' : ` ${row.before} → ${row.after}`}`);
  }
  return lines.join('\n');
}
