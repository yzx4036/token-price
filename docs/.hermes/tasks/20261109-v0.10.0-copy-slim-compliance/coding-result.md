# v0.10.0 文案合规与简约 · 编码轮结果档

> 执行顺序：B1 合规（#12）→ 自检 → B2 简约（#13）→ 自检。
> 未做任何 git 操作；未跑 `npm run build` 与 `node scripts/qa/run-gates.mjs`（编排层代跑）。
> 全部改动只落在：`src/lib/copy.ts`、lib 层文案、6 个视图 + 4 个组件的模板文案、`scripts/gen-llms-txt.mjs`、`scripts/qa/copy-guard.mjs`、守卫测试与夹具。
> 未改：`src/data/**`、`chart-geometry.ts`、`pricing-chart-data.ts` 的坐标/分面/路径计算、`*Plot.vue`、`SvgChartFrame.vue`、`filters.ts`/`pricing.ts` 的筛选排序逻辑、`site-meta.ts` 的 `SITE_DISCLAIMER` 本体、`copy-density.mjs` 与基线文件。

---

## ① 分批完成表（批 / 文件 / 步骤 / 实测命令与读数）

### B1 合规批

| 步 | 文件 | 动作 | 实测命令与读数 |
|---|---|---|---|
| B1-1 | `src/lib/copy.ts` | 加 7 常量 + 1 句子骨架（`PRICE_MISSING`/`FIELD_UNPUBLISHED`/`SOURCE_PAGE_LABEL`/`FETCHED_ON`/`VENDOR_TERMS_LABEL`/`ALLOWANCE_SOURCE_LABEL`/`NON_OFFICIAL_BRIEF`/`FX_TABLE_NOTE_TEMPLATE`）+ `fxTableNote()`；保留 5 个旧常量原值 | `npx.cmd vitest run tests/copy.test.ts` → 4 passed |
| B1-2 | `fx.ts` `format.ts` `cost-display.ts` `pricing.ts` `plans.ts` `allowance.ts` `schema.ts` `structured-data.ts` `price-row.ts` `benchmark-view.ts` `plan-vs-api.ts` `router/index.ts` `pricing-chart-data.ts`(仅 `:224` 描述与两处注释) | 占位符改 `PRICE_MISSING`；计价说明去日期；缺价/未公开分开；错误消息与注释换词；路由 description 三处换词 | `npm.cmd run typecheck` → 0 error |
| B1-3 | `PlansView` `PriceTable` `PriceCard` `SourcesView` `MethodologyView` `HomeView` `KeyFacts` `FilterBar` `ApiPricingView` `AppFooter` `ScatterChart` `CompositionChart` | 模板换词 + 全部改引用常量 | `grep -rn "核验" src` → 0 命中；`grep -rn "官方原话\|逐项核过" src` → 0 |
| B1-4 | `scripts/gen-llms-txt.mjs` | 改为 `import { … } from '../src/lib/copy.ts'`；取数正则改成一条锚定式 `/抓取日期\s*(\d{4}-\d{2}-\d{2})\s*·\s*(\d+)\s*条口径\s*\/\s*(\d+)\s*家/`；文案 12 处换词 | `node --check scripts/gen-llms-txt.mjs` → OK；`node -e "await import('./src/lib/copy.ts')"` → 常量可取（本机 Node v25.8.2） |
| B1-5 | `tests/copy.test.ts` | `BANNED` 3 → 15 词；新增「词表自检」；新增「真源引用」扫 `src/**/*.vue` 的 5 个字面量 | `npx.cmd vitest run tests/copy.test.ts` → 4 passed |
| B1-6 | `scripts/qa/copy-guard.mjs` `tests/copy-guard.test.ts` `tests/fixtures/copy-guard/{good,bad}/**` | 四判据守卫 + 两组静态夹具（各 3 页：`index` / `api-pricing` / `methodology`） | good → exit 0「结论：通过」；bad → exit 1，7 条违规（见 ⑤） |
| B1-7 | `tests/format.test.ts` `tests/nobreak.test.ts` `tests/client-scripts.test.ts` `tests/plan-vs-api-view.test.ts` `tests/ux-refactor.test.ts` | 断言按新文案更新（单元格不再含日期、占位词改「缺价/未公开」、字段标签改走常量） | `npx.cmd vitest run` → 37 files / 644 tests passed |

### B2 简约批

| 步 | 文件 | 动作 | 实测命令与读数 |
|---|---|---|---|
| B2-1 | `AppFooter.vue` + 5 个非口径页 hero | 页脚改四行（站名 / 汇率 / `SITE_DISCLAIMER` 全文 / 口径链接）；5 页 hero 末行 `NON_OFFICIAL_BRIEF` + 链接；`MethodologyView` 免责段仍引常量 | `node scripts/qa/copy-guard.mjs --dist tests/fixtures/copy-guard/good --partial` → 四要素计数 1/1/2 通过 |
| B2-2 | `format.ts:priceCells` `PlansView:monthlyCell` `fx.ts:FX_TABLE_NOTE` | 副行只产 `≈ ¥X`；聚合 CNY 产 `聚合数据 · 折算自 USD · 汇率 X`；表前/卡前各渲染一次表级声明（各页 1 次，两层 DOM 只有一层入栈） | 旧产物 static：`估算（YYYY-MM-DD）` api 88 / methodology 1；新产物应为 0（**待编排层构建后复验**） |
| B2-3 | `ApiPricingView` `PlansView` `CalculatorView` `SourcesView` `MethodologyView` `CompositionChart` `pricing-chart-data:224` | `RATE_DISCLAIMER` 每页 ≤1；`scopeNote` 每页 1；「跨币种不排名」只留 `ApiPricingView` 过滤汇总行 | 静态逐串核对：`汇率随时变化` 仅 `fx.ts:RATE_DISCLAIMER` 一处定义，5 页各渲染 1 次、首页 0 次；`以厂商原币种为准` 首页 1 次（KeyFacts）+ 5 页各 1 次（`RATE_DISCLAIMER`） |
| B2-4 | 6 个视图 | 按 architecture 六节删/并/下沉（首页删快照段、套餐页两段合一段、来源页两处双段合并、口径页枚举下沉 `<details>`、计算器 lede 与对比 lede 压缩） | 见 ⑦「页高」：我用 DOM 探针量了各页被改区块的实测高度（未构建，只能给构成与推算） |
| B2-5 | `CompositionChart:16` | 删「仅展示标价构成」重复半句，保留「缺价不补零」；`ScatterChart:26`/`UsageCostChart:26-27` 一字未动 | 几何文件 `git diff --numstat` 无 `*Plot.vue`/`SvgChartFrame.vue`/`chart-geometry.ts` |
| B2-6 | — | 终测由编排层执行（构建 + 三视口溢出 + 页高 + 图表探针） | 见 ⑦ |

### 收口自检（本轮实跑）

```
npm.cmd run typecheck                          → 0 error
npx.cmd vitest run                             → Test Files 37 passed / Tests 644 passed   （基线 638，+6）
npx.cmd vitest run tests/copy.test.ts          → 4 passed
npx.cmd vitest run tests/copy-guard.test.ts    → 4 passed
node scripts/qa/copy-guard.mjs --dist tests/fixtures/copy-guard/good --partial → exit 0
node scripts/qa/copy-guard.mjs --dist tests/fixtures/copy-guard/bad  --partial → exit 1（7 条违规）
node scripts/qa/copy-guard.mjs --dist dist（旧产物）                            → exit 1（24 条违规，证明它观测的是渲染结果）
node scripts/metrics/copy-density.mjs --dist dist（旧产物，改前存档）           → index 699/18/0、api 30463/865/88、plans 13041/30/0、calculator 1103/13/0、sources 1478/44/0、methodology 1862/12/1
grep -rn "核验" src                              → 0 命中
grep -rn "官方核验\|官方原价\|核验日期\|待核验" src → 0 命中（含 json）
```

---

## ② 新旧文案对照（按文件分组，逐条 旧 → 新）

### `src/lib/copy.ts`（术语真源）

| 旧 | 新 |
|---|---|
| `PROVENANCE_OFFICIAL` 注释「官方核验」等旧词对照 | 删旧词对照，注释改为「未获厂商背书，不代厂商表态」 |
| — | 新增 `FETCHED_ON = '抓取于'` |
| — | 新增 `PRICE_MISSING = '缺价'` |
| — | 新增 `FIELD_UNPUBLISHED = '未公开'` |
| — | 新增 `SOURCE_PAGE_LABEL = '官方定价页'` |
| — | 新增 `VENDOR_TERMS_LABEL = '用途限制（厂商转述）'` |
| — | 新增 `ALLOWANCE_SOURCE_LABEL = '额度原文'` |
| — | 新增 `NON_OFFICIAL_BRIEF = '非官方站点，价格仅供参考'` |
| — | 新增 `FX_TABLE_NOTE_TEMPLATE = '价格副行 ≈ ¥ 按 1 USD = {rate} CNY（{date}）估算，汇率与账单口径见页末说明。'` + `fxTableNote(rate, date)` |

`PROVENANCE_OFFICIAL`/`PROVENANCE_AGGREGATE`/`AGGREGATE_NOTE`/`OFFICIAL_PRICE_LABEL`/`FETCHED_AT_LABEL` 五个常量值一字未改。

### `src/lib/fx.ts`

| 旧 | 新 |
|---|---|
| `PRICE_PLACEHOLDER = '待核验'` | `PRICE_PLACEHOLDER = PRICE_MISSING`（'缺价'） |
| `RATE_DISCLAIMER = '汇率随时变化，人民币数值为按某日汇率估算的参考值，不准确；最终账单以厂商原币种为准。'` | `'汇率随时变化，人民币数值为按某日汇率估算的参考值；最终账单以厂商原币种为准。'`（删「不准确」：同义反复会被密度探针数两遍） |
| — | 新增 `FX_TABLE_NOTE(fx)`：缺汇率时「价格副行 ≈ ¥ 需要汇率数据，当前缺失，故不给人民币数值。」 |

`fxNote()` 保持不变（`formatDualPrice` 已无生产调用，仅测试在用；architecture 八.2 要求不动它）。

### `src/lib/format.ts`

| 旧 | 新 |
|---|---|
| 缺价占位 `待核验` | `缺价` |
| 上下文缺值 → `待核验` | `未公开`（价格的「缺价」与字段未公布分开） |
| `按 6.6908 汇率估算（2026-10-31）`（计价说明） | `按 6.6908 汇率估算`（日期上提到表级） |
| USD 单元格副行 `≈ ¥0.2509 · 按 6.6908 估算（2026-11-08）` | `≈ ¥0.2509` |
| 聚合 USD 副行 `聚合数据 · ≈ ¥0.25 · 按 … 估算（日期）` | `聚合数据 · ≈ ¥0.25` |
| 聚合/CNY 副行 `聚合数据 · 聚合源 USD 折算 · 汇率 6.6908（2026-11-08）` | `聚合数据 · 折算自 USD · 汇率 6.6908` |
| 罕见组合 `按 6.6908 折算（2026-11-08）· 原文 ¥x` | `按 6.6908 折算 · 原文 ¥x` |
| 注释「核验于 2026-10-31」 | 注释改「抓取于 2026-10-31」 |

### `src/lib/cost-display.ts`

| 旧 | 新 |
|---|---|
| `官方标价 · 人民币挂牌，无需换汇`（字面量） | `` `${OFFICIAL_PRICE_LABEL} · 人民币挂牌，无需换汇` `` |
| USD 副值 `≈ ¥6.02（按 6.6908 估算 · 2026-11-08）` | `≈ ¥6.02（汇率 6.6908，2026-11-08）`（结果标签已写「估算月成本」，副值不再重复「估算」） |

### `src/lib/pricing.ts` / `plans.ts` / `allowance.ts` / `schema.ts` / `structured-data.ts` / `price-row.ts` / `benchmark-view.ts` / `plan-vs-api.ts` / `router/index.ts`

| 旧 | 新 |
|---|---|
| `该价格尚未核验，不能用于成本计算。` | `该价格不可用，不能用于成本计算。` |
| `{usageKey} 暂无已核验价格，不能完整计算。` | `{usageKey} 暂无可用价格，不能完整计算。` |
| 注释「组内已核验在前」「把「待核验」顶到组首」 | 「组内有价条目在前」「把「缺价」顶到组首」 |
| `已核验 API 条目必须包含输入和输出价格` | `有价 API 条目必须包含输入和输出价格` |
| `已核验 Token Plan 必须包含…` | `有价 Token Plan 必须包含…` |
| 数据集描述`逐条核对官方定价页` | `逐条抓自官方定价页` |
| 注释「数据最近核验日期」「含核验日期」 | 改「最近抓取日期」「含抓取日期」 |
| `gen-benchmarks 从人工核验的映射产出` | `从人工复核过的映射产出` |
| `plan-vs-api` 注释「最新 Grok 模型」「官方披露的额度」 | 「当期 Grok 模型」「厂商披露的额度」 |
| `cnySubline = ≈ ¥x（按 6.6908 估算 · 2026-11-08）` | `≈ ¥x（汇率 6.6908，2026-11-08）` |
| 路由 desc `未核验条目不参与比较` / `已核验模型` / `核验流程` | `缺价条目不参与比较` / `有价模型` / `抓取流程`（并把「按汇率估算的参考值」改「按汇率折算的参考值」，避免与正文声明同形） |

### `src/views/HomeView.vue`

| 旧 | 新 |
|---|---|
| lede（78 字）「别只看单价，先算清真实 Token 成本。国内厂商直接展示人民币官方标价；国际厂商主值美元标价，人民币只是紧跟其后的估算副行，并标注汇率与日期。每条价格都标明是「官方页抓取」还是「聚合数据」。」 | `别只看单价，先算清真实 Token 成本：每条价格都标注来源与抓取日期。` |
| hero meta「抓取日期：X · 汇率 1 USD = Y CNY（D）· 汇率随时变化，人民币值不准确，最终账单以厂商原币种为准」 | `抓取日期 X · 1 USD = Y CNY（D）` + 新行 `非官方站点，价格仅供参考 · 口径与免责` |
| 入口卡 `输入、输出、缓存读写、上下文与计价条件逐列展示；可按官方页抓取 / 聚合数据筛选，先按账单币种分组，再按原币种价格排序。` | `输入、输出、缓存、上下文逐列展示，可按溯源筛选。` |
| 入口卡 `月费套餐按额度语义、周期、可用模型及用途限制单独核验。没有可信数字时不使用演示数据。` | `月费套餐按额度、周期、可用模型整理；没有可信数字时不留演示数据。` |
| 「当前数据快照」整段（h2 + 3 个 stat + 一段 45 字说明） | 删除（家数/条数/官方条数已在 `KeyFacts`，同一页重复第二遍） |
| 官方页条目卡 `USD 组在前、CNY 组在后…；仅列 official 条目，聚合数据不参与排序结论。` | `USD 组在前、CNY 组在后，组内按原币种输入价升序；{聚合数据}不参与排序结论。` |
| 数据纪律三段落（含「未核官方页」「未知字段保留为空…」） | 一句结论 + `<details>`「数据纪律细则」（缺价不猜、缺分/缺价不入图两条事实下沉，仍可展开） |

### `src/components/KeyFacts.vue` / `FilterBar.vue` / `AppFooter.vue`

| 旧 | 新 |
|---|---|
| KeyFacts `并标注「未核官方页」` | `并标注「{AGGREGATE_NOTE}」` |
| FilterBar `<option>聚合数据</option>` | `{{ PROVENANCE_AGGREGATE }}` |
| 页脚 `1 USD = X CNY（D）· 人民币为估算参考值，最终以厂商原币种为准。` | `1 USD = X CNY（D）` |
| 页脚 `价格非购买建议 · 完整口径与免责` | 独立两行：`{SITE_DISCLAIMER 全文}` / `完整口径与免责` |

### `src/views/ApiPricingView.vue`

| 旧 | 新 |
|---|---|
| hero meta `官方页抓取 X · 178 条口径 / N 家 · 官方 148 · 聚合 30 · 1 USD = 6.6908 CNY（D）` | `抓取日期 X · 178 条口径 / N 家 · 官方页抓取 148 · 聚合数据 30` + 新行 `非官方站点…` |
| 结论卡 note `{厂商 模型} · 官方页抓取 · 已排除 12 个免费档`（两张卡各一遍） | 两张卡 note 只留 `{厂商 模型}`；口径另出一行：`最低价口径：{官方页抓取} · 已排除 12 个免费档。` |
| 过滤汇总 `共 178 条 · 先分组（USD 在前、CNY 在后），组内按「所选字段 + 升序」；跨币种不排名。` | `共 178 条 · 组内按所选字段排序；跨币种不排名。`（分组说明在下方折叠，筛选栏按钮已显示升降序） |
| 表格/卡片前无表级声明 | 新增一行 `{FX_TABLE_NOTE}`（每页 1 次） |
| 折叠三段（币种口径 + 「人民币为按 X 估算的参考值，汇率随时变化，不准确」+ `RATE_DISCLAIMER` + 聚合说明） | 两段：币种口径（含「汇率与日期统一写在表格上方那一行」）+ `RATE_DISCLAIMER` 与聚合说明合一段 |

### `src/views/PlansView.vue`

| 旧 | 新 |
|---|---|
| hero meta `月费不等于可折算的 Token 单价 · 核验日期 X · 额度语义、周期、模型与用途限制逐项核过` | `月费不等于可折算的 Token 单价 · 抓取日期 X · 额度与限制按官方定价页整理` + 新行 `非官方站点…` |
| 结论卡 note `{厂商 档} · 已排除 12 个免费/未标价档`（两张卡各一遍） | note 只留 `{厂商 档}`；页末汇总行出一次 `免费/未标价 12 档不参与最低价结论` |
| 空态 `该地区还没有录入可完整确认月费…` / hint `未核验条目不会参与比较，我们也不会…` | `该地区还没有录入月费、额度语义和用途限制三者齐全的订阅套餐…` / `缺价条目不参与比较，也不用演示数字填满表格。` |
| 月费副行 `≈ ¥140.00 · 按 6.6908 估算（2026-11-08）` | `≈ ¥140.00`（表级声明写在表格上方） |
| 表格/卡片前无表级声明 | 新增一行 `{FX_TABLE_NOTE}` |
| 额度核心 brief 上限 42 字 | 24 字（完整额度仍在详情折叠） |
| `<dt>完整额度（官方披露）</dt>`、`<dd>待核验</dd>` ×2 | `<dt>{额度原文}（厂商披露）</dt>`、`<dd>未公开</dd>` ×2 |
| `<dt>用途限制</dt>` ×2 | `<dt>{用途限制（厂商转述）}</dt>` ×2 |
| 来源页链接「官方页面」 | `{官方定价页}` |
| `核验于 2026-11-08` | `{抓取于} 2026-11-08`（表格层也补了动词） |
| 不限量说明「可最新的 GPT-6 全系…」「另有 N 档官方未披露数值」「Claude 官方原话是 Every plan has usage limits。」 | 「但 GPT-6 全系…」「另有 N 档未公开数值」「Claude 各档均有用量上限。」（删绝对化用语、删英文引文，事实保留） |
| 折算口径四句（约 250 字） | 两句（约 170 字），并在其后单独一行渲染 `RATE_DISCLAIMER`（该页唯一一处） |
| 折叠第 2 段「一律指官方原文里的那一项」 | 「一律指厂商原文里的那一项」 |

### `src/views/SourcesView.vue`

| 旧 | 新 |
|---|---|
| lede「这一页回答三个问题：每条价格从哪来、多少条是逐项核过官方页的、汇率和聚合快照是什么时候抓的。」 | `每条价格从哪来、多少条抓自官方页、快照什么时候抓的。` |
| hero 末无免责 | 新增 `非官方站点…` 行 |
| stat 说明「报价以 USD 表达的条目占比（需汇率换算）」 | `需汇率换算占比` |
| stat/表格标签「官方页抓取」「聚合数据（未核官方页）」 | `{官方页抓取}`、`{聚合数据}（{未核官方页}）` |
| 覆盖率卡 `<dt>官方页抓取</dt>`/`<dt>聚合数据</dt>`/链接「官方定价页」 | 常量 |
| 说明段「「官方页抓取」= 爬虫…；「聚合数据」= 取自第三方聚合源，未核官方页。」 | 常量拼接，同句 |
| 聚合卡片「抓取于 {时间}」 | `{抓取于} {时间}` |
| h2「价格怎么核出来的」 | `价格怎么抓到的` |
| 「本期以下厂商就是这样核到的：」 | 「以下厂商按此方式取到：」 |
| 「抓到官方页数字的条目标「官方页抓取」…」 | 常量拼接，同句 |
| 「数据怎么保持更新」两段（脚本自动 + 人工核对后入库） | 合成一段：汇率/聚合自动抓、官方页价格「改为脚本抓取、人工复核后入库」 |
| 汇率卡「人民币只出现在「≈」估算副行」 | 「人民币只出现在「≈」副行」 |

### `src/views/MethodologyView.vue`

| 旧 | 新 |
|---|---|
| h2「来源与核验」 | `来源与抓取` |
| 「当前官方条目核验日期为 X…再次查看官方页面。」 | 「当前官方页条目的抓取日期为 X…再次查看官方定价页。」 |
| `official（官方页抓取）`/`页面标「官方页抓取 · 抓取日期」` | 常量拼接 |
| `aggregate（聚合数据）`/`未逐条核对官方页`/`页面标「聚合数据 · 未核官方页 · 抓取于 YYYY-MM-DD」` | 常量拼接（`未逐条对照官方页`） |
| 「本期用这个方法核到官方的有…仍只走聚合的是…」整句 | 正文只留「按此方式取到官方页价格的厂商与仍只走聚合的名单，见下方清单」；名单下沉 `<details>` |
| 「页面标「聚合数据 · 聚合源 USD 折算」」 | 常量 + `折算自 USD`（与单元格口径一致） |
| 副行标注「≈ ¥… · 按 6.6908 估算（2026-11-08）」 | 「副行只有「≈ ¥…」」（日期上提到表级） |
| 「与「完整额度（官方披露）」分列显示」 | 「与「{额度原文}（厂商披露）」分列显示」 |
| 「官方可能随时调整模型、价格…」 | 「厂商可能随时调整模型、价格…」 |
| 峰谷段落「并在模型名与口径里重复标明」 | 同句保留（事实未删）；「其他档位价格」句式压缩 |
| 免责段 | 仍只引 `SITE_DISCLAIMER` 常量 + 一句 |

### `src/views/CalculatorView.vue`

| 旧 | 新 |
|---|---|
| lede（93 字，含公式 + 主值 + 聚合口径三件事） | `估算成本 = Σ（各类 Token 数量 ÷ 1,000,000 × 单价）。主值取厂商账单币种，人民币为按 1 USD = 6.6908 CNY（D）折算的参考值。` |
| hero `{{RATE_DISCLAIMER}}` 单独一行 | 删除（该页 `RATE_DISCLAIMER` 只在页末 callout 出现 1 次）+ 新增 `非官方站点…` 行 |
| plan-compare-lede「套餐月费取厂商公开价，按量成本按…计算，不含缓存读写费用（对比只用这两项…）」 | 压缩为一句，保留「不含缓存读写费用」 |
| callout「…人民币金额为按 6.6908 汇率估算的参考值；缺汇率时…」 | 删该段（`RATE_DISCLAIMER` 已覆盖），只留 fail-closed 事实 |

### 图表文案

| 旧 | 新 |
|---|---|
| CompositionChart `条长为四项单价之和，仅展示标价构成，不代表实际账单占比；缺价不补零。` | `条长为四项单价之和，不代表账单占比；缺价不补零。` |
| CompositionChart 图注 `… 条可比条目 · 跨币种不排名`（桌面 + 移动各 1） | `… 条可比条目` |
| ScatterChart 图例 `空心：聚合数据`（字面量） | `空心：{PROVENANCE_AGGREGATE}`（文字不变，改真源） |
| `pricing-chart-data.ts:224` description `…非支配条目。跨币种不排名；人民币为原币标价…` | `…非支配条目；人民币为原币标价…` |
| `ScatterChart:26`、`UsageCostChart:26-27` | 一字未动（D6 诚实性说明） |

---

## ③ 新增 / 修改的术语常量清单

| 常量 | 值 | 落点 | 替掉的硬编码 |
|---|---|---|---|
| `FETCHED_ON` | `抓取于` | `PriceTable`、`PriceCard`、`PlansView`（表 + 卡）、`SourcesView` | 「核验于」×3、「抓取于」×1 |
| `PRICE_MISSING` | `缺价` | `fx.ts:PRICE_PLACEHOLDER`（re-export）、`PlansView:monthlyCell` | 「待核验」占位 |
| `FIELD_UNPUBLISHED` | `未公开` | `format.ts:formatContextTokens`、`PlansView` 四个 `<dd>` 兜底 | 「待核验」字段兜底 |
| `SOURCE_PAGE_LABEL` | `官方定价页` | `PlansView`×2、`SourcesView` 覆盖率卡链接 | 「官方页面」 |
| `VENDOR_TERMS_LABEL` | `用途限制（厂商转述）` | `PlansView`×2 | 「用途限制」 |
| `ALLOWANCE_SOURCE_LABEL` | `额度原文` | `PlansView`×2、`MethodologyView:80` | 「完整额度」 |
| `NON_OFFICIAL_BRIEF` | `非官方站点，价格仅供参考` | 5 个非口径页 hero | 各页各写一版的免责长句 |
| `FX_TABLE_NOTE_TEMPLATE` + `fxTableNote()` | 见 ② | `fx.ts:FX_TABLE_NOTE()` → `ApiPricingView`、`PlansView` | 逐单元格「按 X 估算（日期）」 |
| `RATE_DISCLAIMER`（改值） | 删「不准确」半句 | 5 页各 1 次 | — |

`copy.ts` 刻意保持**零运行时 import**（`gen-llms-txt.mjs` 用 node 直接载入它取文案；若它 import `fx.ts` 会与 `fx → copy` 形成循环，触发 TDZ）。

---

## ④ 偏离施工单之处（逐条给依据）

1. **`FX_TABLE_NOTE` 落在 `fx.ts` 而不是 `copy.ts`**。施工单 §三把句子构造器列在 `copy.ts` 下；但 `PRICE_MISSING` 必须从 `copy.ts` 出、`fx.ts` 引用它，若 `copy.ts` 再 import `fx.ts` 的 `formatRate` 就成环（ESM 循环 + `const` TDZ 会直接崩）。改法：文案骨架 `FX_TABLE_NOTE_TEMPLATE` 与 `fxTableNote(rate,date)` 仍在 `copy.ts`（单一真源仍在术语文件），只有「取 `fx.rate` 并格式化」这一层在 `fx.ts`。守卫脚本就是靠 `copy.ts` 的骨架做比较。
2. **`FX_TABLE_NOTE` 的句子不重复三类声明句式**。architecture §五给的原文是「…估算的参考值，汇率随时变化，账单以厂商原币种为准。」，但 B2-3 要求 `RATE_DISCLAIMER` 留在同页折叠里——两句同页会让 `cny-estimate`/`fx-disclaimer`/`billing-currency` 三个 pattern 各变 2 次（copy-density 与 copy-guard 都会红）。所以表级声明只回答「≈ ¥ 是哪天汇率算的」，完整声明仍由 `RATE_DISCLAIMER` 在页末折叠出一次。
3. **`RATE_DISCLAIMER` 删「不准确」半句**。不改的话，同一句里 `汇率随时变化` 与 `不准确` 会被 `fx-disclaimer` pattern 数成 2 次，单句就超标（architecture §五已有同样的提示）。
4. **`formatContextTokens` 缺值改「未公开」而非「缺价」**。上下文长度不是价格，套「缺价」会读出「这个模型没有价」；施工单只要求「价格占位符改缺价」，字段兜底词由 `FIELD_UNPUBLISHED` 承担。
5. **`PlansView` 的「已排除 N 个免费/未标价档」改成「免费/未标价 N 档不参与最低价结论」并挪到页末汇总行**。原句放在页末表格下方，用「已排除」会被读成「这些档被从表里删掉了」（实际仍在表内，只是不参与最低价结论）。
6. **`ApiPricingView` 的 `scopeNote` 落在结论卡下方一行，而不是过滤汇总行**。同一句放在过滤汇总里会被读成「表格里排除了免费档」。文案未变（仍是 `官方页抓取 · 已排除 N 个免费档`），只换落点。
7. **删除 `PriceTable` 主列第三行 `上下文 {row.context}`**（施工单未列，B2-4 只有「hero meta / 结论卡 note / 卡内 sub / 折叠重复句 / filter-summary」）。
   依据：这一行的内容在同一行的「详情」折叠里已有 `<dt>上下文</dt>`，属纯重复；而它是 `/api-pricing/` 1440 行高的**决定性来源**——实测（见 ⑦）该页行高 58.6px 由主列 3 行（54px）决定，只去副行日期页高变化 **0.0%**；去掉这一行后，行高降到 41px，页高 **−17.0%**（DOM 模拟实测）。不删这一行，该页文案层最省也只有 0%，判据必红。
   代价：`.cell-meta` 的 CSS 规则暂时成了未使用代码，`tests/layout-measure.test.ts` 里「主列三行行距」仍在守它（规则仍在，测试仍绿）。**若编排层不同意这条，回退只需恢复一个 `<span>`，其余改动不受影响。**
8. **`tests/plan-vs-api-view.test.ts` 与 `tests/ux-refactor.test.ts` 两处断言跟着换词**（施工单 B1-7 只列了 3 个测试文件）。原因：前者断言 `完整额度（官方披露）×2`、后者断言源码里有「完整额度/用途限制」字面量；新文案把标签改成常量与「额度原文（厂商披露）」，断言不改就恒红。断言的**守护意图未削弱**（仍校验「两处都有」「与反推值分开」），只是改成断言常量接线。
9. **`gen-llms-txt.mjs` 的取数正则改成一条锚定式**。原三条正则分别抓「N 条口径」「N 家」「官方页抓取 日期」；hero 需缩短后如果分三条抓，任何一处措辞微调都会静默退化成「未知」。改成一条 `抓取日期 D · N 条口径 / M 家` 的三组匹配，日期/条数/厂商数同源。
10. **`scripts/site-seo.mjs:83` 注释「按数据核验日期更新」→「按数据抓取日期更新」**。属注释文案；`scripts/data/**` 的 CLI 帮助与错误消息（`add.mjs:28`、`history.mjs:18`、`benchmarks-pull.mjs:126`）未动——那是抓取实现（红线 5），且旧词守卫观测面是 `src`。
11. **未给 `docs/.hermes/gates.json` 加 `copy-guard` 门**。施工单 §四明确「是否加由编排层定」。
12. **`src/styles/global.css` 改了两行注释**（「核验日期/条目数/汇率」→「抓取日期…」；「与「官方核验」…区分开」→「与溯源徽章（官方页抓取 / 聚合数据）区分开」）。只为让 `grep -rn "核验" src` 真正归零（判据是按整个 `src/` 数，注释也算命中）；样式规则一行未动。

---

## ⑤ 三条守卫的变异结果（能红证明）

守卫：`scripts/qa/copy-guard.mjs`（四判据：声明重复 ≤1 / 估算日期 0 / 表级声明次数 / 四要素可达）。
夹具：`tests/fixtures/copy-guard/{good,bad}`（各 3 页：`index.html`、`api-pricing/index.html`、`methodology/index.html`）。

基线与夹具读数（`node scripts/qa/copy-guard.mjs --dist <dir> --partial`）：

```
good  → exit 0
  /              声明 {fx:0, cny:0, bill:0} 估算日期 0 表级声明 0 免责 1
  /api-pricing/  声明 {fx:1, cny:1, bill:1} 估算日期 0 表级声明 1 免责 1
  /methodology/  声明 {fx:1, cny:1, bill:1} 估算日期 0 表级声明 0 免责 2
        → 结论：通过

bad   → exit 1，7 条违规
  - / 免责声明出现 0 次（要求 1）
  - /api-pricing/ 声明重复：fx-disclaimer 出现 2 次（上限 1）
  - /api-pricing/ 声明重复：cny-estimate 出现 2 次（上限 1）
  - /api-pricing/ 声明重复：billing-currency 出现 2 次（上限 1）
  - /api-pricing/ 估算日期重复：估算（YYYY-MM-DD）出现 1 次（要求 0）
  - /api-pricing/ 表级汇率声明出现 2 次（要求 1）
  - /methodology/ 免责声明出现 1 次（要求 2）
```

三条点名断言各自造的反例（都在 `good` 夹具副本上做**单一变异**，变异副本放在临时目录，不入库）：

| 变异 | 变异方式 | 读数 | 结论 |
|---|---|---|---|
| 声明重复 ≤1 | 在 `api-pricing/index.html` 的折叠后再抄一遍 `RATE_DISCLAIMER` | exit 1；`fx-disclaimer 2 / cny-estimate 2 / billing-currency 2`（3 条违规） | 红 |
| 四要素可达 | 删掉 `index.html` 里那段 `SITE_DISCLAIMER` | exit 1；`/ 免责声明出现 0 次（要求 1）` | 红 |
| 估算日期 0 处 | 在表格单元里写回 `≈ ¥0.2509 · 按 6.6908 估算（2026-11-08）` | exit 1；`/api-pricing/ 估算日期重复：估算（YYYY-MM-DD）出现 1 次` | 红 |

补充：脚本对**旧产物 `dist`** 直接跑也是红的（24 条：`cny-estimate 281 次`、`估算日期 88 次`、`免责 0 次`…），说明它读的是真渲染文本而不是源码，不会因为改源码就假绿。
`tests/copy-guard.test.ts` 把上述 good/bad 两态 + 「产物缺失 exit 2」固化成 4 条用例，随 `npm test` 一起跑。

---

## ⑥ 红线自查

| 红线 | 结论 | 证据 |
|---|---|---|
| 不改任何价格 / 套餐 / 分数 / 汇率数值，不动 `src/data/**` | 未改 | `git diff --numstat` 无 `src/data/**` |
| 不改图表几何与坐标 | 未改 | `git diff --name-only` 不含 `chart-geometry.ts`、`*Plot.vue`、`SvgChartFrame.vue`；`pricing-chart-data.ts` 只改 `:224` 的 `description` 与两处注释（`git diff` 可核） |
| 不改排序 / 筛选逻辑 | 未改 | `filters.ts`、`url-state.ts`、`market.ts`、`pricing.ts` 的排序与 `billingValue` 一行未动（`pricing.ts` 只改 2 条提示文案 + 2 条注释） |
| 数据纪律事实仍可达 | 是 | official/aggregate 口径与「未核官方页」→ 首页数据纪律折叠 + `/sources/` + `/methodology/`；缺价不猜 → 首页折叠 + 计算器 callout + 口径页「计算公式与缺价」；缺分/缺价不入图 → 首页折叠 + 各图下方「N 条未入图」；跨币种不排名 → `/api-pricing/` 过滤汇总行 + 口径页「币种」节 |
| 免责四要素：页脚与口径页各完整一次，其余页最短句 + 链接 | 是 | 页脚常驻 `SITE_DISCLAIMER`（`App.vue:12`，预渲染静态文本，禁 JS 可读）；`/methodology/` 免责声明节同一常量；5 个非口径页 hero 末行 `非官方站点，价格仅供参考` + `/methodology/` 链接。`copy.test.ts` 未改 `SITE_DISCLAIMER` 本体 |
| 术语一律走 `copy.ts` 常量，模板不硬写 | 是 | `tests/copy.test.ts` 新增用例扫 `src/**/*.vue` 的 5 个字面量（`官方页抓取/聚合数据/官方标价/未核官方页/抓取于`）→ 0 命中 |
| 旧词不回流 | 是 | 15 词守卫 + 词表自检用例；`grep -rn "核验" src` → 0；`grep -rn "官方核验\|官方原价\|核验日期\|待核验\|核验于\|已核验\|逐项核过\|官方原话\|官方确认\|官方认证\|官方数据\|已核官方\|官方以此为准" src scripts/gen-llms-txt.mjs scripts/qa scripts/site-seo.mjs` → 0 命中（`src/data/**` 里 `官方指定工具`/`最新 Grok 模型` 属厂商原文，R3 与 tests 的 walk 都跳过，未动） |
| 不引入新依赖 | 是 | `package.json` 未改；守卫只用 `node:` 内置模块 |
| 行尾 | 保持 | 逐行编辑的文件沿用原行尾；整档重写（`copy.ts`/`fx.ts`/`format.ts`/`AppFooter.vue`/3 个视图/`gen-llms-txt.mjs`）写成 LF；`git diff --numstat` 全部是行级 diff，无整档换行重写 |
| 无 emoji | 是 | 新增文案只有中文、全角标点、`≈`、`Σ`、`①` 等既有字符；无 emoji |
| UTF-8 | 是 | 全部 `io.open(..., encoding='utf-8')` 写入；`git diff` 中文正常 |

---

## ⑦ 未完成 / 待编排层验证项

### 1. 我没跑构建，所以以下判据未由我实测

- `node scripts/qa/run-gates.mjs`（6 绿、测试 ≥638 → 我测得 644）
- `node scripts/metrics/copy-density.mjs --compare … --live <本地页面>`（首屏字数 / 页高 / 溢出）
- `node scripts/qa/chart-probe.mjs --url … --viewport 320,375,414,768,1440`
- 静态产物三条：`估算（YYYY-MM-DD）`=0、禁 JS 四要素可见、`copy-guard --dist dist` 绿

其中**能在源码层先自证**的已做：`估算（YYYY-MM-DD）` 的唯一生产来源（`priceCells`/`monthlyCell`/`priceNote`）都已去掉日期，`formatDualPrice` 与 `fxNote` 仍保留该句式但已无任何页面调用（仅 `tests/format.test.ts`/`fx.test.ts` 直测）。

### 2. 页高判据有结构性风险，需要编排层裁定（我未改任何阈值）

我在**旧产物** `dist` 上用 CDP 探针做了「改文案后」的 DOM 模拟（只读产物、不构建；临时脚本不入库）：把副行截成 `≈ ¥X`、把额度 brief 截到 24 字、再按需删掉被判定为重复的行，量页高变化。读数如下。

| 路由 | 1440 页高 | 行高由谁决定（实测内容高） | 模拟结果 | 判据（数据页 −10% / 说明页 −8%） |
|---|---:|---|---|---|
| `/api-pricing/` | 14379 | 178 行 × 58.6；**主列 3 行（厂商/模型/上下文）54px 决定**，价格列 51.8 次之 | 只去副行日期：**−0.0%**；再去掉主列重复的「上下文」行：**−17.0%（实测模拟）** | 需 −1438px → 两种都做才过 |
| `/plans/` | 4168 | 55 行 × 57.8；**主列（厂商 + 套餐名，多数折成 3 行，内容高 52px）决定**，月费 37、折算 45 | 副行去日期 + 额度 brief 24 字：**−0.7%（实测模拟）** | 需 −417px → **文案层达不到**，见表下选项 |
| `/` | 1881 | hero 386（lede 91 + meta 51）+ 快照段 161 + 卡片 223/602 + footer 157 | 删快照段 −161、lede/meta −90、入口卡约 −40（数据纪律两段在等高网格里，删了不减高） | 需 −189px → **推算 −14%，达标** |
| `/calculator/` | 1928 | hero 391（lede 121）+ 对比区 752（lede 72 / caveat 66）+ result 290 + callout 79 | lede −71、删 hero 免责 −25（新增 brief +26 抵消）、对比 lede −22、callout −27 | 需 −154px → **推算 −6%，偏紧** |
| `/sources/` | 3802 | 覆盖率网格 1361 + 两段 676 + 两卡 314 + 两节 447 | 两处双段合并约 −130、lede −35、新增 brief +26 | 需 −305px → **推算 −4%，不达标** |
| `/methodology/` | 2965 | 11 节正文 | 厂商名单下沉 −53、四段压缩约 −60 | 需 −238px → **推算 −4%，不达标** |

结论：**`/plans/` 与三张说明页的页高判据，纯文案层达不到**（`/plans/` 这一条与 architecture §六 已预警的「768 首屏与 DOM 结构冲突」是同一性质：行高来自数据（厂商/套餐名 3 行），不是说明文案）。`/api-pricing/` 只在「副行去日期 + 主列去重复行」两件都做时才能到 −17%。

需要编排层拍的板（三选一，我不擅改阈值）：

1. **接受部分路由不达标**，按实测重定 `docHeightDropPctMin*`：数据页文案层极限 `/api-pricing/` −17%（含主列去重行）、`/plans/` −0.7%；说明页文案层极限约 −4~6%。
2. **授权结构性减法**（都属「删重复不删事实」，但超出「只改文案」）：
   - `/plans/`：主列把「厂商」与「套餐名」并到一行（现在是 `<br />` 断成两行，多数套餐名再折一行）→ 行高 −16px × 55 ≈ −880px（−21%）；
   - `/sources/`：把「价格怎么抓到的」里 8 行来源清单下沉 `<details>`（约 −230px，清单仍可展开）；
   - `/methodology/`：把「四类标注」「反推等效用量」两段下沉 `<details>`（约 −160px）；
   - `/calculator/`：「订阅 vs 按量」的 caveat 压到两句（约 −26px）+ `result-detail` 去掉与 `result-sub` 重复的换算句（约 −24px）。
3. **先按现状提交，把页高缺口单列一票**，下一轮做。

### 3. 其它待验

- `gen-llms-txt.mjs` 直接 `import '../../src/lib/copy.ts'`：本机 Node v25.8.2 通过，`node --check` 通过；CI 若锁 Node 22.23.4（≥22.18 默认开启类型剥离）应同样可用，但**首次 CI 需看一眼** `dist/llms.txt` 是否仍写出真实数字（`抓取日期` 那一行）。
- `/plans/` 768 首屏（基线 247）：本轮只删不增，理论上只会更低；`copy-density --live` 会给准数。
- `scope-note` / `table-note` 两个新 class 没有专门样式（沿用 `.meta` 字号与颜色）；若视觉上想弱化，可在下一轮补一条 CSS（本轮不动样式文件）。
