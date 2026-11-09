# v0.8.0 对抗审查报告（OpenCode / deepseek）

审查对象：工作区相对 `HEAD` 的未提交改动（`src/lib/chart-geometry.ts`、`src/lib/pricing-chart-data.ts`、`src/components/pricing-charts/*`、`src/views/ApiPricingView.vue`、`src/styles/global.css`、`tests/*` 三个新文件、`scripts/metrics/copy-density.mjs`）。

## ① 效力声明与出口判定

**效力声明**：原定审查者是 Codex，但其账号额度耗尽（14:48 恢复），本轮改由 OpenCode（deepseek-flash）执行。本 agent 同时是本迭代的**设计者**（architecture / implementation-plan 的产出侧），与编码者（Codex，gpt 家族）不同模型家族，但与设计者是同一 agent。因此本轮**不是**独立第三方审查：存在「按自己的设计读实现」的确认偏差，本报告所有结论都给出可复现的构造输入或读数，不采信 FIX-NOTES 的自述。

**出口判定：rejected**（阻断项 1 条，严重度 High）。

已复核的基线读数（本机 13:00 前后）：

- `npx.cmd vitest run tests/chart-geometry.test.ts tests/pricing-chart-data.test.ts tests/pricing-charts-render.test.ts` → 3 文件 38 项全过。
- `npx.cmd vitest run tests/layout-width.test.ts tests/ux-refactor.test.ts tests/layout-measure.test.ts tests/verify-static-build.test.ts` → 4 文件 80 项全过（F12 原断言未被破坏）。
- `dist/api-pricing/index.html`（12:53 产物，与 `src/lib/pricing-chart-data.ts` mtime 同分钟）：7 个 `<svg>`、22 个 `<path>`、49 个 `<circle>`、43 个 `<rect>`、122 个 `<text>`、7 个 `<desc>`；`data-history-line` 0 次；无 `NaN/Infinity/undefined`。
- 静态产物里已含 R1 的 `月（对数）` 与 M1 修复后的套餐名（`Anthropic Claude Pro` 等），据此认为 dist 与本轮源码同源，可作为 A1/A9/A11 的静态证据。

## ② 阻断项

### B-1（攻击面 A10 / A6，严重度 High）B4 全链路零自动断言，静默失效通道仍敞开

- **构造输入 / 变异**：把 `src/lib/pricing-chart-data.ts:262` 的 `mapLog(point.apiCost, costDomain, yRange(frame))` 改回 `mapLinear(point.apiCost, costDomain, yRange(frame))`（即 FIX-NOTES 记录的 M2 原状），或把 `src/lib/pricing-chart-data.ts:281` 的交点反解改成 `mapLinear(point.y, yRange(frame), costDomain)`。上述 3 个测试文件从未 import 这两个符号，因此结果必然仍是 38 项全过（变异不可见）。
- **file:line 证据**：
  - `tests/chart-geometry.test.ts:2` 只 import 了 `logTicks, mapLinear, mapLog, paretoFrontier, stackSegments, toSvgPath`，**没有** `polylineIntersections`（`src/lib/chart-geometry.ts:65`）。
  - `tests/pricing-chart-data.test.ts:4` 只 import 了 `buildScatterChart, buildCompositionChart, buildHistoryChart`，**没有** `buildUsageCostChart`（`src/lib/pricing-chart-data.ts:221`）。
  - `tests/pricing-charts-render.test.ts:23-58` 只有 History、Composition、Scatter 三个渲染用例，**没有** `UsageCostChart.vue`。
  - 施工单明确要求这三组：`implementation-plan.md:79`（`polylineIntersections` 的单交点/多交点/端点去重/平行/共线/单点/负坐标）、`:87`（`buildUsageCostChart` 与 `comparePlanVsApi` / `computeBreakEven` 逐点对拍、跨币种、无月费、负用量）、`:89`（B4 两类图例）。
- **期望 vs 实际**：期望 B4 的几何、数据编排、组件渲染各有一条能变红的断言。实际三处均为 0 条；R1（对数纵轴）目前只有 `FIX-NOTES.md:22` 的人工目测背书。
- **为何判 High 而非「覆盖不足」**：M2 就是这条链路静默失效的实证（纵轴线性把整条曲线压进 14px 带，6 条门禁全绿、页面看起来「没画」）。现在同一段逻辑仍然没有任何断言，属于「已发生过一次、防线仍为空」，不是理论风险。
- **最小修复**（三条测试，不涉及产品代码改动）：
  1. `tests/chart-geometry.test.ts` 补 `polylineIntersections`：`polylineIntersections([{x:-10,y:-10},{x:0,y:0}], [{x:-10,y:0},{x:0,y:-10}])` 应为 `[{x:-5,y:-5}]`；平行/共线应为 `[]`；单点应为 `[]`（我已用 Node 探针验证当前实现通过，测试用于锁住它）。
  2. `tests/pricing-chart-data.test.ts` 补 `buildUsageCostChart`：断言 `groups` 内 `pair.modelId` 的 `billingCurrency` 等于组币种（跨币种被 `plan-vs-api.ts:201` 拒绝）；`total > shown`；对至少 1 组逐点对拍 `comparePlanVsApi`（`{inputMillion: 3*out, outputMillion: out}`）；阈值处两条线相等（与 `computeBreakEven` 对拍，我在探针里已按 1e-6 相对误差复核全部 10 组，全部一致）；`usageMillion=-5/0/NaN/1001` 时回落 50；免费套餐（`monthlyPrice=0`）不产生 `planCost=0` 的线。
  3. `tests/pricing-charts-render.test.ts` 补 `UsageCostChart` 渲染：静态 HTML 同时含 `API 单价精确折算` 与 `套餐按月费与 API 单价反推估算`、含 `当前用量 50M` 的竖线与文字、`/NaN|Infinity|undefined/` 不命中、7 个 `<circle>` 交点各自带 `<title>`。

## ③ 非阻断（按严重度降序，每条给收口方式）

**N-1（A9，Medium）静态增量超施工单预算 22%**
- 读数：`dist/api-pricing/index.html` 中 `<section class="pricing-charts-section">` 整段 = 70,494 字节（全页 441,561 字节）；新增 CSS 2,711 字节（47 行）。合计约 73.2KB，施工单判据 `implementation-plan.md:101` 为「增量 < 60KB」。
- 拆分：其中 11,379 字节是 Vue SSR 的 fragment 注释（506 个 `<!--[-->` + 506 个 `<!--]-->` + 469 个 `<!---->`），`<title>` 合计 19,328 字节，`<text>` 合计 10,276 字节。
- 收口方式：把 `ScatterChart.vue:25`、`HistoryChart.vue:26`、`UsageCostChart.vue:29-32` 里 slot 内的 `<template v-for>` 收成单层 `v-for`，实测可消掉大部分 fragment 注释（11.4KB ≈ 增量的 16%，压到 60KB 以内可期）；或由编排层书面改判该预算并记录理由。

**N-2（A11，Medium，属红线项）`src/lib/pricing-chart-data.ts` 整文件为 CRLF**
- 读数：299 个 CRLF、0 个 LF（其余新文件与改动的 `.vue`/`.css` 全为 LF，`src/data/**` 零改动）。判据 `requirements.md:53`「新文件 LF」。
- 影响：仓库 `core.autocrlf=true`、无 `.gitattributes`，提交后入库内容仍会被归一化为 LF，不产生二进制差异；但工作区现状与本迭代红线不符。
- 收口方式：提交前把该文件转回 LF（`git ls-files --eol` 应显示 `w/lf`）。

**N-3（A7，Low）`today` 取 UTC，构建时刻可能把当日快照切掉**
- 构造输入：`buildHistoryChart(historyText, apiPrices, undefined, '2026-11-08')`（模拟 UTC+8 的 00:00-08:00 构建，此时 `new Date().toISOString()` 仍是前一日，`src/lib/pricing-chart-data.ts:141`）→ `days=0`、`groups=[]`、`status='历史积累中（已 0 天，需 6 周）'`、`expectedDate=null`，而 `src/data/history/price-history.jsonl` 里确有 2026-11-09 的快照。
- 影响：仅在该日 UTC 尚未跨日时出现一次，之后不再复现（`days` 由快照跨度决定，不看今天）。会给静态产物带来一次「已 0 天」的错误表述。
- 收口方式：若要消除，把 `today` 的来源固定为构建侧显式变量（例如 `DATA_VERIFIED_AT` 或注入的构建日期），或在状态文案里区分「快照日期晚于构建日」。

**N-4（A9/A12，Medium）移动端图内字号被 viewBox 缩放压到 8px 量级**
- 推算：`.shell` 在 <768 为 `calc(100% - 32px)`（`global.css:67`），320 视口可用 288px，减 `.pricing-chart` 内边距 8px×2 与边框 2px（`global.css:1304`）→ SVG 实际 270px；缩放比 270/640=0.42，`@media (max-width:767px)` 里 `font-size: 19px`（`global.css:1343`，用户单位）落到屏幕约 8.0px；375 视口约 9.7px。
- 影响：不产生横向溢出（`svg { width:100%; max-width:100% }`，`global.css:1305`），但刻度与标签低于常用可读下限；`<title>` 仍可读，属观感/可读性。
- 收口方式：把移动端字号提高到在 270px 宽度下仍 ≥12px 的值（约 28 用户单位），或把移动层 viewBox 收窄为单列 360 宽。

**N-5（A12，Low）B3 空态 figure 的 figcaption 为空**
- 证据：`HistoryChart.vue:11-14` 的 `SvgChartFrame` 没有传 `#legend`/`#note`，静态产物该 `<figure>` 内是 `<figcaption><!----><!----></figcaption>`。图本身有 `<title>`/`<desc>`（`aria-labelledby="v-4-title v-4-desc"`），所以图像可读；`<figure>` 自身无可读标题。
- 收口方式：空态也传一条 legend 文案（例如状态与门槛）。

**N-6（A10，Low）名为「便宜 USD 不支配 CNY」的断言并不检验该命题**
- `tests/chart-geometry.test.ts:42-45` 实际是两次单元素调用。任何「保留合法单点」的实现都通过：我实测把两种币种放进同一次调用会得到 `['usd']`（即 CNY 点被支配），该测试仍为绿。
- 真正的隔离由 `tests/pricing-chart-data.test.ts:13-21`（按币种分组后的点集断言）与 `src/lib/pricing-chart-data.ts:63-69`（先按币种过滤再求前沿）覆盖，所以不影响产品结论。
- 收口方式：删掉或改写成「同一次调用混币种会丢掉 CNY 点」的反例断言，别让它冒充隔离证明。

**N-7（A10，Low）`points[0].frontier` 对单点组恒真**
- `tests/pricing-chart-data.test.ts:17` 的分组里每组只有 1 个点，`every` 断言在任何「不丢最低价点」的实现下都成立，不构成反例。
- 收口方式：改断言前沿 ID 集合（如 `['usd']`、`['cny']`）与多点组的精确集合。

**N-8（A10，Low）「静态守卫反例」是测试内部自证**
- `tests/pricing-charts-render.test.ts:82-86` 在测试里自行定义 `guard`，第一条断言与上一用例重复，第二条只证明字符串替换生效，不对产品行为构成反例。
- 收口方式：删掉，或改成在真实 SSR 产物上断言（已有 dist grep 判据可复用）。

**N-9（A9，Low）`?raw` 把 29KB 历史原文打进客户端主包**
- 读数：`src/data/history/price-history.jsonl` 29,316 字节；`dist/assets/index-8XlHhDXG.js` 569,284 字节且含原文（搜 `aliyun-qwen-long` 命中）。这是同构 hydration 的代价，不是缺陷。
- 收口方式：接受；若后续在意，可只在 SSR 构建期引入原文。

**N-10（A8，Low）用量图内存在第二处 3:1 拆分实现**
- `src/lib/pricing-chart-data.ts:245` 的 `outputMillion = total / (DEFAULT_BLEND_RATIO + 1)` 与 `src/lib/plan-vs-api.ts:356-357` 的 `allowanceValueSentence` 同口径，常量取自 `DEFAULT_BLEND_RATIO`，未另写成本公式（成本仍由 `comparePlanVsApi` 给出），不触红线 2；风险只是口径变更时有两处要改。
- 收口方式：加一条与 `allowanceValueSentence` 同源的断言（比例拆分结果相等），锁住两处一致。

**N-11（A6，Low）`?usage` 越界静默回落 50M**
- `src/lib/pricing-chart-data.ts:222`：`?usage=0`、`?usage=2000`、`?usage=abc`、`?usage=NaN` 全部显示 50M，无提示。
- 收口方式：越界时在 `currentLabel` 里写明「已按 50M 显示」或保留原值并夹到轴端。

**N-12（架构 §5:51，Low）桌面标签上限口径与实现不一致**
- 架构写「桌面最多 12 个」，实现按分面各 12 个（`src/lib/pricing-chart-data.ts:79` `labelIds(points, 12)`），静态产物实测桌面标签 USD 12 + CNY 7 = 19 个；移动层 5+5=10（架构对移动层明确写「各币种」，桌面没写）。
- 收口方式：确认是「每分面 12」还是「全页 12」；若后者，把 `labelIds` 的调用改为跨分面共享配额。

**N-13（A12，Low）构成图四段仅靠颜色区分**
- `global.css:1315-1318` 用 `--brand/--good/--muted/--ink` 四色；位置顺序 + 图例顺序 + 每段 `<title>` 可补偿，但对色盲读者仍偏弱。
- 收口方式：给段加纹理/留白（例如缓存两段加描边）或在条末直接标段名。

**N-14（流程事实，非代码）新文件未 `git add -N`**
- `git status --porcelain` 显示 `src/lib/*.ts`、`src/components/pricing-charts/`、`tests/*.test.ts` 均为 `??`，`git diff HEAD` 看不到全文。本轮按整文件直读审查，结论不受影响；入库前需按三锻纪律处理。

## ④ 被证伪的怀疑（本轮确实怀疑过、实测不成立）

- **F-1「SSR 阶段拿不到数据，静态 HTML 缺图」——不成立。** `src/entry-server.ts:34-40` 先 `app.use(router)`、`router.push(url)`、`await router.isReady()` 再 `renderToString`，`useRoute()` 在 memory history 下可用；`?raw` 由 Vite 在 SSR 构建期内联。静态产物 7 个 `<svg>`、122 个 `<text>`、22 个 `<path>`，四类图均在。禁用 JS 不影响（无 `display:none` 隐藏整个 figure 的规则，只有 `@media (max-width:767px)` 隐藏非前沿散点）。
- **F-2「USD 与 CNY 串进同一前沿/同一坐标系」——不成立。** 逐 SVG 统计货币符号：散点 USD 图 `$`26/`¥`0、CNY 图 `$`0/`¥`16；构成 USD 23/0、CNY 0/20；用量 USD 31/0、CNY 0/31。代码侧 `src/lib/pricing-chart-data.ts:63-69`、`:101-107`、`:180-182`、`:233-235` 均先按币种过滤；`pickBasisModel` 与 `computeBreakEven` 再各查一次币种（`plan-vs-api.ts:101-104`、`:201-206`）。我把两币种真的塞进同一次 `paretoFrontier` 调用会丢掉 CNY 点（探针：`['usd']`），说明隔离是必要的，而实现确实做了。
- **F-3「`stackSegments` 把 null 当 0，缺缓存写价被补零」——不成立。** `src/lib/chart-geometry.ts:56-62` 对 `null` 直接 `return []`（`finite(null)` 为假），且 `total` 不增。实测 `[2,null,3]` → `[{0:0-2},{2:2-5}]`；真实数据缺写价行 `segments` 只剩 `[0,1,2]`，静态产物无 `chart-segment-3`。
- **F-4「免费套餐会画出 planCost=0 的线，或让纵轴域含 0」——不成立。** `computeBreakEven` 对 `monthlyPrice<=0` 先返回 `no_price`（`plan-vs-api.ts:192-194`），`src/lib/pricing-chart-data.ts:228` 把它从 `matched` 里剔除；样本层 `:248` 又要求 `planCost>0`。实测真实数据里存在 `anthropic-claude-free`，`buildUsageCostChart([免费套餐], apiPrices)` 得 `groups=[]`。
- **F-5「交点反解公式与正解不互逆」——不成立。** x：`mapLog(50,[1,1000],[64,608])=372.0799`，反解 `10**mapLinear(372.0799,[64,608],[0,3])=49.99999`；y：`mapLog(5,[0.008,5000],[292,30])=165.6136`，反解 `5.000000000000004`。真实 10 组 pair 在阈值处逐点复核 `comparePlanVsApi` 的 `apiCost` 与 `plan.monthlyPrice`，相对误差 <1e-6。
- **F-6「只有 1 天时会画成两点直线」——不成立。** 真实历史 1 个快照：`days=1`、`ready=false`、每 series `path=null`、`comparison=null`；组件 `HistoryChart.vue:15` 的 `v-if="model.ready"` 不渲染折线组，静态产物 `data-history-line` 0 次、`需 6 周` 存在。
- **F-7「某个几何函数会吐 NaN 或让 `!` 变成 NaN 崩断言」——不成立。** 逐个给最坏输入：`mapLinear(Infinity,…)=null`、`mapLinear(1,[0,0],…)=5`（单点域按契约取中点）、`mapLog(0/-5/[0,10] 域)=null`、`logTicks([NaN,10],5)=[]`、`toSvgPath([{x:NaN}],'line')=null`、`stackSegments([null,-1,NaN,Infinity])=[]`、`polylineIntersections` 遇非有限点返回 `[]`。唯一能溢出的是荒谬域（`mapLinear(1e308,[0,1e-308],[0,1e308])` 返回 `Infinity`，不是 NaN），且 `toSvgPath` 的 `finite` 过滤会把它剔掉（返回 `null`）；实际调用点的域都来自 640×360 常量帧与已过滤的正价，不可达。`!` 是编译期非空断言，运行时不改写值。
- **F-8「固定 viewBox + width:100% 在高 DPI 下会被拉糊」——部分不成立。** SVG 是矢量，不发糊；真问题是字号随缩放变小（见 N-4）。
- **F-9「dist 是旧产物，不能当静态证据」——不成立。** dist 与源码同为 12:53，含 R1 的 `月（对数）` 与 M1 修复后的套餐名，无 `undefined`；用量图 y 刻度 `$5/$20/$100/$200/$1000/$5000` 的位置按 log10 等距（5→276.10、20→226.71、100→169.37、200→144.68、1000→87.34、5000→30.00），确认是对数轴。

## ⑤ A1～A12 逐条结论

| # | 攻击面 | 结论 | 关键证据 |
|---|---|---|---|
| A1 | 静态可渲染 | 通过 | SSR 先装 router 再渲染（`entry-server.ts:34-40`）；dist 7 svg / 122 text / 22 path；四类图与 `需 6 周`、两类图例均在；无法构造「静默缺图」路径（数据异常会让 setup 抛错 → 预渲染直接失败，`prerender.mjs` 还有 <200 字符判空） |
| A2 | 几何边界 | 通过 | 逐函数最坏输入均返回 `null`/`[]`，无 NaN；`!` 为编译期糖；单点域按契约取中点；唯一 `Infinity` 逃逸（`mapLinear` 溢出）不可达且被 `toSvgPath` 过滤 |
| A3 | Pareto 正确性 | 通过（实现），测试偏弱 | `chart-geometry.ts:34-44` 按价升序、同价取高分、分数严格递增保点；实测重复点留首项、同价异分只留高分、单点保留、负分/非正价剔除。弱断言见 N-6 |
| A4 | 跨币种不排名 | 通过 | 逐 SVG 货币符号零混用（F-2）；四处分组过滤 + `pickBasisModel`/`computeBreakEven` 双重复核 |
| A5 | 缺数据不伪装 | 通过 | 缺分 → `unscored` 计数且不入图（`:57`）；缺写价 → `stackSegments` 无段 + `missingText`（`:113`、`chart-geometry.ts:57`）；缺价 → `invalidPrice` 不入图（`:59-60`）；三条都有非恒真断言（`pricing-chart-data.test.ts:13-21`、`:52-59`，`pricing-charts-render.test.ts:47-57`） |
| A6 | R1 对数纵轴 | 通过（测试缺） | 成本样本 `>0`（`:254-256`）；免费套餐前置剔除；`mapLog` 收 0 返 null 且无运行时 NaN；反解互逆实测（F-5）；但零断言，见 B-1 |
| A7 | 走势门槛 | 通过（UTC 窗口见 N-3） | `days>=42` 才 `path`（`:153`、`:195`）；按 UTC 日期串比较（`:141`、`:138`、`:148`）；1 天无 comparison 无折线（F-6） |
| A8 | 图与表格同源 | 通过 | 散点走 `blendPerMillion`/`buildRowScore`/`formatCostPerPoint`，用量走 `comparePlanVsApi`/`computeBreakEven`，历史走 `blendPerMillion`；唯一图内算术是 3:1 用量拆分（N-10），与既有 `allowanceValueSentence` 同口径 |
| A9 | 响应式与体积 | **不达标** | 增量 70.5KB + CSS 2.7KB > 60KB（N-1）；移动端字号约 8.0/9.7px（N-4）；溢出无证据（`svg width:100%`、`minmax(min(100%,480px),1fr)`、`overflow-wrap:anywhere`），但未跑浏览器矩阵 |
| A10 | 测试有效性 | **不通过** | 抽查 3 条可红：`pricing-chart-data.test.ts:52-59`（null→0 变异产生 index 3，红）、`chart-geometry.test.ts:34-36`（`<=`→`<` 变异得 `b,c,e,d,f`，红）、`pricing-chart-data.test.ts:99-107`（42→41 门槛，红）；但 B4 三项零覆盖（B-1），另有两处弱/重复断言（N-6、N-7、N-8） |
| A11 | 红线 | **不通过（1 条）** | `dependencies` 未变、`src/data/**` 零改动、`src/` 无 fetch、SVG 无写死色值（组件内无 fill/stroke 字面量）、改动文件行尾保持 LF；但 `src/lib/pricing-chart-data.ts` 为 CRLF（红线「新文件 LF」） |
| A12 | 无障碍 | 通过（1 处 Low） | 7 个 figure / 7 个 `<title>` / 7 个 `<desc>` / `role="img"` + `aria-labelledby`，id 无重复；聚合点空心、套餐虚线、前沿实线，颜色非唯一手段；缺口是 B3 空态 figcaption 为空（N-5）与构成图四段纯色区分（N-13） |

## 附：本轮执行过的复现命令

- `npx.cmd vitest run tests/chart-geometry.test.ts tests/pricing-chart-data.test.ts tests/pricing-charts-render.test.ts` → 38 passed。
- `npx.cmd vitest run tests/layout-width.test.ts tests/ux-refactor.test.ts tests/layout-measure.test.ts tests/verify-static-build.test.ts` → 80 passed。
- Node 单文件探针（临时目录，未改仓）：`chart-geometry` 边界输入、`buildScatterChart`/`buildCompositionChart`/`buildHistoryChart`/`buildUsageCostChart` 真实数据与构造 fixture、`dist/api-pricing/index.html` 结构与体积解析。
- 未执行：`build`、`run-gates`、任何 git 写操作。
