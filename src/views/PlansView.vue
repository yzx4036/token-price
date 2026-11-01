<script setup lang="ts">
import { computed } from 'vue';
import EmptyState from '../components/EmptyState.vue';
import { useIsDesktop } from '../composables/useMediaQuery';
import { DATA_VERIFIED_AT, fxRate, tokenPlans } from '../lib/data';
import { formatRate } from '../lib/fx';

const isDesktop = useIsDesktop();

/**
 * 月费主行：同一列里 $20 与 ¥40.00 并列会对不齐，所以统一按「整数不补小数位」显示。
 * 只在 Plan 页生效——API 单价的 ¥7.30 是有效小数，不能套这个规则。
 */
function formatMonthly(price: number, currency: 'CNY' | 'USD'): string {
  const symbol = currency === 'CNY' ? '¥' : '$';
  return `${symbol}${price.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

/** 月费单元格：CNY 官方原价 / USD 原价 + 估算副行；缺值一律「待核验」 */
function monthlyCell(price: number | null, currency: 'CNY' | 'USD'): { main: string; sub: string } {
  if (price === null) return { main: '待核验', sub: '' };
  if (currency === 'CNY') return { main: formatMonthly(price, 'CNY'), sub: '官方原价' };
  if (!fxRate) return { main: formatMonthly(price, 'USD'), sub: '汇率数据缺失，暂不给人民币估算' };
  const cny = (price * fxRate.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    main: formatMonthly(price, 'USD'),
    sub: `≈ ¥${cny} · 按 ${formatRate(fxRate.rate)} 估算（${fxRate.date}）`,
  };
}

const planRows = computed(() => tokenPlans.map((item) => ({ item, cell: monthlyCell(item.monthlyPrice, item.billingCurrency) })));
</script>

<template>
  <div class="page">
    <section class="hero">
      <p class="eyebrow">Token / Coding Plan</p>
      <h1>订阅套餐独立比较</h1>
      <p class="lede">月费并不等于可直接折算的 Token 单价。我们同时核对额度语义、周期、可用模型与自动化或应用后端用途限制。</p>
    </section>

    <EmptyState
      v-if="planRows.length === 0"
      eyebrow="Verified only"
      title="暂无满足核价纪律的 Plan 条目"
      :message="`截至 ${DATA_VERIFIED_AT}，还没有录入可完整确认月费、额度语义和用途限制的订阅型套餐。未核验条目不会参与比较，我们也不会用演示数字填满表格。`"
      hint="后续条目只有在官方来源、核验日期与关键限制齐全后才会出现。"
    />

    <template v-else>
      <div v-if="isDesktop" class="table-wrap">
        <table class="plan-table">
          <caption class="sr-only">Token Plan 月费与限制</caption>
          <colgroup>
            <col class="col-plan" />
            <col class="col-fee" />
            <col class="col-allowance" />
            <col class="col-cycle" />
            <col class="col-models" />
            <col class="col-limits" />
            <col class="col-source" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">厂商 / 套餐</th>
              <th scope="col">月费（原币种）</th>
              <th scope="col">额度语义</th>
              <th scope="col">周期</th>
              <th scope="col">可用模型</th>
              <th scope="col">用途限制</th>
              <th scope="col">来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="plan in planRows" :key="plan.item.id">
              <td><strong>{{ plan.item.provider }}</strong><br />{{ plan.item.plan }}</td>
              <td class="cell-price">
                <span class="price-main">{{ plan.cell.main }}</span>
                <span v-if="plan.cell.sub" class="price-sub">{{ plan.cell.sub }}</span>
              </td>
              <td>{{ plan.item.allowance ?? '待核验' }}</td>
              <td>{{ plan.item.billingCycle ?? '待核验' }}</td>
              <td>{{ plan.item.availableModels.length > 0 ? plan.item.availableModels.join('、') : '待核验' }}</td>
              <td>{{ plan.item.usageRestrictions ?? '待核验' }}</td>
              <td>
                <a :href="plan.item.sourceUrl" rel="noreferrer" target="_blank">官方页面</a>
                <span class="price-sub">{{ plan.item.verifiedAt }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ul v-else class="price-cards">
        <li v-for="plan in planRows" :key="plan.item.id" class="price-cards-item">
          <article class="price-card">
            <header class="price-card-head">
              <p class="price-card-provider">{{ plan.item.provider }}</p>
              <h3 class="price-card-model">{{ plan.item.plan }}</h3>
            </header>
            <div class="price-card-prices">
              <div class="price-cell">
                <span class="price-cell-label">月费（原币种）</span>
                <strong class="price-main">{{ plan.cell.main }}</strong>
                <span v-if="plan.cell.sub" class="price-sub">{{ plan.cell.sub }}</span>
              </div>
            </div>
            <details class="fold fold-row">
              <summary>详情</summary>
              <dl class="detail-list">
                <div><dt>额度语义</dt><dd>{{ plan.item.allowance ?? '待核验' }}</dd></div>
                <div><dt>周期</dt><dd>{{ plan.item.billingCycle ?? '待核验' }}</dd></div>
                <div><dt>可用模型</dt><dd>{{ plan.item.availableModels.length > 0 ? plan.item.availableModels.join('、') : '待核验' }}</dd></div>
                <div><dt>用途限制</dt><dd>{{ plan.item.usageRestrictions ?? '待核验' }}</dd></div>
                <div>
                  <dt>来源页</dt>
                  <dd>
                    <a :href="plan.item.sourceUrl" rel="noreferrer" target="_blank">官方页面</a>
                    <span class="price-sub">核验于 {{ plan.item.verifiedAt }}</span>
                  </dd>
                </div>
              </dl>
            </details>
          </article>
        </li>
      </ul>
    </template>
  </div>
</template>
