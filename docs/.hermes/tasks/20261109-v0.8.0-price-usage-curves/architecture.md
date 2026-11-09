# v0.8.0 价格与用量曲线架构

## 1. 约束与落点

- 四批固定为 B1 散点、B2 构成、B3 走势、B4 用量成本（实证：requirements.md:8）；统一嵌入 API 页表格之后、数据纪律之前，不新增路由（实证：src/views/ApiPricingView.vue:132）。
- 业务值只经 `blendPerMillion`（实证：src/lib/benchmark-view.ts:38）、`buildRowScore`（实证：src/lib/benchmark-view.ts:50）、`formatCostPerPoint`（实证：src/lib/benchmark-view.ts:105）、`computeBreakEven`（实证：src/lib/plan-vs-api.ts:187）、`comparePlanVsApi`（实证：src/lib/plan-vs-api.ts:251）取得；图形层只做筛选、几何和格式化编排。
- 新增 `src/lib/chart-geometry.ts`（待验证：实现后以 typecheck 与单测确认）承载无业务语义的纯几何；新增 `src/lib/pricing-chart-data.ts`（待验证：以 10 点对拍测试确认）承载数据接入和既有公式编排。
- 修改 `src/views/ApiPricingView.vue`（实证：src/views/ApiPricingView.vue:111），同步创建图数据；不在 `onMounted`（实证：src/views/ApiPricingView.vue:100）后补算坐标。
- 修改 `src/styles/global.css`（实证：src/styles/global.css:9），图形颜色仅引用已有 CSS 变量，暗色继续依赖变量重定义（实证：requirements.md:25）。

## 2. 纯函数契约

以下签名均为新增设计，落地前状态统一为（待验证：实现后由 TypeScript 编译和对应单测锁定）。

### 2.1 几何函数

- `mapLinear(value: number, domain: readonly [number, number], range: readonly [number, number]): number | null`（待验证：单测覆盖）：有限值线性映射；负值允许；任一非有限值返回 `null`（待验证：边界单测）；单点域映射到区间中点；全缺由调用方不调用并产出空图。
- `mapLog(value: number, domain: readonly [number, number], range: readonly [number, number]): number | null`（待验证：单测覆盖）：正数取十进对数后映射；零、负数、非有限值或非正域返回 `null`（待验证：边界单测）；单点正域映射中点。
- `logTicks(domain: readonly [number, number], maxTicks: number): number[]`（待验证：单测覆盖）：返回域内 1/2/5×10ⁿ 刻度并限量；非法域、`maxTicks <= 0` 或全缺返回空数组；单点域返回该点一次。
- `paretoFrontier<T>(items: readonly T[], priceOf: (item: T) => number | null, scoreOf: (item: T) => number | null): T[]`（待验证：单测覆盖）：同一调用组内按价格升序返回非支配点；严格支配定义为价格不高、分数不低且至少一项严格更优；空集、null、非正价格、负分剔除；单点保留；同价仅留最高分，同价同分稳定留首项。
- `stackSegments(values: readonly (number | null)[], scale: (value: number) => number | null): Array<{ index: number; x0: number; x1: number; value: number }>`（待验证：单测覆盖）：只累计有限非负段；null 不生成段且不补零；负值剔除；单段从零起；全缺返回空数组。
- `polylineIntersections(a: readonly { x: number; y: number }[], b: readonly { x: number; y: number }[]): Array<{ x: number; y: number }>`（待验证：单测覆盖）：求相邻线段交点并去重；null 由数据接入层先剔除；负坐标允许；单点或全缺返回空；共线重叠不伪造唯一交点。
- `toSvgPath(points: readonly { x: number; y: number }[], mode: 'line' | 'step'): string | null`（待验证：单测覆盖）：有限点生成 `M/L` 或水平后垂直阶梯路径；空集返回 `null`；单点只生成 `M`；非法点剔除，全部非法视为空。

### 2.2 数据编排函数

- `buildScatterChart(api, benchmark, frame): ScatterChartModel`（待验证：10 点与表格对拍）：逐条调用评分与混合价函数，只纳入有分且有正价者；按账单币种分组后分别求前沿，返回坐标、标签、前沿路径和未入图计数，绝不跨币种比较。
- `buildCompositionChart(api, frame): CompositionChartModel`（待验证：缺段 fixture）：按币种分面，各取现有 3:1 混合价最低的 8 个有效条目作为可读样本并明示范围，四段交给堆叠函数；缺 `cacheWritePrice`（实证：requirements.md:39）时返回缺失标记而非零段，不产生跨币种次序。
- `buildHistoryChart(historyText, api, frame, today): HistoryChartModel`（待验证：1 天与 42 天 fixture）：解析只增快照格式（实证：requirements.md:30）；跨度不足 42 天仅返回状态和可选“本次 vs 上次”段，折线路径为 `null`（待验证：静态 HTML 不含历史折线标记）。
- `buildUsageCostChart(plans, api, usageMillion, frame): UsageCostChartModel`（待验证：同币种 fixture）：在 1M 到 1000M 对数采样；每币种取最多 5 组能由既有规则匹配的套餐与官方 API 基准，精确 API 点逐点取比较函数结果，套餐阈值取保本点结果并生成虚线阶梯；按源数据稳定顺序截断并明示展示数，不同币种分面，交点只在同币种内求。
- 上述四个返回模型中的坐标字段、路径字段、显示文本字段均在 `setup` 同步生成（待验证：预渲染 HTML grep），组件不接收原始价格或套餐，也不调用业务公式。

## 3. 组件边界

- 新增 `src/components/pricing-charts/PricingChartsSection.vue`（待验证：组件测试与页面挂载）：props 为 `scatter: ScatterChartModel`、`composition: CompositionChartModel`、`history: HistoryChartModel`、`usageCost: UsageCostChartModel`（待验证：vue-tsc）；只安排四个 section，不读数据源。
- 新增 `src/components/pricing-charts/ScatterChart.vue`（待验证：静态渲染测试）、`CompositionChart.vue`（待验证：缺段测试）、`HistoryChart.vue`（待验证：不足 6 周测试）、`UsageCostChart.vue`（待验证：图例测试）：各自唯一 prop 为对应已算好的模型，只展开 SVG 元素。
- 新增 `src/components/pricing-charts/SvgChartFrame.vue`（待验证：无障碍测试）：props 为 `title: string`、`description: string`、`viewBox: string`（待验证：vue-tsc）；统一输出 `<figure>`、响应式 `<svg>`、无障碍 `<title>`/`<desc>`、图例和说明插槽，不计算坐标。
- 数据读取者仅为 API 页：复用 `apiPrices`、`tokenPlans`、`benchmarkDoc`、`fxRate`、`providers`、`DATA_VERIFIED_AT` 的统一入口（实证：requirements.md:21）；子组件只拿展示模型。

## 4. 四图的静态渲染

- B1：SSR 已完成评分、混合价、同币种前沿、对数坐标和标签选择；HTML 留下点 `<circle>`、前沿 `<path>`、轴刻度与至少 5 个 `<text>`，每点带 `<title>`（待验证：dist 页面 grep）。
- B2：SSR 已完成四段宽度与缺段状态；HTML 留下分段 `<rect>`、模型/金额 `<text>`、“无缓存写价”文字和 `<title>`（待验证：dist 页面 grep）。
- B3：SSR 已完成快照跨度判断；不足 6 周时 HTML 留下“历史积累中（已 N 天，需 6 周）”和可选单段，不留下折线 `<path>`（待验证：1 天 fixture 与 dist grep）；达到门槛才留下真实点构成的路径。
- B4：SSR 以 50M 默认值完成采样、精确实线、估算虚线阶梯、当前用量竖线及同币种交点；HTML 留下两类 `<path>`、图例说明、交点 `<text>` 和 `<title>`（待验证：dist 页面 grep）。客户端可在同步响应式 setup 中读取 `usage` 查询参数并替换模型，但不是静态图可见性的前提（待验证：禁 JS 与 `?usage=100` 双场景）。
- 原生 `<title>` 保证无需客户端库即可读具体值；禁用 JS 后 SVG、路径和文字仍在预渲染 HTML（实证：requirements.md:50）。

## 5. 密度与响应式

- 32 个有分点全部保留在桌面散点层（实证：issues-dossier.md:11）；圆点小尺寸、半透明、前沿描边，完全重合点共享位置并由 `<title>` 列出名称，不抖动坐标、不制造假差异。
- 标签按“前沿优先、价格/分数极值、稳定 ID 顺序”去碰撞，桌面最多 12 个；移动层仅画各币种前沿及稳定选出的 5 个代表标签（待验证：375 截图与标签计数）。桌面层与移动层都由 SSR 输出，仅用媒体查询切换显示。
- 构成图按币种各 8 条、用量图按币种各 5 组封顶并写出“展示 N/总数”（待验证：数据模型单测），防止 178 条数据把 SVG 与 HTML 体积撑爆；这只是展示抽样，不输出跨币种或全量最优结论。
- SVG 使用固定 `viewBox` 与 `width: 100%; max-width: 100%`（待验证：320 至 1440 视口矩阵）；长模型名截断，完整名留在 `<title>`，图例允许换行。
- 新 section 不改变价格表列结构和现有桌面/移动端切换（实证：src/views/ApiPricingView.vue:132），从而兼容 F12 既有列数、宽度与静态内容断言（实证：requirements.md:32）。

## 6. 本轮不做

- 不新增路由、首页图、图表依赖、客户端重算、点选联动表格、筛选器联动图、动画或自制 tooltip。
- 不修改 `src/data/**`（实证：requirements.md:51），不补历史、不插值、不改排序/筛选/结论卡，不做跨币种最优结论。
- 不把请求次数或 5 小时额度冒充 token；套餐线始终标“按月费与 API 单价反推的估算”，不是官方额度（实证：src/lib/plan-vs-api.ts:6）。
