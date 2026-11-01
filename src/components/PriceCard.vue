<script setup lang="ts">
import type { PriceRow } from '../lib/price-row';

defineProps<{ row: PriceRow }>();
</script>

<template>
  <article class="price-card">
    <header class="price-card-head">
      <p class="price-card-provider">{{ row.provider }}</p>
      <h3 class="price-card-model">{{ row.model }}</h3>
    </header>

    <div class="price-card-prices">
      <div class="price-cell">
        <span class="price-cell-label">输入 / 1M</span>
        <strong class="price-main">{{ row.cells.input.main }}</strong>
        <span v-if="row.cells.input.sub" class="price-sub">{{ row.cells.input.sub }}</span>
      </div>
      <div class="price-cell">
        <span class="price-cell-label">输出 / 1M</span>
        <strong class="price-main">{{ row.cells.output.main }}</strong>
        <span v-if="row.cells.output.sub" class="price-sub">{{ row.cells.output.sub }}</span>
      </div>
    </div>

    <p class="price-card-badges">
      <span class="badge" :class="row.provenance === 'official' ? 'badge-official' : 'badge-aggregate'">
        {{ row.provenanceBadge }}
      </span>
    </p>

    <details class="fold fold-row">
      <summary>详情</summary>
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
          <dt>计价说明</dt>
          <dd>{{ row.basis }}</dd>
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
  </article>
</template>
