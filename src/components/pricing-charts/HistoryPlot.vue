<script setup lang="ts">
import type { HistoryChartModel } from '../../lib/pricing-chart-data';
type HistoryGroup = HistoryChartModel['groups'][number];
defineProps<{ group: HistoryGroup }>();
</script>

<template>
  <g class="chart-axis">
    <text v-for="tick in group.axes.xTicks" :key="tick.text" :x="tick.position" :y="group.axes.xTickY" :text-anchor="tick.anchor">{{ tick.text }}</text>
    <text v-for="tick in group.axes.yTicks" :key="tick.text" :x="group.axes.yTickX" :y="tick.position" :text-anchor="tick.anchor">{{ tick.text }}</text>
    <text :x="group.axes.yLabelX" :y="group.axes.yLabelY">{{ group.axes.yLabel }}</text>
  </g>
  <g v-for="series in group.series" :key="series.id">
    <path v-if="series.path" data-history-line class="chart-history" :d="series.path"><title>{{ series.name }}</title></path>
    <circle v-for="point in series.points" :key="point.date" :cx="point.x" :cy="point.y" r="3" class="chart-point"><title>{{ point.title }}</title></circle>
  </g>
</template>
