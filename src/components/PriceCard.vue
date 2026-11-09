<script setup lang="ts">
import type { PriceRow } from '../lib/price-row';
import { FETCHED_ON, VALUE_UNIT_CNY, VALUE_UNIT_RAW } from '../lib/copy';
import SubLine from './SubLine.vue';

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
        <span v-if="row.cells.input.sub" class="price-sub"><SubLine :text="row.cells.input.sub" /></span>
      </div>
      <div class="price-cell">
        <span class="price-cell-label">输出 / 1M</span>
        <strong class="price-main">{{ row.cells.output.main }}</strong>
        <span v-if="row.cells.output.sub" class="price-sub"><SubLine :text="row.cells.output.sub" /></span>
      </div>
    </div>

    <div v-if="row.score" class="price-card-score">
      <span class="score-chip">
        智能 <strong>{{ row.score.score.toFixed(2) }}</strong>
        <em>{{ row.score.tier }}</em>
      </span>
      <span v-if="Number.isFinite(row.score.costPerPoint)" class="score-chip">
        性价比 <strong :title="row.score.costPerPointTitle">{{ row.score.costPerPointText }}</strong>
        <em>{{ row.score.costPerPointCny === null ? VALUE_UNIT_RAW : VALUE_UNIT_CNY }}</em>
      </span>
    </div>

    <p class="price-card-badges">
      <span class="badge" :class="row.provenance === 'official' ? 'badge-official' : 'badge-aggregate'">
        {{ row.provenanceBadge }}
      </span>
      <span v-if="!row.score" class="badge badge-muted">未评测</span>
    </p>

    <details class="fold fold-row">
      <summary>详情</summary>
      <dl class="detail-list">
        <div>
          <dt>Cache read / 1M</dt>
          <dd>{{ row.cells.cacheRead.main }}<span v-if="row.cells.cacheRead.sub" class="price-sub"><SubLine :text="row.cells.cacheRead.sub" /></span></dd>
        </div>
        <div>
          <dt>Cache write / 1M</dt>
          <dd>{{ row.cells.cacheWrite.main }}<span v-if="row.cells.cacheWrite.sub" class="price-sub"><SubLine :text="row.cells.cacheWrite.sub" /></span></dd>
        </div>
        <div>
          <dt>上下文</dt>
          <dd>{{ row.context }}</dd>
        </div>
        <div v-if="row.score">
          <dt>智能指数</dt>
          <dd>{{ row.score.score.toFixed(2) }}（采信档位：{{ row.score.tier }}）· 来源 Artificial Analysis，非厂商自述；分数为评测口径的相对强弱，不等于业务效果。</dd>
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
            <span class="price-sub"><SubLine :text="`${FETCHED_ON} ${row.verifiedAt}`" /></span>
          </dd>
        </div>
      </dl>
    </details>
  </article>
</template>
