<script setup lang="ts">
import type { ScatterChartModel } from '../../lib/pricing-chart-data';
type ScatterGroup = ScatterChartModel['groups'][number];
defineProps<{ group: ScatterGroup; variant: 'desktop' | 'mobile' }>();
</script>

<template>
  <g class="chart-axis">
    <text v-for="tick in group.axes.xTicks" :key="`x-${tick.text}`" :x="tick.position" :y="group.axes.xTickY" :text-anchor="tick.anchor">{{ tick.text }}</text>
    <text v-for="tick in group.axes.yTicks" :key="`y-${tick.text}`" :x="group.axes.yTickX" :y="tick.position" :text-anchor="tick.anchor">{{ tick.text }}</text>
    <text :x="group.axes.xLabelX" :y="group.axes.xLabelY" text-anchor="middle">{{ group.axes.xLabel }}</text>
    <text :x="group.axes.yLabelX" :y="group.axes.yLabelY">{{ group.axes.yLabel }}</text>
  </g>
  <path v-if="group.path" class="chart-frontier" :d="group.path"><title>{{ group.currency }} Pareto 前沿</title></path>
  <g v-for="point in group.points" :key="point.id" :class="{ 'chart-desktop-point': variant === 'desktop' && !point.frontier && !point.mobileLabel }">
    <circle :cx="point.x" :cy="point.y" :r="variant === 'mobile' ? 3 : 4" class="chart-point" :class="{ 'chart-cny': group.currency === 'CNY', 'chart-aggregate': point.provenance !== 'official' }"><title>{{ point.title }}</title></circle>
    <text v-if="variant === 'desktop' && point.desktopLabel" :x="point.desktopLabel.x" :y="point.desktopLabel.y" :text-anchor="point.desktopLabel.anchor" class="chart-label chart-desktop-label">{{ point.label }}</text>
    <text v-if="variant === 'mobile' && point.mobileLabel" :x="point.mobileLabel.x" :y="point.mobileLabel.y" :text-anchor="point.mobileLabel.anchor" class="chart-label chart-mobile-label">{{ point.label }}</text>
  </g>
</template>
