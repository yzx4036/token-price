<script setup lang="ts">
import { computed } from 'vue';
import type { UsageCostChartModel } from '../../lib/pricing-chart-data';
import SvgChartFrame from './SvgChartFrame.vue';
import UsageCostPlot from './UsageCostPlot.vue';
const props = defineProps<{ model: UsageCostChartModel }>();
const facets = computed(() => props.model.groups.map((group) => ({
  desktop: group,
  mobile: props.model.mobile.groups.find((candidate) => candidate.currency === group.currency) ?? null,
})));
const currentAnchor = computed<'start' | 'end'>(() => props.model.usageMillion > 500 ? 'end' : 'start');
</script>

<template>
  <section class="pricing-chart-panel" aria-label="用量与成本曲线">
    <h3>用量与成本</h3>
    <p class="meta">{{ model.note }}</p>
    <div class="pricing-chart-facets">
      <SvgChartFrame v-for="facet in facets" :key="facet.desktop.currency" :title="`${facet.desktop.currency} 用量与成本曲线`" :description="model.note" :view-box="model.viewBox" :mobile-view-box="model.mobile.viewBox">
        <UsageCostPlot :group="facet.desktop" :current-x="model.currentX" :current-y="model.currentY" :line-top="model.lineTop" :line-bottom="model.lineBottom" :current-label="model.currentLabel" :current-anchor="currentAnchor" :exact-legend="model.exactLegend" :estimate-legend="model.estimateLegend" />
        <template #mobile>
          <UsageCostPlot v-if="facet.mobile" :group="facet.mobile" :current-x="model.mobile.currentX" :current-y="model.mobile.currentY" :line-top="model.mobile.lineTop" :line-bottom="model.mobile.lineBottom" :current-label="model.currentLabel" :current-anchor="currentAnchor" :exact-legend="model.exactLegend" :estimate-legend="model.estimateLegend" />
        </template>
        <template #legend>
          <p class="chart-legend"><span class="chart-api-key">实线：{{ model.exactLegend }}</span><span class="chart-plan-key">虚线：{{ model.estimateLegend }}</span></p>
          <p class="meta chart-caption-desktop">{{ facet.desktop.currency }} · 展示 {{ facet.desktop.shown }}/{{ facet.desktop.total }} 组有效套餐与同厂商官方 API · {{ model.currentLabel }}</p>
          <p v-if="facet.mobile" class="meta chart-caption-mobile">{{ facet.mobile.currency }} · 展示 {{ facet.mobile.shown }}/{{ facet.mobile.total }} 组有效套餐与同厂商官方 API · {{ model.currentLabel }}</p>
          <ul class="chart-pair-legend chart-caption-desktop"><li v-for="(pair, index) in facet.desktop.pairs" :key="pair.id" :class="`chart-pair chart-pair-${index}`"><span>{{ pair.title }}</span> · {{ pair.thresholdText }}<span class="chart-sample-values"><template v-for="sample in pair.samples" :key="sample.usageMillion"><span v-if="sample.usageMillion === model.usageMillion"> · {{ sample.title }}</span></template></span></li></ul>
          <ul v-if="facet.mobile" class="chart-pair-legend chart-caption-mobile"><li v-for="(pair, index) in facet.mobile.pairs" :key="pair.id" :class="`chart-pair chart-pair-${index}`"><span>{{ pair.title }}</span> · {{ pair.thresholdText }}<span class="chart-sample-values"><template v-for="sample in pair.samples" :key="sample.usageMillion"><span v-if="sample.usageMillion === model.usageMillion"> · {{ sample.title }}</span></template></span></li></ul>
        </template>
      </SvgChartFrame>
    </div>
    <p v-if="!model.groups.length" class="meta">暂无有公开月费且能匹配同币种官方 API 的套餐。</p>
  </section>
</template>
