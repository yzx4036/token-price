#!/usr/bin/env node
import { CliError, parseArgs } from './lib/io.mjs';
import { runReplayCommand, runSnapshotCommand } from './lib/history.mjs';

function main() {
  const [command, ...args] = process.argv.slice(2);
  const { values, flags, rest } = parseArgs(args);
  if (!command || command === '--help') {
    process.stdout.write('用法：node scripts/data/history.mjs snapshot | replay --id <entryId>\n');
    return;
  }
  if (rest.length || flags.size || Object.keys(values).some((key) => !['entries-file', 'history-file', 'id'].includes(key))) throw new CliError('未知快照参数');
  const options = { entriesFile: values['entries-file'], historyFile: values['history-file'], id: values.id };
  const result = command === 'snapshot' ? runSnapshotCommand(options)
    : command === 'replay' ? runReplayCommand(options) : null;
  if (!result) throw new CliError(`未知历史命令：${command}`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try { main(); } catch (error) {
  process.stderr.write(`[失败] ${error.message}\n`);
  process.exitCode = error instanceof CliError ? error.exitCode : 1;
}
