import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseApiPrices } from '../src/lib/schema';

const CLI = 'scripts/data/cli.mjs';
const SOURCE = 'src/data/entries/api.json';
// 聚合快照的入库夹具：真缓存 .cache/models-dev.json 被 gitignore，CI 上不存在，
// 所以 drift 相关测试一律显式指定夹具，不依赖本地缓存也不联网。
const FIXTURE = 'tests/fixtures/models-dev.drift.json';

type RunResult = { status: number; stdout: string; stderr: string };

function run(args: string[], env: Record<string, string> = {}): RunResult {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? 1, stdout: failure.stdout ?? '', stderr: failure.stderr ?? '' };
  }
}

function tempEntriesFile(): string {
  const dir = mkdtempSync(join(tmpdir(), 'token-price-add-'));
  const file = join(dir, 'api.json');
  copyFileSync(SOURCE, file);
  return file;
}

const baseArgs = [
  'add',
  '--provider', 'deepseek',
  '--model', 'deepseek-flash',
  '--input', '1',
  '--output', '4',
  '--billing-currency', 'CNY',
  '--source-url', 'https://api-docs.deepseek.com/zh-cn/quick_start/pricing',
  '--verified-at', '2026-10-31',
];

/** 去掉某个带值参数（连同它的值） */
function withoutFlag(args: string[], flag: string): string[] {
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === flag) {
      index += 1;
      continue;
    }
    out.push(args[index]);
  }
  return out;
}

describe('数据 CLI 的失败语义（v0.11.0 裁定 R14）', () => {
  it('discover --top 缺值直接报错，不许静默回落默认 20', () => {
    const result = run(['discover', '--top']);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('--top');
  });

  it('discover --cache-file 缺值直接报错', () => {
    const result = run(['discover', '--cache-file']);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain('--cache-file');
  });

  it('discover --top 2 正常（带缓存夹具，不联网）', () => {
    const result = run(['discover', '--top', '2', '--cache-file', FIXTURE]);
    expect(result.status).toBe(0);
  });
});

describe('数据 CLI 的基本行为', () => {
  it('无参数打印中文帮助并退出 0', () => {
    const result = run([]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('AI Token Pricing 数据维护 CLI');
    expect(result.stdout).toContain('verify');
    expect(result.stdout).toContain('publish');
  });

  it('--help 打印命令表', () => {
    const result = run(['--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('drift');
  });

  it('子命令帮助不执行副作用', () => {
    const result = run(['add', '--help']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--provider');
  });

  it('未知命令退出码非 0 并给出中文提示', () => {
    const result = run(['nope']);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('未知命令');
  });
});

describe('add 的失败路径（拒绝且文件字节不变）', () => {
  const cases: Array<[string, string[]]> = [
    ['负价格', [...baseArgs, '--input', '-1']],
    ['负的 cache 价格', [...baseArgs, '--cache-read', '-0.5']],
    ['非 https 来源', [...baseArgs, '--source-url', 'http://api-docs.deepseek.com/pricing']],
    ['缺核验日期', withoutFlag(baseArgs, '--verified-at')],
    ['非法核验日期', [...baseArgs, '--verified-at', '2026-02-30']],
    ['official 缺来源链接', withoutFlag(baseArgs, '--source-url')],
    ['aggregate 缺聚合源', [...baseArgs, '--provenance', 'aggregate']],
    ['未知厂商', [...baseArgs, '--provider', 'unknown-vendor']],
  ];

  it.each(cases)('拒绝%s', (_label, args) => {
    const file = tempEntriesFile();
    const before = readFileSync(file);
    const result = run([...args, '--entries-file', file]);
    expect(result.status).not.toBe(0);
    expect(readFileSync(file).equals(before)).toBe(true);
  });

  it('重复 id 未加 --force 时拒绝且文件不变', () => {
    const file = tempEntriesFile();
    const before = readFileSync(file);
    const result = run([...baseArgs, '--id', 'deepseek-deepseek-flash-idle', '--entries-file', file]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('已存在');
    expect(readFileSync(file).equals(before)).toBe(true);
  });
});

describe('add 的成功路径', () => {
  it('新增条目后可被同一份 schema 解析，--force 覆盖时保留条数', () => {
    const file = tempEntriesFile();
    const before = parseApiPrices(JSON.parse(readFileSync(file, 'utf8'))).length;

    const created = run([...baseArgs, '--model', 'deepseek-flash-test', '--entries-file', file]);
    expect(created.status).toBe(0);
    const afterCreate = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>;
    expect(afterCreate).toHaveLength(before + 1);
    const added = afterCreate.find((entry) => entry.id === 'deepseek-deepseek-flash-test');
    expect(added).toMatchObject({ providerId: 'deepseek', billingCurrency: 'CNY', provenance: 'official' });
    expect(() => parseApiPrices(afterCreate)).not.toThrow();

    const forced = run([...baseArgs, '--model', 'deepseek-flash-test', '--input', '2', '--force', '--entries-file', file]);
    expect(forced.status).toBe(0);
    const afterForce = JSON.parse(readFileSync(file, 'utf8')) as Array<Record<string, unknown>>;
    expect(afterForce).toHaveLength(before + 1);
    expect(afterForce.find((entry) => entry.id === 'deepseek-deepseek-flash-test')).toMatchObject({ inputPrice: 2 });
  });

  it('--json 输出机器可读结果', () => {
    const file = tempEntriesFile();
    const result = run([...baseArgs, '--model', 'deepseek-flash-json', '--json', '--entries-file', file]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as { ok: boolean; action: string; entry: { id: string } };
    expect(payload.ok).toBe(true);
    expect(payload.action).toBe('created');
    expect(payload.entry.id).toBe('deepseek-deepseek-flash-json');
  });
});

describe('verify 与 drift 的 CLI 契约', () => {
  it('verify --json 返回统计与零严重问题', () => {
    const result = run(['verify', '--json']);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as { ok: boolean; errorCount: number; stats: { entries: number } };
    expect(payload.ok).toBe(true);
    expect(payload.errorCount).toBe(0);
    expect(payload.stats.entries).toBeGreaterThanOrEqual(100);
  }, 60_000);

  it('verify --check-sources 对不可达来源只产出提醒，退出码仍为 0', () => {
    const result = run(['verify', '--check-sources', '--json'], {
      TOKEN_PRICE_REACHABILITY_URLS: 'http://127.0.0.1:9/x',
    });
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as {
      ok: boolean;
      errorCount: number;
      problems: Array<{ level: string; code: string }>;
      reachability: { checked: number; ok: number; failed: Array<{ url: string; reason: string }> };
    };
    expect(payload.ok).toBe(true);
    expect(payload.errorCount).toBe(0);
    expect(payload.reachability.checked).toBe(1);
    expect(payload.reachability.ok).toBe(0);
    expect(payload.reachability.failed).toHaveLength(1);
    expect(payload.reachability.failed[0].url).toBe('http://127.0.0.1:9/x');
    expect(payload.problems.some((problem) => problem.code === 'SOURCE_UNREACHABLE' && problem.level === 'warning')).toBe(true);
  }, 60_000);

  it('未加 --check-sources 时不探测网络，reachability 为空', () => {
    const result = run(['verify', '--json']);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as { reachability: unknown };
    expect(payload.reachability).toBeNull();
  }, 60_000);

  it('pull 写缓存前会先建目录（CI 全新检出时没有 .cache/）', () => {
    // 静态守卫：这条曾经导致 CI 上 pull 直接 ENOENT 失败。
    // 走 writeJsonAtomic 才会 mkdirSync 父目录；用裸 writeFileSync 就退化。
    const src = readFileSync('scripts/data/lib/pull.mjs', 'utf8');
    expect(src).toContain('writeJsonAtomic(PATHS.modelsDevCache');
    expect(src).not.toMatch(/writeFileSync\(PATHS\.modelsDevCache/);
  });

  it('drift 只报告不改写：运行前后条目文件字节一致', () => {
    const before = readFileSync(SOURCE);
    const result = run(['drift', '--json', '--cache-file', FIXTURE]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as { readOnly: boolean; comparedEntries: number; diffs: unknown[] };
    expect(payload.readOnly).toBe(true);
    expect(payload.comparedEntries).toBeGreaterThan(0);
    expect(Array.isArray(payload.diffs)).toBe(true);
    expect(readFileSync(SOURCE).equals(before)).toBe(true);
  }, 60_000);

  it('聚合快照缺失时 drift 必须报错，不得偷偷联网抓取', () => {
    // 反例保护：早先的实现会在快照缺失时静默 pull，导致 CI 里变成隐式网络调用
    const result = run(['drift', '--json', '--cache-file', join(tmpdir(), 'definitely-missing-snapshot.json')]);
    expect(result.status).not.toBe(0);
    const payload = JSON.parse(result.stdout) as { ok: boolean; code: string };
    expect(payload.ok).toBe(false);
    expect(payload.code).toBe('SNAPSHOT_MISSING');
  }, 60_000);

  it('人为篡改一条 official 价格后 drift 能报出差异（变异验证）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'token-price-drift-'));
    const file = join(dir, 'api.json');
    const entries = JSON.parse(readFileSync(SOURCE, 'utf8')) as Array<Record<string, unknown>>;
    const target = entries.find((entry) => entry.providerId === 'deepseek' && entry.provenance === 'official')!;
    target.inputPrice = 999;
    writeFileSync(file, JSON.stringify(entries, null, 2));
    const result = run(['drift', '--json', '--entries-file', file, '--cache-file', FIXTURE]);
    expect(result.status).toBe(0);
    const payload = JSON.parse(result.stdout) as { diffs: Array<{ id: string; diffPercent: number }> };
    const diff = payload.diffs.find((item) => item.id === target.id);
    expect(diff).toBeDefined();
    expect(Math.abs(diff!.diffPercent)).toBeGreaterThan(5);
  }, 60_000);
});

describe('publish 的机器输出与步骤链', () => {
  it('--json 只输出合法 JSON，并按 verify→typecheck→test→build→deploy 排序', () => {
    const bin = mkdtempSync(join(tmpdir(), 'token-price-publish-bin-'));
    const windows = process.platform === 'win32';
    const npmStub = join(bin, windows ? 'npm.cmd' : 'npm');
    const bashStub = join(bin, windows ? 'bash.cmd' : 'bash');
    const stub = windows ? '@exit /b 0\r\n' : '#!/bin/sh\nexit 0\n';
    writeFileSync(npmStub, stub, 'utf8');
    writeFileSync(bashStub, stub, 'utf8');
    if (!windows) {
      chmodSync(npmStub, 0o755);
      chmodSync(bashStub, 0o755);
    }

    const stdout = execFileSync(process.execPath, [CLI, 'publish', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        BASH: windows ? 'bash.cmd' : bashStub,
        PATH: `${bin}${windows ? ';' : ':'}${process.env.PATH ?? ''}`,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const payload = JSON.parse(stdout) as { ok: boolean; steps: Array<{ name: string; code: number }> };
    expect(payload.ok).toBe(true);
    expect(payload.steps.map((step) => step.name)).toEqual(['verify', '类型检查', '单元测试', '静态构建', '发布站点']);
    expect(payload.steps.every((step) => step.code === 0)).toBe(true);
  }, 60_000);
});
