import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatDiscoverReport, runDiscoverCommand, type DiscoverResult, type DiscoverUnknown } from '../scripts/data/lib/discover.mjs';

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

describe('discover：显式归一且保留解释', () => {
  function withAliases() {
    const snapshot = JSON.parse(readFileSync(snap, 'utf8'));
    for (const key of ['zai', 'minimax', 'moonshotai', 'stepfun-ai', 'alibaba', 'tencent-token-plan', 'google-vertex', 'google-vertex-anthropic', 'ZAI']) {
      snapshot[key] = { name: key, models: { chat: model('chat', 'Chat', 1, 2) } };
    }
    writeFileSync(snap, JSON.stringify(snapshot), 'utf8');
    return snapshot;
  }

  it('已知三项 alias 显式归一到国内主 key', async () => {
    withAliases();
    const r = await runDiscoverCommand({ snapshotFile: snap });
    expect(r.normalizations).toEqual(expect.arrayContaining([
      { alias: 'zai', canonical: 'zhipuai' },
      { alias: 'minimax', canonical: 'minimax-cn' },
      { alias: 'moonshotai', canonical: 'moonshotai-cn' },
    ]));
    for (const alias of ['zai', 'minimax', 'moonshotai']) expect(r.unknown.map((x) => x.key)).not.toContain(alias);
  });

  it('stepfun-ai 与 alibaba 命中而渠道候选保留', async () => {
    withAliases();
    const r = await runDiscoverCommand({ snapshotFile: snap });
    expect(r.normalizations).toEqual(expect.arrayContaining([
      { alias: 'stepfun-ai', canonical: 'stepfun' }, { alias: 'alibaba', canonical: 'alibaba-cn' },
    ]));
    expect(r.unknown.map((x) => x.key)).toEqual(expect.arrayContaining(['tencent-token-plan', 'google-vertex', 'google-vertex-anthropic', 'ZAI']));
  });

  it('归一前后差等于被移除 alias 集合大小，且集合全等', async () => {
    const snapshot = withAliases();
    const r = await runDiscoverCommand({ snapshotFile: snap });
    const before = Object.keys(snapshot).filter((x) => !['openai', 'freemium'].includes(x));
    const after = new Set(r.unknownAfterNormalization.map((x) => x.key));
    const removed = before.filter((x) => !after.has(x)).sort();
    expect(r.unknownBefore).toBe(before.length);
    expect(r.unknownAfter).toBe(after.size);
    expect(r.unknownBefore - r.unknownAfter).toBe(r.normalizationHits);
    expect(removed).toEqual(['alibaba', 'minimax', 'moonshotai', 'stepfun-ai', 'zai']);
    expect(removed).toEqual(r.normalizations.map((x) => x.alias).sort());
    expect(new Set(r.normalizations.map((x) => x.alias)).size).toBe(r.normalizationHits);
  });

  it('文本与 JSON 报告解释全部归一命中，top 只截文本展示', async () => {
    withAliases();
    const r = await runDiscoverCommand({ snapshotFile: snap, topN: 1 });
    const text = formatDiscoverReport(r);
    for (const { alias, canonical } of r.normalizations) expect(text).toContain(`${alias} → ${canonical}`);
    expect(text).toContain('归一前 11 / 归一后 6 / 差 5 / 命中数 5');
    expect(text.indexOf('归一对照')).toBeLessThan(text.indexOf('归一后仍未收录'));
    expect(r.unknownAfterNormalization).toHaveLength(6);
    expect(r.unknown).toHaveLength(6);
    expect(text).toContain('其余 5 个省略');
    const payload = JSON.parse(execFileSync(process.execPath, [CLI, 'discover', '--json', '--cache-file', snap, '--top', '1'], { encoding: 'utf8' })) as DiscoverResult;
    expect(payload.normalizations).toEqual(r.normalizations);
    expect(payload.unknownAfterNormalization).toHaveLength(6);
  });

  it('归一不改变主 key 的 squeezed 计算且快照字节不变', async () => {
    const before = await runDiscoverCommand({ snapshotFile: snap });
    withAliases();
    const bytes = readFileSync(snap);
    const after = await runDiscoverCommand({ snapshotFile: snap });
    expect(after.squeezed).toEqual(before.squeezed);
    expect(readFileSync(snap)).toEqual(bytes);
  });
});
