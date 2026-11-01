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
      <p class="lede">这一页回答三个问题：每条价格从哪来、多少条是逐项核过官方页的、汇率和聚合快照是什么时候抓的。</p>
      <p class="meta">
        官方核验日期：{{ DATA_VERIFIED_AT }} · 汇率日期：{{ fxRate.date }} · 聚合快照：{{ AGGREGATE_FETCHED_AT.slice(0, 10) }}
      </p>
    </section>

    <section class="section">
      <h2>一眼看清的数字</h2>
      <div class="stats">
        <div class="stat"><strong>{{ stats.providers }}</strong><span class="meta">厂商</span></div>
        <div class="stat"><strong>{{ stats.entries }}</strong><span class="meta">计价口径</span></div>
        <div class="stat"><strong>{{ stats.official }}</strong><span class="meta">官方核验</span></div>
      </div>
      <div class="stats stats-gap">
        <div class="stat"><strong>{{ stats.aggregate }}</strong><span class="meta">聚合数据（未逐条核官方）</span></div>
        <div class="stat"><strong>{{ stats.models }}</strong><span class="meta">唯一模型口径</span></div>
        <div class="stat"><strong>{{ fxShare }}%</strong><span class="meta">报价以 USD 表达的条目占比（需汇率换算）</span></div>
      </div>
      <p class="meta">
        币种分两套口径：账单币种（厂商实际收什么）CNY {{ stats.cnyBilling }} 条 / USD {{ stats.usdBilling }} 条；报价币种（数字本身以什么币种写）CNY {{ stats.cnyReported }} 条 / USD {{ stats.usdReported }} 条。聚合源对国内厂商也以 USD 发布，所以两者不必相等。
      </p>
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
            <div><dt>官方核验</dt><dd>{{ item.official }}</dd></div>
            <div><dt>聚合数据</dt><dd>{{ item.aggregate }}</dd></div>
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
            <a :href="item.pricingUrl" rel="noreferrer" target="_blank">官方定价页</a>
          </p>
        </li>
      </ul>
      <p class="meta">「官方核验」= 人工打开官方定价页逐项对照；「聚合数据」= 取自第三方聚合源，未逐条核官方。</p>
    </section>

    <div class="section grid">
      <article class="card">
        <h2>汇率来源</h2>
        <p>1 USD = <strong>{{ fxRate.rate }}</strong> CNY，汇率日期 <strong>{{ fxRate.date }}</strong>，抓取时间 <code>{{ fxRate.fetchedAt }}</code>。</p>
        <p>
          主源 <a :href="fxRate.sourceUrl" rel="noreferrer" target="_blank">{{ fxRate.source }}</a>，失败时自动回落 frankfurter.app。汇率由脚本每天自动抓取，页面只读抓下来的结果，不含任何硬编码汇率。
        </p>
        <p class="meta">
          {{RATE_DISCLAIMER}}国际厂商行以美元原价为主列，人民币只出现在「≈」估算副行；国内厂商行给人民币原价。
        </p>
      </article>
      <article class="card">
        <h2>聚合源：{{ AGGREGATE_SOURCE }}</h2>
        <p>
          仅用于补齐官方页抓不到或缺口的厂商（本期为 {{ aggregateProviders.join('、') || '无' }}）。
          <a :href="AGGREGATE_SOURCE_URL" rel="noreferrer" target="_blank">查看原始 JSON</a>。
        </p>
        <p>
          快照：<strong>{{ aggregateFile.providerStats.providers }}</strong> 个 provider / <strong>{{ aggregateFile.providerStats.models }}</strong> 个模型，抓取于 <code>{{ AGGREGATE_FETCHED_AT }}</code>，收录 <strong>{{ stats.aggregate }}</strong> 条到本站。
        </p>
        <p class="meta">
          聚合条目的数字由聚合源以 USD 发布，可能与厂商官网的人民币挂牌价不同；国内厂商的聚合值即由聚合源从人民币挂牌价折算而来，因此账单币种仍是 CNY、报价币种是 USD。它们一律标「聚合数据 · 未逐条核官方」，不标「官方原价」，且永不覆盖同模型的官方核验条目。
        </p>
      </article>
    </div>

    <section class="section prose">
      <h2>价格怎么核出来的</h2>
      <p>
        官方定价页大多是 JavaScript 渲染的，直接抓 HTML 拿不到价格表。好在这批文档站同时提供 Markdown 原文（在页面地址后加 <code>.md</code>，或先读站点的 <code>llms.txt</code> 索引），通常能直接读到带价格的表格。本期以下厂商就是这样核到的：
      </p>
      <ul class="source-list">
        <li v-for="source in markdownSources" :key="source.name">
          <strong>{{ source.name }}</strong>
          <code>{{ source.source }}</code>
          <span class="meta">{{ source.currency }}</span>
        </li>
      </ul>
      <p>
        核到官方数字的条目标「官方核验」；核不到的保持「聚合数据」并显式标注「未逐条核官方」，两者不会混着算。官方页上由平台转售的第三方模型（例如 Mistral 页上的 Z.ai / DeepSeek）不属于该厂商自有模型，不记到该厂商名下。
      </p>
    </section>

    <section class="section prose">
      <h2>数据怎么保持更新</h2>
      <p>
        写了个脚本定时更新：汇率每天自动抓一次，聚合快照每周重抓一次，都由 GitHub Actions 定时触发。抓完先跑一遍数据校验，任何一条不过就放弃这次更新，不会把坏数据写进站点。
      </p>
      <p>
        官方价格不走自动抓取——各家定价页改版频繁，机器判定容易误伤，所以这部分保持人工核对后入库。脚本会定期比对官方值与聚合值的差异，差异大的厂商会被挑出来人工复核。
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
        <strong>{{ AUTHOR.name }}</strong> 维护。本站是个人项目：价格由人工逐条核对官方页后录入，
        没有商业赞助，也不接受厂商付费修改数字。
      </p>
      <WechatQr variant="guide" />
    </section>
  </div>
</template>
