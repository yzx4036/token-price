<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import ConclusionCards, { type Conclusion } from '../components/ConclusionCards.vue';
import EmptyState from '../components/EmptyState.vue';
import FilterBar from '../components/FilterBar.vue';
import PriceCardList from '../components/PriceCardList.vue';
import PriceTable from '../components/PriceTable.vue';
import PricingChartsSection from '../components/pricing-charts/PricingChartsSection.vue';
import { buildScatterChart, buildCompositionChart, buildHistoryChart, buildUsageCostChart } from '../lib/pricing-chart-data';
import historyText from '../data/history/price-history.jsonl?raw';
import { useFoldOpenByDefault, useIsDesktop } from '../composables/useMediaQuery';
import { apiPrices, benchmarkDoc, DATA_VERIFIED_AT, fxRate, providers, tokenPlans } from '../lib/data';
import { DEFAULT_FILTERS, nextSortState, type FilterState, type SortKey } from '../lib/filters';
import { RATE_DISCLAIMER, FX_TABLE_NOTE, hasValidFx, valueSortNote } from '../lib/fx';
import { API_CURRENCY_DETAIL, API_SORT_SUMMARY, NON_OFFICIAL_BRIEF, OFFICIAL_PRICE_LABEL, PROVENANCE_AGGREGATE, PROVENANCE_OFFICIAL, VALUE_CONCLUSION_CNY, VALUE_SORT_NO_FX_NOTE } from '../lib/copy';
import { costPerPointInCny, filterAndSortApiPrices } from '../lib/pricing';
import { buildPriceRow } from '../lib/price-row';
import { pickValueBest } from '../lib/benchmark-view';
import { modelLabel } from '../lib/format';
import { buildRowScore } from '../lib/benchmark-view';
import { computeApiConclusions, computeStats, isConcludingEntry } from '../lib/stats';
import { readFiltersFromUrl, writeFiltersToUrl } from '../lib/url-state';

const scatter = buildScatterChart(apiPrices, benchmarkDoc);
const composition = buildCompositionChart(apiPrices);
const history = buildHistoryChart(historyText, apiPrices, undefined, DATA_VERIFIED_AT);
const route = useRoute();
// 预渲染路由无 usage 时同步得到 50M；查询参数变化由同一个 computed 同步派生。
const usageCost = computed(() => buildUsageCostChart(tokenPlans, apiPrices, Number(route.query.usage ?? 50)));
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
  // 口径已在 computeApiConclusions 里限定为 official 且非免费档，这里不再拼来源后缀
  return {
    name: modelLabel(best.entry.provider, best.entry.model),
    price: `${symbol}${best.value.toLocaleString('en-US', { maximumFractionDigits: 4 })}`,
  };
}

const apiConclusions = computed(() => computeApiConclusions(apiPrices, regionByProviderId, fxRate));

/**
 * 结论卡的三条口径声明只在这里出一句（D6）：旧版把同一句塞进两张卡的 note，
 * 一页重复两次，读者看不出重点，文案密度探针也会记成重复声明。
 */
const scopeNote = computed(() => `${PROVENANCE_OFFICIAL} · 已排除 ${apiConclusions.value.scope.excludedFree} 个免费档`);

const conclusions = computed<Conclusion[]>(() => {
  const result = apiConclusions.value;
  const cn = presentCheapest(result.cn);
  const intl = presentCheapest(result.intl);

  // 第三张卡给「性价比最优」。选法与表格排序同口径（v0.11.0 裁定 R13）：
  // 有汇率时按折算 CNY 全表取最小；无汇率时只在同一币种内比较。
  const rankable = apiPrices
    .filter((item) => isConcludingEntry(item))
    .map((item) => {
      const s = scoreMap[item.id];
      if (!s || !Number.isFinite(s.costPerPoint)) return null;
      return {
        id: item.id,
        provider: item.provider,
        model: item.model,
        currency: item.billingCurrency,
        score: s.score,
        costPerPoint: s.costPerPoint,
        costPerPointCny: costPerPointInCny(item, s.costPerPoint, fxRate),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const best = pickValueBest(rankable);
  const bestEntry = best ? apiPrices.find((item) => item.id === best.id) : null;
  const bestScore = bestEntry ? buildPriceRow(bestEntry, fxRate, scoreMap[bestEntry.id]).score : null;

  return [
    { label: '国内最低付费输入价', value: cn ? cn.price : '—', note: cn ? cn.name : '官方页的付费条目不足' },
    { label: '国际最低付费输入价', value: intl ? intl.price : '—', note: intl ? intl.name : '官方页的付费条目不足' },
    best
      ? { label: '性价比最优', value: bestScore?.costPerPointText ?? '—', note: `${modelLabel(best.provider, best.model)} · ${bestScore?.costPerPointCny != null ? VALUE_CONCLUSION_CNY : VALUE_SORT_NO_FX_NOTE}` }
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
          <h1>AI API 按量价格对比</h1>
          <p class="meta">
            抓取日期 {{ DATA_VERIFIED_AT }} · {{ stats.entries }} 条口径 / {{ stats.providers }} 家 ·
            {{ PROVENANCE_OFFICIAL }} {{ stats.official }} · {{ PROVENANCE_AGGREGATE }} {{ stats.aggregate }}
          </p>
          <p class="meta">{{ NON_OFFICIAL_BRIEF }} · <RouterLink to="/methodology/">口径与免责</RouterLink></p>
        </div>
        <ConclusionCards :items="conclusions" />
      </div>
      <p class="meta scope-note">最低价口径：{{ scopeNote }}。</p>
    </section>

    <section class="section-tight" aria-label="筛选与排序">
      <FilterBar v-model="filters" :providers="providerOptions" />
    </section>

    <p v-if="rows.length > 0" class="meta table-note">{{ FX_TABLE_NOTE(fxRate) }}<template v-if="filters.sortBy === 'value' || !hasValidFx(fxRate)"> {{ valueSortNote(fxRate) }}</template></p>

    <template v-if="rows.length > 0">
      <PriceTable v-if="isDesktop" :rows="rows" :fx="fxRate" :sort-by="filters.sortBy" :order="filters.order" @sort="onSort" />
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
      共 {{ rows.length }} 条 · {{ API_SORT_SUMMARY }}
    </p>

    <PricingChartsSection :scatter="scatter" :composition="composition" :history="history" :usage-cost="usageCost" />

    <section class="section-tight">
      <details class="fold" :open="foldOpen">
        <summary>币种口径与免责说明</summary>
        <div class="fold-body">
          <p class="lede">
            {{ API_CURRENCY_DETAIL }}
          </p>
          <div class="callout">
            <p>{{ RATE_DISCLAIMER }}</p>
            <p class="meta">
              官方页条目里，人民币挂牌的即{{ OFFICIAL_PRICE_LABEL }}，美元挂牌的只给美元标价；聚合条目由聚合源以 USD 发布（国内厂商的数值折算自人民币挂牌价），一律标「{{ PROVENANCE_AGGREGATE }}」，不标「{{ OFFICIAL_PRICE_LABEL }}」。
            </p>
          </div>
        </div>
      </details>
    </section>
  </div>
</template>
