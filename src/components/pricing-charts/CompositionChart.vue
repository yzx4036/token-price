<script setup lang="ts">
import { computed } from 'vue';
import type { CompositionChartModel } from '../../lib/pricing-chart-data';
import CompositionPlot from './CompositionPlot.vue';
import SvgChartFrame from './SvgChartFrame.vue';
const props = defineProps<{ model: CompositionChartModel }>();
const facets = computed(() => props.model.groups.map((group) => ({
  desktop: group,
  mobile: props.model.mobile.groups.find((candidate) => candidate.currency === group.currency) ?? null,
})));
</script>

<template>
  <section class="pricing-chart-panel" aria-label="价格构成">
    <h3>价格构成</h3>
    <p class="meta">各币种展示 3:1 混合单价最低的可比条目（桌面最多 8 条、移动最多 4 条）。条长为四项单价之和，仅展示标价构成，不代表实际账单占比；缺价不补零。</p>
    <div class="pricing-chart-facets">
      <SvgChartFrame v-for="facet in facets" :key="facet.desktop.currency" :title="`${facet.desktop.currency} 价格构成`" description="输入、输出、缓存读、缓存写单价的堆叠条；缺价段不绘制。单位为原币种每百万 token。" :view-box="model.viewBox" :mobile-view-box="model.mobile.viewBox">
        <CompositionPlot :group="facet.desktop" />
        <template #mobile><CompositionPlot v-if="facet.mobile" :group="facet.mobile" /></template>
        <template #legend>
          <p class="chart-legend"><span v-for="(label, index) in model.legend" :key="label" :class="`chart-key chart-key-${index}`">{{ label }}</span></p>
          <p class="meta chart-caption-desktop">{{ facet.desktop.currency }} · 展示 {{ facet.desktop.shown }}/{{ facet.desktop.total }} 条可比条目 · 跨币种不排名</p>
          <p v-if="facet.mobile" class="meta chart-caption-mobile">{{ facet.mobile.currency }} · 展示 {{ facet.mobile.shown }}/{{ facet.mobile.total }} 条可比条目 · 跨币种不排名</p>
        </template>
      </SvgChartFrame>
    </div>
    <p v-if="!model.groups.length" class="meta">暂无可比价格构成。</p>
  </section>
</template>
