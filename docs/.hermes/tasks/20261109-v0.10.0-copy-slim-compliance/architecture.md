# v0.10.0 文案合规与简约 · 架构设计

> 只出方案与文案清单，不改源码（D8）。新增符号一律标（实证：文件:行）或（待验证：方法）。

## 一、结论速览

1. 越权词不止两张票点名的四个：源码 `核验` 仍命中 17 个文件约 40 处（实证：`grep -rn 核验 src`），须一次换净，否则新词形同虚设（issues-dossier.md:103）。
2. 术语真源从 5 个常量扩到 11 个，页面硬编码清零；`gen-llms-txt.mjs` 改为直接 `import` `copy.ts`（实证：本机 Node v25.8.2 `import('./src/lib/copy.ts')` 成功；CI Node 22.23 同命令待验证）。
3. 免责三档：页脚全文、口径页全文、其余 5 页 11 字短句 + 链接；四要素靠预渲染页脚全站可达，不依赖 JS（实证：`src/App.vue:12` 常驻 `AppFooter`）。
4. 估算日期上提为「表级一处 + 单元格 `≈ ¥X`」；判据是 dist HTML 中 `估算（YYYY-MM-DD）` 计数为 0（实证：`scripts/metrics/copy-density.mjs:150`）。
5. 首屏瘦身有结构风险：768 超标主因不是可见文案，是 `<li>` 的 textContent 把折叠内文本算进去了（实测 `/plans/` 首张卡 li 261 字，折叠占 232 字）。文案层可压到约 600，350 需产品层决策（见六）。

## 二、合规词表（逐个列全，避免下轮再补）

依据列简写：F3-1 = 不得暗示官方背书，F3-2 = 不得代厂商表态（实证：`docs/compliance/data-fetching.md:34-38`）。

| 词 / 句式 | 出现位置 | 替换成 | 依据 |
|---|---|---|---|
| 官方核验 | 源码已清零，靠守卫守（实证：`tests/copy.test.ts:15`） | 官方页抓取（`PROVENANCE_OFFICIAL`） | F3-1 |
| 官方原价 | 同上 | 官方标价（`OFFICIAL_PRICE_LABEL`） | 价格法「原价」含促销对比义（dossier:44） |
| 核验日期 | `src/views/PlansView.vue:178`、`MethodologyView.vue:21` | 抓取日期（`FETCHED_AT_LABEL`） | F3-1，链路是抓取不是核验 |
| 核验于 X | `PriceTable.vue:134`、`PriceCard.vue:86`、`PlansView.vue:405` | 抓取于 X（`FETCHED_ON`） | 同上 |
| 待核验 | `src/lib/fx.ts:3`、`PlansView.vue:37/52/327-330/393-396` | 缺价 `PRICE_MISSING` / 字段用未公开 `FIELD_UNPUBLISHED` | 本站不做核验动作 |
| 已核验 | `src/lib/pricing.ts:57/67`、`router/index.ts:42/47`、`schema.ts:53/156`、`plans.ts:34`、`format.ts:31` | 已收录 / 可用 / 有价 | 同上 |
| 逐项核过 | `PlansView.vue:178` | 按官方页整理 | F3-1 |
| 逐项核过官方页 | `SourcesView.vue:46` | 抓自官方页 | F3-1 |
| 人工核对后入库 | `SourcesView.vue:147` | 脚本抓取、人工复核后入库 | 与爬虫链路矛盾的四处之一（dossier:26-33） |
| 这样核到的 | `SourcesView.vue:127` | 按此方式取到的 | 同上 |
| 核到官方 | `MethodologyView.vue:40` | 取到官方页价格 | 同上 |
| 单独核验 | `HomeView.vue:46` | 按官方页单独整理 | F3-1 |
| 核验流程 | `router/index.ts:56` | 抓取流程 | F3-1 |
| 逐条核对官方定价页 | `src/lib/structured-data.ts:85` | 逐条抓自官方定价页 | F3-1 |
| 核验日期（llms.txt） | `scripts/gen-llms-txt.mjs:63/66/90/103` | 抓取日期 | F3-1 |
| 最新 | `PlansView.vue:423`（「可最新的 GPT-6 全系」） | 删「最新」，保留事实 | 广告法第 9 条绝对化用语 |
| 官方原话是 + 英文引文 | `PlansView.vue:423` | 厂商文档同样写明各档均有用量上限 | F3-2，不代厂商背书转述准确性 |
| 官方指定工具 | `src/data/entries/plans.json:168/188/208`（数据，禁改） | 展示侧标签改「用途限制（厂商转述）」 | F3-2 |
| 官方页面（链接文字） | `PlansView.vue:338/404`、`SourcesView.vue:91` | 官方定价页（`SOURCE_PAGE_LABEL`） | D3 术语统一 |
| 官方披露 | `PlansView.vue:327/393`、`MethodologyView.vue:80` | 厂商披露 / 额度原文 | F3-2 |
| 权威 / 保证 / 全网最低 / 最便宜（裸用）/ 100% | 源码当前无命中（实证：`grep -rn` 全仓），只进守卫防回流 | — | 广告法 9 条、反法 8 条 |

允许保留（指称性使用，不构成背书）：官方页抓取、聚合数据、官方标价、官方定价页、官方页、官方样本、官方原文引用处加「转述」标注（dossier:56）。

## 三、术语真源结构（`src/lib/copy.ts`）

保留 5 个（实证：`src/lib/copy.ts:14/17/20/23/26`）：`PROVENANCE_OFFICIAL`、`PROVENANCE_AGGREGATE`、`AGGREGATE_NOTE`、`OFFICIAL_PRICE_LABEL`、`FETCHED_AT_LABEL`。

新增 6 个（值即最终文案）：

| 常量 | 值 | 替代谁 |
|---|---|---|
| `SOURCE_PAGE_LABEL` | 官方定价页 | 链接文字「官方页面」「定价页」 |
| `FETCHED_ON` | 抓取于 | 「核验于」 |
| `PRICE_MISSING` | 缺价 | `fx.ts:3` 的「待核验」（fx.ts 保留同名 re-export 以少改调用点） |
| `FIELD_UNPUBLISHED` | 未公开 | 套餐字段缺失的「待核验」 |
| `VENDOR_TERMS_LABEL` | 用途限制（厂商转述） | `PlansView.vue:330/396` 的「用途限制」 |
| `NON_OFFICIAL_BRIEF` | 非官方站点，价格仅供参考（11 字） | 各页重复的免责长句 |

另加一个句子构造器 `FX_TABLE_NOTE(fx)`（五节）与 `ALLOWANCE_SOURCE_LABEL = '额度原文'`。

必须改成引用常量的硬编码点：`FilterBar.vue:77`、`cost-display.ts:44`、`format.ts:77`、`SourcesView.vue:57/95`、`KeyFacts.vue:36`、`ApiPricingView.vue:129`、`PlansView.vue:338/404/405`、`PriceTable.vue:134`、`PriceCard.vue:86`。

## 四、免责收口（三档 + 计数规则）

| 档位 | 落点 | 文本 | 每页次数 |
|---|---|---|---|
| 完整 | `AppFooter.vue:17-21` | `SITE_DISCLAIMER` 全文（`site-meta.ts:45-46`） | 1 |
| 完整 | `MethodologyView.vue:115` | 同一个常量，不另写一份 | `/methodology/` 上 1（该页共 2 次：页脚 + 本节） |
| 最短 | 5 个非口径页 hero 末行 | `NON_OFFICIAL_BRIEF` + 指向 `/methodology/` 的链接 | 1 |

- 页脚删掉 `AppFooter.vue:18` 的「人民币为估算参考值，最终以厂商原币种为准」与 `:20` 的「价格非购买建议」：这两句会与表级声明争同一个计数位（`copy-density.mjs:56-64` 里 `cny-estimate`、`billing-currency` 每页 ≤1）。
- 四要素可达：`App.vue:12` 全站常驻页脚，6 条路由均为预渲染写死文本，禁 JS 也在（待验证：`node scripts/qa/copy-guard.mjs --dist dist`）。
- 不新增页面、不新增路由（D7），商标句已在 `SITE_DISCLAIMER` 内，不再单列。

## 五、估算日期上提（D4）

表级声明（唯一一处，`copy.ts` 出）：`FX_TABLE_NOTE(fx)` =
「表格副行 ≈ ¥ 为按 1 USD = 6.6908 CNY（2026-11-08）估算的参考值，汇率随时变化，账单以厂商原币种为准。」
（实证：汇率/日期取 `data.ts` 的 `fxRate.rate`/`fxRate.date`，字段在 `src/lib/fx.ts:13-19`）

桌面层（`/api-pricing/`，表格上方一行 `<p class="meta table-note">` + 单元格）：
```
表格副行 ≈ ¥ 为按 1 USD = 6.6908 CNY（2026-11-08）估算的参考值，汇率随时变化，账单以厂商原币种为准。
输入 / 1M    $0.0375        ¥1.00
              ≈ ¥0.2509      官方标价
```
移动层（卡片列表顶部同一句，卡片内每格只留 `≈ ¥0.2509`）：
```
表格副行 ≈ ¥ 为按 1 USD = 6.6908 CNY（2026-11-08）估算的参考值，汇率随时变化，账单以厂商原币种为准。
Cohere · Command R7B        输入 / 1M  $0.0375  ≈ ¥0.2509
                            输出 / 1M  $0.15    ≈ ¥1.00
```
（实证：现形态在 `format.ts:156`、`price-row.ts:52`、`PlansView.vue:43`、`cost-display.ts:39`）

「只出现一次」判定口径（三条同时成立）：
1. dist HTML 中 `估算（YYYY-MM-DD）` 计数 = 0（`copy-density.mjs:150`）。
2. `FX_TABLE_NOTE` 去数字后正文在每条路由 = 1 次（新守卫）。
3. `cny-estimate` / `fx-disclaimer` / `billing-currency` 三个 pattern 每页 = 1（`copy-density.mjs:368-370`）。
   注意「不准确」也算命中，声明里只准出现「汇率随时变化」一句，不得同时写「不准确」。
两个层（表格 / 卡片）在 SSR 下只有一层进入 DOM（`v-if="isDesktop"`，`src/composables/useMediaQuery.ts:47`），所以两份同句不会同时出现。

## 六、首屏瘦身清单

实测分解（自建 CDP 探针，`dist` + 375/768/1440，与 F7 基线吻合）：

| 路由 | 基线（375/768/1440） | 超标主因（实测） |
|---|---|---|
| `/` | 230/331/391 | 1440 超标 171：lede 78 + 两段 `p` 45/50 + hero meta 31 + 入口卡 `p` 45/38 |
| `/plans/` | 349/918/148 | 768 的 715 全在 `li.price-cards-item`（261/174/140/140），其中折叠文本 232/140/119 |
| `/api-pricing/` | 205/614/134 | 768 里 4 张卡 li 合计 526，折叠文本 106-128/张 |
| `/calculator/` | 144/224/381 | 1440 的 89 是 `plan-compare-lede`，67 是 `result-detail` |
| `/sources/` | 82/266/370 | 1440 里三段各 80-114 字的说明段 |
| `/methodology/` | 237/544/520 | 1440 里 114/109/96/84 四段 |

逐路由动作（删哪段 / 合并到哪 / 下沉到哪）：

| 路由 | 动作 | 预期 | 页高 |
|---|---|---|---|
| `/` | lede 78→30（保留「先算真实成本」）；hero meta 31→`抓取日期 X · 1 USD = Y CNY`；两张入口卡 `p` 45/38→12/12；「当前数据快照」p（`HomeView.vue:58-61`）删（数字已在 KeyFacts）；「数据纪律」三 p（`:77-78`）合一句并下沉 `<details>` | 391→约 200；375 230→约 165 | −8% |
| `/plans/` | hero meta 32→`抓取日期 X · N 档`；三张结论卡 note 压到 ≤25 字，「已排除 N 个免费/未标价档」合并到一行口径（`:129`）；卡 body brief 42→24（`PlansView.vue:54`）；卡内 sub 去日期（五节）；折叠「折算依据」整句→`见页末口径`（`:307-311`）；页末三段口径（`:427-435`）→ 合并为 1 段 + `<details>` | 768 918→约 600；375 349→约 245；1440 148→130 | −18% |
| `/api-pricing/` | hero meta 13 保留；结论卡 note 去 `官方页抓取` 前缀，scope 句合并一行（`:79`）；卡内 sub 去日期；折叠「计价说明」与单元格重复句删（`format.ts:185-192`）；filter-summary（`:153-155`）由 2 行合 1 行 | 768 614→约 420；375 205→约 150 | −20% |
| `/calculator/` | lede 93→40（公式下沉到下方 callout）；`plan-compare-lede` 89→45；`result-detail`（`cost-display.ts:57`）由 4 句合 2 句 | 1440 381→约 250 | −12% |
| `/sources/` | lede 46 句→`每条价格从哪来、多少条抓自官方页`；「一眼看清」第二组 stat 说明压到 ≤12 字；`Section`「价格怎么核出来的」两段（`:127/137`）合并；「数据怎么保持更新」两段（`:144/147`）合并 | 1440 370→约 300 | −12% |
| `/methodology/` | 四段（114/109/96/84）各删重复半句：`official/aggregate` 段与「币种」段重复的标价规则只留一处；「为什么仍只走聚合」保留事实、删「本期用这个方法核到官方」的枚举细节 → 下沉 `<details>` | 1440 520→约 430 | −14% |

达标风险（必须上报，不自行改判据）：`/plans/` 768 若只做文案层，实测预计停在 590-620，与 350 差 240 左右，全部来自折叠文本被 `<li>.textContent` 计入。三个可选口径交编排层拍板：① 768-1023 断点改渲染表格（表格文本不计入，见 `copy-density.mjs:101-121`）；② 折叠内容改由客户端插值（破禁 JS 可达，不推荐）；③ 阈值按新 DOM 口径复核。本文档只给文案层，不动断点（D6/D8）。

## 七、守卫设计（四道，各自选对观测面）

| 守卫 | 观测面 | 怎么测 | 为什么不被 SSR 结构变化误伤 |
|---|---|---|---|
| 旧词 | 源码 | 扩 `tests/copy.test.ts` 的 `BANNED`：加 官方数据/官方确认/已核官方/官方认证/官方以此为准/核验于/核验日期/待核验/已核验/最新/逐项核过/官方指定；扫 `src`+`scripts`，跳 `data` | 只做字符串包含判断，不解析 AST 与模板结构 |
| 真源引用 | 源码 | 同上：`src/**/*.vue` 出现 `官方页抓取/聚合数据/官方标价/未核官方页/抓取于` 字面量（`copy.ts` 除外）即红 | 同上；允许 `${常量}` 拼接 |
| 声明重复 | 构建产物 | 新增 `scripts/qa/copy-guard.mjs`：读 `dist` 6 个 HTML，剥 script/style、摘 `<table>` 子树后取文本（与 `copy-density.mjs:89-131` 同口径），断言 `FX_TABLE_NOTE` =1、三个 pattern ≤1、`估算（日期）`=0 | 只看可见文本，不看 class / 组件名 / 选择器；两层只渲染一层（`useMediaQuery.ts:16-27`） |
| 四要素可达 | 构建产物（禁 JS） | 同一脚本：每条路由文本包含 `SITE_DISCLAIMER` 归一化串；`/methodology/` 计 2，其余计 1 | 用真源常量比对，改标点不会假红；dist 即无 JS 视图 |

「能红」证明：`tests/fixtures/copy-guard/{good,bad}/` 两个静态目录，`tests/copy-guard.test.ts` 用 `spawnSync` 跑脚本断言 exit 0 / 1 且 stderr 指名违规项。

## 八、遗留与风险

1. `/plans/` 768 阈值与 DOM 结构冲突（六节），需编排层决策。
2. `formatDualPrice`（`format.ts:68-97`）生产代码已无调用，仅测试在用；本轮不动，避免扩面，但它的 `按 X 估算（日期）` 句式不许被页面再引用。
3. `gen-llms-txt.mjs` 用正则从产物 HTML 取数（`:30-36`），文案一改这些正则必须同步，否则 llms.txt 写「未知」。
4. 数据侧 `plans.json` 的「官方指定工具」「最新 Grok 模型」按红线不改，只在展示层标转述；`copy` 守卫跳过 `src/data/**`（`tests/copy.test.ts:22`）。
