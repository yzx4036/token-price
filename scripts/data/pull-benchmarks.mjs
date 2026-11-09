#!/usr/bin/env node
import { CliError, parseArgs } from './lib/io.mjs';
import { runPullBenchmarksCommand } from './lib/benchmarks-pull.mjs';

async function main() {
  const { flags, values, rest } = parseArgs(process.argv.slice(2));
  if (flags.has('help')) { process.stdout.write('用法：node scripts/data/pull-benchmarks.mjs [--check]\n'); return; }
  if (rest.length || [...flags].some((flag) => flag !== 'check') || Object.keys(values).some((key) => !['basis-file', 'cache-file', 'candidates-file', 'entries-file'].includes(key))) throw new CliError('未知 AA 取数参数');
  const result = await runPullBenchmarksCommand({ check: flags.has('check'), basisFile: values['basis-file'],
    cacheFile: values['cache-file'], candidatesFile: values['candidates-file'], entriesFile: values['entries-file'] });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`[失败] ${error.code ?? 'UNEXPECTED'}: ${error.message}\n`);
  process.exitCode = error instanceof CliError ? error.exitCode : 1;
});
