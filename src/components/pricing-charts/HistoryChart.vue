<script setup lang="ts">
import { computed } from 'vue';
import type { HistoryChartModel } from '../../lib/pricing-chart-data';
import HistoryPlot from './HistoryPlot.vue';
import SvgChartFrame from './SvgChartFrame.vue';
const props = defineProps<{ model: HistoryChartModel }>();
const facets = computed(() => props.model.groups.map((group) => ({
  desktop: group,
  mobile: props.model.mobile.groups.find((candidate) => candidate.currency === group.currency) ?? null,
})));
</script>

<template>
  <section class="pricing-chart-panel" aria-label="价格走势">
    <h3>价格走势</h3>
    <p class="meta">{{ model.status }}<template v-if="!model.ready && model.expectedDate"> · 最早 {{ model.expectedDate }} 达到时间门槛，仍需持续积累真实快照。</template></p>
    <SvgChartFrame v-if="!model.ready" title="价格走势：历史积累中" :description="model.status" :view-box="model.viewBox" :mobile-view-box="model.mobile.viewBox">
      <text x="320" y="150" text-anchor="middle">{{ model.status }}</text>
      <text x="320" y="190" text-anchor="middle">仅展示实际记录，不补日期、不插值</text>
      <template #mobile>
        <text x="180" y="140" text-anchor="middle">{{ model.status }}</text>
        <text x="180" y="176" text-anchor="middle">仅展示实际记录，不补日期、不插值</text>
      </template>
      <template #legend>
        <p class="chart-legend"><span>当前状态：{{ model.status }}</span></p>
        <p class="meta">门槛：连续 6 周（42 天）真实快照后才连走势线<template v-if="model.expectedDate">，最早 {{ model.expectedDate }} 达标</template>；缺快照的日期留空，不插值。</p>
      </template>
    </SvgChartFrame>
    <div v-if="model.ready" class="pricing-chart-facets">
      <SvgChartFrame v-for="facet in facets" :key="facet.desktop.currency" :title="`${facet.desktop.currency} 价格走势`" :description="model.status" :view-box="model.viewBox" :mobile-view-box="model.mobile.viewBox">
        <HistoryPlot :group="facet.desktop" />
        <template #mobile><HistoryPlot v-if="facet.mobile" :group="facet.mobile" /></template>
        <template #legend><p class="meta">{{ facet.desktop.currency }} · 3:1 混合单价 · 原生标题可读模型、日期与单价；不同币种与价格中断分别绘制。</p></template>
      </SvgChartFrame>
    </div>
    <div v-for="group in model.groups" :key="group.currency" class="chart-history-comparisons">
      <template v-for="series in group.series" :key="series.id"><p v-if="series.comparison" class="meta">本次 vs 上次 · {{ series.comparison }}</p></template>
    </div>
  </section>
</template>
