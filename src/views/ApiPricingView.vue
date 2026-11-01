<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import ConclusionCards, { type Conclusion } from '../components/ConclusionCards.vue';
import EmptyState from '../components/EmptyState.vue';
import FilterBar from '../components/FilterBar.vue';
import PriceCardList from '../components/PriceCardList.vue';
import PriceTable from '../components/PriceTable.vue';
import { useFoldOpenByDefault, useIsDesktop } from '../composables/useMediaQuery';
import { apiPrices, benchmarkDoc, DATA_VERIFIED_AT, fxRate, providers } from '../lib/data';
import { DEFAULT_FILTERS, nextSortState, type FilterState, type SortKey } from '../lib/filters';
import { RATE_DISCLAIMER, formatRate } from '../lib/fx';
import { filterAndSortApiPrices } from '../lib/pricing';
import { buildPriceRow } from '../lib/price-row';
import { buildRowScore, rankByCurrency, formatCostPerPoint } from '../lib/benchmark-view';
import { computeApiConclusions, computeStats } from '../lib/stats';
import { readFiltersFromUrl, writeFiltersToUrl } from '../lib/url-state';

const stats = computeStats(apiPrices);
const filters = ref<FilterState>({ ...DEFAULT_FILTERS });
const urlReady = ref(false);

const isDesktop = useIsDesktop();
// 桌面端默认折叠：这段免责说明展开时会吃掉 300+px，把首屏价格全推下去
const foldOpen = useFoldOpenByDefault();

const regionByProviderId = Object.fromEntries(providers.map((p) => [p.id, p.region]));

// 评分查表：id → { score, costPerPoint }，排序与展示共用同一份，避免两处算出不同结果
const scoreMap = Object.fromEntries(
  apiPrices.map((item) => {
    const s = buildRowScore(item, benchmarkDoc);
    return [item.id, s];
  }),
);
const sortScores = Object.fromEntries(
  Object.entries(scoreMap).map(([id, s]) => [id, s ? { score: s.score, costPerPoint: s.costPerPoint } : null]),
);

const rows = computed(() =>
  filterAndSortApiPrices(
    apiPrices,
    { ...filters.value, scores: sortScores },
    fxRate,
    regionByProviderId,
  ).map((item) => buildPriceRow(item, fxRate, scoreMap[item.id] ?? null)),
);

const providerOptions = providers
  .filter((provider) => apiPrices.some((entry) => entry.providerId === provider.id))
  .map((provider) => ({ id: provider.id, label: provider.nameZh }));

function presentCheapest(best: ReturnType<typeof computeApiConclusions>['cn']): { name: string; price: string } | null {
  if (!best) return null;
  const symbol = best.entry.billingCurrency === 'CNY' ? '¥' : '$';
  return {
    name: `${best.entry.provider} ${best.entry.model}${best.entry.provenance === 'aggregate' ? '（聚合数据）' : ''}`,
    price: `${symbol}${best.value.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,
  };
}

const conclusions = computed<Conclusion[]>(() => {
  const result = computeApiConclusions(apiPrices, regionByProviderId, fxRate);
  const cn = presentCheapest(result.cn);
  const intl = presentCheapest(result.intl);

  // 第三张卡给「性价比最优」：同币种内每分智能成本最低的那个。
  // 这正是 issue #5 想回答的「贵多少 / 强多少」，比单纯报条目数有用。
  const rankable = apiPrices
    .map((item) => {
      const s = scoreMap[item.id];
      if (!s || !Number.isFinite(s.costPerPoint)) return null;
      return { id: item.id, provider: item.provider, model: item.model, currency: item.billingCurrency, score: s.score, costPerPoint: s.costPerPoint };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const groups = rankByCurrency(rankable);
  const all = Object.values(groups).flat().sort((a, b) => a.costPerPoint - b.costPerPoint);
  const best = all[0];

  return [
    { label: '国内最低输入价', value: cn ? cn.price : '—', note: cn?.name ?? '无可用价格条目' },
    { label: '国际最低输入价', value: intl ? intl.price : '—', note: intl?.name ?? '无可用价格条目' },
    best
      ? { label: '性价比最优', value: formatCostPerPoint(best.costPerPoint), note: `${best.provider} ${best.model} · 每分智能成本` }
      : { label: '性价比最优', value: '—', note: '暂无可比评分的条目' },
  ];
});

/** 表头点击：同列反转方向，换列重置为升序 */
function onSort(key: SortKey): void {
  filters.value = { ...filters.value, ...nextSortState(filters.value, key) };
}

// URL 同步只在客户端进行：构建期没有真实 URL，不能在 setup 顶层读 location
onMounted(() => {
  filters.value = readFiltersFromUrl(window.location.search);
  urlReady.value = true;
});
watch(filters, (value) => {
  if (typeof window === 'undefined' || !urlReady.value) return;
  const qs = writeFiltersToUrl(value);
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${qs}${window.location.hash}`);
}, { deep: true });
</script>

<template>
  <div class="page">
    <section class="hero hero-compact">
      <div class="hero-head">
        <div class="hero-text">
          <p class="eyebrow">API Pricing</p>
          <h1>按量 API 比价</h1>
          <p class="meta">
            官方核验 {{ DATA_VERIFIED_AT }} · {{ stats.entries }} 条口径 / {{ stats.providers }} 家 · 官方 {{ stats.official }} · 聚合 {{ stats.aggregate }} ·
            1 USD = {{ fxRate.rate }} CNY（{{ fxRate.date }}）
          </p>
        </div>
        <ConclusionCards :items="conclusions" />
      </div>

    </section>

    <section class="section-tight" aria-label="筛选与排序">
      <FilterBar v-model="filters" :providers="providerOptions" />
    </section>

    <template v-if="rows.length > 0">
      <PriceTable v-if="isDesktop" :rows="rows" :sort-by="filters.sortBy" :order="filters.order" @sort="onSort" />
      <PriceCardList v-else :rows="rows" />
    </template>
    <EmptyState
      v-else
      eyebrow="No match"
      title="没有符合当前筛选条件的条目"
      message="换一个关键词、厂商、地区或溯源筛选试试。筛选项在浏览器内完成，数据与构建期完全一致，不发网络请求。"
      hint="清空搜索框并选择「全部 / 全部厂商 / 全部」即可恢复全表。"
    />
    <p class="meta filter-summary filter-summary-after">
      共 {{ rows.length }} 条 · 先分组（USD 在前、CNY 在后），组内按「所选字段 + {{ filters.order === 'asc' ? '升序' : '降序' }}」；跨币种不排名。
    </p>

    <section class="section-tight">
      <details class="fold" :open="foldOpen">
        <summary>币种口径与免责说明</summary>
        <div class="fold-body">
          <p class="lede">
            主列永远是厂商账单币种的原价：国际厂商显示美元，国内厂商显示人民币。人民币只作为国际厂商的估算副行出现，并标注汇率与日期。表格先按账单币种分组，再在组内排序，不做跨币种的「最便宜」合并排名。
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
  </div>
</template>
