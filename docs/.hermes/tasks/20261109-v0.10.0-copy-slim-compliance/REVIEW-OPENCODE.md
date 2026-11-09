# v0.10.0 文案合规与简约 · 对抗审查（OpenCode 同源）

审查时间：2026-11-09
审查对象：工作区相对 `HEAD`（54ff98c）的全部未提交改动 —— `git diff --stat` 41 文件 / +477 / −281，另有 7 个未跟踪条目（`scripts/qa/copy-guard.mjs`、`tests/copy-guard.test.ts`、`tests/fixtures/copy-guard/**`、两份 coding-result、两份 prompt）。

本轮实际执行的只读探针：

```
git status --short / git diff / git diff --numstat / git diff --check
npx.cmd vitest run                                   → 37 files / 644 tests passed
npx.cmd vitest run tests/{copy,copy-guard,format,client-scripts,plan-vs-api-view,ux-refactor}.test.ts
                                                     → 6 files / 75 tests passed
node scripts/qa/copy-guard.mjs --dist dist           → exit 0
node scripts/qa/copy-guard.mjs --dist tests/fixtures/copy-guard/{good,bad} --partial → 0 / 1（7 条）
node scripts/metrics/copy-density.mjs --dist dist    → 与 coding-result-rework ⓿ 静态读数逐格一致
node scripts/metrics/copy-density.mjs --compare docs/metrics/copy-density-baseline.json --dist dist → 通过
Node 单文件探针（逐路由四要素 grep、JSON-LD 解析、EOL 审计、守卫变异、常量引用统计）
```

未执行：`npm run build`、`run-gates.mjs`、`chart-probe.mjs`、live 视口实测（按纪律不自跑构建/门禁）。因此首屏 208/93/235/321/497 这组 live 读数**本轮未独立复现**，仅采信自述；但同一脚本的 static 读数已逐格复现。

---

## ① 效力声明与出口判定

### 效力声明（如实）

- 原定审查者 Codex 的账号额度仍未恢复（编排层提供的冒烟结论是 usage limit；本轮未复核该额度的探测本身）。
- 实际执行者是 **OpenCode**，而本迭代的架构设计（`architecture.md`）与两轮编码（`coding-result.md` / `coding-result-rework.md`）**也是由 OpenCode 完成的**。
- **这是同源审查，不是独立第三方。** 同一执行体审自己的设计稿与代码，系统性偏差（例如把「设计稿这么写了」当成「事实成立」）不会被自动发现。下面每条结论都附了可复现命令或 file:line，请按证据复核，不要按结论签名。

### 出口判定

**`rejected`** —— 2 个 High 阻断项：

| 编号 | 阻断项 | 性质 |
|---|---|---|
| H1 | `/sources/` 的更新流程句把「人工核对后入库」改成了「脚本抓取、人工复核后入库」，与同一句前半段「不走自动抓取」自相矛盾，也与仓库的更新流程相反 | 事实被改错 |
| H2 | 四要素第 3 项「以厂商页面与账单为准」不在 `SITE_DISCLAIMER` 里；本轮又删掉页脚唯一含「…为准」的那一句；`/` 与 `/api-pricing/` 只剩默认闭合折叠内一处。`copy-guard` 的「四要素可达」用常量自身当 needle，结构性发现不了缺要素 | 四要素不达标 + 守卫不可证伪 |

其余为 Medium / Low（见 ③），不影响「rejected」的主体结论，但建议同批收口。

---

## ② 阻断项

### H1（High）流程事实被改错：「不走自动抓取」与「改为脚本抓取」同时成立

**位置**：`src/views/SourcesView.vue:152`

新句（当前工作区）：

> 官方页价格不走自动抓取——各家定价页改版频繁，机器判定容易误伤，**这部分改为脚本抓取、人工复核后入库**；……

旧句（`git show HEAD:src/views/SourcesView.vue`，同段）：

> 官方价格不走自动抓取——各家定价页改版频繁，机器判定容易误伤，**所以这部分保持人工核对后入库**。

**两处硬伤**

1. **句内自相矛盾**：前半句「不走自动抓取」，后半句「改为脚本抓取」。读者无法判断官方价到底怎么进库。
2. **与仓库事实相反**（可复现证据，均为一手文件）：
   - `.github/workflows/data-refresh.yml:3`：「只做「抓取 → 校验 → 提交」，**不碰官方价格（那部分必须人工核对）**。」
   - `README.md:102`：「先把官方定价页打开，**把数字抄下来**，然后 `node scripts/data/cli.mjs add ...`」
   - `README.md:214`：`src/data/entries/api.json` 的维护方式是「**人 + CLI `add`**」
   - `scripts/data/cli.mjs:95`：「只读：不写任何数据文件，**收录仍需人工核验官方页**。」
   - `scripts/data/lib/add.mjs:143`：official 条目的默认 notes 是「**人工核对官方定价页**」
   - `src/data/entries/api.json` 的 official 条目 notes 实际值是「官方页原文：…」「官方表格：…」（人工抄录痕迹）
   - 仓库里没有任何把官方定价页价格解析成条目的抓取脚本；`cli.mjs pull` 只拉 models.dev 聚合快照。

也就是说：**旧句是真的，新句是假的。** 这不是措辞偏好，是把一条本来正确的流程说明改成了错误说明——而且发生在以「来源可追溯」为卖点的合规迭代里。

> 附带口径问题（Medium，不单独阻断，见 M-01）：仓库其余文案多处把 official 条目的来源写成「爬虫抓公开定价页」（`HomeView.vue:57`）或「爬虫抓自厂商官方定价页」（`MethodologyView.vue:38`）。按上面的仓库流程，这是「人工从官方页抄录 + 校验」，不是爬虫。旧版也有同样措辞（`git show HEAD:src/components/KeyFacts.vue`），属存量；但本轮在 `SourcesView.vue:152` 把它坐实成了「脚本抓取」，等于新增了一条不存在的链路。

**最小修复**：把该半句恢复为事实——「这部分保持**人工从官方页抄录、脚本校验后入库**」；同时删掉「改为脚本抓取」这个新断言。是否把「官方页抓取」这个术语本身改成「摘自官方页 / 官方页录入」属于编排层决策（涉及 `copy.ts` 常量值、`NON_OFFICIAL_BRIEF` 之外的标签体系），不在本轮最小修复内。

**构造输入**（复现）：

```
grep -n "不走自动抓取" src/views/SourcesView.vue
grep -n "不碰官方价格" .github/workflows/data-refresh.yml
sed -n '100,106p' README.md
node -e "const d=require('./src/data/entries/api.json'); console.log(d.filter(e=>e.provenance==='official')[0].notes)"
```

---

### H2（High）四要素第 3 项不在页脚；守卫对「缺要素」结构性失明

**要素定义**（`docs/compliance/data-fetching.md:38`、`issues-dossier.md:164`）：
非官方 / 与厂商无隶属或授权关系 / **以厂商页面与账单为准** / 不构成采购建议 + 商标归属。

**真源**：`src/lib/site-meta.ts:45-46`

> 本站是个人维护的静态信息与估算工具，与所收录厂商无隶属、合作或授权关系，不代表任何厂商，不构成采购、财务或法律建议。厂商名称与商标归各自权利人所有。

这句话里 **没有**「以厂商页面与账单为准」（也没有任何「…为准」）。按 dossier 的定义，四要素的第 3 项缺失；句子里实际具备的是：个人维护（≈非官方）/ 无隶属、合作或授权关系 / 不构成采购、财务或法律建议 / 商标归属。这一项一直缺——属存量缺陷。

**本轮把它从页脚也删掉了**

`git show HEAD:src/components/AppFooter.vue:18` 原有：

> 1 USD = … CNY（…）· 人民币为估算参考值，**最终以厂商原币种为准**。

当前 `src/components/AppFooter.vue:17` 只剩：

> 1 USD = … CNY（…）

`/` 的 hero 旧 meta 也含「最终账单以厂商原币种为准」（`git show HEAD:src/views/HomeView.vue:28-30`），本轮一并删除。于是：

**逐路由读数**（`node` 探针：剥 script 后取可见文本，分别在全页与 `<footer>…</footer>` 内计数）：

| 路由 | E1 非官方 | E2 无隶属 | **E3 以…为准（全页 / 页脚）** | E4 不构成采购 | E5 商标 | E3 是否在闭合 details 内 |
|---|---|---:|---:|---:|---:|---|
| `/` | 3 / 2 | 2 / 2 | **1 / 0** | 1 / 1 | 1 / 1 | 是（唯一一处） |
| `/api-pricing/` | 3 / 2 | 2 / 2 | **1 / 0** | 1 / 1 | 1 / 1 | 是（唯一一处） |
| `/plans/` | 3 / 2 | 2 / 2 | **1 / 0** | 1 / 1 | 1 / 1 | 否 |
| `/calculator/` | 3 / 2 | 2 / 2 | **1 / 0** | 1 / 1 | 1 / 1 | 否 |
| `/sources/` | 3 / 2 | 3 / 2 | **1 / 0** | 1 / 1 | 1 / 1 | 否 |
| `/methodology/` | 4 / 2 | 3 / 2 | **2 / 0** | 2 / 1 | 2 / 1 | 否 |

（格式：全页次数 / 页脚内次数。E2 页脚为 2 是因为 `WechatQr.vue:35` 也有一句「与所收录厂商无隶属或合作关系」，同属页脚。）

结论：

- **页脚不承载 E3，6/6 路由都是 0。** 设计稿（`architecture.md:9/71`）与返工自述（`coding-result-rework.md:137`）都写「四要素靠预渲染页脚全站可达」——不成立。
- `/` 与 `/api-pricing/` 上 E3 只剩 1 处，且在**默认闭合**的 `<details>` 内（首页是「数据纪律与排序口径」折叠：`HomeView.vue:64-67`）。不开折叠，读者看不到「以…为准」。这已经不是「页脚常驻」，而是「点开才有」。

**守卫为什么发现不了**（同源审查的关键盲点）

`scripts/qa/copy-guard.mjs:157` 取 `SITE_DISCLAIMER` 当 needle，`:207` 在产物文本里数这个 needle。**needle 与被测对象是同一个常量**：只要 SITE_DISCLAIMER 改了而产物跟着重建，守卫永远绿。

变异证明（临时目录，不改仓库）：把 `SITE_DISCLAIMER` 里的「，不构成采购、财务或法律建议」删掉，同时把 good 夹具产物里的同一句删掉（模拟「改常量 + 重新构建」），跑同一个脚本：

```
node <tmp>/scripts/qa/copy-guard.mjs --dist <tmp>/dist --partial
→ 结论：通过（声明各 ≤1、估算日期 0、表级声明 1、四要素可达）
→ EXIT=0
```

即：**四要素真被删掉一项，守卫仍打印「四要素可达」并 exit 0。** 这条断言对它声称守护的性质不可证伪。

**最小修复**（两条一起做）

1. 在 `SITE_DISCLAIMER` 内补上第 3 项，例如把「不代表任何厂商」改成「不代表厂商，价格与账单以厂商页面为准」。注意预算：`/`@1440 现在是 208，上限 220，页脚这句加长约 13 字，很可能把首页顶到 ~221。要么同步精简页脚另一行（如站名/汇率行的重复表述），要么由编排层重定阈值——**不要用改判据的方式掩盖**（R2 已明确反对）。
2. `copy-guard.mjs` 的「四要素」改成**逐要素断言**（非官方 / 无隶属 / 以…为准 / 不构成采购建议 / 商标归属 各自 ≥1，且页脚内各自 ≥1），needle 用字面量或独立常量，不要用被测常量自身当基准。

---

## ③ 非阻断项（Medium / Low）

| 编号 | 级别 | 位置 | 问题 | 收口方式 / 归属 |
|---|---|---|---|---|
| M-01 | Medium | `HomeView.vue:57`、`MethodologyView.vue:38` | 「爬虫抓公开定价页」与仓库实际流程（人工抄录 + CLI add）不符；存量措辞，本轮在 `SourcesView.vue:152` 被放大成「脚本抓取」 | 与 H1 同批改；是否整体换术语由编排层定 |
| M-02 | Medium | `KeyFacts.vue:37-45` | 「133 条官方页抓取、45 条聚合数据」丢掉了旧句的「未核官方页」限定与「在官方页的付费条目中」这一结论范围；两者都在首屏摘要里消失，只剩首页折叠内 | 恢复限定词（约 +6~10 字，需看 220 预算）或把 summary 写成「聚合数据（未核官方页）」；归编码 |
| M-03 | Medium | `CalculatorView.vue:71` | 删掉了「聚合数据由聚合源以 USD 发布，即使国内厂商也只标「聚合数据」，不标「官方标价」」。这是合规措辞（F3-1 术语边界），R3 只允许「换位置与说法」，这里是直接删、未换位置 | 在下方 callout 补一句同义说明；归编码 |
| M-04 | Medium | `PlansView.vue:436` | 「Claude 各档均有用量上限」把「官方原话 + 英文引文」换成了**无归属的断言**。`architecture.md:35` 要求的是「厂商文档同样写明各档均有用量上限」；现在丢了可追溯性，也构成代厂商表态的风险（F3-2） | 改为「厂商文档写明各档均有用量上限」（+6 字，该段不在首屏）；归编码 |
| M-05 | Medium | `tests/format.test.ts:75-82`；`src/lib/fx.ts:24-27` | 旧断言 `usdCells.input.sub` 必须含当前汇率/日期；新断言改成 `not.toContain`，而 `FX_TABLE_NOTE` / `fxTableNote` **零单测**（`grep -rn FX_TABLE_NOTE tests` 只命中一行注释）。`copy-guard` 的 skeleton 会抹掉数字，所以汇率/日期写错既不会红测试也不会红守卫 | 给 `FX_TABLE_NOTE(fxRate)` 加断言（含 `formatRate(fxRate.rate)` 与 `fxRate.date`）；归编码 |
| M-06 | Low/Medium | `scripts/metrics/copy-density.mjs:420,427` | `const heightOk = true;` 后仍打印 `${heightOk ? '✓' : '✗'}`，页高不达标时输出「降 0%，需 ≥10% ✓」。不参与 `ok` 符合 R2，但**读数在说谎**，也属「恒真指示」 | 打印真实布尔但排除出 `ok`，或删掉 ✓ 只留数字；归编排层（该脚本属门禁面） |
| M-07 | Low | `HomeView.vue`（删除的「当前数据快照」段，HEAD:51-62） | 数字已在 `KeyFacts`，但连带删掉了「数字由 `src/lib/stats.ts` 算出，与 `cli.mjs verify` 同源」这条可验证性说明，以及「N 个模型口径」这个读数 | 若要保留可验证性，移入下方折叠一句；非硬要求 |
| M-08 | Low | `MethodologyView.vue:30` | 「页面可访问不代表价格永久有效」换成「使用前请再核对官方页」，动作保留、失效机理说明弱化；免责节仍有「厂商可能随时调整…」兜底 | 可接受，若加回只需半句 |
| M-09 | Low | 23 个改动文件 + `ScatterChart.vue` | 工作区行尾不一致：23 个文件被写成纯 LF，`ScatterChart.vue` 是 CRLF 里夹了 1 行 LF（crlf=28 / lf=1），其余 17 个改动文件仍是 CRLF；未改动文件（如 `stats.ts`、`filters.ts`）都是 CRLF（`core.autocrlf=true`）。`git diff --check` 干净、`git diff` 无 EOL 噪声、提交后 blob 仍是 LF，**无功能影响** | 下一轮按仓库约定写回并消掉 ScatterChart 的混合行；或在 `.gitattributes` 里显式钉住 `* text=auto`；归编排层 |

---

## ④ 被证伪的怀疑（全部实跑过）

| # | 怀疑 | 构造输入 / 命令 | 结果 |
|---|---|---|---|
| 1 | `gen-llms-txt.mjs` 改成运行时 `import '../src/lib/copy.ts'`，CI Node 22 会构建失败 | 读 `package.json engines`（`>=22.23.4`）、`.github/workflows/ci.yml:24`（node 22）、`dist/llms.txt`（14:46 构建产物） | **证伪**：llms.txt 的日期/条数/厂商数/汇率全部是真实值（133/45/178/16/6.6908/2026-11-08），说明本机 Node 25.8.2 已跑通；Node 22.18+ 默认类型剥离，`copy.ts` 只用可擦除语法。残余风险：未在 22.x 实跑，CI 首跑需看一眼 `dist/llms.txt` |
| 2 | 结构化数据里的中文标点会让 JSON-LD 非法 | 抽取 6 个路由所有 `<script type="application/ld+json">` 并 `JSON.parse` | **证伪**：`/` 4 块、其余各 2 块，全部 parse 成功 |
| 3 | Methodology 删掉「与适用条件」= 丢了方法论事实 | `grep -n "峰谷\|阶梯\|批量" src/views/MethodologyView.vue` | **证伪**：`:104-106`「峰谷价、阶梯价与批量价」整节仍在，批量/长上下文/其他档位价格都写明 |
| 4 | R2 改判据时顺手放掉了「声明重复 / 估算日期」 | 读 `compareStatic`（`copy-density.mjs:378-403`）+ 实跑 `--compare ... --dist dist` | **证伪**：static 判定仍只按「超标重复项 + 单元格估算重复」，本轮通过的正是这两项；`copy-guard --dist dist` 六路由声明各 1、估算日期 0 |
| 5 | 数据文件或图表几何被顺手改了 | `git diff --name-only \| grep -E "^src/data/\|chart-geometry\|package.json"` | **证伪**：零命中；`pricing-chart-data.ts` 只改了 `:224` 的 description 与两处注释 |
| 6 | `BANNED` 里的「最新」会误伤 plans.json 的厂商转述 | `grep -rn "最新" src` | **证伪**：5 处全在 `src/data/entries/plans.json`；`tests/copy.test.ts:43-50` 的 walk 跳过 `entries`/`generated`，测试 644 全绿 |
| 7 | 表级声明 `FX_TABLE_NOTE` 与页末 `RATE_DISCLAIMER` 同页会被判成「声明重复」 | `node scripts/qa/copy-guard.mjs --dist dist` | **证伪**：`/api-pricing/`、`/plans/` 的 fx/cny/billing 各 1，表级声明各 1 |
| 8 | 首页 208 字是靠把价格样例删掉换的（事实被删） | 读 `HomeView.vue:70-81` 与 dist 渲染结果 | **部分证伪**：8 条样例在 `<details>` 内完整保留（含「查看全部 API 价格」出口），属换位置不是删事实；但确实用「首屏看不到样例」换了字数，这是取舍，不是事实缺失 |

---

## ⑤ A1~A8 逐条结论表

| 面 | 结论 | 关键证据 |
|---|---|---|
| **A1 语义漂移** | **不通过（1 High + 1 Medium）** | High：`SourcesView.vue:152` 流程句自相矛盾且与 `data-refresh.yml:3`/`README.md:102` 相反（H1）。Medium：`PlansView.vue:436` Claude 断言丢归属（M-04）。逐条抽查 15 处，见下表。数字/币种/汇率/生效日期：diff 内未发现被改——`133` / `45` / `178` / `16` 仍由 `stats` 现算，`6.6908` / `2026-11-08` 仍取 `fx.generated.json`，`DATA_VERIFIED_AT` 仍由数据派生 |
| **A2 四要素可达** | **不通过（High）** | 页脚 E3 = 0/6 路由；`/` 与 `/api-pricing/` 唯一一处 E3 在闭合 `<details>` 内；`SITE_DISCLAIMER` 本体缺 E3（H2）。**直接回答「哪句是唯一来源」：是。** 改前页脚「人民币为估算参考值，最终以厂商原币种为准」是 E3 在页脚的唯一条目（删除后 6/6 路由页脚归零）；首页改前 hero meta 也有一次，两条都删后，`/` 只剩折叠内一句。逐路由读数见 ② 表 |
| **A3 术语常量真被引用** | **有条件通过（Medium）** | 8 个新常量全部有生产引用（见下表）；但 3 个 lib 文件仍有 7 处用户可见硬编码（`format.ts:187/190/191/201`、`cost-display.ts:57`、`pricing-chart-data.ts:184/267`），`FETCHED_AT_LABEL` 只有 Methodology 一处引用、4 个视图仍硬写「抓取日期」；`copy.test.ts:74-84` 只扫 `.vue`，抓不到 `.ts` |
| **A4 守卫有效性** | **有条件通过（High 缺口 + Low 恒真）** | 四条判据逐条变异均能红：重复声明（m1 → 3 条违规）、估算日期（m2 → 1 条）、表级声明（m3 → 0 次）、免责缺失（m4 → 0 次），EXIT 均 1。但「四要素」判据用常量自身当 needle，删掉一个要素仍 exit 0（H2）；`copy-density.mjs:420` 的 `heightOk=true` 是恒真指示（M-06）。另：R2 的「四项」不是单命令一次判完——`compareLive`（`:404-437`）只判首屏+溢出，声明重复/估算日期在 `compareStatic`（`:378-403`），复验时两条都要跑 |
| **A5 简约是否删事实** | **有条件通过（Medium）** | 三处点名：首页数据纪律 → 折叠三段落完整（`HomeView.vue:56-67`，含 official/aggregate、缺价不猜、不入图、分组排序、账单原币种）；`/sources/` 抓取方法段只改一句、未折叠；`/methodology/` 口径段压缩但名单/数字全在折叠内（`:49-54`）。扣分项：Calculator 两处（M-03 合规句删除；`CalculatorView.vue:196` 删「缺汇率时…」行为说明）、KeyFacts 限定词（M-02）、首页快照可验证性说明（M-07） |
| **A6 结构化数据与 SEO** | **通过（含既有观察）** | 6 路由 JSON-LD 全部可 parse；`structured-data.ts:85` 改词未破语法；`dist/llms.txt` 字段齐全（133/45/178/16/6.6908/2026-11-08）；`.mjs → .ts` 导入在 Node 22.18+ 默认类型剥离下可用，非运行时 npm 依赖、`package.json` 未变。既有观察（非本轮引入）：llms.txt「主要页面」链接是 `https://whyzero.studio/api-pricing/api-pricing/`（base 取 api-pricing 的 canonical 再拼路由），且 `SITE_DISCLAIMER` 未进入 structured-data（dossier 的「三处一致」未实现） |
| **A7 红线** | **通过（1 Low 卫生项）** | `src/data/**`、`chart-geometry.ts`、`*Plot.vue`、`SvgChartFrame.vue`、`package.json` 零改动；`pricing-chart-data.ts` 仅 description + 注释；无 emoji（diff 全文扫描）；`git diff --check` 0。Low：23 个文件工作区被转纯 LF、`ScatterChart.vue` 夹了 1 行 LF，与仓库 CRLF 约定不一致（M-09，无功能影响） |
| **A8 回归风险** | **有条件通过（Medium）** | 4 个测试文件的改动方向是「断言随文案更新」，未发现把红改绿的路径级放宽；但 `format.test.ts` 删掉了「单元格含当前汇率」这条真断言，且新函数 `FX_TABLE_NOTE` 零覆盖（M-05）。另：自述 B1-7 声称改了 `tests/nobreak.test.ts`，`git diff` 里没有该文件（它本来也不需要改），自述与改动面不符 |

### A1 逐条抽查（旧句事实 → 新句事实）

| # | 位置 | 旧 | 新 | 判定 |
|---|---|---|---|---|
| 1 | `HomeView.vue:25` | lede 78 字，含「国内人民币官方标价 / 国际美元主值 / 每条标明溯源」 | 只留「别只看单价，先算清真实 Token 成本。」 | 事实未消失：溯源在徽章，币种/副行在折叠 `:64-67`，口径页完整。等价（换位置） |
| 2 | `HomeView.vue:26-27` | hero meta 含「汇率随时变化，人民币值不准确，最终账单以厂商原币种为准」 | 「抓取日期 … · 1 USD = … CNY（…）」+「非官方站点…」 | **不等价**：E3 从首屏/页脚消失，只剩折叠（H2）；「汇率」这个标签也丢了（Low） |
| 3 | `KeyFacts.vue:37-45` | 「133 条由爬虫从厂商官方定价页抓取，45 条取自第三方聚合源并**标注「未核官方页」**」「在官方页的付费条目中…」「最终账单以厂商原币种为准」 | 「133 条官方页抓取、45 条聚合数据」+ 两个最低价 | 数字等价；**限定词与范围丢失**（M-02） |
| 4 | `SourcesView.vue:152` | 「这部分保持人工核对后入库」 | 「这部分改为脚本抓取、人工复核后入库」 | **事实被改错**（H1） |
| 5 | `MethodologyView.vue:27-32` | 「只采用厂商官方定价或文档页面…页面可访问不代表价格永久有效」 | 「只采用厂商官方定价页…使用前请再核对官方页」 | 近似等价；失效机理说明弱化（M-08）。「中转商价格」→「报价」属措辞 |
| 6 | `MethodologyView.vue:38` | official「抓取输入价、输出价、缓存价**与适用条件**」 | 「输入价、输出价与缓存价」 | 等价：适用条件由 `:104-106` 与表格计价条件列承担 |
| 7 | `MethodologyView.vue:44` | 「绝不允许聚合值静默覆盖官方值」「免费档会让最低价永远是 0、失去比较意义」 | 「aggregate 只补空缺」「0 元档仍在表内」 | 结论等价；理由被删但结论保留（Low） |
| 8 | `PlansView.vue:436` | 「Claude **官方原话是** Every plan has usage limits.」 | 「Claude 各档均有用量上限。」 | **可追溯性丢失 + 无归属断言**（M-04） |
| 9 | `PlansView.vue:436` | 「可**最新**的 GPT-6 全系」 | 「但 GPT-6 全系」 | 等价，删绝对化用语正确 |
| 10 | `PlansView.vue` 额度标签 | 「完整额度（官方披露）」/「用途限制」 | 「额度原文（厂商披露）」/「用途限制（厂商转述）」 | 等价且更准确（F3-2 方向正确）；「完整」一词丢失，值本身未截断 |
| 11 | `CalculatorView.vue:71` | 含「聚合数据…即使国内厂商也只标聚合数据，不标官方标价」 | 只剩公式 + 主值币种 | **合规句被删、未换位置**（M-03） |
| 12 | `CalculatorView.vue:196` | 「缺汇率时美元结果照常给出，人民币位置显示「汇率缺失，无法估算」」 | 删 | 行为仍在 `cost-display.ts`（UI 会显示「汇率缺失，无法估算」），但说明被删（Low） |
| 13 | `ApiPricingView.vue:134-139` | hero 含汇率日期 | 汇率移到表级 `FX_TABLE_NOTE`（`:148`） | 等价（每页仍 1 处，copy-guard 实测） |
| 14 | `SourcesView.vue:56-65` | 「报价以 USD 表达的条目占比（需汇率换算）」 | 「需汇率换算占比」 | 等价（口径即 USD 报价条目占比） |
| 15 | `MethodologyView.vue:69` | 聚合+USD「副行标聚合来源与**估算**人民币」 | 「折算人民币」 | **修正**：聚合值是折算不是估算，改对了 |

补充三条针对题面重点的结论：

- **「核验 → 抓取」的替换本身没有留下「我们抓了但没核，却写成已确认」**：`grep -rn "核验" src --include=*.vue --include=*.ts` 0 命中；`已确认/确认过` 的唯一命中是 `src/lib/copy.ts:4` 的注释（说明旧措辞），不是页面文案。现有句子只声明「抓自官方页 / 展示口径不是质量背书」。风险方向相反——把人工抄录写成脚本抓取（H1）。
- **「官方指定工具 → 用途限制（厂商转述）」没有改变套餐事实**：`src/data/entries/plans.json` 的字段值（「仅限官方指定工具」）一字未改，只是展示侧 `<dt>` 标签加了「（厂商转述）」；符合 R3「数据禁改、展示侧标转述」。
- **数字 / 单位 / 币种 / 生效日期未改**：diff 内没有价格、额度、汇率、日期的值替换；`133/45/178/16` 仍由 `stats` 现算，`6.6908` 与 `2026-11-08` 仍来自 `fx.generated.json`。唯一被删的数字是 `PlansView.vue:436` 一带写死的「四档 / 6 档」计数（改成「几档」），属减少硬编码，不是改值。

### A5 三处点名的折叠完整性（逐句核对）

| 位置 | 旧 | 现在在哪 | 是否完整 |
|---|---|---|---|
| 首页「数据纪律」 | 两段：official/aggregate 与「未核官方页」、同模型以官方为准；未知字段留空、缺价 fail closed | `HomeView.vue:53-68` 折叠第一、二段 | **完整**，且补了「缺评分/无可比正价不入图」「聚合不参与排序」 |
| 首页「官方页条目」meta | USD 组在前、CNY 在后、组内升序、aggregate 不参与结论 | 同一折叠第三段 `:64-67` | **完整**（多了「人民币副行按当日汇率估算，账单以厂商原币种为准」） |
| 首页 8 条低价条目 | 直接铺开 | 第二个折叠 `:70-81`，含「查看全部 API 价格」 | **完整**（可见性换位置，事实未删） |
| `/sources/` 抓取方法 | JS 渲染 → `.md` / `llms.txt` → 厂商清单 → 抓到/抓不到的口径 | `SourcesView.vue:135-150`，**没有折叠** | **完整**，只把「本期就是这样核到的」改成「按此方式取到」 |
| `/methodology/` 厂商名单 | 「本期用这个方法核到官方的有 …；仍只走聚合的是 …（Cohere 按实例小时计费…）」 | `MethodologyView.vue:49-54` 折叠 | **完整**，厂商名、括号说明、Cohere 例外全在 |
| `/methodology/` 溯源分级 | official/aggregate 定义、条数、「绝不静默覆盖」、免费档理由 | `:36-44` 正文（未折叠） | 定义/条数在；「绝不静默覆盖」压成「只补空缺」，理由句删除（Low） |

### A3 常量引用清点

| 常量 | .vue 引用文件数 | 其他生产引用 | 备注 |
|---|---:|---|---|
| `PROVENANCE_OFFICIAL` | 6 | `format.ts` | 已真源化 |
| `PROVENANCE_AGGREGATE` | 7 | `format.ts` | 已真源化 |
| `AGGREGATE_NOTE` | 3（Home/Methodology/Sources） | `format.ts` | 已真源化 |
| `OFFICIAL_PRICE_LABEL` | 4 | `format.ts`、`cost-display.ts` | 已真源化 |
| `FETCHED_AT_LABEL` | 1（Methodology） | `gen-llms-txt.mjs` | **4 个视图仍硬写「抓取日期」**：Home:26 / Api:134 / Plans:189 / Sources:49 |
| `FETCHED_ON` | 4（PriceCard/PriceTable/Plans/Sources） | — | 已真源化 |
| `PRICE_MISSING` | 1（Plans） | `fx.ts` re-export | 已真源化 |
| `FIELD_UNPUBLISHED` | 1（Plans） | `format.ts` | 已真源化 |
| `SOURCE_PAGE_LABEL` | 2（Plans/Sources） | — | 已真源化 |
| `VENDOR_TERMS_LABEL` | 1（Plans ×2） | — | 已真源化 |
| `ALLOWANCE_SOURCE_LABEL` | 2（Plans ×2 / Methodology） | — | 已真源化 |
| `NON_OFFICIAL_BRIEF` | 5 | — | `AppFooter.vue:14` 只是注释提及，不是引用；`/methodology/` 按设计不挂 |
| `FX_TABLE_NOTE_TEMPLATE` / `fxTableNote` | — | `fx.ts`、`copy-guard.mjs` | 骨架单一真源成立 |
| `FX_TABLE_NOTE` | 2（Api/Plans） | `fx.ts`（`format.ts` 注释提及） | 已真源化 |
| `RATE_DISCLAIMER` | 5 | `fx.ts` | 已真源化 |

**硬编码残留（用户可见，按 A3 口径列出）**

- `src/lib/format.ts:187/190/191/201`：`聚合数据`（`priceBasisLabel` / `provenanceLabel`，渲染进表格详情与首页样例）；`:201` 还硬写 `抓取于`
- `src/lib/cost-display.ts:57`：`官方标价`（计算器结算说明）
- `src/lib/pricing-chart-data.ts:184/267`：`官方标价` / `聚合数据`（图表 aria/title）
- `src/lib/format.ts:78/95/97`：同一个函数内一半用常量一半硬写（`formatDualPrice` 已无生产调用，优先级低）
- 4 个视图的 `抓取日期` 字面量（上表）

---

## 收口建议（按优先级）

1. **H1**：`SourcesView.vue:152` 改回「人工从官方页抄录、脚本校验后入库」，删掉「改为脚本抓取」。
2. **H2**：`SITE_DISCLAIMER` 补「以厂商页面与账单为准」；`copy-guard` 改逐要素断言；同时复测 `/`@1440（208 的余量只有 12 字，补句后大概率超 220，需与编排层一起定预算）。
3. M-02/M-03/M-04 三处 Medium 文案（KeyFacts 限定词、Calculator 合规句、Claude 归属）同批修。
4. M-05 给 `FX_TABLE_NOTE` 加断言；M-06 修掉 `heightOk` 的假 ✓。
5. 其余 Low（M-07/08/09）可延后，但不要在本轮自述里写成「已达标」。

复审通过的最低条件：H1 句子为真、H2 的逐路由页脚读数 E3 ≥1、守卫在「删掉任一要素」时能红。
