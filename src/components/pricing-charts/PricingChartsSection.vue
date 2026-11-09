<script setup lang="ts">
import type { ScatterChartModel, CompositionChartModel, HistoryChartModel, UsageCostChartModel } from '../../lib/pricing-chart-data';
import ScatterChart from './ScatterChart.vue';
import CompositionChart from './CompositionChart.vue';
import HistoryChart from './HistoryChart.vue';
import UsageCostChart from './UsageCostChart.vue';
defineProps<{ scatter: ScatterChartModel; composition: CompositionChartModel; history: HistoryChartModel; usageCost: UsageCostChartModel }>();
</script>

<template>
  <section class="pricing-charts-section" aria-label="价格与用量图解">
    <h2>价格与用量图解</h2>
    <ScatterChart :model="scatter" />
    <CompositionChart :model="composition" />
    <HistoryChart :model="history" />
    <UsageCostChart :model="usageCost" />
  </section>
</template>
