# v0.8.0 价格与用量曲线实施计划

## 1. 总体次序与共用纪律

按 B1 → B2 → B3 → B4 串行，每批先补纯函数与单测，再补组件、页面接入、样式、静态构建验证（实证：requirements.md:8）。任何批次失败只返工该批与必要根因，不提前改后续批。

共用文件如下：

- 新增 `src/lib/chart-geometry.ts`（待验证：`npx.cmd vue-tsc --noEmit`），只放坐标映射、刻度、前沿、堆叠、交点、路径纯函数。
- 新增 `src/lib/pricing-chart-data.ts`（待验证：10 点同源测试），只调用既有业务函数并组装静态展示模型。
- 新增 `src/components/pricing-charts/SvgChartFrame.vue`（待验证：静态组件测试），统一 SVG 外壳与无障碍信息。
- 新增 `src/components/pricing-charts/PricingChartsSection.vue`（待验证：API 页挂载测试），按固定顺序容纳四图。
- 修改 `src/views/ApiPricingView.vue`（实证：src/views/ApiPricingView.vue:132），在表格与汇总之后、数据纪律前同步建模并插入图组。
- 修改 `src/styles/global.css`（实证：src/styles/global.css:9），仅用变量完成图形、图例与响应式样式。
- 所有新文件 UTF-8 + LF；不安装依赖、不执行 git、不改任何数据文件（实证：requirements.md:46）。

## 2. B1 价格-能力散点

### 文件与步骤

1. 在 `src/lib/chart-geometry.ts`（待验证：几何单测）实现 `mapLinear`、`mapLog`、`logTicks`、`paretoFrontier`、`toSvgPath`（待验证：`tests/chart-geometry.test.ts`）。读数：非法对数值均为 null；同币种 fixture 的前沿 ID 精确相等。
2. 在 `src/lib/pricing-chart-data.ts`（待验证：数据单测）实现 `buildScatterChart`（待验证：`tests/pricing-chart-data.test.ts`），复用评分、混合价和每分成本格式化。读数：仅有分有正价点入图；未入图数 = 总条目数 - 入图数；USD/CNY 前沿分别计算。
3. 新增 `src/components/pricing-charts/ScatterChart.vue`（待验证：静态 HTML 测试），接收算好的散点模型，输出圆点、两套响应式标签、各币种前沿与原生标题。
4. 接入 `src/components/pricing-charts/PricingChartsSection.vue`（待验证：组件测试）、`src/views/ApiPricingView.vue`（实证：src/views/ApiPricingView.vue:143）和 `src/styles/global.css`（实证：src/styles/global.css:45）。读数：预渲染 API 页有 SVG、前沿路径、至少 5 个数值标签和“条无评测数据未入图”。

### 本批不碰

- `src/data/**`（实证：requirements.md:51）、`src/lib/filters.ts`（实证：src/views/ApiPricingView.vue:10）、`src/lib/pricing.ts`（实证：src/views/ApiPricingView.vue:13）、`src/components/PriceTable.vue`（实证：src/views/ApiPricingView.vue:7）、`src/components/PriceCardList.vue`（实证：src/views/ApiPricingView.vue:6）。
- B2/B3/B4 的组件与数据模型；首页、路由、结论卡和 URL 筛选逻辑。

## 3. B2 价格构成

### 文件与步骤

1. 在 `src/lib/chart-geometry.ts`（待验证：几何单测）实现 `stackSegments`（待验证：`tests/chart-geometry.test.ts`）。读数：`[2, null, 3]` 只产生两段，第二段从 2 累到 5，null 不占宽度；全缺为空。
2. 在 `src/lib/pricing-chart-data.ts`（待验证：数据单测）实现 `buildCompositionChart`（待验证：`tests/pricing-chart-data.test.ts`）。读数：每币种最多 8 条并报告展示数；缺缓存写价条目有缺失标记且无对应段；负值不进入图；条目排序不反写源数组。
3. 新增 `src/components/pricing-charts/CompositionChart.vue`（待验证：静态组件测试），只输出分段矩形、标签、完整值标题和“无缓存写价”。
4. 扩展图组与 CSS（待验证：API 页预渲染和 375 截图）。读数：四段图例齐全；缺段文案存在；SVG 宽度不超过容器。

### 本批不碰

- B1 的前沿定义和标签选择；B3 历史解析；B4 套餐/API 折算；`src/data/**`（实证：requirements.md:51）及现有表格排序、筛选、结论逻辑。

## 4. B3 价格走势

### 文件与步骤

1. 在 `src/lib/pricing-chart-data.ts`（待验证：历史 fixture 单测）实现 `buildHistoryChart`（待验证：`tests/pricing-chart-data.test.ts`），由调用方以 raw 文本传入历史快照，按日期合并 full/delta，不改源文件。读数：1 天 fixture 的折线路径为 null、状态天数为 1；42 天真实点 fixture 才有路径；两快照可有单段对比。
2. 新增 `src/components/pricing-charts/HistoryChart.vue`（待验证：静态组件测试），不足门槛只输出“历史积累中（已 N 天，需 6 周）”与可用的前后对比，不渲染走势路径。
3. 修改 `src/views/ApiPricingView.vue`（实证：src/views/ApiPricingView.vue:1）以构建期 raw 导入读取 `src/data/history/price-history.jsonl`（实证：requirements.md:30），同步传给建模函数。
4. 扩展图组与 CSS（待验证：dist grep）。读数：当前快照不足 6 周时积累文案恰好出现，历史折线专用标记出现 0 次。

### 本批不碰

- `src/data/history/price-history.jsonl`（实证：requirements.md:30）及全部刷新/生成脚本；不补日期、不插值；不改变 B1/B2 数值与图形结构；不做 B4。

## 5. B4 用量-成本曲线

### 文件与步骤

1. 在 `src/lib/chart-geometry.ts`（待验证：几何单测）实现 `polylineIntersections`（待验证：`tests/chart-geometry.test.ts`），复用 `mapLog` 与 `toSvgPath`（待验证：同测试文件）。读数：两线单交点坐标、平行无交点、共线不伪造点、阶梯路径水平后垂直。
2. 在 `src/lib/pricing-chart-data.ts`（待验证：同币种数据单测）实现 `buildUsageCostChart`（待验证：`tests/pricing-chart-data.test.ts`），1M 至 1000M 采样值逐点调用套餐/API 比较函数，套餐阈值调用保本点函数。读数：每币种最多 5 组并报告展示数；API 为实线路径、套餐为虚线阶梯；跨币种交点为 0；默认当前用量为 50M。
3. 新增 `src/components/pricing-charts/UsageCostChart.vue`（待验证：静态组件测试），输出精确/估算两种路径、当前用量竖线、同币种交点及明确估算口径图例。
4. API 页在 SSR 同步 setup 中使用 50M 默认值，客户端由路由查询参数 `usage`（待验证：`?usage=100` 组件测试）同步派生新模型，不使用 mounted 绘图；扩展图组与 CSS。读数：禁用 JS 仍有默认 50M 标线，带参数时水合后标线为参数值；静态 HTML同时含“API 单价精确折算”和“套餐按月费与 API 单价反推估算”。

### 本批不碰

- `src/lib/plan-vs-api.ts` 的公式与返回结构（实证：src/lib/plan-vs-api.ts:187）；`src/data/**`（实证：requirements.md:51）；现有 URL 筛选写回流程（实证：src/views/ApiPricingView.vue:99）；不把请求次数换成 token。

## 6. 纯函数单测清单

统一新增 `tests/chart-geometry.test.ts`（待验证：首次 vitest 运行）放几何 fixture：

- `mapLinear`（待验证：该测试文件）：正常/反向 range、负值、null 等价非法数、单点域中点。
- `mapLog`（待验证：该测试文件）：1/10/100 等距、零/负/非法值、单点域。
- `logTicks`（待验证：该测试文件）：1/2/5 序列、限量、非法域、单点。
- `paretoFrontier`（待验证：该测试文件）：支配链、同价、同分、稳定首项、空/全缺/单点、两币种须由两次调用隔离。
- `stackSegments`（待验证：该测试文件）：正常四段、null 缺段、零段、负值、单段、全缺。
- `polylineIntersections`（待验证：该测试文件）：单交点、多交点、端点去重、平行、共线、单点、负坐标。
- `toSvgPath`（待验证：该测试文件）：line/step、空、单点、混入非法点。

统一新增 `tests/pricing-chart-data.test.ts`（待验证：首次 vitest 运行）放最小对象 fixture，不复制业务公式：

- `buildScatterChart`（待验证：该测试文件）：有分有价/缺分/缺价组合、未入图计数、币种隔离；抽 10 点与 `buildRowScore`（实证：src/lib/benchmark-view.ts:50）和 `blendPerMillion`（实证：src/lib/benchmark-view.ts:38）结果逐字段对拍。
- `buildCompositionChart`（待验证：该测试文件）：四价齐全与缺缓存写价各一条，断言段数、缺失文案、无补零。
- `buildHistoryChart`（待验证：该测试文件）：1 天、两次变化、41 天、42 天 fixture，断言门槛、真实路径和禁止插值。
- `buildUsageCostChart`（待验证：该测试文件）：同币种有效套餐、跨币种、无月费、负用量；逐点与 `comparePlanVsApi`（实证：src/lib/plan-vs-api.ts:251）对拍，阈值与 `computeBreakEven`（实证：src/lib/plan-vs-api.ts:187）对拍。

新增 `tests/pricing-charts-render.test.ts`（待验证：首次 vitest 运行）做组件静态渲染 fixture：四图都有 `<title>`；散点至少 5 个 `<text>`；缺段文案；不足 6 周无折线；B4 两类图例。

## 7. 验证命令与判据

1. 几何：`npx.cmd vitest run tests/chart-geometry.test.ts`；全部通过，重点核对前沿、null、单点、全缺。
2. 数据同源：`npx.cmd vitest run tests/pricing-chart-data.test.ts`；10 个散点及用量采样对拍全通过。
3. 静态组件：`npx.cmd vitest run tests/pricing-charts-render.test.ts`；无障碍标题、5 个标签、缺段和积累态通过。
4. 约束回归：`npx.cmd vitest run tests/layout-width.test.ts tests/ux-refactor.test.ts tests/layout-measure.test.ts tests/verify-static-build.test.ts`；F12 原断言不改且全绿（实证：requirements.md:32）。
5. 全门禁：`node scripts/qa/run-gates.mjs`；6 条全绿且测试总数不少于 580（实证：requirements.md:69）。
6. 静态产物：先执行项目既有 build 门禁，再运行 `node -e "const fs=require('fs');const s=fs.readFileSync('dist/api-pricing/index.html','utf8');for(const x of ['<svg','<path','无评测数据未入图','无缓存写价','历史积累中','API 单价精确折算','套餐按月费与 API 单价反推估算'])if(!s.includes(x))throw Error(x);console.log((s.match(/<text/g)||[]).length)"`；输出标签数 ≥ 5。
7. 不足 6 周：`node -e "const s=require('fs').readFileSync('dist/api-pricing/index.html','utf8');if(!s.includes('需 6 周')||s.includes('data-history-line'))process.exit(1)"`；积累文案存在且历史折线专用标记不存在。
8. 溢出：`node scripts/metrics/copy-density.mjs --live`；320/375/414/768/1024/1440 × 6 路由横向溢出均为 0（实证：requirements.md:71）。
9. 体积：构建前后记录 `dist/api-pricing/index.html` 字节数；增量 < 60KB（实证：issues-dossier.md:66）。
10. 主题与禁 JS：1440/375 各截深浅色且禁 JS 页面；SVG 可见、文字可读、颜色样式只含 `var(--*)`（待验证：截图与 CSS 搜索）。
