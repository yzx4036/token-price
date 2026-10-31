<script setup lang="ts">
import PriceCard from './PriceCard.vue';
import type { PriceRow } from '../lib/price-row';

defineProps<{ rows: PriceRow[] }>();
</script>

<template>
  <ul class="price-cards">
    <li v-for="row in rows" :key="row.id" class="price-cards-item">
      <PriceCard :row="row" />
    </li>
  </ul>
</template>
