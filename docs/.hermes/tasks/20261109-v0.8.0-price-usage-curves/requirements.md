# v0.8.0 价格与用量曲线 · 任务书

> 本文件是**任务书**。需求真源 = GitHub #14 / #3，全文见 `issues-dossier.md`。
> 只做三件事：钉死已核实事实、划批次与验收口径、声明红线。

## 一、迭代范围

| 批 | 票 | 交付 |
|---|---|---|
| B1 | #14 Phase 1 | 价格-能力散点（横轴 3:1 混合单价对数，纵轴智能指数，标 Pareto 前沿） |
| B2 | #14 Phase 2 | 价格构成（输入 / 输出 / 缓存读 / 缓存写 四段堆叠条） |
| B3 | #14 Phase 3 | 价格走势（读 v0.7.0 已建的历史快照；不满 6 周则如实标「积累中」，不画插值） |
| B4 | #3 | 用量-成本曲线（横轴月 Token 用量 1M→1000M 对数，纵轴月成本，标排位反转点） |

四批共用同一套手写 SVG 渲染层与同一份数据接入。批次顺序固定。

## 二、已核实事实表（编排层亲验，可直接引用，不得改名）

| 编号 | 事实 | 实证 |
|---|---|---|
| F1 | 数据入口：`apiPrices`（合并后的价格条目）、`tokenPlans`（套餐）、`benchmarkDoc`（智能基准）、`fxRate`、`providers`、`DATA_VERIFIED_AT` | `src/lib/data.ts:20`-`:46` |
| F2 | 行数据装配 `buildPriceRow(item, fxRate)`；`RowScore` 类型定义在 | `src/lib/price-row.ts:39`、`:5` |
| F3 | 混合单价与性价比：`blendPerMillion(item)`（3 输入 : 1 输出）、`buildRowScore(item, doc)`、`formatCostPerPoint(v)` | `src/lib/benchmark-view.ts:38`、`:50`、`:105` |
| F4 | 套餐与 API 折算：`computeBreakEven`、`comparePlanVsApi`、`DEFAULT_BLEND_RATIO = 3` | `src/lib/plan-vs-api.ts:187`、`:251`、`:19` |
| F5 | 主题真源是 CSS 变量：`--ink`/`--muted`/`--line`/`--paper`/`--wash`/`--brand`/`--good` 等，暗色在 `@media (prefers-color-scheme: dark)` 内重定义 | `src/styles/global.css:9`、`:1076` |
| F6 | API 页结构：hero（`:113`）→ ConclusionCards（`:123`）→ FilterBar（`:128`）→ PriceTable（桌面，`:133`）/ 移动端卡片列表 | `src/views/ApiPricingView.vue` |
| F7 | 构建期预渲染：`scripts/prerender.mjs` 按 `PRERENDER_ROUTES` 逐路由写 `dist/<route>/index.html` | `scripts/prerender.mjs:140`-`:149` |
| F8 | 产物门禁 P2 要求静态 HTML 里 API 页 `$` 与 `¥` 各 ≥50 处、「官方标价」存在 | `scripts/verify-static-build.mjs:72`-`:74` |
| F9 | 无图表库：`dependencies` 只有 vue / vue-router / zod | `package.json` |
| F10 | 历史快照已交付：`src/data/history/price-history.jsonl`（v0.7.0 建，事件形如 `{date,kind,entries}`，`delta` 只记变化） | v0.7.0 交付，`docs/.hermes/tasks/20261109-v0.7.0-data-base/FINAL-ACCEPTANCE.md` |
| F11 | 门禁：`node scripts/qa/run-gates.mjs` 跑 6 条（typecheck / test / build / data-verify / 两个派生 `--check`） | 本仓 `docs/.hermes/gates.json` |
| F12 | 约束性测试：`tests/layout-width.test.ts`、`tests/ux-refactor.test.ts`、`tests/layout-measure.test.ts`、`tests/verify-static-build.test.ts` 断言列数/宽度/静态内容，新增图形不得破坏 | `tests/` |

## 三、待设计轮定的问题（有设计空间，不许照稿抄）

1. **图放哪**：API 页内嵌 vs 独立路由（`/api-pricing/` 之下 vs 新路由）；首页是否要一张小图。
2. **控件形态**：图与表格的联动（选中某点高亮对应行？筛选器是否作用于图？），点密度（178 条里 32 条有分）如何处理避免糊成一团。
3. **Pareto 前沿定义**：严格支配（同币种内「价更低且分不低于」）如何实现与展示；跨币种如何处理（票面要求不做跨币种排名结论）。
4. **价格构成的数据完整性**：很多条目 `cacheWritePrice` 为 null，堆叠条缺段怎么画（留空 + 标注，不补零）。
5. **走势图数据门槛**：快照目前只有 1 天（2026-11-09），不满 6 周时页面怎么如实表达；是否先只画「本次 vs 上次」。
6. **#3 的套餐折线**：套餐额度语义常是「5 小时 N 次请求」而非 token，票面要求区分「可精确折算的 API 单价曲线」与「只能估的套餐」，怎么做视觉区分。
7. **SVG 实现边界**：坐标算在 lib（可测）还是组件里；如何保证构建期就算好坐标并写进预渲染 HTML。

## 四、红线

1. 不引入图表库或任何新运行时依赖。
2. **图里不重算业务数值**：一律调用 `blendPerMillion` / `buildRowScore` / `computeBreakEven` 等既有函数，禁止图内另写一套公式。
3. 未评测（缺分）条目不许进散点图，不许用 0 分顶替；缺价段不补零。
4. 不做跨币种排名结论（与表格口径一致）。
5. 禁用 JS 时静态 HTML 里必须能看到图与至少 5 个标注数值（SSR 阶段就得算好）。
6. 不改官方价格数据、不改 `src/data/generated/`、不改 `src/data/estimates/*`。
7. 1440 与 375 两个视口都不得横向溢出；深浅色都要可读（色值全部走 CSS 变量）。
8. 编码 UTF-8；新文件 LF；改既有文件保持原行尾（`.vue`/`.css`/`.ts` 现为 LF，`src/data/**` 有 CRLF 文件，改前用字节探针）；不写 emoji。

## 五、三锻收口铁律（所有阶段继承）

状态链 `implementing → acceptance →（failed → rework → acceptance）→ accepted_pending_commit → committed_pending_report → completed`。

1. 验收通过才可提交；编码完成、单测部分绿不算。
2. 失败只返工失败项，范围限该失败项与必要根因；不许删断言/放宽判据换通过。
3. 按迭代合并提交，由编排层执行；执行体不做任何 git 操作。
4. 终验报告是完成门，五段：范围清单 / 逐项结论与证据 / 失败返工复验链 / 提交哈希 / 遗留边界。
5. 报告入库不算第二个功能批。

## 六、验收口径（编排层亲跑）

| 项 | 判据 |
|---|---|
| 门禁 | `node scripts/qa/run-gates.mjs` 6 条全绿（测试 ≥ 580 项） |
| 静态产物 | 禁 JS 打开 `dist/api-pricing/index.html` 能看到 SVG 与 ≥5 个标注数值；P1–P5 门禁仍绿 |
| 溢出 | 320 / 375 / 414 / 768 / 1024 / 1440 × 6 路由横向溢出 = 0（可复用 `scripts/metrics/copy-density.mjs --live` 的视口矩阵） |
| 数值同源 | 图上 10 个点与表格对应行数值一致（写测试对拍） |
| Pareto | 给定 (价, 分) 集合，前沿判定可复现（单测） |
| 走势 | 快照不足 6 周时页面显式标「积累中」，不得出现插值曲线 |
| 构成 | 缺 `cacheWritePrice` 的条目不画该段且标注，不补零 |
