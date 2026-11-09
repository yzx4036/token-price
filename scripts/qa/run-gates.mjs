#!/usr/bin/env node
/**
 * 门禁执行器（编排层仪表，不委派给执行体）
 *
 * 读 docs/.hermes/gates.json 逐条跑，判据 = expect_exit + expect_regex（若有）。
 * 为什么自己写而不是装一个第三方 runner：
 *   门本身必须可被我审计，且它的判据口径要能一眼读出来（regex 写死在这里的配置里）。
 *
 * 用法：
 *   node scripts/qa/run-gates.mjs                # 跑全部
 *   node scripts/qa/run-gates.mjs --only test    # 只跑一条（逗号分隔可多选）
 *   node scripts/qa/run-gates.mjs --json         # 机器可读
 *
 * 退出码：0 全绿；1 有门红；2 配置或环境问题（配置读不到 / 门禁列表为空）
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? null : process.argv[i + 1];
};
const only = arg('--only');
const asJson = process.argv.includes('--json');
const configPath = resolve(arg('--config') ?? 'docs/.hermes/gates.json');

let config;
try {
  config = JSON.parse(readFileSync(configPath, 'utf8'));
} catch (error) {
  console.error(`[无法判定] 门禁配置读不到：${configPath}\n${error.message}`);
  process.exit(2);
}

const gates = (config.gates ?? []).filter((gate) => {
  if (!only) return true;
  const wanted = only.split(',').map((s) => s.trim()).filter(Boolean);
  return wanted.includes(gate.id);
});

if (gates.length === 0) {
  console.error('[无法判定] 没有任何可跑的门（检查 --only 或配置内容）');
  process.exit(2);
}

const results = [];
for (const gate of gates) {
  const started = Date.now();
  if (!Array.isArray(gate.cmd) || gate.cmd.length === 0) {
    results.push({ id: gate.id, ok: false, reason: 'cmd 必须是 argv 数组', ms: 0 });
    continue;
  }
  const run = spawnSync(gate.cmd[0], gate.cmd.slice(1), {
    encoding: 'utf8',
    timeout: (gate.timeout ?? 600) * 1000,
    // Windows 上 .cmd/.bat 不能直接 spawn（Node 会报 EINVAL，源自 CVE-2024-27980 的修复），
    // 必须经 shell 解析；本仓门禁参数都是简单 token（run / test / --run），无注入面。
    shell: /\.(cmd|bat)$/i.test(gate.cmd[0]),
    maxBuffer: 32 * 1024 * 1024,
  });
  const ms = Date.now() - started;
  const output = `${run.stdout ?? ''}\n${run.stderr ?? ''}`;
  const expectExit = gate.expect_exit ?? 0;
  let ok = run.status === expectExit;
  let reason = ok ? 'exit 正常' : `exit ${run.status ?? 'null'} ≠ ${expectExit}`;

  if (ok && gate.expect_regex) {
    // 正则不命中 → 红：有的命令红着也返 0，必须用输出判据兜底
    const hit = new RegExp(gate.expect_regex, 'm').test(output);
    if (!hit) {
      ok = false;
      reason = `退出码正常但输出未命中 /${gate.expect_regex}/`;
    }
  }
  if (run.error) {
    ok = false;
    reason = `启动失败：${run.error.message}`;
  }
  const tail = output.trim().split('\n').slice(-6).join('\n');
  results.push({ id: gate.id, name: gate.name, ok, reason, ms, tail });
}

if (asJson) {
  console.log(JSON.stringify({ config: configPath, results }, null, 2));
} else {
  console.log(`== 门禁（${configPath}）==`);
  for (const r of results) {
    const mark = r.ok ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${r.id.padEnd(20)} ${String(r.ms).padStart(7)}ms  ${r.reason}`);
    if (!r.ok && r.tail) {
      console.log(r.tail.split('\n').map((l) => `      ${l}`).join('\n'));
    }
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\n结论：${failed.length === 0 ? '全绿' : `${failed.length} 条红（${failed.map((r) => r.id).join(', ')}）`}`);
}

process.exit(results.every((r) => r.ok) ? 0 : 1);
