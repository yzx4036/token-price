<script setup lang="ts">
import { computed } from 'vue';
import { splitUnbreakableTail } from '../lib/format';

/**
 * 币种副行 / 日期文案的渲染组件。
 * 尾部那段（全角括号里的日期，或裸的 YYYY-MM-DD）包成不可断元素，
 * 否则窄列里会在连字符处折行，把日期劈成「（2026-10-」/「31）」两半。
 */
const props = defineProps<{ text: string }>();

const parts = computed(() => splitUnbreakableTail(props.text));
</script>

<template>
  <template v-if="parts.tail">{{ parts.head }}<span class="nobreak">{{ parts.tail }}</span></template>
  <template v-else>{{ parts.head }}</template>
</template>
