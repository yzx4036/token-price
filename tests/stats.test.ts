import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiPrices, providers } from '../src/lib/data';
import { computeProviderCoverage, computeStats } from '../src/lib/stats';

const stats = computeStats(apiPrices);

describe('统计纯函数', () => {
  it('统计口径自洽：official + aggregate = 总数', () => {
    expect(stats.official + stats.aggregate).toBe(stats.entries);
    expect(stats.verified + stats.pending).toBe(stats.entries);
    expect(stats.cnyBilling + stats.usdBilling).toBe(stats.entries);
    expect(stats.cnyReported + stats.usdReported).toBe(stats.entries);
    expect(stats.entries).toBe(apiPrices.length);
    expect(stats.providers).toBeGreaterThanOrEqual(15);
    expect(stats.entries).toBeGreaterThanOrEqual(100);
  });

  it('账单币种与报价币种分开统计：国内厂商聚合条目账单 CNY、报价 USD', () => {
    expect(stats.usdReported).toBe(apiPrices.filter((entry) => entry.reportedCurrency === 'USD').length);
    expect(stats.cnyReported).toBe(apiPrices.filter((entry) => entry.reportedCurrency === 'CNY').length);
    expect(stats.reportedUsdShare).toBe(Math.round((stats.usdReported / stats.entries) * 1000) / 10);
    // 聚合源以 USD 发布，所以「账单 CNY」条数必然多于「报价 CNY」条数
    expect(stats.cnyBilling).toBeGreaterThan(stats.cnyReported);
    expect(stats.usdReported).toBeGreaterThan(stats.usdBilling);
    // 国内厂商的聚合条目：账单币种 CNY，报价 USD
    const cnAggregate = apiPrices.filter((entry) => entry.provenance === 'aggregate'
      && providers.find((provider) => provider.id === entry.providerId)?.region === 'cn');
    expect(cnAggregate.length).toBeGreaterThan(0);
    expect(cnAggregate.every((entry) => entry.billingCurrency === 'CNY' && entry.reportedCurrency === 'USD')).toBe(true);
  });

  it('sources 页的换算占比取自 stats.reportedUsdShare，不再用 billingCurrency 算', () => {
    // v0.3.0：页面从 Astro 迁到 Vue，断言与判据不变，只把扫描目标换成新的视图文件
    const page = readFileSync(join(process.cwd(), 'src', 'views', 'SourcesView.vue'), 'utf8');
    expect(page).toContain('stats.reportedUsdShare');
    expect(page).not.toMatch(/usdBilling\s*\/\s*stats\.entries/);
  });

  it('每厂商覆盖率之和等于总条目数', () => {
    const coverage = computeProviderCoverage(apiPrices, providers);
    expect(coverage.length).toBe(providers.length);
    expect(coverage.reduce((sum, item) => sum + item.entries, 0)).toBe(stats.entries);
    expect(coverage.reduce((sum, item) => sum + item.official, 0)).toBe(stats.official);
    expect(coverage.reduce((sum, item) => sum + item.aggregate, 0)).toBe(stats.aggregate);
    expect(coverage.every((item) => item.officialShare >= 0 && item.officialShare <= 100)).toBe(true);
  });

  it('CLI verify 与页面统计同源（同一份 stats 模块）', () => {
    const raw = execFileSync(process.execPath, ['scripts/data/cli.mjs', 'verify', '--json'], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, NO_COLOR: '1' },
    });
    const result = JSON.parse(raw) as { ok: boolean; stats: typeof stats };
    expect(result.ok).toBe(true);
    expect(result.stats).toEqual(stats);
  }, 60_000);
});
