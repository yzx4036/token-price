<script setup lang="ts">
import {
  SORT_KEYS,
  SORT_KEY_LABELS,
  type FilterState,
  type RegionFilter,
  type SortKey,
} from '../lib/filters';
import { PROVENANCE_OFFICIAL } from '../lib/copy';

defineProps<{ providers: { id: string; label: string }[] }>();
const model = defineModel<FilterState>({ required: true });

function patch(part: Partial<FilterState>): void {
  model.value = { ...model.value, ...part };
}

function valueOf(event: Event): string {
  const target = event.target as HTMLInputElement | HTMLSelectElement | null;
  return target?.value ?? '';
}

const REGIONS: { value: RegionFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'cn', label: '国内' },
  { value: 'intl', label: '国外' },
];
</script>

<template>
  <form class="filter-bar" role="search" aria-label="价格筛选" @submit.prevent>
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

    <!-- 国内 / 国外：三段式分段控件，比下拉框少一次点击 -->
    <div class="filter-field filter-segment-field">
      <span id="region-label">地区</span>
      <div class="segmented" role="group" aria-labelledby="region-label">
        <button
          v-for="item in REGIONS"
          :key="item.value"
          type="button"
          class="segment"
          :class="{ 'is-active': model.region === item.value }"
          :aria-pressed="model.region === item.value"
          @click="patch({ region: item.value })"
        >{{ item.label }}</button>
      </div>
    </div>

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
        <option value="official">{{ PROVENANCE_OFFICIAL }}</option>
        <option value="aggregate">聚合数据</option>
      </select>
    </label>

    <!-- 窄屏没有表头可点，排序入口必须留在这里 -->
    <label class="filter-field">
      <span>排序</span>
      <select
        name="sort"
        :value="model.sortBy"
        @change="patch({ sortBy: valueOf($event) as SortKey, order: 'asc' })"
      >
        <option v-for="key in SORT_KEYS" :key="key" :value="key">{{ SORT_KEY_LABELS[key] }}</option>
      </select>
    </label>

    <button
      type="button"
      class="filter-order"
      :aria-label="model.order === 'asc' ? '当前升序，点击切为降序' : '当前降序，点击切为升序'"
      @click="patch({ order: model.order === 'asc' ? 'desc' : 'asc' })"
    >
      {{ model.order === 'asc' ? '↑ 升序' : '↓ 降序' }}
    </button>
  </form>
</template>
