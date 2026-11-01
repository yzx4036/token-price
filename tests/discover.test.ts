import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDiscoverCommand, type DiscoverResult, type DiscoverUnknown } from '../scripts/data/lib/discover.mjs';

/**
 * discover 是「只发现不落库」的命令，所以测试的重点不是它扫得全，
 * 而是它守得住两条纪律：不写文件、不偷偷联网。
 */

const CLI = 'scripts/data/cli.mjs';
let dir: string;
let snap: string;

function model(id: string, name: string, input: number, output: number, release = '2026-01-01') {
  return { id, name, cost: { input, output }, release_date: release };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tp-discover-'));
  snap = join(dir, 'models-dev.json');
  writeFileSync(
    snap,
    JSON.stringify({
      // 已覆盖的厂商（providers.json 里有 aggregateProvider 映射）
      openai: {
        models: {
          'gpt-5': model('gpt-5', 'GPT-5', 1, 4, '2026-05-01'),
          'gpt-4.1': model('gpt-4.1', 'GPT-4.1', 2, 8, '2025-04-01'),
          'text-embedding-3': { id: 'text-embedding-3', name: 'embed', cost: { input: 0.02, output: 0 } },
        },
      },
      // 未收录的真实厂商：只挂自己一系的模型
      'newvendor': {
        name: 'New Vendor',
        models: { 'nv-1': model('nv-1', 'NV-1', 3, 12, '2026-03-01') },
      },
      // 未收录的渠道：同时挂多家厂商的模型
      'some-gateway': {
        name: 'Some Gateway',
        models: {
          a: model('gpt-5', 'GPT-5', 1, 4),
          b: model('claude-opus-4', 'Claude Opus 4', 15, 75),
          c: model('gemini-3-pro', 'Gemini 3 Pro', 2, 10),
        },
      },
      // 全是免费/无价格：不该出现在候选里
      'freemium': {
        name: 'Free',
        models: { f: { id: 'free-chat', name: 'Free', cost: { input: 0, output: 0 } } },
      },
    }),
    'utf8',
  );
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('discover：发现候选', () => {
  it('未收录厂商被列出，已覆盖的不重复出现', async () => {
    const r = await runDiscoverCommand({ snapshotFile: snap });
    const keys = r.unknown.map((u) => u.key);
    expect(keys).toContain('newvendor');
    expect(keys).toContain('some-gateway');
    expect(keys).not.toContain('openai');
  });

  it('横跨多厂商系的渠道被判为 reseller，真厂商排在前面', async () => {
    const r = await runDiscoverCommand({ snapshotFile: snap });
    const byKey = Object.fromEntries(r.unknown.map((u) => [u.key, u])) as Record<string, DiscoverUnknown>;
    expect(byKey['newvendor'].reseller).toBe(false);
    expect(byKey['some-gateway'].reseller).toBe(true);
    expect(r.unknown[0].key).toBe('newvendor');
  });

  it('全 0 价格的厂商不进候选（对横向比较无意义）', async () => {
    const r = await runDiscoverCommand({ snapshotFile: snap });
    expect(r.unknown.map((u) => u.key)).not.toContain('freemium');
  });

  it('被上限挤掉的模型能算出来', async () => {
    const r = await runDiscoverCommand({ snapshotFile: snap });
    const openai = r.squeezed.find((s) => s.providerId === 'openai');
    // fixture 里 openai 只有 2 条可计价对话模型，上限 12，不该有挤掉
    expect(openai).toBeUndefined();
  });
});

describe('discover：不可越界', () => {
  it('只读，不写任何数据文件', async () => {
    const before = readdirSync(join(process.cwd(), 'src/data/generated'));
    await runDiscoverCommand({ snapshotFile: snap });
    const after = readdirSync(join(process.cwd(), 'src/data/generated'));
    expect(after).toEqual(before);
  });

  it('快照缺失时报错，不得偷偷联网抓取', async () => {
    await expect(
      runDiscoverCommand({ snapshotFile: join(dir, 'nope.json') }),
    ).rejects.toThrow(/SNAPSHOT_MISSING|聚合快照不存在/);
  });

  it('--json 输出可被解析，且带 readOnly 标记', () => {
    const out = execFileSync(
      process.execPath,
      [CLI, 'discover', '--json', '--cache-file', snap],
      { cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const payload = JSON.parse(out) as DiscoverResult;
    expect(payload.ok).toBe(true);
    expect(payload.readOnly).toBe(true);
    expect(Array.isArray(payload.unknown)).toBe(true);
  });

  it('--top 非正整数被拒绝', () => {
    let code = 0;
    try {
      execFileSync(process.execPath, [CLI, 'discover', '--json', '--cache-file', snap, '--top', '0'], {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      code = (error as { status?: number }).status ?? 1;
    }
    expect(code).not.toBe(0);
  });
});

describe('discover：接入点', () => {
  it('CLI 帮助里能看到 discover 且标注只读', () => {
    const src = readFileSync('scripts/data/cli.mjs', 'utf8');
    expect(src).toContain("case 'discover'");
    expect(src).toContain('只报告不写数据');
  });
});
