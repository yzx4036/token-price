<script setup lang="ts">
defineProps<{
  eyebrow?: string;
  title: string;
  message: string;
  hint?: string;
}>();
</script>

<template>
  <div class="empty" role="status">
    <p v-if="eyebrow" class="eyebrow">{{ eyebrow }}</p>
    <h2>{{ title }}</h2>
    <p>{{ message }}</p>
    <p v-if="hint" class="meta">{{ hint }}</p>
  </div>
</template>
