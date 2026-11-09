# 第二轮返工结果：给四张图加移动层（OpenCode 执行体）

## 0. 效力声明与范围

本轮只做票面列出的那一件事：给「价格与能力散点 / 价格构成 / 价格走势 / 用量与成本」四张图加移动层，
两层都进 SSR，只用媒体查询切换显示；桌面层版式不动。

- 几何判据用仓库里的编排层仪表 `scripts/qa/chart-probe.mjs`（本机 Edge headless）实测，375 / 1440 / 320 三档各跑两遍（改前基线、改后）。
- 探针跑在 `vite dev`（8816 端口）上，不写 dist；按纪律**没有**跑 `npm run build`、`scripts/qa/run-gates.mjs`，也没有做任何 git 操作。
- 本文件只声明「改动已完成 + 断言可红（附实测变异）」，不声称独立验收；最终验收由编排层亲跑 build 与 run-gates。

## 1. 结论先说

| 判据 | 结果 |
|---|---|
| 375 视口 | **PASS**：7 个可见 SVG 全部为移动层，`svg 325px / viewBox 360`（scale 0.903），文字框重叠 0、裁切 0、横向溢出 0 |
| 320 视口 | 横向溢出 0、重叠 0、裁切 0；探针的 `scale >= 0.85` 一项仍报红（270/360 = 0.75），见 §7 说明 |
| 1440 视口 | **PASS**：7 个可见 SVG 全部为桌面层（移动层 `display:none`），`663px / 640`（scale 1.035），重叠 0、裁切 0、溢出 0；散点标签 12（USD）+ 9（CNY） |
| 静态产物 | 每个 figure 内两个 `<svg>`（`chart-layer-desktop` / `chart-layer-mobile`），`NaN/Infinity/undefined` 命中 0（SSR 断言，见 §5.2） |
| 门禁 | `npx vitest run` → 36 文件 638 项全绿、0 skip；`npm run typecheck` 零错误 |

## 2. 改了什么

### 2.1 两层结构（组件）

- `SvgChartFrame.vue`：一个 `<figure>` 里两个 `<svg>`，各自带 `<title>/<desc>` 与 `aria-labelledby`，
  `figcaption` 共享；新增 `mobileViewBox` prop 与 `#mobile` 插槽。
- 新增四个 Plot 组件（`ScatterPlot / CompositionPlot / HistoryPlot / UsageCostPlot`）：同一份模板按图层渲染，
  避免两套手写标记日后漂移；坐标、anchor、字号全部来自数据层。
- 四个 Chart 组件把 `groups` 与 `mobile.groups` 按币种配对（`facets`），一层一个 figure。
- 图注按层切换：`.chart-caption-desktop / .chart-caption-mobile`（「展示 4/88 条」这类计数必须与可见层一致），
  用量图的 pair 图例也只列本层画出来的条数（桌面 5+5、移动 3+3）。

### 2.2 数据层（`src/lib/pricing-chart-data.ts`）

1. **移动 frame 常量**：四张图各有自己的移动 frame，宽度一律 360；高度按内容定（散点 330、构成 170、走势 300、用量 320）。
   `375 视口下 .pricing-chart 内 svg 实测 325px → 缩放 0.903`，14 用户单位文字 ≈ 12.6px。
2. **文字包围盒估算 + 布局**（`planLabels` / `textBox` / `tickAnchor` / `fitText`）：
   构建期没有测量接口，按字号估宽高（ASCII 0.62em、全角 1.02em、上伸 1.08em、下伸 0.25em，偏大取值），
   标签依次尝试「上 / 下 / 右 / 左」，取第一个不与走位框相交且在画布内的位置；轴文字先占位，点标签再挑空位。
3. **贴边刻度改 anchor**：位置 ± 半个字宽越出画布时改用 `start/end`，长模型名与末端刻度不再被裁。
4. **每个模型新增 `mobile` 字段**（`{ viewBox, groups }`，用量图再加 `currentX/currentY/lineTop/lineBottom`）。
   桌面字段（`viewBox` / `groups` / `currentX` / `currentLabel`）保持原样，仍是 640 版式，测试读到的都是桌面层。
5. 移动层内容裁剪在数据层完成（行数、pair 数、标签数、截断），组件不做业务判断。

### 2.3 CSS（`src/styles/global.css` 图表段）

```css
.pricing-chart .chart-layer-mobile { display: none; }
.chart-caption-mobile { display: none; }
@media (max-width: 767px) {
  .pricing-chart .chart-layer-desktop { display: none; }
  .pricing-chart .chart-layer-mobile { display: block; }
  .chart-caption-desktop { display: none; }
  .chart-caption-mobile { display: revert; }
  .pricing-chart text { font-size: 14px; }
  .pricing-chart .chart-label { font-size: 14px; }
}
```

原来的 29/30 用户单位字号 hack 删除：那是给 640 宽 viewBox 被缩到 0.51 打补丁；移动层 360 宽后 14 用户单位就够 12.6px。
`.chart-desktop-label, .chart-desktop-point { display: none; }` 这条既有规则保留（既有断言与降级行为都还依赖它）。

## 3. 移动层与桌面层各画什么

| 图 | 桌面层（640×h，1440 下 663px） | 移动层（360×h，375 下 325px） |
|---|---|---|
| 价格与能力散点 | 全部点大圆点 + 前沿折线 + 12 个代表标签（实际 USD 12 / CNY 9）+ 6 个 x 刻度 + 5 个 y 刻度 + 两轴标题 | 全部点小圆点（r=3）+ 同币种前沿折线 + **5 个**代表标签（前沿优先、再极值、再稳定 ID）+ 6 个 x 刻度 + 5 个 y 刻度 + 两轴标题 |
| 价格构成 | 每币种 8 行、行距 31、缺价提示 `无缓存读价 · 无缓存写价` | 每币种 **4 行**、行距 36、缺价提示压成 `无缓存读/缓存写价` 把宽度让给模型名（仍逐项点名缺哪个价） |
| 价格走势 | 空态两行状态文字；就绪态按真实观察点连线 | 同一状态与同一批观察点，只是按 360 宽重排（空态文字居中 180） |
| 用量与成本 | 每币种 5 条 pair、最多 5 个交点标注、当前用量标线 + 文字 | 每币种 **3 条 pair**、最多 3 个交点标注（够不着空位就不标）、当前用量标线 + 文字，图例保留 |

## 4. 落点

| 文件 | 落点 | 内容 |
|---|---|---|
| `src/lib/pricing-chart-data.ts` | `:14-17` | 四个移动 frame 常量（宽 360） |
| 同上 | `:77` | `planLabels`：四方向候选 + 包围盒排斥 |
| 同上 | `:100` | `DESKTOP_LABEL_TEXT = 14`（实测 `.chart-label` 的 12px 被 `.pricing-chart text` 覆盖） |
| 同上 | `:119` / `:131` | 桌面 / 移动两套轴版式（桌面逐项等于改造前） |
| 同上 | `:157-224` | `buildScatterChart`：两套坐标（`x/y` 与 `mx/my`）、两层标签（12 / 5）、`mobile` 层 |
| 同上 | `:243-285` | `compositionGroups`（行数 8/4、行距 31/36、移动层缺价文案与截断）、`buildCompositionChart` 的 `mobile` |
| 同上 | `:304-382` | `buildHistoryChart`：`groupsFor(frame, mobile)` 两次成图，观察点同源 |
| 同上 | `:407-505` | `buildUsageCostChart`：`groupsFor(frame, 5|3)`、交点标注占位、`mobile` 层 |
| `SvgChartFrame.vue` | `:9-19` | 两个 `<svg>` + `#mobile` 插槽 |
| `ScatterPlot.vue` / `CompositionPlot.vue` / `HistoryPlot.vue` / `UsageCostPlot.vue` | 全文（新增） | 图层模板，坐标/anchor/字号全部取自模型 |
| `ScatterChart.vue` / `CompositionChart.vue` / `HistoryChart.vue` / `UsageCostChart.vue` | `facets` 与 `#mobile` | 按币种配对两层、图注按层切换 |
| `src/styles/global.css` | `:1306-1307`、`:1342-1354` | 图层显隐 + 图注显隐 + 移动层字号 |
| `tests/pricing-chart-data.test.ts` | `:284-359` | 新增 `describe('移动层（360 宽）')` 四条 |
| `tests/pricing-charts-render.test.ts` | `:139-235` | 新增 `describe('移动层几何（360 宽，SSR 产物）')` 两条；既有三条按两层口径改写 |

## 5. 新增 / 改写的测试与变异

### 5.1 改写的既有断言（前提变了，不是放宽）

| 原断言 | 现在 | 为什么 |
|---|---|---|
| `满六周 SSR` 中 `<circle>` 数 = 2 | = 4，且分层各 2 | 两层都 SSR，圆心数是两倍 |
| `用量图 SSR` 中 `<circle>` 数 = 桌面交点数 | = 桌面 + 移动交点数，且分层核对 | 同上 |
| 移动字号按 `270/640` 折算 ≥ 12 | 按 `325/360` 折算 ≥ 12 | 移动层 viewBox 从 640 改到 360，除数跟着变 |
| 其余 49 条 | 原样通过 | 未改任何数据/公式断言 |

### 5.2 新增断言与变异（每条都实测变红并已还原）

| 用例 | 位置 | 断言 | 变异方式 → 实测结果 |
|---|---|---|---|
| 散点移动层宽 360、每币种最多 5 个标签、坐标按移动 frame 重排 | `pricing-chart-data.test.ts:285-309` | `mobile.viewBox='0 0 360 330'`；`labelled.length ∈ (0,5]`；`point.mx===point.x` 且与桌面 x 不同；非前沿点保留圆点 | `pricing-chart-data.ts:207` `planLabels(mobileSequence, 5, …)` → `12` → **红**：`expected 7 to be less than or equal to 5` |
| 价格构成移动层 4 行、行距 36 | `:310-321` | `rows` 长度 4、`y=[30,66,102,138]`、`total > shown`、桌面仍 8 行 | `:284` `compositionGroups(api, mobileFrame, 4, 36, true)` → `8` → **红**：`expected [...] to have a length of 4 but got 8` |
| 用量-成本移动层最多 3 条 pair | `:322-341` | `pairs.length <= 3`、`shown === pairs.length`、移动交点仍逐点落回月费、`mobile.currentX ≠ currentX` 且在 0..360 | `:494` `groupsFor(mobileFrame, 3, true)` → `5` → **红**：`expected 5 to be less than or equal to 3` |
| 走势移动层沿用同一批观察点 | `:342-359` | 移动层与桌面层日期/价格序列相等、`path` 有、x 在 0..360 | `:379` `groupsFor(mobileFrame, true)` → `groupsFor(frame, true)`（移动层误用桌面 frame）→ **红**：`expected 369.1707317073171 to be less than or equal to 360` |
| 同一 figure 内两层并存；移动层文字框两两不交且不越界 | `pricing-charts-render.test.ts:200-217` | 7 个 figure 各两个 svg；移动层 `viewBox` 宽 360；每个 text 框在画布 ±2 内；两两重叠两个方向都 >2px 即失败 | ① `:37` `GAP = 1` → `-6` → **红**：`Claude Opus 5.5 与 GPT-6.1 Sol 文字框相交`；② `:14` `MOBILE_CHART_FRAME.width` 360 → 640 → **红**：`expected 640 to be 360`；③ `HistoryChart.vue:21` 空态移动层 `x="180"` → `320` → **红**：`历史积累中（已 1 天，需 6 周） 右越界: expected 427.1 to be less than or equal to 362` |
| 走势就绪态移动层同样可读 | `:218-234` | 42 天 fixture 的移动层含 `data-history-line`，文字框同样不交不越界 | 同上第三条（同一 `assertReadableLayer`） |
| 图例按层列出本层 pair | `:106-111` | 桌面 pair 图例 10 项、移动 6 项、`mobile.groups` 每组 3 条 | `:494` 3 → 5 → **红**：`expected 5 to be less than or equal to 3`（数据用例）+ 图例项数变 10 |
| CSS 只切显示、按 360 折算字号 | `:119-135` | `.chart-layer-mobile{display:none}`、媒体查询里反转、`14 * 325/360 >= 12` | 删掉媒体查询里的 `.pricing-chart .chart-layer-desktop { display: none; }` → **红**：`expected '@media (max-width: 767px) {\n  /* 移动层…' to contain '.pricing-chart .chart-layer-desktop {…'` |

六条变异全部实测变红、全部已还原（`diff -q` 对备份逐字节回读确认），还原后 638 项全绿。

## 6. 探针实测读数（`scripts/qa/chart-probe.mjs`）

改造前基线取自仓库里 12:53 的 `dist` 产物（N-4 字号补丁之前的构建，仅作方向对比）：

| 视口 | 改造前 | 改造后 |
|---|---|---|
| 375 | 7 个 svg 全 `640`（scale 0.508）；重叠 11/8/15/19/0/10/11；裁切 7/5/0/0/0/5/5 | 7 个 svg 全 `360`（scale 0.903，325px）；重叠 0；裁切 0；横向溢出 0 → **PASS** |
| 1440 | 重叠 2/2/0/0/0/2/2；裁切 1/1/0/0/0/0/0 | 重叠 0；裁切 0；横向溢出 0；散点 text 25（12 标签）/20（9 标签）→ **PASS** |
| 320 | 重叠 5/4/1/0/0/6/7；裁切 5/3/0/0/0/5/5 | 重叠 0；裁切 0；横向溢出 0；`scale 0.75` 报红（见 §7） |

## 7. 需要编排层知道的两处取舍

### 7.1 320 的 `scale < 0.85`

移动层 viewBox 按票面取 360。320 视口下 `.shell` 是 `100% - 32px = 288`，`.pricing-chart` 内边距 8+8、边框 1+1，
svg 实测 270px → `270/360 = 0.75`，探针的「未被大幅缩小」这条在 320 必然报红。
这是 360 这个宽度在 320 屏上的算术结果：要过 0.85 得让 viewBox ≤ 317，与票面「宽度取 360」冲突，故未改。
票面给 320 的判据只有「无横向溢出」，实测为 0。若编排层要求 320 也过 scale，请裁定是否允许把移动层 viewBox 收到 315 或把 `.shell`  gutter 在 ≤360 收窄。

### 7.2 桌面层修了三处既存压字/裁切（内容与标签数不变）

1440 基线探针本身是红的，成因都在改造前的桌面排版里：

1. 纵轴标题与顶部 y 刻度重叠 6.6px（`智能指数` / `USD / 月（对数）` / `USD / 百万 token（3:1）`）：
   纵轴标题 x 从 `10`（散点）/`64`（用量、走势）移到 `100`，仍在绘图区左上角，与刻度列不再相交。
2. 点标签压住 y 刻度（`GPT-6 Luna` 压 `29.2`、`deepseek-flash（空闲时…` 压 `34.5`）、
   以及右侧长标签被裁 58px（`GPT-6 Astra（长上下文 >…`）、另一处裁 13px（`Kimi K3.1 Pro`）：
   标签改为走 §2.2 的四方向避让 + 画布内收，标签上限仍是 12。
3. 用量图的交点标注互相压（`≈5M` 压 `≈4.997M`、`$5` 压 `≈1.248M`、CNY 两组同型）：
   交点标注改为占位式排布（桌面最多 5 个、移动最多 3 个），压住的那个不再画字但仍保留圆点与 `<title>`。

副作用（如实报告）：CNY 散点桌面标签从 7 个变成 9 个（避让算法能放下更多），
USD 仍是 12 个；曲线、刻度、颜色、行数、图注全未变。

## 8. 红线复查

| 项 | 结论 | 证据 |
|---|---|---|
| 只改图表相关文件 | 通过 | 改动 = `src/lib/pricing-chart-data.ts`、`src/components/pricing-charts/*`（4 个既有 + 4 个新增 Plot）、`src/styles/global.css` 图表段、`tests/` 两个图表测试 + 本文件 |
| 不碰 `src/data/**` | 通过 | `git status --porcelain` 无 `src/data` 条目 |
| 不改业务公式 | 通过 | 价格、评分、保本点、交点反解全部仍调用 `comparePlanVsApi / computeBreakEven / paretoFrontier`；移动层只换了 frame 与取样条数 |
| 不引依赖 | 通过 | `package.json` 未改（仍 vue / vue-router / zod + 既有 devDependencies） |
| 不做 git 操作 | 通过 | 未 `add/commit/push`；未跑 `build`、`run-gates.mjs` |
| 行尾 / 编码 / 无 emoji | 通过 | 13 个改动文件逐个探针：`crlf=0`（`pricing-chart-data.ts` 507 LF、`global.css` 1354 LF、两个测试 226 / 359 LF、8 个组件 14-40 LF）；`\p{Extended_Pictographic}` 命中 0（`global.css` 里 4 个是既有注释里的旧 emoji，不在本轮改动行） |
| 静态产物禁 JS | 通过 | 两层都由 SSR 输出（`pricing-charts-render.test.ts:200` 断言 7+7 个图层 svg）；显隐只靠媒体查询 |
| 颜色只用变量 | 通过 | 图表段仍无 `#hex` / `rgb()` / `hsl()`（既有断言 `:121` 绿） |
| 现有测试不红不 skip | 通过 | `npx vitest run` 36 文件 / 638 项全过，无 skip，图表 3 文件 58 项（改造前 52） |

## 9. 本轮自跑的命令与读数

- `node scripts/qa/chart-probe.mjs --url http://localhost:8816/api-pricing/ --viewport 375,1440,320`
  （dev server，本机 Edge headless）：375 PASS / 1440 PASS / 320 仅 scale 一项红（§7.1）。
- `npx.cmd vitest run` → **36 文件 / 638 项全过**（改造前 632，+6）。
- `npx.cmd vitest run tests/chart-geometry.test.ts tests/pricing-chart-data.test.ts tests/pricing-charts-render.test.ts` → **3 文件 / 58 项全过**（改造前 52）。
- `npm.cmd run typecheck` → 零错误。
- 变异 6 次（§5.2），全部按预期变红并已还原；还原后上述命令重跑仍全绿。

留给编排层复验（本轮按纪律未跑）：`npm run build`、`node scripts/qa/run-gates.mjs`、
`dist/api-pricing/index.html` 的静态 grep（每个 figure 两个 `<svg>`、`chart-layer-mobile` 出现 7 次、`NaN|Infinity|undefined` 命中 0）、
以及 375 截图的目视确认。
