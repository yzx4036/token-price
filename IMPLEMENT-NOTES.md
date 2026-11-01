# IMPLEMENT-NOTES · v0.4.0 比价体验重构

对应 issue：#4（国内外筛选）· #2（表头排序）· #1（信息密度）
真源：`docs/.hermes/tasks/20261101-v0.4.0-ux-refactor/requirements.md`

## 〇、执行经过（必须如实记录）

1. 本任务委派 OpenCode 执行。它切到 `gpt-5.6-sol` 后额度耗尽，**只做了分析就退出**（`OC_RC=0` 但零产出，`git status` 无源码改动）——典型的「返回码成功但没干活」。
2. 随后由编排层直接实现 #4/#2/#1 的主体。
3. 实现过程中发现**另一执行体在同一工作树并行改动**，其改动已并入本交付，清单见下。合并后的状态通过了全部四道门禁与浏览器实测。

## 一、并行汇入的外部改动（非编排层所写，已审阅）

| 文件 | 改动 | 评估 |
|---|---|---|
| `src/main.ts` | `createApp` → `createSSRApp` | 采纳。让 `mount()` 走 hydration 而不是清空静态 HTML 重绘，方向正确 |
| `src/composables/useMediaQuery.ts` | `matchMedia` 从 setup 顶层挪到 `onMounted` | 采纳。这是 `createSSRApp` 下**必须**的配套改动：首次渲染固定为移动优先、与 SSR 输出一致，否则 hydration mismatch |
| `src/lib/stats.ts` | 新增 `computeApiConclusions` / `computePlanConclusions` | 采纳。结论卡口径下沉到 lib |
| `tests/ux-refactor.test.ts` | 新增 15 项 | 采纳，全绿 |

**已知技术债（登记，不在本轮修）**：`computePlanConclusions`（stats.ts）与 `cheapestPlanByCurrency`（plans.ts）功能重叠，两个实现并存。二者都对、都有测试，但应合并为一个，留待审查轮处理。

## 二、编排层实现的改动

### #4 国内 / 国外筛选
- `src/lib/filters.ts`：`FilterState` 增 `region`，抽出 `SortKey` / `SortOrder` / `nextSortState()`
- `src/lib/pricing.ts`：`filterAndSortApiPrices` 增第 4 参 `regionByProviderId`
- `src/lib/plans.ts`（新）：套餐 `filterPlansByRegion` / `sortPlans` / `cheapestPlanByCurrency` 提为纯函数，视图不再直接读 `.monthlyPrice`
- `FilterBar.vue`：三段式分段控件（全部/国内/国外），带 `aria-pressed`
- `PlansView.vue`：同样的地区筛选

**口径决定**：无 region 映射的厂商 **fail-closed** —— 只在「全部」出现，不落进国内或国外；否则两侧之和会大于全部。仓库 19 家厂商全部有 region，并有断言守住。

### #2 点击表头排序
- `PriceTable.vue`：可排序列表头改 `<button>`，带 `aria-sort` 与 ▲▼
- 同列再点反转，换列重置为升序
- 套餐页：月费 / 厂商两列可排序
- 窄屏没表头，排序入口留在筛选区（下拉 + 升降序按钮）

**口径守住**：跨币种不排名；`desc` 不会把 CNY 组翻到 USD 组前；缺值永远排组末。

### #1 信息密度重构
1. 免责 details 默认折叠（原桌面默认展开，单块 309px），并移到表格之后
2. 紧凑 hero：数据页 h1 从 69px 降到 ~34px
3. 结论卡 `ConclusionCards.vue`：桌面与标题并排（不占纵向），移动三列紧凑排
4. 表格分层：API 7→5 列（Cache 读写进折叠）；套餐 7→4 列（周期/模型/用途限制进折叠，主表留「额度核心」= 第一小句）
5. **长文本只折叠不删除**

### URL 状态同步
`src/lib/url-state.ts`（新）：`?q=&provider=&provenance=&region=&sort=&order=`。只在 `onMounted` 后读，构建期用默认值；非法值回落不抛错；写回用 `replaceState`。

## 三、实测前后对比（1440×900，真实 Chrome）

| 指标 | 前 | 后 | 目标 | |
|---|---|---|---|---|
| API 首屏完整可见行 | 1 | **9** | ≥8 | ✅ |
| API 第一个价格 top | 826px | **384px** | ≤400 | ✅ |
| API 列数 | 7 | **5** | 5 | ✅ |
| API 单行最高 | 77px | **57px** | — | ✅ |
| 套餐单行最高 | 140px | **51px** | ≤60 | ✅ |
| 套餐列数 | 7 | **4** | ≤5 | ✅ |
| 套餐首屏可见行 | 6 | **8** | — | ✅ |
| 结论卡 | 0 | **3 / 3** | 3 / 3 | ✅ |
| 横向溢出（7 视口 × 7 路由） | 0 | **0（全 ≤0）** | 全 ≤0 | ✅ |

### 移动端（过程中发现并修掉两个回归）

首版结论卡竖排 + 筛选区 4 行，导致首屏看不到价格（801px）、3 个触控目标 <44px。
修法：结论卡窄屏三列紧凑排、筛选区两列改三列（4 行→3 行，294→220px）、分段控件与排序按钮抬到 44px。

| 视口 | 首价格 top / 视口 | 首屏可见 | 触控不达标 | 溢出 |
|---|---|---|---|---|
| 320×640 | 617 / 640 | ✅ | 0 | 0 |
| 375×667 | 654 / 667 | ✅ | 0 | 0 |
| 414×896 | 654 / 896 | ✅ | 0 | 0 |

## 四、功能实测

- 国内 **88** + 国外 **81** = 全部 **169**（不重不漏）
- 点「输出价」表头 → 首行 Ministral 3 3B、箭头 ▲；再点 → 首行 GPT-5.4 Pro、箭头 ▼
- 排序后币种分组：`USD 全在 CNY 之前 ✓`
- 带参 `?region=cn&sort=outputPrice&order=desc` → 88 条、地区「国内」高亮、箭头 ▼（状态保持）
- 控制台：**无 error、无 hydration mismatch 警告**

## 五、门禁

| 门 | 结果 |
|---|---|
| `npm run typecheck` | **0 error** |
| `npm test -- --run` | **267 passed / 17 files**（原 234 条一条未删未跳过；新增 33 条） |
| `npm run build`（base=/token-price） | 成功，6 路由 |
| `verify-static-build.mjs` P1–P5 | 通过 |
| `git status --short src/data/` | **空**（数据零改动） |
| 禁用 JS | api-pricing **444** 个 `$`、plans 72 个 `$` + 档位名在 HTML 里 |

## 六、取舍与遗留

1. **免责说明移到表格后**：折叠后仍占 46px，移后让首屏更干净；代价是可发现性略降。它是免责声明而非操作入口，页脚位置合理。
2. **h1 缩小**：数据页从 69px→34px。数据页价值在表格不在大标题；首页保留展示级字号。
3. **Cache 两列折进 details**：它们多为「待核验」，占列不提供信息；但偶有已核验值，故只折叠不删。
4. **排序只在客户端生效**：SSR 一律输出默认顺序。这是预渲染站的必然取舍，换来「禁用 JS 也能看到完整价格」。
5. **首帧仍有卡片→表格切换**：`useMediaQuery` 延到 `onMounted` 后，桌面首帧先出卡片再切表格。这是 hydration 一致性的代价，视觉切换在毫秒级，且切换前后价格都在 DOM 里。
6. **遗留**：`computePlanConclusions` 与 `cheapestPlanByCurrency` 重复实现待合并；#3 价格曲线图按决定搁置，已转 v0.5.0 里程碑。
