import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGGREGATE_NOTE, OFFICIAL_PRICE_LABEL, PROVENANCE_OFFICIAL } from '../src/lib/copy';

/**
 * 用语守卫：拦住把「官方核验 / 官方原价」写回源码的情况。
 *
 * 为什么需要守卫：这两个词会被读成本站已获厂商确认，而数据实际是爬虫从厂商官方定价页
 * 抓取的公开报价（docs/compliance/data-fetching.md）。改词时散在 22 个文件里，
 * 靠人工 review 必然漏；只测常量前缀不够，要**扫全仓源码**。
 */
const SRC = fileURLToPath(new URL('../src', import.meta.url));
const BANNED = ['官方核验', '官方原价', '未逐条核官方'];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    // 数据文件里的文字来自厂商条款转述，不属本站文案，跳过
    if (full.includes(`${'entries'}`) || full.includes('generated')) return [];
    return /\.(vue|ts)$/.test(entry.name) ? [full] : [];
  });
}

describe('对外用语：溯源等级不得回到越权措辞', () => {
  it('src 内不出现「官方核验 / 官方原价 / 未逐条核官方」', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf-8');
      for (const word of BANNED) {
        if (text.includes(word)) hits.push(`${file.replace(SRC, 'src')} -> ${word}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('术语常量与展示文案一致', () => {
    expect(PROVENANCE_OFFICIAL).toBe('官方页抓取');
    expect(OFFICIAL_PRICE_LABEL).toBe('官方标价');
    expect(AGGREGATE_NOTE).toBe('未核官方页');
  });
});
