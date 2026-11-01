<script setup lang="ts">
import type { SortKey, SortOrder } from '../lib/filters';
import type { PriceRow } from '../lib/price-row';

const props = defineProps<{ rows: PriceRow[]; sortBy: SortKey; order: SortOrder }>();
const emit = defineEmits<{ (e: 'sort', key: SortKey): void }>();

const columns: { key: SortKey | null; label: string; cls: string }[] = [
  { key: 'provider', label: '厂商 / 模型', cls: 'col-model' },
  { key: null, label: '溯源', cls: 'col-provenance' },
  { key: 'inputPrice', label: '输入（原币种）/1M', cls: 'col-price' },
  { key: 'outputPrice', label: '输出（原币种）/1M', cls: 'col-price' },
  { key: null, label: '详情', cls: 'col-detail' },
];

function indicator(key: SortKey): string {
  if (props.sortBy !== key) return '';
  return props.order === 'asc' ? '▲' : '▼';
}
</script>

<!--
  桌面表格（>=1024 才渲染）：table-layout: fixed + 百分比列宽，保证不横向滚动。
  Cache 读写两列已收进「详情」折叠（它们大多为「待核验」，占列不提供信息）。
  表头可点击排序：再点同一列反转方向。
-->
<template>
  <div class="table-wrap">
    <table class="pricing-table">
      <caption class="sr-only">API 按量价格表（按账单币种分组，组内按选中字段排序）</caption>
      <colgroup>
        <col class="col-model" />
        <col class="col-provenance" />
        <col class="col-price" />
        <col class="col-price" />
        <col class="col-detail" />
      </colgroup>
      <thead>
        <tr>
          <th
            v-for="col in columns"
            :key="col.label"
            scope="col"
            :class="[col.cls, col.key ? 'th-sortable' : '', col.key && sortBy === col.key ? 'th-active' : '']"
            :aria-sort="col.key ? (sortBy === col.key ? (order === 'asc' ? 'ascending' : 'descending') : 'none') : undefined"
          >
            <button
              v-if="col.key"
              type="button"
              class="th-button"
              @click="emit('sort', col.key)"
            >
              <span>{{ col.label }}</span>
              <span class="sort-indicator" aria-hidden="true">{{ indicator(col.key) }}</span>
            </button>
            <span v-else>{{ col.label }}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.id">
          <td class="cell-model">
            <strong class="cell-provider">{{ row.provider }}</strong>
            <span class="cell-model-name">{{ row.model }}</span>
            <span class="cell-meta">上下文 {{ row.context }}</span>
          </td>
          <td>
            <span class="badge" :class="row.provenance === 'official' ? 'badge-official' : 'badge-aggregate'">
              {{ row.provenanceBadge }}
            </span>
          </td>
          <td class="cell-price">
            <span class="price-main">{{ row.cells.input.main }}</span>
            <span v-if="row.cells.input.sub" class="price-sub">{{ row.cells.input.sub }}</span>
          </td>
          <td class="cell-price">
            <span class="price-main">{{ row.cells.output.main }}</span>
            <span v-if="row.cells.output.sub" class="price-sub">{{ row.cells.output.sub }}</span>
          </td>
          <td class="cell-detail">
            <details class="fold fold-cell">
              <summary>口径</summary>
              <dl class="detail-list">
                <div>
                  <dt>Cache read / 1M</dt>
                  <dd>{{ row.cells.cacheRead.main }}<span v-if="row.cells.cacheRead.sub" class="price-sub">{{ row.cells.cacheRead.sub }}</span></dd>
                </div>
                <div>
                  <dt>Cache write / 1M</dt>
                  <dd>{{ row.cells.cacheWrite.main }}<span v-if="row.cells.cacheWrite.sub" class="price-sub">{{ row.cells.cacheWrite.sub }}</span></dd>
                </div>
                <div>
                  <dt>上下文</dt>
                  <dd>{{ row.context }}</dd>
                </div>
                <div>
                  <dt>计价口径</dt>
                  <dd>{{ row.pricingCondition }}</dd>
                </div>
                <div>
                  <dt>备注</dt>
                  <dd>{{ row.notes }}</dd>
                </div>
                <div>
                  <dt>溯源</dt>
                  <dd>{{ row.provenanceText }}</dd>
                </div>
                <div>
                  <dt>来源页</dt>
                  <dd>
                    <a :href="row.sourceUrl" rel="noreferrer" target="_blank">{{ row.provider }} 定价页</a>
                    <span class="price-sub">核验于 {{ row.verifiedAt }}</span>
                  </dd>
                </div>
              </dl>
            </details>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
