<script setup lang="ts">
import type { UsageCostChartModel } from '../../lib/pricing-chart-data';
type UsageCostGroup = UsageCostChartModel['groups'][number];
defineProps<{
  group: UsageCostGroup;
  currentX: number; currentY: number; lineTop: number; lineBottom: number;
  currentLabel: string; currentAnchor: 'start' | 'end';
  exactLegend: string; estimateLegend: string;
}>();
</script>

<template>
  <g class="chart-axis">
    <text v-for="tick in group.axes.xTicks" :key="tick.text" :x="tick.position" :y="group.axes.xTickY" :text-anchor="tick.anchor">{{ tick.text }}</text>
    <text v-for="tick in group.axes.yTicks" :key="tick.text" :x="group.axes.yTickX" :y="tick.position" :text-anchor="tick.anchor">{{ tick.text }}</text>
    <text :x="group.axes.xLabelX" :y="group.axes.xLabelY" text-anchor="middle">{{ group.axes.xLabel }}</text>
    <text :x="group.axes.yLabelX" :y="group.axes.yLabelY">{{ group.axes.yLabel }}</text>
  </g>
  <g v-for="(pair, index) in group.pairs" :key="pair.id" :class="`chart-pair chart-pair-${index}`">
    <path v-if="pair.apiPath" :d="pair.apiPath" class="chart-api-cost"><title>{{ pair.title }} · {{ exactLegend }}</title></path>
    <path v-if="pair.planPath" :d="pair.planPath" class="chart-plan-cost"><title>{{ pair.title }} · {{ estimateLegend }}</title></path>
  </g>
  <line :x1="currentX" :x2="currentX" :y1="lineTop" :y2="lineBottom" class="chart-current"><title>{{ currentLabel }}</title></line>
  <text :x="currentX" :y="currentY" :text-anchor="currentAnchor" class="chart-label">{{ currentLabel }}</text>
  <g v-for="(point, index) in group.intersections" :key="index">
    <circle :cx="point.x" :cy="point.y" r="4" class="chart-crossing"><title>{{ point.title }}</title></circle>
    <text v-if="point.labelPlacement" :x="point.labelPlacement.x" :y="point.labelPlacement.y" :text-anchor="point.labelPlacement.anchor" class="chart-label">{{ point.label }}</text>
  </g>
</template>
