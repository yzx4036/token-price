<script setup lang="ts">
import { apiPrices, DATA_VERIFIED_AT, fxRate } from '../lib/data';
import { formatRate } from '../lib/fx';
import { filterAndSortApiPrices } from '../lib/pricing';
import { buildPriceRow } from '../lib/price-row';
import { computeStats } from '../lib/stats';
import KeyFacts from '../components/KeyFacts.vue';

const stats = computeStats(apiPrices);
// 首页只展示官方核验条目：排名类结论不允许落在未逐条核验的聚合数据上
const officialEntries = filterAndSortApiPrices(apiPrices, { provenance: 'official', sortBy: 'inputPrice' }, fxRate);
const showcase = officialEntries.slice(0, 8).map((item) => buildPriceRow(item, fxRate));
</script>

<template>
  <div class="page">
    <section class="hero">
      <p class="eyebrow">原币种原价 · 逐条溯源 · 可复算</p>
      <h1>别只看单价，计算你的真实 Token 成本。</h1>
      <p class="lede">
        国内厂商直接展示人民币官方原价；国际厂商主值美元原价，人民币只是紧跟其后的估算副行，并标注汇率与日期。每条价格都标明是「官方核验」还是「聚合数据」。
      </p>
      <p class="meta">
        官方核验日期：{{ DATA_VERIFIED_AT }} · 汇率 1 USD = {{ formatRate(fxRate.rate) }} CNY（{{ fxRate.date }}）· 汇率随时变化，人民币值不准确，最终账单以厂商原币种为准
      </p>
    </section>

    <!-- 摘要段紧跟 hero：这是 AI 引擎最可能直接引用的那一段 -->
    <KeyFacts />

    <div class="grid">
      <article class="card">
        <p class="eyebrow">Pay as you go</p>
        <h2>API 按量价格</h2>
        <p>输入、输出、缓存读写、上下文与计价条件逐列展示；可按官方核验 / 聚合数据筛选，先按账单币种分组，再按原币种价格排序。</p>
        <RouterLink class="button" to="/api-pricing/">查看 API 比价</RouterLink>
      </article>
      <article class="card">
        <p class="eyebrow">Subscription</p>
        <h2>Token / Coding Plan</h2>
        <p>月费套餐按额度语义、周期、可用模型及用途限制单独核验。没有可信数字时不使用演示数据。</p>
        <RouterLink class="button" to="/plans/">查看 Plan 状态</RouterLink>
      </article>
    </div>

    <section class="section" aria-labelledby="snapshot-title">
      <h2 id="snapshot-title">当前数据快照</h2>
      <div class="stats">
        <div class="stat"><strong>{{ stats.providers }}</strong><span class="meta">覆盖厂商</span></div>
        <div class="stat"><strong>{{ stats.entries }}</strong><span class="meta">独立计价口径</span></div>
        <div class="stat"><strong>{{ stats.official }}</strong><span class="meta">官方核验条目</span></div>
      </div>
      <p class="meta">
        其中聚合补位 {{ stats.aggregate }} 条（{{ stats.providers }} 家 × {{ stats.models }} 个模型口径）。数字由
        <code>src/lib/stats.ts</code> 从数据文件算出，与 <code>node scripts/data/cli.mjs verify</code> 输出同源。
      </p>
    </section>

    <div class="section grid">
      <article class="card">
        <h2>官方核验条目</h2>
        <p class="meta">USD 组在前、CNY 组在后，组内按原币种输入价升序；仅列 official 条目，聚合数据不参与排序结论。</p>
        <ul class="showcase">
          <li v-for="row in showcase" :key="row.id">
            <strong>{{ row.model }}</strong> · 输入 {{ row.cells.input.main }}/1M · 输出 {{ row.cells.output.main }}/1M
            <span class="meta">{{ row.provider }} · {{ row.provenanceText }}</span>
          </li>
        </ul>
      </article>
      <article class="card">
        <h2>数据纪律</h2>
        <p>官方页面可直接确认的数字标 <strong>official</strong>；只能用第三方聚合补位时标 <strong>aggregate</strong>，并在页面上注明「未逐条核官方」。同一模型两种来源并存时以官方为准。</p>
        <p>未知字段保留为空，正用量遇到缺价时计算器会拒绝给出不完整总价。</p>
        <p class="link-row"><RouterLink to="/methodology/">阅读口径与免责声明</RouterLink></p>
        <p class="link-row"><RouterLink to="/sources/">查看数据来源与覆盖率</RouterLink></p>
      </article>
    </div>
  </div>
</template>
