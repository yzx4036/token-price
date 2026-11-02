<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import ConclusionCards, { type Conclusion } from '../components/ConclusionCards.vue';
import EmptyState from '../components/EmptyState.vue';
import { useIsDesktop, useFoldOpenByDefault } from '../composables/useMediaQuery';
import { DATA_VERIFIED_AT, apiPrices, fxRate, providers, tokenPlans } from '../lib/data';
import { marketBadge } from '../lib/market';
import type { RegionFilter } from '../lib/filters';
import { formatMonthly } from '../lib/format';
import { OFFICIAL_PRICE_LABEL } from '../lib/copy';
import { formatRate } from '../lib/fx';
import { allowanceValueSentence, breakEvenSentence, computeBreakEven, pickBasisModel } from '../lib/plan-vs-api';
import {
  filterPlansByRegion,
  sortPlans,
  type PlanSortKey,
  type PlanSortOrder,
} from '../lib/plans';
import { computePlanConclusions } from '../lib/stats';
import { tokenEstimates } from '../lib/data';
import { estimateCell, rangeLabel, isOptimisticTier } from '../lib/token-estimate-view';
import { readPlanStateFromUrl, writePlanStateToUrl } from '../lib/url-state';
import SubLine from '../components/SubLine.vue';
import { natureBadge, natureHint, countMixed } from '../lib/allowance';

const isDesktop = useIsDesktop();
const foldOpen = useFoldOpenByDefault();

const region = ref<RegionFilter>('all');
const sortBy = ref<PlanSortKey>('monthlyPrice');
const order = ref<PlanSortOrder>('asc');
const urlReady = ref(false);

const regionByProviderId = Object.fromEntries(providers.map((p) => [p.id, p.region]));

function monthlyCell(price: number | null, currency: 'CNY' | 'USD'): { main: string; sub: string } {
  if (price === null) return { main: '待核验', sub: '' };
  if (currency === 'CNY') return { main: formatMonthly(price, 'CNY'), sub: OFFICIAL_PRICE_LABEL };
  if (!fxRate) return { main: formatMonthly(price, 'USD'), sub: '汇率数据缺失，暂不给人民币估算' };
  const cny = (price * fxRate.rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    main: formatMonthly(price, 'USD'),
    sub: `≈ ¥${cny} · 按 ${formatRate(fxRate.rate)} 估算（${fxRate.date}）`,
  };
}

/**
 * 额度核心：只取第一小句（「每 5 小时 6,000 次请求」这种），完整文本进详情折叠。
 * 目的是让主表一行放得下，而不是删掉信息。
 */
function allowanceBrief(allowance: string | null): string {
  if (!allowance) return '待核验';
  const brief = allowance.split(/[；;。]/)[0] ?? allowance;
  return brief.length > 42 ? `${brief.slice(0, 42)}…` : brief;
}

const filtered = computed(() =>
  sortPlans(filterPlansByRegion(tokenPlans, region.value, regionByProviderId), sortBy.value, order.value),
);

const mixedCount = computed(() => countMixed(tokenPlans));
const SURFACE_LABEL: Record<'official-only' | 'official-and-third-party' | 'unknown', string> = {
  'official-only': '仅官方产品内',
  'official-and-third-party': '官方产品与第三方工具内',
  unknown: '入口官方未写明',
};

/** 把结构化的「不限量」拼成一句可读口径，避免读者把「不限量」读成「随便用」 */
function unlimitedText(u: { feature: string; models: string[]; surface: keyof typeof SURFACE_LABEL; constrains: string; note: string | null }): string {
  // 用冒号引出模型清单，避免与模型名自带的括号嵌套（如「GPT-5.6 Luna（含 Think）」）
  const models = u.models.length > 0 ? `：${u.models.join('、')}` : '';
  const note = u.note ? `；${u.note}` : '';
  return `${u.feature}${models}，${SURFACE_LABEL[u.surface]}；${u.constrains}${note}`;
}

const quotaCount = computed(() => tokenPlans.filter((p) => p.allowanceNature === 'quota').length);
const undisclosedCount = computed(() => tokenPlans.filter((p) => p.allowanceNature === 'undisclosed').length);

const hasInternational = computed(() => planRows.value.some((row) => marketBadge(row.item) !== null));

const planRows = computed(() =>
  filtered.value.map((item) => {
    const est = tokenEstimates.estimates[item.id] ?? null;
    // 折算列的三段文案在 lib 里算好（价格字段不许在视图层直接读）
    const cellEst = estimateCell(est, item.monthlyPrice);
    // issue #6：套餐 ↔ API 的桥。基准模型只在本厂商内选，选不到就不给数（见 pickBasisModel 注释）
    const basisModel = pickBasisModel(item, apiPrices);
    const breakEven = basisModel ? computeBreakEven(item, basisModel) : null;
    // 已有的「折算可用 token」列（est.blendedMillion）= 官方额度换算。
    // 它与保本点是两个不同的问题，数值能差 10 倍以上，所以这里补一句「用满值多少钱」
    // 把两者串成一条线：官方额度给上界，保本点给临界点。
    const officialTotal = est?.blendedMillion ?? null;
    const allowanceWorth = officialTotal !== null && basisModel
      ? allowanceValueSentence(officialTotal, basisModel, item)
      : null;
    return {
      item,
      cell: monthlyCell(item.monthlyPrice, item.billingCurrency),
      estMain: cellEst.main,
      estSub: cellEst.sub,
      estTier: cellEst.tier,
      estRange: est ? rangeLabel(est) : null,
      estOptimistic: est ? isOptimisticTier(est) : false,
      est,
      /** 等效 API 用量的一句话结论（已含「反推」「基准模型」「比例假设」三要素） */
      breakEvenText: breakEven
        ? breakEvenSentence(breakEven)
        : '无同厂商按量 API 条目可比，不做等效折算。',
      /** 是否算出了保本点，用于决定文案样式 */
      hasBreakEven: breakEven?.kind === 'break_even',
      /** 官方额度「用满相当于按量多少钱」——把保本点与官方折算列串成一条线，避免两个数打架 */
      allowanceWorth,
    };
  }),
);

function presentCheapest(best: ReturnType<typeof computePlanConclusions>['CNY'], currency: 'CNY' | 'USD'): { value: string; note: string } | null {
  if (!best) return null;
  const who = `${best.plan.provider} ${best.plan.plan}${best.price === 0 ? '（免费档）' : ''}`;
  // 并列最低价不止一家时补一句，否则读者会把另一家同价档误当成更贵
  const tie = best.tiedCount > 1 ? `，共 ${best.tiedCount} 档并列` : '';
  return { value: formatMonthly(best.price, currency), note: `${who}${tie}` };
}

const conclusions = computed<Conclusion[]>(() => {
  const result = computePlanConclusions(tokenPlans);
  const cny = presentCheapest(result.CNY, 'CNY');
  const usd = presentCheapest(result.USD, 'USD');
  const scopeNote = `已排除 ${result.scope.excludedFree} 个免费/未标价档`;
  return [
    { label: '人民币最低付费月费', value: cny?.value ?? '—', note: cny ? `${cny.note} · ${scopeNote}` : '无 CNY 付费档位' },
    { label: '美元最低付费月费', value: usd?.value ?? '—', note: usd ? `${usd.note} · ${scopeNote}` : '无 USD 付费档位' },
    { label: '收录档位', value: `${result.plans} 档`, note: `免费档 ${result.scope.excludedFree} · 付费档 ${result.scope.considered}` },
  ];
});

function toggleSort(key: PlanSortKey): void {
  if (sortBy.value === key) order.value = order.value === 'asc' ? 'desc' : 'asc';
  else {
    sortBy.value = key;
    order.value = 'asc';
  }
}

const REGIONS: { value: RegionFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'cn', label: '国内' },
  { value: 'intl', label: '国外' },
];

function sortLabel(key: PlanSortKey): string {
  if (sortBy.value !== key) return '';
  return order.value === 'asc' ? '▲' : '▼';
}

// 与 API 页同一套 URL 约定，只在客户端读写
onMounted(() => {
  const state = readPlanStateFromUrl(window.location.search);
  region.value = state.region;
  sortBy.value = state.sortBy;
  order.value = state.order;
  urlReady.value = true;
});
watch([region, sortBy, order], () => {
  if (typeof window === 'undefined' || !urlReady.value) return;
  const search = writePlanStateToUrl({ region: region.value, sortBy: sortBy.value, order: order.value });
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}${window.location.hash}`);
});
</script>

<template>
  <div class="page">
    <section class="hero hero-compact">
      <div class="hero-head">
        <div class="hero-text">
          <p class="eyebrow">Token / Coding Plan</p>
          <h1>Token Plan / Coding Plan 套餐对比</h1>
          <p class="meta">月费不等于可折算的 Token 单价 · 核验日期 {{ DATA_VERIFIED_AT }} · 额度语义、周期、模型与用途限制逐项核过</p>
        </div>
        <ConclusionCards :items="conclusions" />
      </div>

    </section>

    <section class="section-tight" aria-label="筛选与排序">
      <div class="filter-bar filter-bar-plans">
        <div class="filter-field filter-segment-field">
          <span id="plan-region-label">地区</span>
          <div class="segmented" role="group" aria-labelledby="plan-region-label">
            <button
              v-for="item in REGIONS"
              :key="item.value"
              type="button"
              class="segment"
              :class="{ 'is-active': region === item.value }"
              :aria-pressed="region === item.value"
              @click="region = item.value"
            >{{ item.label }}</button>
          </div>
        </div>

        <div class="filter-field filter-segment-field">
          <span id="plan-sort-label">排序</span>
          <div class="segmented" role="group" aria-labelledby="plan-sort-label">
            <button
              type="button"
              class="segment"
              :class="{ 'is-active': sortBy === 'monthlyPrice' }"
              :aria-pressed="sortBy === 'monthlyPrice'"
              @click="toggleSort('monthlyPrice')"
            >月费 {{ sortLabel('monthlyPrice') }}</button>
            <button
              type="button"
              class="segment"
              :class="{ 'is-active': sortBy === 'provider' }"
              :aria-pressed="sortBy === 'provider'"
              @click="toggleSort('provider')"
            >厂商 {{ sortLabel('provider') }}</button>
          </div>
        </div>

        <button
          type="button"
          class="filter-order"
          :aria-label="order === 'asc' ? '当前升序，点击切为降序' : '当前降序，点击切为升序'"
          @click="order = order === 'asc' ? 'desc' : 'asc'"
        >{{ order === 'asc' ? '↑ 升序' : '↓ 降序' }}</button>
      </div>
    </section>

    <EmptyState
      v-if="planRows.length === 0"
      eyebrow="No match"
      title="当前地区没有收录的套餐"
      :message="`截至 ${DATA_VERIFIED_AT}，该地区还没有录入可完整确认月费、额度语义和用途限制的订阅套餐。切回「全部」可看全部档位。`"
      hint="未核验条目不会参与比较，我们也不会用演示数字填满表格。"
    />

    <template v-else>
      <div v-if="isDesktop" class="table-wrap">
        <table class="plan-table">
          <caption class="sr-only">Token Plan 月费与额度</caption>
          <colgroup>
            <col class="col-plan" />
            <col class="col-fee" />
            <col class="col-allowance" />
            <col class="col-estimate" />
            <col class="col-detail" />
          </colgroup>
          <thead>
            <tr>
              <th
                scope="col"
                class="th-sortable"
                :class="{ 'th-active': sortBy === 'provider' }"
                :aria-sort="sortBy === 'provider' ? (order === 'asc' ? 'ascending' : 'descending') : 'none'"
              >
                <button type="button" class="th-button" @click="toggleSort('provider')">
                  <span>厂商 / 套餐</span><span class="sort-indicator" aria-hidden="true">{{ sortLabel('provider') }}</span>
                </button>
              </th>
              <th
                scope="col"
                class="th-sortable"
                :class="{ 'th-active': sortBy === 'monthlyPrice' }"
                :aria-sort="sortBy === 'monthlyPrice' ? (order === 'asc' ? 'ascending' : 'descending') : 'none'"
              >
                <button type="button" class="th-button" @click="toggleSort('monthlyPrice')">
                  <span>月费（原币种）</span><span class="sort-indicator" aria-hidden="true">{{ sortLabel('monthlyPrice') }}</span>
                </button>
              </th>
              <th scope="col">额度核心</th>
              <th scope="col">
                折算可用 token
                <span class="th-hint" title="官方/估算口径不同，见每行的口径标注与详情">?</span>
              </th>
              <th scope="col">详情</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="plan in planRows" :key="plan.item.id">
              <td>
                <strong>{{ plan.item.provider }}</strong><br />{{ plan.item.plan
                }}<span v-if="marketBadge(plan.item)" class="market-badge" :title="`${plan.item.provider} 面向海外市场的独立品牌与定价，不是国内站的人民币套餐`">{{ marketBadge(plan.item) }}</span>
              </td>
              <td class="cell-price">
                <span class="price-main">{{ plan.cell.main }}</span>
                <span v-if="plan.cell.sub" class="price-sub"><SubLine :text="plan.cell.sub" /></span>
              </td>
              <td class="cell-brief">
                {{ allowanceBrief(plan.item.allowance)
                }}<span
                  v-if="natureBadge(plan.item.allowanceNature)"
                  class="nature-badge"
                  :title="natureHint(plan.item.allowanceNature)"
                >{{ natureBadge(plan.item.allowanceNature) }}</span>
              </td>
              <td class="cell-estimate">
                <span class="score-main" :class="{ 'score-none': plan.estMain === '—' }">{{ plan.estMain }}</span>
                <span class="score-tier">{{ plan.estSub }}</span>
              </td>
              <td class="cell-detail">
                <details class="fold fold-cell">
                  <summary>详情</summary>
                  <dl class="detail-list">
                    <div v-if="plan.est">
                      <dt>折算依据</dt>
                      <dd>
                        {{ plan.est.method }}
                        <a :href="plan.est.sourceUrl" rel="noreferrer" target="_blank">来源页</a>
                      </dd>
                    </div>
                    <div v-if="plan.est?.assumption">
                      <dt>计算假设</dt>
                      <dd>
                        {{ plan.est.assumption }}
                        <span v-if="plan.estRange" class="estimate-range">{{ plan.estRange }}</span>
                        <span v-if="plan.estOptimistic" class="nature-badge">相对偏乐观</span>
                      </dd>
                    </div>
                    <!-- issue #6：反推的等效量，与上面「完整额度」（官方披露）明确分开 -->
                    <div class="breakeven-row" :class="{ 'breakeven-none': !plan.hasBreakEven }">
                      <dt>保本点（订阅 vs 按量）</dt>
                      <dd>{{ plan.breakEvenText }}</dd>
                      <dd v-if="plan.allowanceWorth" class="breakeven-worth">{{ plan.allowanceWorth }}</dd>
                    </div>
                    <div><dt>完整额度（官方披露）</dt><dd>{{ plan.item.allowance ?? '待核验' }}</dd></div>
                    <div><dt>周期</dt><dd>{{ plan.item.billingCycle ?? '待核验' }}</dd></div>
                    <div><dt>可用模型</dt><dd>{{ plan.item.availableModels.length > 0 ? plan.item.availableModels.join('、') : '待核验' }}</dd></div>
                    <div><dt>用途限制</dt><dd>{{ plan.item.usageRestrictions ?? '待核验' }}</dd></div>
                    <div v-if="plan.item.unlimited">
                      <dt>不限量范围</dt>
                      <dd>{{ unlimitedText(plan.item.unlimited) }}</dd>
                    </div>
                    <div>
                      <dt>来源页</dt>
                      <dd>
                        <a :href="plan.item.sourceUrl" rel="noreferrer" target="_blank">官方页面</a>
                        <span class="price-sub"><SubLine :text="plan.item.verifiedAt" /></span>
                      </dd>
                    </div>
                  </dl>
                </details>
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
              <h3 class="price-card-model">
                {{ plan.item.plan
                }}<span v-if="marketBadge(plan.item)" class="market-badge">{{ marketBadge(plan.item) }}</span>
              </h3>
            </header>
            <div class="price-card-prices">
              <div class="price-cell">
                <span class="price-cell-label">月费（原币种）</span>
                <strong class="price-main">{{ plan.cell.main }}</strong>
                <span v-if="plan.cell.sub" class="price-sub"><SubLine :text="plan.cell.sub" /></span>
              </div>
            </div>
            <div class="price-card-score">
              <span class="score-chip" :class="`chip-${plan.estTier}`">
                折算可用 <strong>{{ plan.estMain }}</strong>
                <em>{{ plan.estSub }}</em>
              </span>
            </div>
            <p class="price-card-brief">
              {{ allowanceBrief(plan.item.allowance)
              }}<span
                v-if="natureBadge(plan.item.allowanceNature)"
                class="nature-badge"
                :title="natureHint(plan.item.allowanceNature)"
              >{{ natureBadge(plan.item.allowanceNature) }}</span>
            </p>
            <details class="fold fold-row">
              <summary>详情</summary>
              <dl class="detail-list">
                <div v-if="plan.est">
                  <dt>折算依据</dt>
                  <dd>{{ plan.est.method }} <a :href="plan.est.sourceUrl" rel="noreferrer" target="_blank">来源页</a></dd>
                </div>
                <div class="breakeven-row" :class="{ 'breakeven-none': !plan.hasBreakEven }">
                  <dt>保本点（订阅 vs 按量）</dt>
                  <dd>{{ plan.breakEvenText }}</dd>
                  <dd v-if="plan.allowanceWorth" class="breakeven-worth">{{ plan.allowanceWorth }}</dd>
                </div>
                <div><dt>完整额度（官方披露）</dt><dd>{{ plan.item.allowance ?? '待核验' }}</dd></div>
                <div><dt>周期</dt><dd>{{ plan.item.billingCycle ?? '待核验' }}</dd></div>
                <div><dt>可用模型</dt><dd>{{ plan.item.availableModels.length > 0 ? plan.item.availableModels.join('、') : '待核验' }}</dd></div>
                <div><dt>用途限制</dt><dd>{{ plan.item.usageRestrictions ?? '待核验' }}</dd></div>
                <div v-if="plan.item.unlimited">
                  <dt>不限量范围</dt>
                  <dd>{{ unlimitedText(plan.item.unlimited) }}</dd>
                </div>
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

    <p class="meta filter-summary filter-summary-after">共 {{ planRows.length }} 档 · 缺价条目始终排在所属币种组末尾</p>
    <p v-if="hasInternational" class="meta market-note">
      <span class="market-badge">国际版</span>
      标记的条目是同一厂商面向海外市场的独立品牌（例如智谱的 Z.AI、月之暗面的 kimi.ai），
      以美元挂牌、与国内站的同名套餐是两套互不通用的定价，不能直接比价。
    </p>
    <p v-if="mixedCount > 0" class="meta nature-note">
      <span class="nature-badge">部分不限量</span>
      <span>{{ mixedCount }} 档存在真·不限量项，但天花板在别处。OpenAI 的日常文本对话四档都不限量，可最新的 GPT-6 全系连 Pro 档也只是「扩展额度」，反而是上一代 GPT-5.6 在 Pro 上才不限量；Copilot 与 CodeBuddy 则是代码补全不限量、对话与 agent 走积分或 Credits。其余 {{ quotaCount }} 档为纯额度制{{ undisclosedCount > 0 ? `，另有 ${undisclosedCount} 档官方未披露数值` : '' }}；Claude 官方原话是 Every plan has usage limits。</span>
    </p>

    <p class="meta estimate-note">
      <strong>折算可用 token 的口径。</strong>
      {{ tokenEstimates.coverage.withNumbers }} 档能算出数、{{ tokenEstimates.coverage.withoutNumbers }} 档算不出（只给了定性描述或未公开换算率）。能出数的四档口径不同，
      每行详情里写明了「计算假设」：官方货币锚定与按 $ 额度折算的，一律按
      <strong>零缓存命中 + 标准时段价 + 输入输出 3:1</strong> 估算；
      官方额度表那 6 档（智谱 / Z.AI）用的是官方给的区间<strong>中点</strong>，但官方区间本身
      已含 <strong>98% 缓存命中</strong>假设，所以这几档相对其它档<strong>偏乐观</strong>，已在行内标注。
      编码场景的缓存读单价通常远低于输入价，所以「零缓存」这一侧的估算会系统性偏低 ——
      两组数字只能各自和同口径比，不能跨口径直接比大小。
    </p>

    <details class="fold" :open="foldOpen">
      <summary>为什么不按「最便宜」统一排名</summary>
      <div class="fold-body">
        <p class="lede">
          订阅是按月买额度，不是按 Token 买量，所以不能和 API 单价混在一起比。同一档位在不同厂商之间的额度口径也不同（有的给请求次数、有的给积分、有的给 Credit），我们只如实呈现标价与额度语义，不替读者折算。
        </p>
        <p class="lede">
          另外，页面里出现的「不限量」一律指官方原文里的那一项，且都标了范围：不限的是哪项能力（例如 IDE 内联补全、Instant 日常对话）、在哪个入口成立（仅官方产品内，还是官方产品与第三方工具都算）、以及附带条件（滥用防护、速率限制、限免活动）。同一模型经 API 调用通常另按 Token 计费，不在这份额度的覆盖范围内 —— 「不限量」不等于「无限调用」。
        </p>
      </div>
    </details>

  </div>
</template>
