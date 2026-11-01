#!/usr/bin/env node
/**
 * 生成 src/data/generated/token-estimates.generated.json
 *
 * 依据：src/data/estimates/token-basis.json（手写，只记官方原文数字与来源）
 * 计算：scripts/data/lib/token-estimate.mjs（程序化，可重跑复现）
 *
 * 用法：node.exe scripts/data/gen-token-estimates.mjs [--check]
 *   --check  只校验「产物与重算结果一致」，不写盘；不一致退出码 1（给 CI / 门禁用）
 */
import { resolve } from 'node:path';
import { PATHS, ROOT, readJson, writeJsonAtomic, relative, CliError } from './lib/io.mjs';
import { buildDocument } from './lib/token-estimate.mjs';

const BASIS_PATH = resolve(ROOT, 'src/data/estimates/token-basis.json');
const OUT_PATH = resolve(ROOT, 'src/data/generated/token-estimates.generated.json');

function main() {
  const check = process.argv.includes('--check');

  const plans = readJson(PATHS.planEntries);
  const plansById = new Map(plans.map((p) => [p.id, p]));
  const basis = readJson(BASIS_PATH);

  // 依据必须覆盖全部套餐，缺一条就报错——防止新增套餐后折算静默漏掉
  const covered = new Set(basis.plans.map((p) => p.planId));
  const missing = plans.map((p) => p.id).filter((id) => !covered.has(id));
  if (missing.length > 0) {
    throw new CliError(
      `以下套餐缺折算依据（请在 src/data/estimates/token-basis.json 补齐）：${missing.join(', ')}`,
      { code: 'BASIS_MISSING' },
    );
  }

  // 依据里引用的基准模型必须在单价表里，否则会算出 NaN
  for (const row of basis.plans) {
    if (row.basisModel && !basis.currencyPrices[row.basisModel]) {
      throw new CliError(
        `基准模型 ${row.basisModel} 未在 currencyPrices 中定义单价（套餐 ${row.planId}）`,
        { code: 'BASIS_PRICE_MISSING' },
      );
    }
  }

  const doc = buildDocument(basis, plansById);

  if (check) {
    let onDisk;
    try {
      onDisk = readJson(OUT_PATH);
    } catch {
      throw new CliError(`${relative(OUT_PATH)} 不存在，请先运行本脚本生成`, { code: 'OUT_MISSING' });
    }
    const a = JSON.stringify(doc.estimates);
    const b = JSON.stringify(onDisk.estimates);
    if (a !== b) {
      throw new CliError(
        `产物与重算结果不一致（改过依据但没重新生成？）：${relative(OUT_PATH)}`,
        { code: 'OUT_STALE' },
      );
    }
    console.log(`✓ token-estimates 一致：${doc.coverage.plans} 条，其中有数值 ${doc.coverage.withNumbers} 条`);
    return;
  }

  writeJsonAtomic(OUT_PATH, doc);
  console.log(`✓ 已生成 ${relative(OUT_PATH)}`);
  console.log(`  套餐 ${doc.coverage.plans} 条 · 有数值 ${doc.coverage.withNumbers} · 无数值 ${doc.coverage.withoutNumbers}`);
  for (const [tier, n] of Object.entries(doc.coverage.byTier)) {
    console.log(`    ${tier.padEnd(24)} ${n}`);
  }
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
