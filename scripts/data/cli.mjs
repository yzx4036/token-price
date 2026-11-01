#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { ADD_USAGE, addEntry, describeEntry } from './lib/add.mjs';
import { formatDiscoverReport, runDiscoverCommand } from './lib/discover.mjs';
import { formatDriftReport, runDriftCommand } from './lib/drift.mjs';
import { runRateCommand } from './lib/fx.mjs';
import { CliError, PATHS, ROOT, parseArgs, relative } from './lib/io.mjs';
import { AGGREGATE_SOURCE, runPullCommand } from './lib/pull.mjs';
import { formatPlansDriftReport, runPlansDriftCommand } from './lib/plans-drift.mjs';
import { checkSourceReachability } from './lib/reachability.mjs';
import { attachReachability, formatVerifyReport, runVerifyCommand } from './lib/verify.mjs';

const HELP = `Token Price 数据维护 CLI（v0.2.0）

用法：
  node scripts/data/cli.mjs <command> [options]
  npm run data -- <command>

命令：
  rate      拉取 USD→CNY 汇率并写入 src/data/generated/fx.generated.json
  pull      下载 models.dev 快照到 .cache/ 并重建 src/data/generated/aggregate.generated.json
  add       新增/覆盖一条价格（自动生成 id，重复时需 --force）
  verify    校验全部数据（schema + 厂商存在性 + 溯源完整性），输出问题清单与统计
            --check-sources 附加来源可达性抽查（默认关闭，只产出提醒，不是发布门禁）
  drift     把本地 official 值与聚合源对拍，只报告差异，不改写任何文件
  discover  扫聚合源找出「未收录厂商」与「被上限挤掉的模型」，只报告不写数据
  plans-drift  检查订阅套餐的月费是否还出现在官方页上，只告警
  publish   依次跑 verify → typecheck → test → build，全绿后执行部署脚本

通用选项：
  --json    输出机器可读 JSON（所有命令都支持）
  --help    查看命令帮助

示例：
  node scripts/data/cli.mjs                     # 查看本帮助
  node scripts/data/cli.mjs rate                # 更新汇率
  node scripts/data/cli.mjs pull                # 更新聚合补位数据
  node scripts/data/cli.mjs verify              # 交付前必跑
  node scripts/data/cli.mjs drift --json        # 差异清单（JSON）
  node scripts/data/cli.mjs discover            # 候选发现（未收录厂商 / 被挤掉的模型）
  node scripts/data/cli.mjs add --provider deepseek --model deepseek-flash \\
      --input 1 --output 4 --source-url https://api-docs.deepseek.com/zh-cn/quick_start/pricing \\
      --verified-at 2026-10-31
  node scripts/data/cli.mjs publish             # 校验 + 构建 + 发布

数据真源：
  src/data/providers.json          厂商元数据（含官方定价页）
  src/data/entries/api.json        价格条目（手写 + add 维护）
  src/data/entries/plans.json      Token Plan 条目
  src/data/generated/*.json        CLI 生成物（必须入库，缺失即构建失败）
`;

const COMMAND_HELP = {
  rate: `用法：node scripts/data/cli.mjs rate [--json]

主源 https://open.er-api.com/v6/latest/USD，失败自动回落 https://api.frankfurter.app/latest?from=USD&to=CNY。
写入 src/data/generated/fx.generated.json：{base, quote, rate, source, sourceUrl, fetchedAt, date}。
两个源都失败时不写文件、退出码非 0。`,
  pull: `用法：node scripts/data/cli.mjs pull [--json]

下载 ${AGGREGATE_SOURCE} 快照到 .cache/models-dev.json，打印厂商/模型统计，
并按「聚合补位白名单」重建 src/data/generated/aggregate.generated.json。
聚合条目一律标 provenance=aggregate，绝不覆盖 official 条目。`,
  add: ADD_USAGE,
  verify: `用法：node scripts/data/cli.mjs verify [--json] [--check-sources]

校验：schema、厂商存在性、id 唯一、official 有来源、aggregate 有来源与抓取日期、
汇率与聚合快照新鲜度、official 的 reportedCurrency 必须等于 billingCurrency。
有严重问题时退出码 1。

--check-sources  附加来源可达性抽查（默认关闭）：
                 对去重后的 official sourceUrl 串行探测，单条超时 8 秒、跟随重定向、
                 最多 12 个唯一 URL。HTTP 403、正文 < 500 字符的 JS 空壳页都只算提醒，
                 永不改变退出码；--json 输出新增 reachability 字段。
                 这是抽查，不是发布门禁——publish 不会调用它。
                 调试时可设环境变量 TOKEN_PRICE_REACHABILITY_URLS 覆盖探测清单（逗号分隔）。`,
  drift: `用法：node scripts/data/cli.mjs drift [--json]

把 src/data/entries/api.json 里的 official 条目与 .cache/models-dev.json 对拍，
输出「本地值 vs 聚合值」差异表。缓存不存在时先自动 pull。
只报告，绝不改写任何数据文件。`,
  discover: `用法：node scripts/data/cli.mjs discover [--json] [--top N] [--cache-file PATH] [--pull]

扫 .cache/models-dev.json，输出两类候选，供人工判断要不要收录：
  1) 未收录厂商：聚合源里有可计价对话模型、但 providers.json 没映射的；
     转售/托管平台会被标出来并排在后面，避免渠道商混进厂商标的横比。
  2) 被上限挤掉的模型：已收录厂商中候选数超过 AGGREGATE_LIMITS 的，
     新模型按发布日倒序进榜，会顶掉最旧的条目，这里把它列出来。

只读：不写任何数据文件，收录仍需人工核验官方页。
默认不联网：缓存缺失时报错，需要自动抓取时加 --pull。`,
  publish: `用法：node scripts/data/cli.mjs publish

依次执行：verify → npm run typecheck → npm test -- --run → npm run build → bash scripts/deploy-site.sh
任一步失败立即中止并返回非 0 退出码。`,
};

function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function runStep(name, command, args, { json }) {
  if (!json) process.stdout.write(`\n==> ${name}：${command} ${args.join(' ')}\n`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: json ? 'pipe' : 'inherit',
    encoding: 'utf8',
    shell: false,
  });
  const code = result.status ?? 1;
  if (result.error) {
    throw new CliError(`${name} 无法执行：${result.error.message}`, { code: 'STEP_SPAWN_FAILED' });
  }
  if (code !== 0) {
    const output = json ? `${result.stdout ?? ''}${result.stderr ?? ''}`.trim().split('\n').slice(-40).join('\n') : '';
    throw new CliError(`${name} 失败（退出码 ${code}）\n${output}`, { code: 'STEP_FAILED' });
  }
  return { name, command: `${command} ${args.join(' ')}`, code, ok: true };
}

function npmInvocation(args) {
  if (process.platform !== 'win32') return { command: 'npm', args };
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', 'npm.cmd', ...args],
  };
}

function bashInvocation(args) {
  const command = process.env.BASH || 'bash';
  if (process.platform !== 'win32' || !/\.(?:cmd|bat)$/i.test(command)) {
    return { command, args };
  }
  return {
    command: process.env.ComSpec ?? 'cmd.exe',
    args: ['/d', '/s', '/c', command, ...args],
  };
}

async function runPublish({ json }) {
  const steps = [];
  const verify = runVerifyCommand();
  if (!json) process.stdout.write(`${formatVerifyReport(verify)}\n`);
  if (!verify.ok) {
    throw new CliError('verify 未通过，publish 中止（未执行构建与部署）', { code: 'PUBLISH_VERIFY_FAILED' });
  }
  steps.push({ name: 'verify', command: 'cli.mjs verify', code: 0, ok: true });
  const typecheck = npmInvocation(['run', 'typecheck']);
  const test = npmInvocation(['test', '--', '--run']);
  const build = npmInvocation(['run', 'build']);
  const deploy = bashInvocation([relative(PATHS.deployScript)]);
  steps.push(runStep('类型检查', typecheck.command, typecheck.args, { json }));
  steps.push(runStep('单元测试', test.command, test.args, { json }));
  steps.push(runStep('静态构建', build.command, build.args, { json }));
  steps.push(runStep('发布站点', deploy.command, deploy.args, { json }));
  return { ok: true, steps };
}

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  const args = argv.filter((token) => token !== '--json');
  const command = args[0];
  const rest = args.slice(1);

  if (!command || command === '--help' || command === '-h' || command === 'help') {
    if (command === 'help' && rest[0] && COMMAND_HELP[rest[0]]) {
      process.stdout.write(`${COMMAND_HELP[rest[0]]}\n`);
      return;
    }
    process.stdout.write(HELP);
    return;
  }

  if (rest.includes('--help') || rest.includes('-h')) {
    process.stdout.write(`${COMMAND_HELP[command] ?? HELP}\n`);
    return;
  }

  switch (command) {
    case 'rate': {
      const result = await runRateCommand();
      if (json) return printJson({ ok: true, ...result, file: relative(PATHS.fx) });
      const previousRate = result.previous?.rate;
      process.stdout.write(`== 汇率更新 ==\n`);
      process.stdout.write(`1 USD = ${result.fx.rate} CNY（汇率日期 ${result.fx.date}，来源 ${result.fx.source}）\n`);
      if (typeof previousRate === 'number') {
        process.stdout.write(`上一版：${previousRate}（${result.previous.date}）\n`);
      }
      process.stdout.write(`已写入 ${relative(PATHS.fx)}（抓取时间 ${result.fx.fetchedAt}）\n`);
      process.stdout.write('提示：页面上的「按汇率估算」取的就是这份文件，汇率非实时，仅用于横向比较。\n');
      return;
    }
    case 'pull': {
      const result = await runPullCommand();
      if (json) return printJson({ ok: true, ...result });
      process.stdout.write(`== 聚合源拉取 ==\n`);
      process.stdout.write(`快照：${result.cachePath}（${result.stats.providers} 厂商 / ${result.stats.models} 模型）\n`);
      process.stdout.write(`生成物：${result.aggregatePath}（收录 ${result.aggregateCount} 条 aggregate 条目）\n`);
      process.stdout.write('各厂商收录条数：\n');
      for (const item of result.perProvider) {
        process.stdout.write(`  ${item.providerId.padEnd(12)} ${item.missing ? '聚合源缺少该厂商' : `${item.selected} 条`}\n`);
      }
      process.stdout.write('提示：聚合条目只补空缺，不会覆盖 official 条目。\n');
      return;
    }
    case 'add': {
      const result = addEntry(rest);
      if (result.help) return process.stdout.write(`${result.help}\n`);
      if (json) return printJson({ ok: true, ...result });
      process.stdout.write(`== 条目${result.action === 'created' ? '新增' : '覆盖'} ==\n`);
      if (result.previous) process.stdout.write(`旧值：${describeEntry(result.previous)}\n`);
      process.stdout.write(`新值：${describeEntry(result.entry)}\n`);
      process.stdout.write(`已写入 ${result.path}（共 ${result.count} 条）\n`);
      process.stdout.write('下一步：node scripts/data/cli.mjs verify\n');
      return;
    }
    case 'verify': {
      const { flags } = parseArgs(rest);
      const result = runVerifyCommand();
      if (flags.has('check-sources')) {
        const override = String(process.env.TOKEN_PRICE_REACHABILITY_URLS ?? '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        const targets = override.length > 0 ? override : result.officialSourceUrls;
        attachReachability(result, await checkSourceReachability(targets));
      }
      if (json) {
        printJson(result);
      } else {
        process.stdout.write(`${formatVerifyReport(result)}\n`);
      }
      if (!result.ok) process.exitCode = 1;
      return;
    }
    case 'plans-drift': {
      const result = await runPlansDriftCommand();
      if (json) printJson(result);
      else process.stdout.write(`${formatPlansDriftReport(result)}\n`);
      return;
    }
    case 'discover': {
      const { values, flags } = parseArgs(rest);
      const cacheFile = values['cache-file'] ? resolve(process.cwd(), values['cache-file']) : null;
      const topN = values.top ? Number(values.top) : 20;
      if (!Number.isInteger(topN) || topN <= 0) {
        throw new CliError('--top 必须是正整数', { code: 'BAD_ARGUMENT' });
      }
      const result = await runDiscoverCommand({ snapshotFile: cacheFile, allowPull: flags.has('pull'), topN });
      if (json) printJson(result);
      else process.stdout.write(`${formatDiscoverReport(result)}\n`);
      return;
    }
    case 'drift': {
      const { values, flags } = parseArgs(rest);
      const entriesFile = values['entries-file'] ? resolve(process.cwd(), values['entries-file']) : null;
      const cacheFile = values['cache-file'] ? resolve(process.cwd(), values['cache-file']) : null;
      const allowPull = flags.has('pull') || values.pull === 'true';
      const result = await runDriftCommand({ entriesFile, cacheFile, allowPull });
      if (json) printJson(result);
      else process.stdout.write(`${formatDriftReport(result)}\n`);
      return;
    }
    case 'publish': {
      const result = await runPublish({ json });
      if (json) printJson(result);
      else process.stdout.write('\n==> 发布完成\n');
      return;
    }
    default:
      throw new CliError(`未知命令：${command}\n\n${HELP}`, { code: 'UNKNOWN_COMMAND' });
  }
}

main().catch((error) => {
  const json = process.argv.includes('--json');
  const exitCode = error instanceof CliError ? error.exitCode : 1;
  if (json) {
    printJson({ ok: false, code: error?.code ?? 'UNEXPECTED', message: error instanceof Error ? error.message : String(error) });
  } else {
    process.stderr.write(`\n[失败] ${error instanceof Error ? error.message : String(error)}\n`);
  }
  process.exitCode = exitCode;
});
