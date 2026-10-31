<script setup lang="ts">
import { computed, ref } from 'vue';
import EmptyState from '../components/EmptyState.vue';
import FilterBar from '../components/FilterBar.vue';
import PriceCardList from '../components/PriceCardList.vue';
import PriceTable from '../components/PriceTable.vue';
import { useFoldOpenByDefault, useIsDesktop } from '../composables/useMediaQuery';
import { apiPrices, DATA_VERIFIED_AT, fxRate, providers } from '../lib/data';
import { DEFAULT_FILTERS, type FilterState } from '../lib/filters';
import { RATE_DISCLAIMER, formatRate } from '../lib/fx';
import { filterAndSortApiPrices } from '../lib/pricing';
import { buildPriceRow } from '../lib/price-row';
import { computeStats } from '../lib/stats';

const stats = computeStats(apiPrices);
const filters = ref<FilterState>({ ...DEFAULT_FILTERS });

// <1024 渲染卡片列表，>=1024 渲染表格；SSR 阶段按移动优先输出卡片
const isDesktop = useIsDesktop();
const foldOpen = useFoldOpenByDefault();

const rows = computed(() => filterAndSortApiPrices(apiPrices, filters.value, fxRate).map((item) => buildPriceRow(item, fxRate)));

const providerOptions = providers
  .filter((provider) => apiPrices.some((entry) => entry.providerId === provider.id))
  .map((provider) => ({ id: provider.id, label: provider.nameZh }));
</script>

<template>
  <div class="page">
    <section class="hero hero-compact">
      <p class="eyebrow">API Pricing</p>
      <h1>按量 API 比价（原币种原价 + 人民币估算）</h1>
      <p class="meta">
        官方核验日期：{{ DATA_VERIFIED_AT }} · 共 {{ stats.entries }} 条口径 / {{ stats.providers }} 家厂商 · 官方核验 {{ stats.official }} 条 · 聚合数据 {{ stats.aggregate }} 条 ·
        汇率 1 USD = {{ fxRate.rate }} CNY（{{ fxRate.date }}）
      </p>

      <details class="fold" :open="foldOpen">
        <summary>币种口径与免责说明</summary>
        <div class="fold-body">
          <p class="lede">
            主列永远是厂商账单币种的原价：国际厂商显示美元，国内厂商显示人民币。人民币只作为国际厂商的估算副行出现，并标注汇率与日期。表格先按账单币种分组，再在组内按原币种价格升序，不做跨币种的「最便宜」合并排名。
          </p>
          <div class="callout">
            <p>
              <strong>币种口径：</strong>美元为厂商原价；人民币为按 {{ formatRate(fxRate.rate) }} 估算的参考值，汇率随时变化，不准确。
            </p>
            <p>{{RATE_DISCLAIMER}}</p>
            <p class="meta">
              官方核验条目里，人民币挂牌的即官方原价；美元挂牌的只给美元原价，人民币一律标「≈」与「估算」。聚合数据由聚合源以 USD 发布（国内厂商的数值折算自人民币挂牌价），一律标注「聚合数据」，不标「官方原价」。
            </p>
          </div>
        </div>
      </details>
    </section>

    <section class="section-tight" aria-label="筛选与排序">
      <FilterBar v-model="filters" :providers="providerOptions" />
      <p class="meta filter-summary">
        共 {{ rows.length }} 条 · 排序口径：先分组（USD 条目组在前、CNY 条目组在后），组内按原币种价格升序；跨币种不排名。窄屏用卡片列表，宽屏用表格，均无需横向拖动。
      </p>
    </section>

    <template v-if="rows.length > 0">
      <PriceTable v-if="isDesktop" :rows="rows" />
      <PriceCardList v-else :rows="rows" />
    </template>
    <EmptyState
      v-else
      eyebrow="No match"
      title="没有符合当前筛选条件的条目"
      message="换一个关键词、厂商或溯源筛选试试。筛选项在浏览器内完成，数据与构建期完全一致，不发网络请求。"
      hint="清空搜索框并选择「全部厂商 / 全部」即可恢复全表。"
    />
  </div>
</template>
