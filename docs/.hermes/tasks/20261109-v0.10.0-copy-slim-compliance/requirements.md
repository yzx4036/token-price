# v0.10.0 文案合规与措辞 · 任务书

> 本文件是**任务书**。需求真源 = GitHub #12 / #13，全文见 `issues-dossier.md`。
> 本迭代只动**文案与术语**，不动数据金额、不动图表几何、不动排序筛选。

## 一、迭代范围

| 批 | 票 | 交付 |
|---|---|---|
| B1 | #12 | 全站文案合规：越权措辞清零、免责与商标口径补全、绝对化用语清理 |
| B2 | #13 | 文本简约：声明去重、条目内估算日期上提、首屏瘦身、页高压缩 |

B1 先于 B2：口径定稿后再删重复，否则删完又要按新口径补回来。

## 二、已核实事实表（编排层亲验）

| 编号 | 事实 | 实证 |
|---|---|---|
| F1 | 免责真源 `SITE_DISCLAIMER`（「个人维护…与所收录厂商无隶属、合作或授权关系…不构成采购、财务或法律建议…商标归各自权利人」） | `src/lib/site-meta.ts` |
| F2 | 术语真源：`PROVENANCE_OFFICIAL`「官方页抓取」、`PROVENANCE_AGGREGATE`「聚合数据」、`AGGREGATE_NOTE`、`OFFICIAL_PRICE_LABEL`、`FETCHED_AT_LABEL`；旧词（「官方核验」等）由 `tests/copy.test.ts` 拦截 | `src/lib/copy.ts`、`tests/copy.test.ts` |
| F3 | 展示侧合规三条（不得暗示官方背书 / 不得代厂商表态 / 免责四要素） | `docs/compliance/data-fetching.md` 第三节 |
| F4 | 文案密度基线（**已按 v0.8.0 现状重采**） | `docs/metrics/copy-density-baseline.json` |
| F5 | 探针 `scripts/metrics/copy-density.mjs`：static 与 live 双模式，`--compare` 判据未达标退出码 1；live 已修「先设视口再导航」 | 脚本本体 |
| F6 | 文案承载文件：`HomeView` / `ApiPricingView` / `PlansView` / `MethodologyView` / `SourcesView` / `CalculatorView` / `AppFooter` / `ConclusionCards` / `KeyFacts` / `FilterBar`，以及本轮图表文案 `src/components/pricing-charts/*` | `src/views/`、`src/components/` |
| F7 | 当前基线（live，中文可见字数） | 见下表 |

### F7 基线读数（v0.8.0，2026-11-09）

| 路由 | 375 首屏 | 768 首屏 | 1440 首屏 | 1440 页高 |
|---|---:|---:|---:|---:|
| `/` | 230 | 331 | 391 | 1881 |
| `/api-pricing/` | 205 | 614 | 134 | 14379 |
| `/plans/` | 349 | 918 | 148 | 4168 |
| `/calculator/` | 144 | 224 | 381 | 1928 |
| `/sources/` | 82 | 266 | 370 | 3802 |
| `/methodology/` | 237 | 544 | 520 | 2965 |

三视口 × 6 路由横向溢出均为 0（既有成果，不许破坏）。

## 三、待设计轮定的问题

1. **免责收口方式**：`SITE_DISCLAIMER` 放页脚一处 + 口径页一处，其余页面用什么最短句式替代（需保留四要素的可达性）。
2. **条目内估算日期怎么上提**：表头加一列「≈ 按 X 汇率」？还是表格上方一行统一声明 + 单元格只留 `≈ ¥X`？两种在移动卡片层怎么落地。
3. **声明重复的守卫写法**：`tests/copy.test.ts` 现有旧词守卫之外，新增「同一句式全页出现 ≤1 次」怎么测（渲染文本 vs 构建产物 vs 组件源码），哪种不会被 SSR 结构变化误伤。
4. **首屏瘦身取舍**：`/plans/` 768 首屏 918 字、`/api-pricing/` 768 首屏 614 字是最大超标项，具体删/并哪几段。
5. **合规措辞清单**：除「官方核验」外还有哪些词需要清理（如「官方原价」「最新」「权威」），一次列全，避免下轮再补。

## 四、红线

1. 不改任何价格、套餐、分数、汇率数值；不动 `src/data/**`。
2. 不改图表几何与坐标（图内标注文案可改）。
3. 不得删除事实性信息：删的是**重复表述**，数据纪律项必须仍可达（折叠或口径页）。
4. 免责四要素必须完整可达，真源仍在 `src/lib/site-meta.ts`，不许各页各写一份。
5. `tests/copy.test.ts` 旧词不得回流；新增「声明重复」守卫要能红（造反例证明）。
6. 文案密度判据由 `npm run metrics:copy:compare` 判定（数据页 375≤200 / 768≤350 / 1440≤220；说明页首屏不增；数据页 1440 页高降 ≥15%、说明页 ≥10%；声明重复 ≤1）。
7. 编码 UTF-8；改既有文件保持原行尾（`src/data/**` 有 CRLF，本轮原则上不碰）；不写 emoji。

## 五、三锻收口铁律

状态链 `implementing → acceptance →（failed → rework → acceptance）→ accepted_pending_commit → committed_pending_report → completed`；验收通过才提交；失败只返工失败项；按迭代合并提交（编排层执行，执行体不做 git）；终验报告五段；报告入库不算第二个功能批。

## 六、验收口径

| 项 | 判据 |
|---|---|
| 门禁 | `node scripts/qa/run-gates.mjs` 6 条全绿（测试 ≥ 638 项） |
| 文案密度 | `npm run metrics:copy:compare` + live 模式对比基线，退出码 0 |
| 旧词 | `tests/copy.test.ts` 全绿，且新增合规词表守卫 |
| 免责 | 页脚与口径页各一处完整四要素；禁 JS 静态 HTML 里仍可见 |
| 图表 | `node scripts/qa/chart-probe.mjs --url <页面> --viewport 320,375,414,768,1440` 仍全 PASS（文案改动不得把图表挤坏） |
| 溢出 | 三视口 × 6 路由横向溢出 0 |
