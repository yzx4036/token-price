#!/usr/bin/env node
/**
 * 生成 src/data/generated/benchmarks.generated.json
 *
 * 依据：src/data/estimates/benchmark-basis.json（手写，只记 AA 原始值与人工核验的映射）
 * 计算：scripts/data/lib/benchmark.mjs
 *
 * 用法：node.exe scripts/data/gen-benchmarks.mjs [--check]
 */
import { resolve } from 'node:path';
import { PATHS, ROOT, readJson, writeJsonAtomic, relative, CliError } from './lib/io.mjs';
import { buildBenchmarkDocument, findSemanticMismatches } from './lib/benchmark.mjs';

const BASIS_PATH = resolve(ROOT, 'src/data/estimates/benchmark-basis.json');
const OUT_PATH = resolve(ROOT, 'src/data/generated/benchmarks.generated.json');

function main() {
  const check = process.argv.includes('--check');
  const apiEntries = readJson(PATHS.apiEntries);
  const basis = readJson(BASIS_PATH);

  // 依据自检：每条 benchmark 必须有来源可追溯的 slug 与分数
  for (const b of basis.benchmarks) {
    if (!b.aaSlug || typeof b.score !== 'number') {
      throw new CliError(`benchmark 记录不完整：${JSON.stringify(b)}`, { code: 'BENCH_BAD' });
    }
    if (b.score <= 0 || b.score > 100) {
      throw new CliError(`分数超出合理区间 (0,100]：${b.aaSlug} = ${b.score}`, { code: 'BENCH_RANGE' });
    }
  }

  const doc = buildBenchmarkDocument(basis, apiEntries);

  // 悬空映射直接报错：映射指向了不存在的评分，说明手写表写错了
  if (doc.coverage.danglingMappings.length > 0) {
    throw new CliError(
      `映射指向不存在的评分：${doc.coverage.danglingMappings.join(', ')}`,
      { code: 'BENCH_DANGLING' },
    );
  }

  // 语义一致性：防止「A 的分数安到 B 头上」——这类笔误结构上完全合法，只能靠语义校验
  const mismatches = findSemanticMismatches(basis);
  if (mismatches.length > 0) {
    throw new CliError(
      `映射两端语义不一致（疑似张冠李戴）：${mismatches.join('；')}`,
      { code: 'BENCH_MISMATCH' },
    );
  }

  if (check) {
    let onDisk;
    try {
      onDisk = readJson(OUT_PATH);
    } catch {
      throw new CliError(`${relative(OUT_PATH)} 不存在`, { code: 'OUT_MISSING' });
    }
    if (JSON.stringify(doc.byEntryId) !== JSON.stringify(onDisk.byEntryId)) {
      throw new CliError(`产物与重算不一致：${relative(OUT_PATH)}`, { code: 'OUT_STALE' });
    }
    console.log(`✓ benchmarks 一致：${doc.coverage.scoredModels} 个模型有分数 / ${doc.coverage.uniqueModels} 个唯一模型`);
    return;
  }

  writeJsonAtomic(OUT_PATH, doc);
  const c = doc.coverage;
  console.log(`✓ 已生成 ${relative(OUT_PATH)}`);
  console.log(`  唯一模型 ${c.uniqueModels} · 有评分 ${c.scoredModels} · 未评测 ${c.unscoredModels}`);
  console.log(`  API 条目 ${c.apiEntries} · 挂上评分 ${c.apiEntriesScored}`);
}

try {
  main();
} catch (error) {
  if (error instanceof CliError) {
    console.error(`✗ ${error.code}: ${error.message}`);
    process.exit(error.exitCode);
  }
  throw error;
}
