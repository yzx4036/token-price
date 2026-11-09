import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * `scripts/qa/copy-guard.mjs` 的「能红」证明。
 *
 * 为什么必须造反例：文案类守卫最容易写成恒绿——正则写宽了、路径写错了、
 * 判据算在源码上而不是渲染结果上，都表现为「一直通过」。所以这里用两个
 * 静态夹具跑同一份脚本：good 必须 exit 0，bad 必须 exit 1 且 stderr 逐条
 * 指名违规项（声明重复 / 估算日期 / 表级声明 / 免责要素）。
 *
 * 另有一组「要素级变异」用例：把 good 夹具里第 3 要素的关键词删掉，
 * 守卫必须红。这条专门盯 v0.10.0 首轮的结构性缺陷——当时守卫拿
 * SITE_DISCLAIMER 自己当 needle，要素真被删了还是 exit 0。
 */
const script = join(process.cwd(), 'scripts', 'qa', 'copy-guard.mjs');
const fixture = (name: string): string => join(process.cwd(), 'tests', 'fixtures', 'copy-guard', name);

function runGuard(name: string) {
  return spawnSync(process.execPath, [script, '--dist', fixture(name), '--partial'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
}

function runGuardAt(dir: string) {
  return spawnSync(process.execPath, [script, '--dist', dir, '--partial'], {
    encoding: 'utf8',
    cwd: process.cwd(),
  });
}

describe('文案守卫脚本：判据能红也能绿', () => {
  it('good 夹具：声明各 1 次、估算日期 0、表级声明就位、免责要素齐全 → exit 0', () => {
    const result = runGuard('good');
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('结论：通过');
    expect(result.stdout).toContain('免责要素 5/5');
  });

  it('bad 夹具：exit 1，且 stderr 指名违规项', () => {
    const result = runGuard('bad');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('免责要素缺失');
    expect(result.stderr).toContain('声明重复：cny-estimate');
    expect(result.stderr).toContain('估算日期重复');
    expect(result.stderr).toContain('表级汇率声明出现 2 次');
  });

  it('四类判据各自都有反例（少一类就等于少一道门）', () => {
    const stderr = runGuard('bad').stderr;
    for (const need of ['声明重复', '估算日期重复', '表级汇率声明', '免责要素缺失']) {
      expect(stderr, `bad 夹具没有触发「${need}」`).toContain(need);
    }
  });

  it('删掉第 3 要素「官方页面 / 账单」后守卫必须红（防「拿常量自证」）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'copy-guard-mutation-'));
    cpSync(fixture('good'), dir, { recursive: true });
    const target = join(dir, 'index.html');
    const html = readFileSync(target, 'utf8');
    // 只改渲染产物，不改任何源码常量：模拟「要素从产库里真的消失了」
    const mutated = html.split('价格与账单以厂商官方页面和最终账单为准').join('价格以厂商页面为准');
    expect(mutated).not.toBe(html);
    writeFileSync(target, mutated, 'utf8');
    const result = runGuardAt(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('vendor-authoritative');
    expect(result.stderr).toContain('官方页面');
    // 页脚也要红：good/index.html 的页脚与正文各有一句，两处都被替换掉了
    expect(result.stderr).toContain('页脚免责要素缺失');
  });

  it('删掉「不构成…建议」后守卫必须红', () => {
    const dir = mkdtempSync(join(tmpdir(), 'copy-guard-mutation-'));
    cpSync(fixture('good'), dir, { recursive: true });
    const target = join(dir, 'methodology', 'index.html');
    const html = readFileSync(target, 'utf8');
    writeFileSync(target, html.split('，不构成采购、财务或法律建议').join(''), 'utf8');
    const result = runGuardAt(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not-advice');
  });

  it('产物目录不存在时返回 2（无法判定，不与「通过」混淆）', () => {
    const result = spawnSync(process.execPath, [script, '--dist', join(process.cwd(), 'tests', 'fixtures', 'copy-guard', 'missing')], {
      encoding: 'utf8',
      cwd: process.cwd(),
    });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('无法判定');
  });
});
