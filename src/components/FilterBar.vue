<script setup lang="ts">
import type { FilterState } from '../lib/filters';
import type { PriceField } from '../lib/pricing';

defineProps<{ providers: { id: string; label: string }[] }>();
const model = defineModel<FilterState>({ required: true });

function patch(part: Partial<FilterState>): void {
  model.value = { ...model.value, ...part };
}

function valueOf(event: Event): string {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  return target?.value ?? '';
}
</script>

<template>
  <form class="filter-bar" role="search" aria-label="API 价格筛选" @submit.prevent>
    <label class="filter-field">
      <span>搜索厂商或模型</span>
      <input
        type="search"
        name="query"
        :value="model.query"
        placeholder="例如 qwen、Gemini、deepseek"
        autocomplete="off"
        @input="patch({ query: valueOf($event) })"
      />
    </label>

    <label class="filter-field">
      <span>厂商</span>
      <select name="provider" :value="model.provider" @change="patch({ provider: valueOf($event) })">
        <option value="">全部厂商</option>
        <option v-for="provider in providers" :key="provider.id" :value="provider.id">{{ provider.label }}</option>
      </select>
    </label>

    <label class="filter-field">
      <span>溯源</span>
      <select
        name="provenance"
        :value="model.provenance"
        @change="patch({ provenance: valueOf($event) as FilterState['provenance'] })"
      >
        <option value="all">全部</option>
        <option value="official">官方核验</option>
        <option value="aggregate">聚合数据</option>
      </select>
    </label>

    <label class="filter-field">
      <span>排序字段</span>
      <select name="sort" :value="model.sortBy" @change="patch({ sortBy: valueOf($event) as PriceField })">
        <option value="inputPrice">输入价</option>
        <option value="outputPrice">输出价</option>
        <option value="cacheReadPrice">Cache 读</option>
        <option value="cacheWritePrice">Cache 写</option>
      </select>
    </label>
  </form>
</template>
