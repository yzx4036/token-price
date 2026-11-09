<script setup lang="ts">
import { apiPrices, DATA_VERIFIED_AT, fxRate } from '../lib/data';
import { AGGREGATE_NOTE, NON_OFFICIAL_BRIEF, PROVENANCE_AGGREGATE, PROVENANCE_OFFICIAL } from '../lib/copy';
import { formatRate } from '../lib/fx';
import { filterAndSortApiPrices } from '../lib/pricing';
import { buildPriceRow } from '../lib/price-row';
import KeyFacts from '../components/KeyFacts.vue';

// 首页只展示官方页条目：排名类结论不允许落在没有逐条对照官方页的第三方快照上
const officialEntries = filterAndSortApiPrices(apiPrices, { provenance: 'official', sortBy: 'inputPrice' }, fxRate);
const showcase = officialEntries.slice(0, 8).map((item) => buildPriceRow(item, fxRate));
</script>

<template>
  <div class="page">
    <section class="hero">
      <p class="eyebrow">原币种标价 · 逐条溯源</p>
      <!--
        h1 必须带搜索词。原来这里是「别只看单价，计算你的真实 Token 成本。」——
        纯文案零关键词，实测首页「对比」「AI API」「大模型」各出现 0 次。
        文案挪到 lede，h1 换成能命中的短语。
      -->
      <h1>AI 大模型 API 与 Token Plan 价格对比</h1>
      <!-- v0.10.0 返工：hero 只留一句定位（原句 26 字把主值/副行/溯源说了三遍） -->
      <p class="lede">别只看单价，先算清真实 Token 成本。</p>
      <p class="meta">抓取日期 {{ DATA_VERIFIED_AT }} · 1 USD = {{ formatRate(fxRate.rate) }} CNY（{{ fxRate.date }}）</p>
      <p class="meta">{{ NON_OFFICIAL_BRIEF }} · <RouterLink to="/methodology/">口径与免责</RouterLink></p>
    </section>

    <!-- 摘要段紧跟 hero：这是 AI 引擎最可能直接引用的那一段 -->
    <KeyFacts />

    <div class="grid">
      <article class="card">
        <p class="eyebrow">Pay as you go</p>
        <h2>AI API 价格表</h2>
        <RouterLink class="button" to="/api-pricing/">查看 API 价格对比</RouterLink>
      </article>
      <article class="card">
        <p class="eyebrow">Subscription</p>
        <h2>Token / Coding Plan 套餐对比</h2>
        <RouterLink class="button" to="/plans/">查看套餐对比</RouterLink>
      </article>
    </div>

    <!--
      v0.10.0 返工：「官方页条目」与「数据纪律」合成一张卡。
      口径与站点纪律整段下沉到折叠（仍可展开、口径页也有完整版），
      8 条低价条目同样折叠——完整列表本来就在 /api-pricing/，首页不重复铺一遍。
    -->
    <article class="section card">
      <h2>官方页条目与数据纪律</h2>
      <details class="fold">
        <summary>数据纪律与排序口径</summary>
        <div class="fold-body">
          <p>
            {{ PROVENANCE_OFFICIAL }} 是维护者从厂商公开定价页逐条录入，{{ PROVENANCE_AGGREGATE }} 是第三方快照（{{ AGGREGATE_NOTE }}）；
            两者是展示口径，不是质量背书，同一模型两种来源并存时以官方为准。
          </p>
          <p>
            未知字段保留为空，不用推测值填充；缺价时计算器拒绝给出不完整总价。
            缺智能评分或无可比正价的条目不进图（各图下方标注未入图条数）。
          </p>
          <p>
            列表按账单币种分组（USD 在前、CNY 在后），组内按原币种输入价升序；{{ PROVENANCE_AGGREGATE }}不参与排序结论，
            人民币副行按当日汇率估算，账单以厂商原币种为准。
          </p>
        </div>
      </details>
      <details class="fold">
        <summary>展开 {{ showcase.length }} 条官方页低价条目</summary>
        <div class="fold-body">
          <ul class="showcase">
            <li v-for="row in showcase" :key="row.id">
              <strong>{{ row.model }}</strong> · 输入 {{ row.cells.input.main }}/1M · 输出 {{ row.cells.output.main }}/1M
              <span class="meta">{{ row.provider }} · {{ row.provenanceText }}</span>
            </li>
          </ul>
          <p class="link-row"><RouterLink to="/api-pricing/">查看全部 API 价格</RouterLink></p>
        </div>
      </details>
    </article>
  </div>
</template>
