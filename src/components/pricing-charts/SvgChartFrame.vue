<script setup lang="ts">
import { useId } from 'vue';
defineProps<{ title: string; description: string; viewBox: string; mobileViewBox: string }>();
const id = useId();
</script>

<template>
  <figure class="pricing-chart">
    <svg class="chart-layer chart-layer-desktop" :viewBox="viewBox" role="img" :aria-labelledby="`${id}-title ${id}-desc`" xmlns="http://www.w3.org/2000/svg">
      <title :id="`${id}-title`">{{ title }}</title>
      <desc :id="`${id}-desc`">{{ description }}</desc>
      <slot />
    </svg>
    <svg class="chart-layer chart-layer-mobile" :viewBox="mobileViewBox" role="img" :aria-labelledby="`${id}-title-m ${id}-desc-m`" xmlns="http://www.w3.org/2000/svg">
      <title :id="`${id}-title-m`">{{ title }}</title>
      <desc :id="`${id}-desc-m`">{{ description }}</desc>
      <slot name="mobile" />
    </svg>
    <figcaption><slot name="legend" /><slot name="note" /></figcaption>
  </figure>
</template>
