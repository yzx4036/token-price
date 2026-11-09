import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { formatPlansStructureDriftReport, quantityEvidence, runPlansStructureDriftCommand } from '../scripts/data/lib/plans-structure-drift.mjs';

const fixture = (name: string) => `tests/fixtures/plans-structure/${name}`;
const plans = () => JSON.parse(readFileSync(fixture('plans.json'), 'utf8'));
const html = (name: string) => readFileSync(fixture(name), 'utf8');
const page = (name: string) => async () => ({ text: html(name) });
const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');

describe('套餐结构与额度只读漂移', () => {
  it('不变时四类漂移皆空，覆盖率可判 3/3，免费档不误报下架', async () => {
    const result = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: page('unchanged.html') });
    expect(result).toEqual({ ok: true, readOnly: true, coverage: { total: 3, checked: 3, unknown: 0 }, missingTiers: [], mergedTiers: [], removedTiers: [], allowanceChanges: [], unknown: [] });
    expect(formatPlansStructureDriftReport(result)).toContain('可判 3/3');
  });

  it('页面新价格归漏档；整数/两位小数等价，页面多余普通数字不是价格', async () => {
    const result = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: page('missing-tier.html') });
    expect(result.missingTiers).toEqual([expect.objectContaining({ pagePrices: [100], recordedPrices: [0, 20, 50] })]);
    expect(result.removedTiers).toEqual([]); expect(result.mergedTiers).toEqual([]);
    const clean = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: async () => ({ text: html('unchanged.html') + '<p>999 requests</p>' }) });
    expect(clean.missingTiers).toEqual([]);
  });

  it('多个已录付费价格仅剩一个归疑似合并，不能拿免费档充当命中', async () => {
    const result = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: page('merged-tier.html') });
    expect(result.mergedTiers).toEqual([expect.objectContaining({ ids: ['openai-plus', 'openai-pro'], recordedPrices: [20, 50], pagePrices: [20] })]);
    expect(result.removedTiers).toEqual([]);
    const noPaid = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: async () => ({ text: '<p>$0/month</p>' }) });
    expect(noPaid.mergedTiers).toEqual([]); expect(noPaid.removedTiers).toHaveLength(2);
  });

  it('已录非零价格消失归下架；没有命中价时不能冒充合并', async () => {
    const result = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: page('removed-tier.html') });
    expect(result.removedTiers.map((row) => row.id)).toEqual(['openai-plus', 'openai-pro']);
    expect(result.missingTiers[0].pagePrices).toEqual([10]); expect(result.mergedTiers).toEqual([]);
  });

  it('只剩一个已录价格可命中时，合并与新增价格提示独立报告', async () => {
    const result = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: async () => ({ text: '$20 $100' }) });
    expect(result.mergedTiers).toHaveLength(1);
    expect(result.missingTiers[0].pagePrices).toEqual([100]);
  });

  it('额度数字减少、OpenAI 可用表 Yes→No、mixed 的 Unlimited 消失，均为额度变化', async () => {
    const result = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: page('allowance-changed.html') });
    expect(result.unknown).toEqual([]); expect(result.allowanceChanges).toHaveLength(3);
    expect(result.allowanceChanges[0].changes).toEqual([
      { field: 'allowance', missingEvidence: ['10000:credits'] },
      { field: 'availableModels', missingEvidence: ['gpt-6 luna'] },
      { field: 'allowanceNature', recorded: 'mixed', missingEvidence: ['unlimited'] },
    ]);
    expect(result.removedTiers).toEqual([]);
  });

  it('B3 多列可用表按本套餐列判断，Pro 的 Yes 不能掩盖 Plus/Free 的 No', async () => {
    const text = '<p>$20 $50 Unlimited 10,000 credits</p><table>'
      + '<tr><th>Model</th><th>Plus</th><th>Pro</th><th>Free</th></tr>'
      + '<tr><td>GPT-6 Luna</td><td>No</td><td>Yes</td><td>No</td></tr></table>';
    const result = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: async () => ({ text }) });
    expect(result.coverage).toEqual({ total: 3, checked: 3, unknown: 0 });
    expect(result.allowanceChanges.map((row) => row.id)).toEqual(['openai-plus', 'openai-free']);
    for (const row of result.allowanceChanges) expect(row.changes).toEqual([
      { field: 'availableModels', missingEvidence: ['gpt-6 luna'] },
    ]);
  });

  it.each(['无表头', '无本套餐列', '重复本套餐列', '跨列', '缺单元格'])('B3 可用表多列无法可靠定位：%s，必须 unknown', async (kind) => {
    const headers = kind === '无表头' ? '' : `<tr><th>Model</th><th>${kind === '无本套餐列' ? 'Team' : 'Plus'}</th><th>${kind === '重复本套餐列' ? 'Plus' : 'Pro'}</th><th>Free</th></tr>`;
    const text = '<p>$20 $50 Unlimited 10,000 credits</p><table>' + headers
      + `<tr><td>GPT-6 Luna</td><td${kind === '跨列' ? ' colspan="2"' : ''}>No</td>${kind === '缺单元格' ? '' : '<td>Yes</td><td>No</td>'}</tr></table>`;
    const result = await runPlansStructureDriftCommand({ plans: [plans()[0]], fetchPage: async () => ({ text }) });
    expect(result.coverage).toEqual({ total: 1, checked: 0, unknown: 1 });
    expect(result.unknown[0].reason).toContain('可用表多列无法定位本套餐列');
    expect(result.allowanceChanges).toEqual([]);
  });

  it('B4 价格 SSR、额度 CSR 归 unknown，不能把未渲染证据报成额度变化', async () => {
    const text = '<p>$20/month</p><div id="root"></div><script src="/pricing.js"></script>';
    const result = await runPlansStructureDriftCommand({ plans: [plans()[0]], fetchPage: async () => ({ text }) });
    expect(result.coverage).toEqual({ total: 1, checked: 0, unknown: 1 });
    expect(result.unknown[0].reason).toContain('价格可解析但额度语义未渲染');
    expect(result.allowanceChanges).toEqual([]);
  });

  it('B4 已渲染真实额度 10000→20000 必须报变化，不能永远 unknown', async () => {
    const text = '<p>$20/month Unlimited 20,000 credits GPT-6 Luna</p>';
    const result = await runPlansStructureDriftCommand({ plans: [plans()[0]], fetchPage: async () => ({ text }) });
    expect(result.coverage).toEqual({ total: 1, checked: 1, unknown: 0 });
    expect(result.unknown).toEqual([]);
    expect(result.allowanceChanges[0].changes).toEqual([{ field: 'allowance', missingEvidence: ['10000:credits'] }]);
  });

  it('模型名消失或近名不能充当可用证据；模型版本号/月费不冒充额度；quota 证据消失', async () => {
    const result = await runPlansStructureDriftCommand({ plans: plans(), fetchPage: async () => ({ text: '<p>$20 $50 GPT-6 Lunatic Unlimited 10000</p>' }) });
    const changes = result.allowanceChanges[0].changes;
    expect(changes).toContainEqual({ field: 'availableModels', missingEvidence: ['gpt-6 luna'] });
    expect(changes).toContainEqual({ field: 'allowance', missingEvidence: ['10000:credits'] });
    expect(changes).toContainEqual({ field: 'allowanceNature', recorded: 'mixed', missingEvidence: ['quota'] });
    expect(result.allowanceChanges[2].changes).toContainEqual({ field: 'allowanceNature', recorded: 'quota', missingEvidence: ['quota'] });
    expect([...quantityEvidence('GPT-6 Luna $10,000 5 小时 1,000 requests')]).toEqual(['5:小时', '1000:requests']);
  });

  it.each(['csr', 'throw', 'error', 'bad-body', 'no-url'])('无法抓取/无价格 token %s 归 unknown，不混为干净或漂移', async (kind) => {
    const list = plans(); if (kind === 'no-url') list.forEach((plan: any) => { plan.sourceUrl = ''; });
    const fetchPage = vi.fn(async () => {
      if (kind === 'throw') throw new Error('timeout');
      if (kind === 'error') return { error: 'HTTP 403' };
      if (kind === 'bad-body') return {};
      return { text: html('csr.html') };
    });
    const result = await runPlansStructureDriftCommand({ plans: list, fetchPage });
    expect(result.coverage).toEqual({ total: 3, checked: 0, unknown: 3 });
    expect(result.unknown).toHaveLength(3); expect(result.allowanceChanges).toEqual([]);
    expect(result.missingTiers).toEqual([]); expect(result.removedTiers).toEqual([]);
    expect(fetchPage).toHaveBeenCalledTimes(kind === 'no-url' ? 0 : 1);
  });

  it('共享 URL 跨 provider 只请求一次，比较仍按 provider/page；覆盖率 N+M=总数', async () => {
    const list = plans();
    list[1].providerId = 'other'; list[1].provider = 'Other'; list[2].sourceUrl = 'https://example.com/csr';
    const fetchPage = vi.fn(async (url: string) => ({ text: html(url.endsWith('/csr') ? 'csr.html' : 'missing-tier.html') }));
    const result = await runPlansStructureDriftCommand({ plans: list, fetchPage });
    expect(fetchPage).toHaveBeenCalledTimes(2);
    expect(result.coverage).toEqual({ total: 3, checked: 2, unknown: 1 });
    expect(result.missingTiers).toHaveLength(2);
    expect(result.missingTiers.find((row) => row.providerId === 'other')?.pagePrices).toEqual([20, 100]);
  });

  it('数据与页面 fixture 哈希不变，输入对象不变；坏结构在任何 HTTP 前失败', async () => {
    const files = ['plans.json', 'missing-tier.html', 'allowance-changed.html'].map(fixture);
    const before = files.map(hash); const list = plans(); const serialized = JSON.stringify(list);
    await runPlansStructureDriftCommand({ plans: list, fetchPage: page('missing-tier.html') });
    expect(files.map(hash)).toEqual(before); expect(JSON.stringify(list)).toBe(serialized);
    for (const bad of [{}, [list[0], list[0]], ...[
      { id: '' }, { provider: '' }, { plan: '' }, { monthlyPrice: -1 }, { monthlyPrice: '20' },
      { monthlyPrice: NaN }, { billingCurrency: 'EUR' }, { sourceUrl: 123 }, { allowance: [] },
      { availableModels: 'GPT' }, { availableModels: [''] }, { allowanceNature: 'unknown' },
    ].map((invalid) => [{ ...list[0], ...invalid }])]) {
      const fetchPage = vi.fn(page('unchanged.html'));
      await expect(runPlansStructureDriftCommand({ plans: bad, fetchPage })).rejects.toMatchObject({ code: 'PLANS_SHAPE' });
      expect(fetchPage).not.toHaveBeenCalled();
    }
  });

  it('真实网络路径复用固定 UA/超时 HTTP 包装，403 归 unknown', async () => {
    const fetchMock = vi.fn(async () => new Response('blocked', { status: 403 })); vi.stubGlobal('fetch', fetchMock);
    try {
      const result = await runPlansStructureDriftCommand({ plans: plans() });
      expect(result.coverage.unknown).toBe(3); expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/pricing', expect.objectContaining({ headers: expect.objectContaining({ 'user-agent': 'token-price-data-cli/0.2 (+https://github.com/yzx4036/token-price)' }), signal: expect.any(AbortSignal) }));
    } finally { vi.unstubAllGlobals(); }
  });

  it('历史合并与漏档反例：三档→一档可报合并，一条记录对应新增三档可报漏档', async () => {
    const list = plans().map((plan: any, index: number) => ({ ...plan, monthlyPrice: [20, 50, 100][index] }));
    const merged = await runPlansStructureDriftCommand({ plans: list, fetchPage: async () => ({ text: '$20/month' }) });
    expect(merged.mergedTiers[0].recordedPrices).toEqual([20, 50, 100]);
    const missing = await runPlansStructureDriftCommand({ plans: [{ ...list[0], monthlyPrice: 0 }], fetchPage: async () => ({ text: '¥40 ¥100 ¥200' }) });
    expect(missing.missingTiers[0].pagePrices).toEqual([40, 100, 200]);
  });

  it('CLI JSON 漂移仍退出 0；结构错误非 0；stdout 不改真源', () => {
    const dir = mkdtempSync(join(tmpdir(), 'token-price-structure-cli-'));
    try {
      const preload = join(dir, 'fetch.mjs');
      writeFileSync(preload, `globalThis.fetch = async () => new Response(${JSON.stringify(html('missing-tier.html'))});`);
      const args = ['--import', pathToFileURL(preload).href, 'scripts/data/cli.mjs', 'plans-structure-drift', '--json', '--plans-file', fixture('plans.json')];
      const before = hash(fixture('plans.json'));
      const result = spawnSync(process.execPath, args, { encoding: 'utf8' });
      expect(result.status).toBe(0); expect(JSON.parse(result.stdout).missingTiers).toHaveLength(1);
      expect(hash(fixture('plans.json'))).toBe(before);
      const badFile = join(dir, 'bad.json'); writeFileSync(badFile, '{}');
      const bad = spawnSync(process.execPath, [...args, '--plans-file', badFile], { encoding: 'utf8' });
      expect(bad.status).not.toBe(0); expect(JSON.parse(bad.stdout).code).toBe('PLANS_SHAPE');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('workflow 仅 pull 周期执行新报告，写 Actions 摘要，原 plans-drift 保留', () => {
    const text = readFileSync('.github/workflows/data-refresh.yml', 'utf8');
    const block = text.slice(text.indexOf('      - name: 套餐结构与额度漂移'), text.indexOf('      - name: 提交并推送'));
    expect(block).toContain("if: steps.plan.outputs.pull == 'true'");
    expect(block).toContain('node scripts/data/cli.mjs plans-structure-drift || echo');
    expect(block).toContain('>> "$GITHUB_STEP_SUMMARY"');
    expect(text).toContain('node scripts/data/cli.mjs plans-drift || echo');
  });
});
