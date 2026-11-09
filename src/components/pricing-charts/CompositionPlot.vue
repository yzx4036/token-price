<script setup lang="ts">
import type { CompositionChartModel } from '../../lib/pricing-chart-data';
type CompositionGroup = CompositionChartModel['groups'][number];
defineProps<{ group: CompositionGroup }>();
</script>

<template>
  <g v-for="row in group.rows" :key="row.id">
    <title>{{ row.title }}</title>
    <text :x="group.labelX" :y="row.y">{{ row.label }}</text>
    <text v-if="row.missingText" :x="group.missingX" :y="row.y" text-anchor="end" class="chart-missing">{{ row.missingText }}</text>
    <rect v-for="segment in row.segments" :key="segment.index" :x="segment.x" :y="row.y + 5" :width="segment.width" height="12" :class="`chart-segment chart-segment-${segment.index}`"><title>{{ row.title }} · {{ segment.title }}</title></rect>
  </g>
</template>
