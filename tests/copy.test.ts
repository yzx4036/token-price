import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AGGREGATE_NOTE, OFFICIAL_PRICE_LABEL, PROVENANCE_OFFICIAL } from '../src/lib/copy';

/**
 * 用语守卫：拦住把「官方核验 / 官方原价」这类越权措辞写回源码的情况。
 *
 * 为什么需要守卫：这类词会被读成本站已获厂商确认，而数据实际是爬虫从厂商官方定价页
 * 抓取的公开报价（docs/compliance/data-fetching.md）。改词时散在 22 个文件里，
 * 靠人工 review 必然漏；只测常量前缀不够，要**扫全仓源码**。
 *
 * v0.10.0 扩到 15 个词（#12）：旧版只有 3 个，实测「核验日期 / 待核验 / 已核验 /
 * 最新 / 逐项核过」仍在 17 个文件里各写一份，词表不全等于没改干净。
 */
const SRC = fileURLToPath(new URL('../src', import.meta.url));

const BANNED = [
  // 越权（暗示官方背书）
  '官方核验',
  '官方原价',
  '未逐条核官方',
  '官方数据',
  '官方确认',
  '已核官方',
  '官方认证',
  '官方以此为准',
  // 把「抓取」说成「核验」
  '核验于',
  '核验日期',
  '待核验',
  '已核验',
  '逐项核过',
  // 广告法绝对化用语 / 代厂商表态
  '最新',
  '官方指定',
];

/** 溯源与口径术语必须在 copy.ts 里有常量；模板里出现字面量就是漂移风险 */
const TERM_LITERALS = ['官方页抓取', '聚合数据', '官方标价', '未核官方页', '抓取于'];

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
  it('词表覆盖 #12 点名的全部 15 个词（少一个就等于少一道门）', () => {
    for (const word of ['官方核验', '官方原价', '官方数据', '官方确认', '已核官方', '官方认证',
      '官方以此为准', '核验于', '核验日期', '待核验', '已核验', '最新', '逐项核过', '官方指定']) {
      expect(BANNED, `词表缺少「${word}」`).toContain(word);
    }
  });

  it('src 内不出现词表里的越权措辞', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf-8');
      for (const word of BANNED) {
        if (text.includes(word)) hits.push(`${file.replace(SRC, 'src')} -> ${word}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

describe('术语真源：模板只能引用 copy.ts，不能硬写', () => {
  it('src/**/*.vue 里不出现溯源 / 标价 / 抓取日期字面量', () => {
    const hits: string[] = [];
    for (const file of walk(SRC)) {
      if (!file.endsWith('.vue')) continue;
      const text = readFileSync(file, 'utf-8');
      for (const word of TERM_LITERALS) {
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
