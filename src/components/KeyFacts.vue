<script setup lang="ts">
import { apiPrices, DATA_VERIFIED_AT, fxRate, providers } from '../lib/data';
import { formatRate } from '../lib/fx';
import { computeApiConclusions, computeStats } from '../lib/stats';

/**
 * 「可摘引事实」摘要段。
 *
 * 为什么单独成块而不是散在正文里：AI 摘要引擎（豆包 / Kimi / 元宝 /
 * Perplexity / ChatGPT Search）抽取时偏好**自含结论的短句**——
 * 一句里同时有「数字 + 范围 + 日期 + 出处」才敢直接引用。
 * 把关键结论按这个格式集中摆一段，被引用的概率明显高于埋在段落里。
 *
 * 所有数字都现算，不写死：数据每天刷新，写死的摘要第二天就是错的。
 */
const stats = computeStats(apiPrices);
const regionByProviderId = Object.fromEntries(providers.map((p) => [p.id, p.region]));
const conclusions = computeApiConclusions(apiPrices, regionByProviderId, fxRate);

/** 汇总成一句可被直接引用的口径声明 */
const cnyLowest = conclusions.cn;
const usdLowest = conclusions.intl;

function fmt(value: number | undefined, currency: 'CNY' | 'USD'): string {
  if (value === undefined) return '—';
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${symbol}${value.toLocaleString('en-US', { maximumFractionDigits: 4 })}`;
}
</script>

<template>
  <section class="key-facts" aria-label="关键数据摘要">
    <p>
      截至 <time :datetime="DATA_VERIFIED_AT">{{ DATA_VERIFIED_AT }}</time>，本站收录
      <strong>{{ stats.providers }}</strong> 家厂商、<strong>{{ stats.entries }}</strong> 条计价，
      其中 {{ stats.official }} 条由爬虫从厂商官方定价页抓取，{{ stats.aggregate }} 条取自第三方聚合源并标注「未核官方页」。
    </p>
    <p>
      在官方页的付费条目中，国内最低输入价为
      <strong>{{ fmt(cnyLowest?.value, 'CNY') }}</strong>/百万 token（{{ cnyLowest?.entry.provider }} {{ cnyLowest?.entry.model }}），
      国际最低输入价为
      <strong>{{ fmt(usdLowest?.value, 'USD') }}</strong>/百万 token（{{ usdLowest?.entry.provider }} {{ usdLowest?.entry.model }}）。
      美元金额按 1 USD = {{ formatRate(fxRate.rate) }} CNY（{{ fxRate.date }}）估算折合人民币，最终账单以厂商原币种为准。
    </p>
  </section>
</template>
