# v0.10.0 文案合规与简约 · 实施方案

> 顺序 D1：B1 先定口径，B2 再删重复。全部改动由编码轮执行，本文件只给步骤与判据。

## 一、B1 合规批（#12）

### 文件清单

新增：`scripts/qa/copy-guard.mjs`、`tests/copy-guard.test.ts`、`tests/fixtures/copy-guard/{good,bad}/index.html`。
修改（lib）：`src/lib/copy.ts`（扩常量）、`fx.ts`、`format.ts`、`cost-display.ts`、`pricing.ts`、`plans.ts`、`allowance.ts`、`schema.ts`、`structured-data.ts`、`price-row.ts`、`router/index.ts`。
修改（模板）：`AppFooter.vue`、`HomeView.vue`、`ApiPricingView.vue`、`PlansView.vue`、`MethodologyView.vue`、`SourcesView.vue`、`CalculatorView.vue`、`FilterBar.vue`、`KeyFacts.vue`、`PriceTable.vue`、`PriceCard.vue`。
修改（脚本/测试）：`scripts/gen-llms-txt.mjs`、`tests/copy.test.ts`、`tests/format.test.ts`、`tests/nobreak.test.ts`。

### 步骤序

| 步 | 动作 | 验证 |
|---|---|---|
| B1-1 | `copy.ts` 加 6 常量 + `FX_TABLE_NOTE(fx)`，保留 5 个旧常量原值 | `npx.cmd vitest run tests/copy.test.ts` |
| B1-2 | lib 层换词：`fx.ts:3` 占位符改 `PRICE_MISSING`；`format.ts:185-192` 计价说明去「核对」；`pricing.ts:57/67` 改「暂无可用价格」/「该价格不可用」；`plans.ts:34`、`allowance.ts:24`、`benchmark-view.ts:8` 注释改词；`schema.ts:53/156` 改「有价条目」；`structured-data.ts:85` 改「逐条抓自官方定价页」；`router/index.ts:42/47/56` 改词 | `npm run typecheck` |
| B1-3 | 模板换词并改引用常量：`PlansView.vue:178/236/327/330/338/393/396/404/405/423`、`PriceTable.vue:14/134`、`PriceCard.vue:86`、`SourcesView.vue:46/57/79-80/95/127/147/159`、`MethodologyView.vue:19/21/30/34/40/80/115`、`HomeView.vue:46`、`KeyFacts.vue:36`、`FilterBar.vue:76-77`、`ApiPricingView.vue:129` | `grep -rn "核验\|官方原话\|逐项核过" src` 归零 |
| B1-4 | `gen-llms-txt.mjs`：`import { PROVENANCE_OFFICIAL, FETCHED_AT_LABEL, OFFICIAL_PRICE_LABEL } from '../src/lib/copy.ts'`；同步 `:33` 的取数正则与 `:49/61-63/66/71/76/90/103` 文案 | `npm run build && node scripts/gen-llms-txt.mjs && grep -c 抓取日期 dist/llms.txt` |
| B1-5 | 扩 `tests/copy.test.ts`：`BANNED` 加 12 词（见 architecture 七节）；新增「真源引用」用例扫 `src/**/*.vue` | `npx.cmd vitest run tests/copy.test.ts` |
| B1-6 | 写 `copy-guard.mjs`（三判据）+ 两个 fixture + `tests/copy-guard.test.ts`（bad 必须 exit 1） | `node scripts/qa/copy-guard.mjs --dist dist; npx.cmd vitest run tests/copy-guard.test.ts` |
| B1-7 | 更新测试断言：`format.test.ts:59/70-81/164-180`（单元格不再含日期）、`nobreak.test.ts:8-22`（示例串换成新形态）、`client-scripts.test.ts:60`（断言 `≈` 而非「估算」） | `npx.cmd vitest run tests/format.test.ts tests/nobreak.test.ts tests/client-scripts.test.ts` |

B1 收口：`node scripts/qa/run-gates.mjs` 6 绿；`grep -rn "官方核验\|官方原价\|核验于\|待核验\|已核验\|最新" src scripts` 归零（`copy.ts` 注释里的旧词对照行删除）。

## 二、B2 简约批（#13）

| 步 | 动作 | 验证 |
|---|---|---|
| B2-1 | 免责三档：`AppFooter.vue:17-21` 改「站名 / 汇率 / `SITE_DISCLAIMER` / 口径链接」四行；5 页 hero 末加 `NON_OFFICIAL_BRIEF`；`MethodologyView.vue:115` 保持引用常量 | `node scripts/qa/copy-guard.mjs --dist dist`（四要素判定） |
| B2-2 | 估算上提：`priceCells`（`format.ts:135-167`）副行只产 `≈ ¥X`，聚合 CNY 场景产 `聚合 · 折算自 USD`；`PlansView.vue:36-45` 同改；表前/卡前各渲染一次 `FX_TABLE_NOTE` | `npm run metrics:copy`（`估算日期重复` 列须为 0） |
| B2-3 | 声明去重：`RATE_DISCLAIMER` 每页只留 1 处（`ApiPricingView.vue:170` 保留，`:168` 与 `CalculatorView.vue:72` 删除）；`scopeNote`（`ApiPricingView.vue:79`）只渲染一次；「跨币种不排名」只留 `ApiPricingView.vue:154`，删 `CompositionChart.vue:23-24` 与 `pricing-chart-data.ts:224` 该半句 | `npm run metrics:copy` 三 pattern ≤1 |
| B2-4 | 首屏瘦身：按 architecture 六节逐路由删/并/下沉（home 入口卡说明、snapshot 段、plans 卡 brief 与结论 note、calculator lede 与 `plan-compare-lede`、sources 两处双段合并、methodology 四段各删半句） | `npm run metrics:copy:compare` 退出码 0 |
| B2-5 | 图表文案：`CompositionChart.vue:16` 删「仅展示标价构成」中的重复半句（保留「缺价不补零」）；`ScatterChart.vue:26` 与 `UsageCostChart.vue:26-27` 一字不动（诚实性说明，D6） | `node scripts/qa/chart-probe.mjs --url dist/api-pricing/ --viewport 320,375,414,768,1440` |
| B2-6 | 终测：构建 + 六页三视口溢出 + 页面高度 | 下表 |

## 三、文案对照表（旧 → 新）

`copy.ts`：`待核验`→`缺价`；`核验于 {d}`→`抓取于 {d}`；`官方页面`→`官方定价页`；`用途限制`→`用途限制（厂商转述）`；`完整额度（官方披露）`→`额度原文`。

`AppFooter.vue`

| 旧 | 新 |
|---|---|
| `1 USD = X CNY（日期）· 人民币为估算参考值，最终以厂商原币种为准。` | `1 USD = X CNY（日期）` |
| `价格非购买建议 · 完整口径与免责` | `SITE_DISCLAIMER` 全文 + `完整口径与免责` 链接 |

`HomeView.vue:26`：78 字 lede → `别只看单价，先算清真实 Token 成本。` + 一句「国际厂商人民币为估算副行」→ 删（下沉口径页）。
`:28-30` hero meta → `抓取日期 2026-11-08 · 1 USD = 6.6908 CNY`；`:40` 入口卡 `p` →「输入、输出、缓存、上下文逐列展示，可按溯源筛选。」；`:46` →「月费套餐按额度、周期、可用模型整理；没有可信数字时不留演示数据。」；`:58-61` 整段删；`:77-78` → 一句 + `<details>`。

`ApiPricingView.vue:129-131` hero meta → `抓取日期 X · 178 条 / N 家 · 官方页 M · 聚合 K`；`:96-97` 卡 note → `{provider} {model}`（去「官方页抓取 · 已排除 N 个免费档」，该句移到 `:154` 前一行只写一次）；`:153-155` → `共 {{rows.length}} 条 · 组内按所选字段排序；跨币种不排名。`；`:163-173` 折叠三段 → 两段（币种口径 + 聚合折算），`RATE_DISCLAIMER` 只在本折叠出现。

`PlansView.vue:178` → `月费不等于可折算的 Token 单价 · 抓取日期 X · 额度与限制按官方页整理`；`:129` → `已排除 N 个免费/未标价档`；`:275` title → `官方标价与估算口径不同，见每行详情`；`:327/393` → `额度原文（厂商披露）`；`:330/396` → `用途限制（厂商转述）`；`:405` → `抓取于 {d}`；`:423` → 删「最新」「官方原话」，保留事实与 `partial` 判断；`:427-435` 四段 → 两段。

`SourcesView.vue:46` → `每条价格从哪来、多少条抓自官方页、快照抓取时间。`；`:57` → 常量；`:60` → `聚合数据（未核官方页）` 保留；`:81` → `官方页占比`；`:95` → 常量拼接；`:106` → 单句；`:127` → `按此方式取到价格的厂商`；`:137` → 保留；`:147` → `官方页条目由脚本抓取后入库，抓不到的走聚合补位；差异大的厂商会挑出来人工复核。`

`MethodologyView.vue:19` → `来源与抓取`；`:21` → `当前官方页条目抓取日期为`；`:22` → 保留；`:30/34` → 保留（已是新词）；`:40` → `按此方式取到官方页价格的有`；`:56` → 保留（描述单元格，B2 后改为 `≈ ¥X` 需同步）；`:68` → 保留；`:114-116` → 免责段只引常量 + 一句「厂商可能随时调整，最终以厂商页面与账单为准」。

`CalculatorView.vue:70` 93 字 → 40 字（公式一句 + 主值币种一句）；`:72` 删（`RATE_DISCLAIMER` 只在下方 callout 出现）；`:151-156` → 45 字；`:196` → 两句。

`PriceTable.vue:14` → `溯源` 保留；`:134` → `抓取于`；`:126-129` 的 `溯源/计价口径` 字段名不动。

图表：`CompositionChart.vue:16` → `各币种展示 3:1 混合单价最低的可比条目；条长为四项单价之和，不代表账单占比；缺价不补零。`；`:23-24` → 去「跨币种不排名」；`ScatterChart.vue:22/26` 不动；`HistoryChart.vue:16/26` 不动。

## 四、判据 → 验证方式

| 判据 | 命令 | 通过标准 |
|---|---|---|
| 首屏字数 / 页高 / 溢出 | `npm run build` → `npm run metrics:copy:compare` | 数据页 375≤200、768≤350、1440≤220；说明页不增；页高数据页 −15%、说明页 −10% |
| live 复核 | `node scripts/metrics/copy-density.mjs --compare docs/metrics/copy-density-baseline.json --live <url>` | 退出码 0 |
| 声明重复 / 估算日期 | `npm run metrics:copy` | 三个 pattern ≤1；`估算日期重复`=0 |
| 旧词 / 真源 | `npx.cmd vitest run tests/copy.test.ts tests/copy-guard.test.ts` | 全绿，且 bad fixture 必须红 |
| 禁 JS 四要素 | `node scripts/qa/copy-guard.mjs --dist dist` + `grep -c "无隶属、合作或授权关系" dist/*/index.html dist/index.html` | 6 条路由各 ≥1，`/methodology/`=2 |
| 图表 | `node scripts/qa/chart-probe.mjs --url <页面> --viewport 320,375,414,768,1440` | 全 PASS |
| 门禁 | `node scripts/qa/run-gates.mjs` | 6 条全绿，测试 ≥638 |

建议给 `docs/.hermes/gates.json` 增一条 `copy-guard`（`node.exe scripts/qa/copy-guard.mjs --dist dist`，跑在 build 之后）；是否加由编排层定，本文件不擅改配置。

## 五、不碰的文件（红线）

1. `src/data/**`（含 `entries/plans.json` 的「官方指定工具」原文、`api.json` 的计价条件）。
2. `src/lib/pricing-chart-data.ts` 的坐标/分面/路径计算（只许改 `:224` 的 description 字符串）；`src/components/pricing-charts/*Plot.vue`、`SvgChartFrame.vue`、`src/lib/chart-geometry.ts` 全不动。
3. `src/lib/filters.ts`、`src/lib/pricing.ts` 的筛选与排序逻辑（`:57/67` 只改提示文案）、`src/lib/url-state.ts`、`src/lib/market.ts`。
4. `src/lib/site-meta.ts` 的 `SITE_DISCLAIMER` 文本本体（真源，只读不改）。
5. `scripts/metrics/copy-density.mjs`、`docs/metrics/copy-density-baseline.json`（判据与基线，不调阈值不改 pattern）。
6. `src/lib/schema.ts` 的校验规则（仅错误消息措辞）、`scripts/data/**` 抓取实现。

## 六、次序与回滚

- B1 与 B2 分两次提交（编排层执行）；B1 完成后先跑一次 `npm run build && npm run metrics:copy` 存档读数，作为 B2 的对照起点。
- 每批结束先 `npm run typecheck` → `npm run build` → 门禁，再跑度量；度量红先看 `超标重复项` 列定位 pattern，不看总字数。
- 回滚单位：B1（`copy.ts` + 换词）与 B2（免责/上提/瘦身）互不依赖，任一失败只回退该批，不动另一批。
- 编码轮若发现 `/plans/` 768 落在 590-620（architecture 六节风险），不自行改阈值、不改断点，交编排层决策。
