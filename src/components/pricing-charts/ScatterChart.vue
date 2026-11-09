<script setup lang="ts">
import { computed } from 'vue';
import type { ScatterChartModel } from '../../lib/pricing-chart-data';
import ScatterPlot from './ScatterPlot.vue';
import SvgChartFrame from './SvgChartFrame.vue';
const props = defineProps<{ model: ScatterChartModel }>();
// 桌面层与移动层按币种配对：两层都是构建期产物，只由 CSS 媒体查询切换显示。
const facets = computed(() => props.model.groups.map((group) => ({
  desktop: group,
  mobile: props.model.mobile.groups.find((candidate) => candidate.currency === group.currency) ?? null,
})));
</script>

<template>
  <section class="pricing-chart-panel" aria-label="价格与能力散点">
    <h3>价格与能力</h3>
    <p class="meta">{{ model.description }}</p>
    <div class="pricing-chart-facets">
      <SvgChartFrame v-for="facet in facets" :key="facet.desktop.currency" :title="`${facet.desktop.currency} 价格与能力散点`" :description="model.description" :view-box="model.viewBox" :mobile-view-box="model.mobile.viewBox">
        <ScatterPlot :group="facet.desktop" variant="desktop" />
        <template #mobile><ScatterPlot v-if="facet.mobile" :group="facet.mobile" variant="mobile" /></template>
        <template #legend><p class="chart-legend">{{ facet.desktop.currency }} · 实线：同币种 Pareto 前沿 · 空心：聚合数据</p></template>
      </SvgChartFrame>
    </div>
    <p v-if="!model.groups.length" class="meta">暂无有分且有正价的条目。</p>
    <p class="meta">{{ model.unscored }} 条无评测数据未入图；{{ model.invalidPrice }} 条缺可比正价未入图；共 {{ model.excluded }} 条未入图。</p>
  </section>
</template>
