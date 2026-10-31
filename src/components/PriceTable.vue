<script setup lang="ts">
import type { PriceRow } from '../lib/price-row';

defineProps<{ rows: PriceRow[] }>();
</script>

<!--
  桌面表格（≥1024 才渲染）：table-layout: fixed + 百分比列宽，保证 table.scrollWidth <= 容器宽（R4）。
  「溯源」只放徽章，「来源 / 计价口径 / 备注」收进行内 details，行高不再被长文本撑爆（R5）。
-->
<template>
  <div class="table-wrap">
    <table class="pricing-table">
      <caption class="sr-only">API 按量价格表（按账单币种分组，组内按原币种价格升序）</caption>
      <colgroup>
        <col class="col-model" />
        <col class="col-provenance" />
        <col class="col-price" />
        <col class="col-price" />
        <col class="col-cache" />
        <col class="col-cache" />
        <col class="col-detail" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">厂商 / 模型</th>
          <th scope="col">溯源</th>
          <th scope="col">输入（原币种）/1M</th>
          <th scope="col">输出（原币种）/1M</th>
          <th scope="col">Cache read/1M</th>
          <th scope="col">Cache write/1M</th>
          <th scope="col">详情</th>
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
          <td class="cell-price">
            <span class="price-main">{{ row.cells.cacheRead.main }}</span>
            <span v-if="row.cells.cacheRead.sub" class="price-sub">{{ row.cells.cacheRead.sub }}</span>
          </td>
          <td class="cell-price">
            <span class="price-main">{{ row.cells.cacheWrite.main }}</span>
            <span v-if="row.cells.cacheWrite.sub" class="price-sub">{{ row.cells.cacheWrite.sub }}</span>
          </td>
          <td class="cell-detail">
            <details class="fold fold-cell">
              <summary>口径</summary>
              <dl class="detail-list">
                <div>
                  <dt>溯源</dt>
                  <dd>{{ row.provenanceText }}</dd>
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
