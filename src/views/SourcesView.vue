<script setup lang="ts">
import {
  aggregateFile,
  AGGREGATE_FETCHED_AT,
  AGGREGATE_SOURCE,
  AGGREGATE_SOURCE_URL,
  apiPrices,
  DATA_VERIFIED_AT,
  fxRate,
  providers,
  tokenPlans,
} from '../lib/data';
import { AGGREGATE_NOTE, FETCHED_ON, NON_OFFICIAL_BRIEF, OFFICIAL_PRICE_LABEL, PROVENANCE_AGGREGATE, PROVENANCE_OFFICIAL, SOURCE_PAGE_LABEL } from '../lib/copy';
import { RATE_DISCLAIMER } from '../lib/fx';
import { computeProviderCoverage, computeStats } from '../lib/stats';
import { AUTHOR } from '../lib/site-meta';
import WechatQr from '../components/WechatQr.vue';

const stats = computeStats(apiPrices);
// 套餐档位数一起传：只上架订阅套餐的厂商要能和「完全没录」区分开
const coverage = computeProviderCoverage(apiPrices, providers, tokenPlans);
// 需要汇率换算的条目 == 数字本身以 USD 表达（reportedCurrency），与账单币种无关
const fxShare = stats.reportedUsdShare;
// 仍然依赖聚合补位的厂商（不写死名单，随数据变化）
const aggregateProviders = coverage.filter((item) => item.aggregate > 0).map((item) => item.nameZh);

const regionLabel = { cn: '国内', intl: '国际' } as const;

/** 本期实测可直接取到价格表的官方源（与 README §7.5 同源） */
const markdownSources = [
  { name: '智谱 GLM', source: 'docs.bigmodel.cn/cn/guide/start/pricing.md', currency: 'CNY' },
  { name: 'Anthropic', source: 'platform.claude.com/docs/en/about-claude/pricing', currency: 'USD' },
  { name: 'OpenAI', source: 'platform.openai.com/docs/pricing.md', currency: 'USD' },
  { name: 'xAI', source: 'docs.x.ai/docs/pricing.md', currency: 'USD' },
  { name: 'Mistral', source: 'docs.mistral.ai/inference/pricing/', currency: 'USD' },
  { name: 'DeepSeek', source: 'api-docs.deepseek.com/zh-cn/quick_start/pricing', currency: 'CNY' },
  { name: 'MiniMax', source: 'platform.minimax.cn/docs/pricing/overview', currency: 'CNY' },
  { name: 'Google', source: 'ai.google.dev/gemini-api/docs/pricing', currency: 'USD' },
];
</script>

<template>
  <div class="page">
    <section class="hero">
      <p class="eyebrow">Sources</p>
      <h1>数据来源与溯源覆盖率</h1>
      <p class="lede">每条价格从哪来、多少条抓自官方页。</p>
      <p class="meta">
        抓取日期：{{ DATA_VERIFIED_AT }} · 汇率日期：{{ fxRate.date }} · 聚合快照：{{ AGGREGATE_FETCHED_AT.slice(0, 10) }}
      </p>
      <p class="meta">{{ NON_OFFICIAL_BRIEF }} · <RouterLink to="/methodology/">口径与免责</RouterLink></p>
    </section>

    <section class="section">
      <h2>一眼看清的数字</h2>
      <div class="stats">
        <div class="stat"><strong>{{ stats.providers }}</strong><span class="meta">厂商</span></div>
        <div class="stat"><strong>{{ stats.entries }}</strong><span class="meta">计价口径</span></div>
        <div class="stat"><strong>{{ stats.official }}</strong><span class="meta">{{ PROVENANCE_OFFICIAL }}</span></div>
      </div>
      <div class="stats stats-gap">
        <div class="stat"><strong>{{ stats.aggregate }}</strong><span class="meta">{{ PROVENANCE_AGGREGATE }}（{{ AGGREGATE_NOTE }}）</span></div>
        <div class="stat"><strong>{{ stats.models }}</strong><span class="meta">唯一模型口径</span></div>
        <div class="stat"><strong>{{ fxShare }}%</strong><span class="meta">需汇率换算占比</span></div>
      </div>
      <!-- v0.10.0 返工：两套币种口径是解释性内容，下沉折叠，首屏只留数字 -->
      <details class="fold">
        <summary>账单币种与报价币种</summary>
        <div class="fold-body">
          <p>
            账单币种是厂商实际收取的币种（CNY {{ stats.cnyBilling }} 条 / USD {{ stats.usdBilling }} 条），报价币种是数字本身以什么币种写（CNY {{ stats.cnyReported }} 条 / USD {{ stats.usdReported }} 条）。聚合源对国内厂商也以 USD 发布，所以两者不必相等。
          </p>
        </div>
      </details>
    </section>

    <section class="section">
      <h2>各厂商溯源覆盖率</h2>
      <ul class="coverage-grid">
        <li v-for="item in coverage" :key="item.providerId" class="coverage-card">
          <div class="coverage-head">
            <strong>{{ item.nameZh }}</strong>
            <span class="meta">{{ item.nameEn }} · {{ regionLabel[item.region] }}</span>
          </div>
          <dl v-if="item.entries > 0" class="coverage-numbers">
            <div><dt>条目</dt><dd>{{ item.entries }}</dd></div>
            <div><dt>{{ PROVENANCE_OFFICIAL }}</dt><dd>{{ item.official }}</dd></div>
            <div><dt>{{ PROVENANCE_AGGREGATE }}</dt><dd>{{ item.aggregate }}</dd></div>
            <div><dt>官方占比</dt><dd>{{ item.officialShare }}%</dd></div>
          </dl>
          <!-- 只上架订阅套餐、没有按量 API 价的厂商：写明是哪一类缺失，
               否则「条目 0 · 官方占比 0%」会被读成数据没录 -->
          <p v-else-if="item.planCount > 0" class="coverage-empty">
            无按量 API 价格条目；已收录 <strong>{{ item.planCount }}</strong> 档订阅套餐，见
            <RouterLink to="/plans/">套餐页</RouterLink>。
          </p>
          <p v-else class="coverage-empty">尚未收录任何价格条目。</p>
          <p class="link-row">
            <a :href="item.pricingUrl" rel="noreferrer" target="_blank">{{ SOURCE_PAGE_LABEL }}</a>
          </p>
        </li>
      </ul>
      <p class="meta">「{{ PROVENANCE_OFFICIAL }}」= 维护者按厂商官方定价页逐条录入，每条带来源 URL 与抓取日期；「{{ PROVENANCE_AGGREGATE }}」= 取自第三方聚合源，{{ AGGREGATE_NOTE }}。</p>
    </section>

    <div class="section grid">
      <article class="card">
        <h2>汇率来源</h2>
        <p>1 USD = <strong>{{ fxRate.rate }}</strong> CNY，汇率日期 <strong>{{ fxRate.date }}</strong>，抓取时间 <code>{{ fxRate.fetchedAt }}</code>。</p>
        <p>
          主源 <a :href="fxRate.sourceUrl" rel="noreferrer" target="_blank">{{ fxRate.source }}</a>，失败时自动回落 frankfurter.app。汇率由脚本每天自动抓取，页面只读抓下来的结果，不含任何硬编码汇率。
        </p>
        <p class="meta">
          {{RATE_DISCLAIMER}}国际厂商行以美元标价为主列，人民币只出现在「≈」副行；国内厂商行给人民币标价。
        </p>
      </article>
      <article class="card">
        <h2>聚合源：{{ AGGREGATE_SOURCE }}</h2>
        <p>
          仅用于补齐官方页抓不到或缺口的厂商（本期为 {{ aggregateProviders.join('、') || '无' }}）。
          <a :href="AGGREGATE_SOURCE_URL" rel="noreferrer" target="_blank">查看原始 JSON</a>。
        </p>
        <p>
          快照：<strong>{{ aggregateFile.providerStats.providers }}</strong> 个 provider / <strong>{{ aggregateFile.providerStats.models }}</strong> 个模型，{{ FETCHED_ON }} <code>{{ AGGREGATE_FETCHED_AT }}</code>，收录 <strong>{{ stats.aggregate }}</strong> 条到本站。
        </p>
        <p class="meta">
          聚合条目的数字由聚合源以 USD 发布，可能与厂商官网的人民币挂牌价不同；国内厂商的聚合值即由聚合源从人民币挂牌价折算而来，因此账单币种仍是 CNY、报价币种是 USD。它们一律标「{{ PROVENANCE_AGGREGATE }} · {{ AGGREGATE_NOTE }}」，不标「{{ OFFICIAL_PRICE_LABEL }}」，且永不覆盖同模型的官方页条目。
        </p>
      </article>
    </div>

    <section class="section prose">
      <h2>官方页价格怎么取到的</h2>
      <p>
        官方定价页大多是 JavaScript 渲染的，直接读 HTML 拿不到价格表。好在这批文档站同时提供 Markdown 原文（在页面地址后加 <code>.md</code>，或先读站点的 <code>llms.txt</code> 索引），通常能直接读到带价格的表格。以下厂商按此方式取到：
      </p>
      <ul class="source-list">
        <li v-for="source in markdownSources" :key="source.name">
          <strong>{{ source.name }}</strong>
          <code>{{ source.source }}</code>
          <span class="meta">{{ source.currency }}</span>
        </li>
      </ul>
      <p>
        取到官方页数字的条目标「{{ PROVENANCE_OFFICIAL }}」；取不到的保持「{{ PROVENANCE_AGGREGATE }}」并标注「{{ AGGREGATE_NOTE }}」，两者不混算。官方页上由平台转售的第三方模型（例如 Mistral 页上的 Z.ai / DeepSeek）不属于该厂商自有模型，不记到该厂商名下。
      </p>
    </section>

    <section class="section prose">
      <h2>数据怎么保持更新</h2>
      <p>
        脚本每天自动抓一次汇率、每周重抓一次聚合快照，另外自动重建派生数据、跑数据校验并记录官方价格历史快照，都由 GitHub Actions 定时触发；任何一条校验不过就放弃这次更新，不会把坏数据写进站点。官方页价格不在自动抓取之列——各家定价页改版频繁，机器判定容易误伤，这部分由维护者逐条人工录入，每条都带来源 URL 与抓取日期，入库前同样过数据校验；对这条链路，脚本只做差异比对，把官方值与聚合值偏差大的厂商挑出来复核。
      </p>
    </section>

    <!--
      维护者身份只放这一页，不铺到全站页头页脚：
      读者在「查数据靠不靠谱」的这一刻才关心「谁做的」，
      放在数据来源页是与意图对齐的位置，放首页反而分散工具本身的注意力。
    -->
    <section class="section prose author-block">
      <h2>关于本站</h2>
      <p>
        <strong>{{ AUTHOR.name }}</strong> 维护。本站是个人项目：价格由维护者从厂商官方定价页逐条录入、校验后入库，
        没有商业赞助，也不接受厂商付费修改数字。
      </p>
      <WechatQr variant="guide" />
    </section>
  </div>
</template>
