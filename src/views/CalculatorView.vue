<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { computeCostDisplay } from '../lib/cost-display';
import { apiPrices, fxRate, tokenPlans } from '../lib/data';
import { RATE_DISCLAIMER, formatRate } from '../lib/fx';
import { comparePlansForUsage, toMillion } from '../lib/plan-vs-api';
import { parseUsageInput, type UsageInput } from '../lib/pricing';

const calculablePrices = apiPrices.filter((item) => item.status === 'verified');
const modelId = ref(calculablePrices[0]?.id ?? '');

const usage = reactive<Record<keyof UsageInput, string>>({
  input: '1000000',
  output: '100000',
  cacheRead: '0',
  cacheWrite: '0',
});

/**
 * ⚠️ 这里必须手动取字符串，不能用 v-model：
 * Vue 对 <input type="number"> 的 v-model 会自动套 .number 修饰（castToNumber），
 * 把值转成 number 后再交给 parseUsageInput，后者按 `raw.trim()` 判空会直接抛 TypeError。
 * 所以统一绑 :value + @input，始终保持 string，由 lib 层负责解析与 fail-closed。
 */
function onUsageInput(key: keyof UsageInput, event: Event): void {
  const target = event.target as HTMLInputElement | null;
  usage[key] = target?.value ?? '';
}

const display = computed(() => {
  const model = calculablePrices.find((item) => item.id === modelId.value);
  return model ? computeCostDisplay(model, usage, fxRate) : null;
});

/**
 * issue #6：订阅 vs 按量对比。
 *
 * 用当前选中的模型作基准，拿同一份用量去算「买套餐」与「按量付费」差多少。
 * 用量解析复用同一份 parseUsageInput，避免两处对「空值/负数」判定不一致。
 */
const comparisons = computed(() => {
  const model = calculablePrices.find((item) => item.id === modelId.value);
  if (!model) return [];
  const parsed = parseUsageInput(usage);
  if (!parsed.ok) return [];
  return comparePlansForUsage(
    tokenPlans,
    model,
    {
      inputMillion: toMillion(parsed.usage.input),
      outputMillion: toMillion(parsed.usage.output),
    },
    fxRate,
  );
});

/** 对比区默认只展开前几行，避免 50 个套餐把页面撑成清单 */
const showAllComparisons = ref(false);
const visibleComparisons = computed(() =>
  showAllComparisons.value ? comparisons.value : comparisons.value.slice(0, 6),
);
</script>

<template>
  <div class="page">
    <section class="hero">
      <p class="eyebrow">Cost calculator</p>
      <h1>月度 Token 成本计算器（API 用量费用对比）</h1>
      <p class="lede">
        公式为各类 Token 数量 ÷ 1,000,000 × 对应单价，再求和。结果主值取厂商账单币种：国际厂商给美元金额，紧跟一行「≈ 人民币（按 {{ formatRate(fxRate.rate) }} 估算 · {{ fxRate.date }}）」；国内厂商直接给人民币标价，不带估算标注。聚合数据由聚合源以 USD 发布，即使是国内厂商也只标「聚合数据」，不标「官方标价」。
      </p>
      <p class="meta">{{RATE_DISCLAIMER}}</p>
    </section>

    <div class="calculator">
      <form class="card" aria-label="成本计算输入" @submit.prevent>
        <label class="field">
          <span>模型与计价口径</span>
          <select v-model="modelId" name="model">
            <option v-for="item in calculablePrices" :key="item.id" :value="item.id">{{ item.provider }} · {{ item.model }}</option>
          </select>
        </label>

        <div class="usage-grid section-tight">
          <label class="field">
            <span>Input Token / 月</span>
            <input
              :value="usage.input"
              name="input"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              required
              @input="onUsageInput('input', $event)"
            />
          </label>
          <label class="field">
            <span>Output Token / 月</span>
            <input
              :value="usage.output"
              name="output"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              required
              @input="onUsageInput('output', $event)"
            />
          </label>
          <label class="field">
            <span>Cache read Token / 月</span>
            <input
              :value="usage.cacheRead"
              name="cacheRead"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              required
              @input="onUsageInput('cacheRead', $event)"
            />
          </label>
          <label class="field">
            <span>Cache write Token / 月</span>
            <input
              :value="usage.cacheWrite"
              name="cacheWrite"
              type="number"
              min="0"
              step="1"
              inputmode="numeric"
              required
              @input="onUsageInput('cacheWrite', $event)"
            />
          </label>
        </div>
      </form>

      <section class="result" aria-live="polite">
        <span class="result-label">估算月成本（主值 = 厂商账单币种）</span>
        <div class="result-output">{{ display?.main ?? '—' }}</div>
        <p class="result-sub">{{ display?.sub ?? '—' }}</p>
        <p class="result-detail">{{ display?.detail ?? '选择模型并填写每月用量。' }}</p>
      </section>
    </div>

    <!-- issue #6：订阅 vs 按量。同一份用量，一边是按量付费，一边是买套餐 -->
    <section v-if="comparisons.length > 0" class="section plan-compare">
      <h2>订阅套餐 vs 按量付费</h2>
      <p class="plan-compare-lede">
        用上面填的用量和当前选中模型的 API 单价，逐个对比「买套餐」与「按量付费」。
        套餐月费取厂商公开价，按量成本按
        <strong>输入 × 输入单价 + 输出 × 输出单价</strong>
        计算，不含缓存读写费用（对比只用这两项，与计算器主结果口径不同，见下方说明）。
      </p>

      <ul class="plan-compare-list">
        <li
          v-for="row in visibleComparisons"
          :key="row.plan.id"
          class="plan-compare-row"
          :class="`winner-${row.winner}`"
        >
          <div class="plan-compare-name">
            <strong>{{ row.plan.provider }} · {{ row.plan.plan }}</strong>
            <span class="meta">月费 {{ row.planCostText }}</span>
            <span v-if="row.cnySub" class="price-sub">{{ row.cnySub }}</span>
          </div>
          <div class="plan-compare-numbers">
            <span class="meta">按量 {{ row.apiCostText }}</span>
            <strong class="plan-compare-verdict">{{ row.verdictText }}</strong>
          </div>
        </li>
      </ul>

      <button
        v-if="comparisons.length > 6"
        class="button button-ghost"
        type="button"
        @click="showAllComparisons = !showAllComparisons"
      >
        {{ showAllComparisons ? '收起' : `展开全部 ${comparisons.length} 个可比套餐` }}
      </button>

      <p class="plan-compare-caveat">
        只列出「月费与当前模型币种一致」的套餐，跨币种不做比较（换汇会引入额外的估算误差）。
        免费档没有月费，不参与对比。套餐的真实额度语义（「每 5 小时上限」「不限量」等）各有不同，
        这里的结论只回答「同样这些 token 按量买要多少钱」，不代表套餐一定够你用 ——
        具体额度见 <RouterLink to="/plans/">套餐页</RouterLink> 每行的详情。
      </p>
    </section>

    <div class="callout section">
      <p>
        结果只包含表中四类 Token 费用，不含缓存存储费、工具调用、税费或其他附加费用。缺少某类价格且对应使用量大于 0 时，计算会直接停止（fail closed），不给部分总价。美元金额是厂商标价，人民币金额为按 {{ formatRate(fxRate.rate) }} 汇率估算的参考值；缺汇率时美元结果照常给出，人民币位置明确显示「汇率缺失，无法估算」。
      </p>
      <p>{{RATE_DISCLAIMER}}</p>
    </div>

    <noscript>
      <p class="callout section">成本计算器需要启用 JavaScript；API 比价、数据来源与数据口径页面无需 JavaScript 即可阅读。</p>
    </noscript>
  </div>
</template>
