# v0.8.0 返工结果（OpenCode 执行体）

## 0. 效力声明

本轮返工由 **OpenCode（deepseek-flash）执行**，而它同时是本迭代的**设计者**（architecture.md / implementation-plan.md 的产出侧）。原编码者 Codex 账号额度耗尽（14:48 恢复），因此本轮**返工与设计同源**：本文件所有「已修」结论只声明「改动已完成 + 断言可红（附实测变异）」，不声称独立验收。**最终验收由编排层亲跑复验**（`npm run build`、`node scripts/qa/run-gates.mjs`、静态产物 grep）。为压低确认偏差，每条新断言都给出了可复现的变异方式与实际失败输出。

范围纪律：只修 `REVIEW-OPENCODE.md` 的 B-1 与 N-2～N-10（N-1、N-9 按编排层裁定不做），未新增功能、未改设计方向、未重构已通过部分，未做任何 git 操作，未跑 build / run-gates。

## 1. 逐条返工记录

### B-1.1 `polylineIntersections` 几何断言（纯测试）

- **改了什么**：`tests/chart-geometry.test.ts` 的 import 补上 `polylineIntersections`，新增 6 条用例覆盖交叉（负坐标）、多交点顺序、平行、共线重叠、单点/零长/空折线、重复交点去重、非有限坐标跳过。
- **落点**：`tests/chart-geometry.test.ts:2`（import）、`:75-104`（新 describe「折线交点」）。
- **新增断言**：
  - `交叉给出精确交点，负坐标不丢`（`:76`）：`([{x:-10,y:-10},{x:0,y:0}] × [{x:-10,y:0},{x:0,y:-10}])` → `[{x:-5,y:-5}]`。
  - `多交点按首次出现顺序返回`（`:80`）：→ `[{x:5,y:5},{x:15,y:5}]`。
  - `平行与共线重叠都不伪造交点`（`:85`）：平行、完全共线、部分共线三条均为 `[]`。
  - `单点、零长线段与空折线无交点`（`:90`）。
  - `同一位置的重复交点去重：折返线只留一个点`（`:95`）。
  - `非有限坐标的线段被跳过，其余线段照常求交`（`:100`）。
- **变异与实测**：
  1. `src/lib/chart-geometry.ts:83` 去掉去重判断（`if (!points.some(...)) points.push(point)` → `points.push(point)`）→ `重复交点去重` 用例 **红**：`expected [ {x:5,y:5}, {x:5,y:5} ] to deeply equal [ {x:5,y:5} ]`。
  2. `src/lib/chart-geometry.ts:78` 删掉平行/共线判定 → `平行与共线重叠都不伪造交点` 与 `单点、零长线段与空折线无交点` **红**（`expected [ {x:NaN,y:NaN} ] to deeply equal []`）。
  3. `polylineIntersections` 末尾 `return points;` 改成 `return [];` → 交叉/多交点/去重/非有限 4 条 **红**。
  三处变异均已还原（`grep -n "points.some" src/lib/chart-geometry.ts` 回读确认）。

### B-1.2 `buildUsageCostChart` 全链路断言（纯测试）

- **改了什么**：`tests/pricing-chart-data.test.ts` 新增 `describe('用量-成本曲线')`，共 7 条用例；import 补 `buildUsageCostChart`、`tokenPlans`、`DATA_VERIFIED_AT` 及 `comparePlanVsApi / computeBreakEven / allowanceValueSentence / DEFAULT_BLEND_RATIO`。
- **落点**：`tests/pricing-chart-data.test.ts:171-280`（另 import 在 `:2`、`:4-5`）。
- **新增断言与变异**：

| 判据 | 断言位置 | 用例名 | 实测读数 | 变异方式 → 实测结果 |
|---|---|---|---|---|
| 每 `pair.modelId` 的 API 条目 `billingCurrency` == 组币种 | `:182-184` | 跨币种不串味… | 10 组全部 `USD/CNY` 各自一致 | `pricing-chart-data.ts:240` `matched.filter(({plan}) => plan.billingCurrency === currency)` → `matched` → **红**：`expected 'CNY' to be 'USD'` |
| `total > shown`（且 `shown <= 5`） | `:178-180` | 同上 | USD 16/5、CNY 17/5 | `:242` `candidates.slice(0,5)` → `candidates` → **红**：`expected 16 to be less than or equal to 5` |
| 逐点对拍 `comparePlanVsApi({inputMillion:3*out, outputMillion:out})` | `:188-206` | 每个采样点与 comparePlanVsApi 同源… | 305 个采样点全等（USD 5×30 + CNY 5×31，`checked > 100`） | `:251` `total/(DEFAULT_BLEND_RATIO+1)` → `/(DEFAULT_BLEND_RATIO+2)` → **红**：`expected 3.2 to be 4` |
| 保本点处两线同值，与 `computeBreakEven.totalMillion` 对拍（相对误差 1e-6） | `:207-227` | 保本点作为采样点存在… | 10 组阈值全部落在采样点上（5/25/50/1.2475/4.9975M，6.667/33.33/57.14/9.077/41.38M），`apiCost == planCost == monthlyPrice` | 同一拆分变异 → **红**：`expected 0.2 to be less than 0.000001` |
| 交点反解回原成本（每个交点金额落在某套餐月费上） | `:228-240` | 交点反解回原成本… | USD 5 个、CNY 12 个交点，全部命中月费（20/100/200/4.99/19.99、40/200/118/538） | `:287` 反解改 `10 ** mapLinear(y,yRange,[log10(costDomain[0]),log10(costDomain[1])])` → `mapLinear(point.y, yRange(frame), costDomain)` → **红**：`交点 ≈5M 金额 1248.3713741758638` |
| 纵轴对数：每十倍用量 y 等距 + 1M→1000M 跨距 > 100 用户单位 | `:241-254` | 纵轴是对数… | 每组每十倍差恒为 -82.03（USD）/-69.61（CNY），跨距 246.1 / 208.8 | `:268` `apiY/planY` 的 `mapLog` → `mapLinear` → **红**：`expected 16.988… to be less than 0.0000018…` |
| `usageMillion` 传 `-5 / 0 / NaN / 1001` 回落 50 | `:255-267` | 负、零、NaN、越界用量回落到 50M… | 四值均 `usageMillion=50`、`currentLabel='当前用量 50M'`、`currentX=372.08`；`100` 时 `currentX` 更大 | `:228` 下界 `usageMillion >= 1` → `>= 0` → **红**：`expected +0 to be 50` |

- **关于「1M 与 1000M 的 y 差 > 100」这条**：实测该断言**不足以证伪线性轴**——线性轴下 1M 与 1000M 恰好是域两端附近，跨距约 209 用户单位同样 > 100。因此同一用例内加了**决定性的等距断言**（每个十倍的 y 差必须相等，1e-6 相对容差）：真实对数轴为恒值，线性轴为 `-1.89 / -18.9 / -188.7`。变异测试证伪用的是后一条（见上表末行），前者保留为题目要求的粗判据并在注释里写明线性轴下 1M→10M 只有约 1.9 用户单位。

### B-1.3 `UsageCostChart` 渲染断言（纯测试）

- **改了什么**：`tests/pricing-charts-render.test.ts` 新增真实 SSR 用例（用已安装的 Vite/Vue 服务端编译器渲染 `UsageCostChart.vue`）。
- **落点**：`tests/pricing-charts-render.test.ts:73-91`。
- **新增断言**：同时含 `API 单价精确折算` 与 `套餐按月费与 API 单价反推估算`（图例 + 每条 line 的 `<title>`）、`class="chart-current"` 与文字 `当前用量 50M`、`/NaN|Infinity|undefined/` 不命中、`<circle>` 数 == 交点总数（17）且每个 `<circle>` 紧跟 `<title>`。
- **变异与实测**：`UsageCostChart.vue:26` 删掉 circle 内的 `<title>{{ point.title }}</title>` → **红**：`expected [] to have a length of 17 but got +0`。

### N-2 行尾（`src/lib/pricing-chart-data.ts` CRLF → LF）

- **改前探针**（本机 13:13，N-3 改完后）：`bytes=21386 crlf=305 lf=305 bareLf=0`。
- **改法**：整文件 `\r\n` → `\n`（node 一次性重写，不做其它字符改动）。
- **改后探针**：`bytes=21081 crlf=0 lf=305`（305 行全部 LF，无 `\r`）。
- **其余文件行尾复查**（逐个探针，`crlf=0`）：`chart-geometry.ts`（87 LF）、`UsageCostChart.vue`（38）、`HistoryChart.vue`（37）、`global.css`（1347）、`ApiPricingView.vue`（179）、三个测试文件（105 / 281 / 120）。

### N-3 `buildHistoryChart` 的 `today` 改为调用方注入 + UTC 边界

- **改了什么**：
  1. `today` 从「默认 `new Date().toISOString()`」改为**必填第 4 参数**（无默认值，漏传就是类型错误），注释写明「必须由调用方注入数据侧日期；不读构建机时区」。
  2. 注入日期只作**截断上限**，最新快照日期永远有效：`const cutoff = newest && newest > today ? newest : today`。原因是实测 `DATA_VERIFIED_AT = 2026-11-01` 而真实快照是 `2026-11-09`（快照按抓取日、`verifiedAt` 按核验日），若直接拿注入日期硬切，页面上仍是「已 0 天」——这正是 N-3 要消除的状态。
  3. `ApiPricingView.vue` 改传 `DATA_VERIFIED_AT`。
- **落点**：`src/lib/pricing-chart-data.ts:140-154`（签名在 `:141`，夹取在 `:149-152`）；`src/views/ApiPricingView.vue:25`。
- **新增断言**：`tests/pricing-chart-data.test.ts:155-167`「UTC 边界：注入日期落后于快照日也不切掉当日快照，不产出「已 0 天」」——对 `today = 2026-11-08 / 2026-11-09 / DATA_VERIFIED_AT(2026-11-01)` 三值断言 `days === 1`、`status` 不含「已 0 天」、`groups.length > 0`，并断言视图源码里是 `buildHistoryChart(historyText, apiPrices, undefined, DATA_VERIFIED_AT)`。
- **变异与实测**：`src/lib/pricing-chart-data.ts:152` 改回 `const cutoff = today;` → **红**：`today=2026-11-08 不应丢掉快照: expected +0 to be 1`。
- 受签名影响，测试内所有 `buildHistoryChart` 调用都补了显式日期（`:98`、`:107`、`:116`、`:119`、`:129`、`:132`、`:138`、`:141`、`:143`、`:148`、`:151-153`、`:160`）；`tests/pricing-charts-render.test.ts:97` 的接线断言同步更新。

### N-4 移动端图内字号

- **改了什么**：`@media (max-width: 767px)` 内 `.pricing-chart text` 19px → **29px**、`.chart-label` 17px → **30px**，并写明推算（270px / 640 = 0.4219，28.5 用户单位才到 12px）。
- **落点**：`src/styles/global.css:1343-1346`。
- **新增断言**：`tests/pricing-charts-render.test.ts:113-118`，从图表段媒体查询里取两个 `font-size`，按 `* (270/640)` 断言 `>= 12`。
- **变异与实测**：字号退回 19/17 → **红**：`expected 8.015625 to be greater than or equal to 12`（与审查报告推算的 8.0px 一致）。

### N-5 B3 空态 figcaption

- **改了什么**：`HistoryChart.vue` 的 `v-if="!model.ready"` 分支也给 `SvgChartFrame` 传 `#legend`：一行当前状态、一行门槛（「门槛：连续 6 周（42 天）真实快照后才连走势线，最早 {{ expectedDate }} 达标；缺快照的日期留空，不插值」）。
- **落点**：`src/components/pricing-charts/HistoryChart.vue:14-17`。
- **新增断言**：`tests/pricing-charts-render.test.ts:34-39`——空态 HTML 含「门槛：连续 6 周（42 天）」，且 `<figcaption>` 去掉注释节点后文本长度 > 20（不再只剩两个空插槽）。
- **变异与实测**：删掉整个 `<template #legend>` → **红**：`expected '<section class="pricing-chart-panel" …' to contain '门槛：连续 6 周（42 天）'`。

### N-6 恒真断言（「便宜 USD 不支配 CNY」）

- **改了什么**：删掉两次单元素调用，改成**真正的反例断言**：`frontier([[1,10,'usd'],[10,5,'cny']])` 必须 `toEqual(['usd'])`——即把两币种塞进同一次调用会丢掉 CNY 点，证明 `paretoFrontier` 本身不认币种、隔离责任在调用方；注释指向 `pricing-chart-data.test.ts` 的前沿集合用例（真正的隔离证明）。
- **落点**：`tests/chart-geometry.test.ts:42-46`。
- **变异与实测**：`chart-geometry.ts:40` 去掉支配判定（`if (p.score <= best) return false;`）→ **红**：`expected [ 'usd', 'cny' ] to deeply equal [ 'usd' ]`。

### N-7 `points[0].frontier` 单点恒真

- **改了什么**：散点首条用例改成每币种多点 fixture（USD 4 点：同价高分/同价低分/更高分更贵；CNY 1 点），断言**前沿 ID 精确集合** `[['USD', ['usd-a','usd-b','usd-c']], ['CNY', ['cny']]]`，`usd-d`（与 `usd-b` 同价但分低）必须在集合外。
- **落点**：`tests/pricing-chart-data.test.ts:15-37`（集合断言 `:29-33`）。
- **变异与实测**：`chart-geometry.ts:40` 去掉支配判定 → **红**：`expected [['USD', …], …] to deeply equal [['USD', …], …]`（`usd-d` 混入前沿集合）。

### N-8 自证式 `guard` 断言

- **改了什么**：删除「静态守卫反例：把绘图移入 mounted 会失败」整条用例（测试内自定义 `guard`、第二条只证明字符串替换生效），保留注释说明删除原因；生产接线的判据由上一条用例在真实源码上断言（`buildHistoryChart(..., DATA_VERIFIED_AT)`、`buildScatterChart` 在 `onMounted` 之前）。
- **落点**：`tests/pricing-charts-render.test.ts:105-106`（删除处注释）。
- 未新增替代断言（原判据已在 `:92-104` 的源码断言里，重复断言没有信息量）；本轮没有为此放宽任何判据。

### N-10 3:1 拆分同口径

- **改了什么**：新增用例：取真实 `anthropic-claude-pro` 组，断言图内 `sample.usageMillion / (DEFAULT_BLEND_RATIO + 1) === 25`，再把同一 total 传 `allowanceValueSentence`，断言它返回的金额与图内采样点的 `apiCost` 取整后完全一致。
- **落点**：`tests/pricing-chart-data.test.ts:268-280`。
- **变异与实测**：`pricing-chart-data.ts:251` 拆分改 `/(DEFAULT_BLEND_RATIO+2)` → **红**：`expected '用满官方额度 ≈ 按量付费 $400（约月费的 20 倍）。' to contain '≈ 按量付费 $320'`（同一次变异也打穿了逐点对拍与保本点两条用例）。

## 2. 本轮改了哪些文件

产品代码（4 个文件，均为最小改动）：

1. `src/lib/pricing-chart-data.ts` — N-3（`today` 必填 + 快照日期夹取）、N-2（整文件转 LF）。usage 图的采样、对数轴、交点反解**未动**。
2. `src/views/ApiPricingView.vue` — 第 25 行传 `DATA_VERIFIED_AT`（N-3）。
3. `src/components/pricing-charts/HistoryChart.vue` — 空态补 `#legend`（N-5）。
4. `src/styles/global.css` — 图表移动段字号 29/30（N-4）。

测试（3 个文件）：

5. `tests/chart-geometry.test.ts` — B-1.1 六条交点用例 + N-6 反例改写。
6. `tests/pricing-chart-data.test.ts` — B-1.2 七条用例 + N-7 前沿集合 + N-3 UTC 边界 + N-10 同口径。
7. `tests/pricing-charts-render.test.ts` — B-1.3 用量图 SSR 用例 + N-5 空态 figcaption 断言 + N-4 字号比例断言 + N-8 删除 + 接线断言更新。

文档：

8. `docs/.hermes/tasks/20261109-v0.8.0-price-usage-curves/coding-result-rework.md`（本文件）。

未改：`src/lib/chart-geometry.ts`（只被变异测试临时改动并还原）、`src/components/pricing-charts/UsageCostChart.vue`（只被变异测试临时改动并还原）、`src/components/pricing-charts/SvgChartFrame.vue`、`PricingChartsSection.vue`、`ScatterChart.vue`、`CompositionChart.vue`、`scripts/metrics/copy-density.mjs`（工作区既有改动，非本轮）。

## 3. 红线复查

| 项 | 结论 | 证据 |
|---|---|---|
| 依赖未变 | 通过 | `package.json` 未改（`dependencies` 仍为 vue/vue-router/zod），未新增 devDependency |
| 数据文件未动 | 通过 | `src/data/**` 零改动（`git status --porcelain` 只有 `scripts/metrics/copy-density.mjs`、`src/styles/global.css`、`src/views/ApiPricingView.vue` 三个 M，其余为既有未跟踪新文件） |
| 无网络请求 | 通过 | 未新增 fetch/axios；新断言只读仓库内文件（`price-history.jsonl`、`global.css`、`ApiPricingView.vue`） |
| 行尾 | 通过 | `src/lib/pricing-chart-data.ts` `crlf=0 lf=305`；其余新/改文件逐个探针 `crlf=0` |
| 无 emoji | 通过 | 本文件与所有改动行均无 emoji |
| 颜色只用变量 | 通过 | `global.css` 图表段仍无 `#hex`/`rgb()`/`hsl()`（既有断言 `:109` 仍绿） |
| 无 git 操作 | 通过 | 全程未执行 `git add/commit/push`，未跑 `build` / `run-gates` |

## 4. 本轮自跑的命令与读数

- `npx.cmd vitest run tests/chart-geometry.test.ts tests/pricing-chart-data.test.ts tests/pricing-charts-render.test.ts` → **3 文件 / 52 项全过**（返工前 38 项）。
- `npx.cmd vitest run tests/chart-geometry.test.ts tests/pricing-chart-data.test.ts tests/pricing-charts-render.test.ts tests/layout-width.test.ts tests/ux-refactor.test.ts tests/layout-measure.test.ts tests/verify-static-build.test.ts tests/font-size.test.ts` → **8 文件 / 138 项全过**（F12 等既有断言未改）。
- `npx.cmd vitest run`（全量）→ **36 文件 / 632 项全过**（返工前 618 项，+14）。
- `npm.cmd run typecheck` → 零错误。
- 变异测试 12 次（见 §1 各条），全部按预期变红，全部已还原；还原后重跑上述三文件与全量仍全绿。

**留给编排层复验**（本轮按纪律未跑）：`npm run build`、`node scripts/qa/run-gates.mjs`、`dist/api-pricing/index.html` 的静态 grep（两类图例 / `当前用量 50M` / 无 `NaN|Infinity|undefined`）、移动端 320px 截图目测字号。
