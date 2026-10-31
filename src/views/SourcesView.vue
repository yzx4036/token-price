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
} from '../lib/data';
import { RATE_DISCLAIMER } from '../lib/fx';
import { computeProviderCoverage, computeStats } from '../lib/stats';

const stats = computeStats(apiPrices);
const coverage = computeProviderCoverage(apiPrices, providers);
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
      <p class="meta">
        以上数字由 <code>src/lib/stats.ts</code> 从数据文件实时计算，与 <code>node scripts/data/cli.mjs verify</code> 打印的统计同一份来源，不会两处各写一份。
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
          <dl class="coverage-numbers">
            <div><dt>条目</dt><dd>{{ item.entries }}</dd></div>
            <div><dt>官方核验</dt><dd>{{ item.official }}</dd></div>
            <div><dt>聚合数据</dt><dd>{{ item.aggregate }}</dd></div>
            <div><dt>官方占比</dt><dd>{{ item.officialShare }}%</dd></div>
          </dl>
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
          主源 <a :href="fxRate.sourceUrl" rel="noreferrer" target="_blank">{{ fxRate.source }}</a>，失败时自动回落 frankfurter.app。汇率写入 <code>src/data/generated/fx.generated.json</code>，页面只读文件，代码里没有任何硬编码汇率常量。
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
      <h2>怎么核对官方价格</h2>
      <p>
        很多厂商的定价页是 JavaScript 渲染的，直接抓 HTML 拿不到价格表。但这批文档站同时提供 <strong>Markdown 原文</strong>：在页面 URL 后面加 <code>.md</code>，或先读站点的 <code>llms.txt</code> 索引，通常能直接拿到带价格的表格。本期以下厂商就是用这个方法核到官方的：
      </p>
      <ul class="source-list">
        <li v-for="source in markdownSources" :key="source.name">
          <strong>{{ source.name }}</strong>
          <code>{{ source.source }}</code>
          <span class="meta">{{ source.currency }}</span>
        </li>
      </ul>
      <p>
        取到官方数字后，用 <code>cli.mjs add</code> 写入并标 <code>official</code>；核对不了的厂商保持 <code>aggregate</code>，页面会显式标注「未逐条核官方」。注意：官方页上由平台转售的第三方模型（例如 Mistral 页上的 Z.ai / DeepSeek）不属于该厂商自有模型，不能记到该厂商名下。
      </p>
    </section>

    <section class="section prose">
      <h2>如何更新数据</h2>
      <p>所有数据维护都在一个命令入口里完成，不需要懂 Vite 或 TypeScript。命令细节见 <code>node scripts/data/cli.mjs --help</code>。</p>
      <pre><code>node scripts/data/cli.mjs rate      # 更新汇率（USD→CNY）
node scripts/data/cli.mjs pull      # 更新聚合补位数据
node scripts/data/cli.mjs add --provider deepseek --model deepseek-flash \
  --input 1 --output 4 --source-url https://api-docs.deepseek.com/zh-cn/quick_start/pricing \
  --verified-at 2026-10-31
node scripts/data/cli.mjs verify    # 交付前必跑：schema + 溯源完整性
node scripts/data/cli.mjs drift     # 本地官方值 vs 聚合值差异表（只报告）
node scripts/data/cli.mjs publish   # verify → typecheck → test → build → 部署</code></pre>
      <p>
        也可以使用 <code>npm run data:rate</code>、<code>npm run data:pull</code>、<code>npm run data:verify</code>、<code>npm run data:drift</code>、<code>npm run data:add</code>、<code>npm run publish</code>。
      </p>
      <p>所有写文件的命令都先校验再落盘（临时文件 + 原子 rename）：非法输入被拒绝时，原文件一个字节都不会变。</p>
    </section>
  </div>
</template>
