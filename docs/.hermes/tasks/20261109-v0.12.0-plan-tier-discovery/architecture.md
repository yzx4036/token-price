# v0.12.0 套餐档位发现 · 架构设计

> 设计者：main。范围 B1 降噪 → B2 覆盖率 → B3 输出。只做设计，不含源码改动。
> 基线：`node scripts/data/cli.mjs plans-structure-drift` = 可判 23/55，`missingTiers` 8 组共 68 个价位（实测：2026-11-09 复跑，`coverage={"total":55,"checked":23,"unknown":32}`）。
## 0. 决策摘要

| 决策 | 内容 | 理由 |
|---|---|---|
| 命令形态 | 新增 `plans-tier-discovery`，`plans-structure-drift` 原样不动 | 旧结果形状被 `toEqual` 全量锁死（实证：`tests/plans-structure-drift.test.ts:21`），且已进 workflow summary（实证：`.github/workflows/data-refresh.yml:157-162`） |
| 降噪 | 三通道抽取（属性 / 表格 / 文本）+ 分层语境判定 | 纯文本邻近词最多干掉 24/29 个单价，剩余必须靠表头、行标签、属性（M1） |
| 异常 | 值域判定放在语境过滤之前，异常段独立 | `1201001` 无任何月费语境，先过滤就被静默丢弃（M2） |
| 置信 | 已录值宽松、未录值严格（不对称） | Copilot `$10` 同时是卡片价和 credits 行取值，对称规则必错一边（M1） |
## 1. 现状与约束

1. 现判据是「全页价格数字集合差集」，无语境校验（实证：`scripts/data/lib/plans-structure-drift.mjs:119`、`:147-156`），页面任何多出来的正数都算候选（实证：同上 `:152-153`）。
2. `normalizePage` 把注释替换为**空串**再去标签（实证：`scripts/data/lib/plans-drift.mjs:25-35`）：既是残渣拼接的成因，也是 `¥<!-- -->9.9` 能被认出的原因，**不改**。
3. 失败语义照抄 v0.11.0：官网失败 → `unavailable` + exit 0；基准/参数问题 → `CliError` 非 0（实证：`scripts/data/lib/official-price-drift.mjs:267-303`）。网络只在 CLI，不引依赖，不写数据文件，不碰图表与展示层。
## 2. B1 实测归因
### 2.1 M1：Anthropic 那 29 个「价格」逐个定位

该页共 33 个 `¥/$` 数字，其中 29 个正数正是 `missingTiers[0].pagePrices`（实测：`plans-structure-drift --json`）。原文片段（实测：`curl https://claude.com/pricing` 后本地扫描）：

| 语境 | 数字 | 原文证据 |
|---|---|---|
| token 单价（每百万，含 RSC 文案） | 0.01~15、25、40、50 的多数 | `Read$0.01 / MTokWrite$0.125 / MTok`、`Input$10 / MTokOutput$50 / MTok`、`priced at $8/$40 per million tokens` |
| 时长 / 按次计价 | 0.05、0.08、10 | `$0.05 per hour per container`、`$0.08 per session-hour`、`Cost$10 / 1K searches` |
| 档位月费 | 20、100、200 | `$17Per month…$20 if billed monthly`、`Max…$100Per month`、`Ultra…$200Per month` |
| 额度上限（却带月费词） | 500 | `Up to $500 per month in pooled API credits` |
| 年付折算 / 按席位 | 17、25、125 | `$17Per month with annual subscription discount ($200 billed up front)`、`$20Per seat / month if billed annually. $25 if billed monthly.` |

结论：**只靠附近出现什么词排不干净。** 单价类可排，因为单位在数字**之后**（`/ MTok`、`per hour`、`/ 1K`），窗口向后看 18 字符即可；排不掉的是 `500`（额度却带 `per month`）、`17/25/125`（是月费但属年付/席位），以及 Copilot 的 `$5/$31`（比较表内，词面无任何额度标记）。缺的信号正是结构：开标签属性、表格列头、行标签、同块价格个数。
### 2.2 M2：`1201001` 是什么

OpenCode 模型额度表末行之后紧跟图表坐标轴：`…data-layer="current-value">$120</span>…</td></tr><tfoot…><span data-layer="axis-tick" data-tick="100"><span data-layer="axis-label">100</span>`，随后 `1K`、`10K`、`100K`（实测：本地保存 `opencode.html` 后检索 `>$120<`）。去标签后 `$120` + `100` + `1K` 粘成 `$1201001K`，正则取到 `1201001`。

判定方法：值 `> 100000`，且原文（先去注释）里找不到连续 `$1201001`；两条同时成立才判「跨标签拼接」，只超上限则判「值域超上限」。
### 2.3 M3：真月费长什么样（接收规则的依据）

- 中文卡片：`价格¥ 200/月`（百炼 Coding Plan）——符号与数字间有空格，`/月` 紧贴数字。
- 英文卡片：`Go$10per month`、`Ultra…$200Per month`——月费词紧贴价格，中间没有其它价格。
- 属性标注：`<p class="…__price" data-plan="pro_annual" data-plan-field="amount_per_month">$17</p>`。
- 表格列头：`| Mini | 400M | ¥49 | ¥129 | ¥456 |` + 表头 `月付/季付/年付`——价格自身无月费词，只有列头能判。

第 4 种是引入表格通道的硬理由：只开文本通道时，StepFun 的 `¥49`（对应）与 `¥129`（季付）一起被判无证据丢弃，已录 4 档全部误报下架（实测：原型 `stepfun MISSING=[49,99,199,699]`）。
## 3. B1 规则集
### 3.1 三通道抽取

- **C1 属性**：正则扫 `<tag attrs>¥N`，属性串原样保留，提供 `data-plan[-field]`、`data-layer`、`class` 里的 `price/seatPrice/allowance/axis-tick`。
- **C2 表格**：`<table>→<tr>→<td/th>` 切块（照抄 `scripts/data/lib/plans-structure-drift.mjs:57-62`），Markdown 管道表按行块切（思路同 `scripts/data/lib/official-price-drift.mjs:106-118`），提供列头文本、行首格文本、同格价格个数。
- **C3 文本**：`normalizePage` 全页文本 + 每 token 前 90 / 后 60 字符窗口，提供紧邻单位词、年付/席位/促销词、同块多价。

不引 DOM 解析器；卡片块**不做祖先解析**（嵌套匹配太脆），用 C1 属性锚 + C3 同块多价替代。
### 3.2 单次出现判定（按序短路）

| 序 | 条件 | 归类 | 处置 |
|---|---|---|---|
| R1 | 非有限、负数（0 单列免费档） | anomaly | 异常段 |
| R2 | 值 > 100000 | anomaly | 异常段，`reason` 分「超上限」/「跨标签拼接」 |
| R3 | 属性/行标签/列头命中 `allowance\|usage\|credits\|allotment\|额度\|积分\|用量` | allowance | 排除（只计数） |
| R4 | 属性含 `amount_total\|annual` | annual | 低置信 |
| R5 | 窗口命中 `/MTok`、`/million`、`per 1M`、`/千 token`、`/token`、`/1K`、`per hour`、`per session`、`百万` | unit | 排除（只计数） |
| R6 | 月费词后紧跟额度词（`per month in … credits`、`monthly total credits`） | allowance | 排除（只计数） |
| R7 | 表格列头为月付且不含季/年（`月付\|月费\|/月\|per month\|monthly`） | monthly | 高置信 |
| R8 | 属性标注月费且非席位（`amount_per_month\|monthly`） | monthly | 高置信 |
| R9 | 价格后 0..18 字符内有月费词，但窗口同时含 `annual\|per year\|/年\|年付\|季付` | annual | 低置信 |
| R10 | 同上且窗口含 `seat\|席位` / `限时\|首月\|特惠\|折\|起\|starting at` | seat / promo | 低置信 |
| R11 | 同块（±70 字符）有 ≥2 个不同货币数字 | multi | 低置信 |
| R12 | 价格后 0..18 字符内有月费词，且以上都不命中 | monthly | 高置信 |
| 兜底 | 无月费证据 | noContext | 排除（只计数） |
### 3.3 冲突裁决

1. **同一数字既有 `/月` 又有 `/百万`**：按出现粒度分别判，R5 先短路；未录值只要有一处排除证据成立就不进高置信。`500` 因此落「月费 + 额度冲突」低置信（实测：原型输出 `500 conflict`）。
2. **已录 / 未录不对称**：已录值只要有一处干净月费证据即判「仍在」（防误报下架）；未录值必须「有干净月费证据且无任何排除证据」。依据：Copilot `$10` 既有卡片价又在 `Base credits` 行，对称规则会把已录 10 判成下架（实测：`copilot.html` 两处并存）。
3. **值级合并优先级**：anomaly > 已录值保持 > 未录 clean monthly > annual > seat > promo > multi > allowance > unit > noContext。
### 3.4 异常值的落点

放在语境过滤**之前**（否则 `1201001` 是 noContext，被静默丢弃，违背 F5）。字段：`anomalies[] = { provider, providerId, url, value, reason, snippet(前后 40 字符), action: '疑似解析异常' }`；不进候选、不参与差集、也不从计数消失（`coverage.anomalies` 单列）。
### 3.5 排不掉的残留（如实标注，不硬判）

- 额度上限带月费词：`Up to $500 per month in pooled API credits` → 低置信 + `reason=月费与额度证据冲突`。
- 无属性比较表行：Copilot `$5 per month` / `$31 per month`（Flex allotment 行）→ 低置信 + `reason=同块多价`。
- 整页促销：百度千帆 `¥4.9/月`（`Mini限时5折特惠`），已录 9.9/40/200/600 无一命中 → 5 条低置信 + `reason=促销/首月价`；已录值不逐条报下架，整组标「疑似改档」。
## 4. B2 覆盖率
### 4.1 可达性口径

状态码 200 不算通过：`bigmodel.cn/claude-code.md` 与 `.llms.txt` 都是 200 + `text/html`，正文是同一份 SPA 壳（实测：两者解压后同为 6,572 B，均含 `id="app"` 与「doesn't work properly without JavaScript」，无 `118`）。判定必须叠加 `content-type` 与正文特征。
### 4.2 三家结论

| 家 | 抓取 | HTTP / 解压后正文 / 耗时 | `.md` | `llms.txt` | 结论 | 解析口径 |
|---|---|---|---|---|---|---|
| anthropic | `https://claude.com/pricing` | 200 / 1,323,203 B / 1.95 s | 404（108,288 B 错误页） | 404（107,044 B） | **可用** | C1 属性锚为主（10 个 `data-plan*` 价格），C3 兜底；4/4 档 |
| volcengine | `https://www.volcengine.com/activity/codingplan` | 200 / 655,082 B / 0.35 s | 200 但 `text/html` 67,643 B，正文无 `Coding`/`9.9`（WAF 页） | 200 但为站点首页 330,362 B | **可用（需适配）** | JSON props：`"name":"Lite Plan"` + `"periodUnit":"元/月"` + `"priceConfig"` |
| zhipu | `https://bigmodel.cn/claude-code` | 200 / 6,572 B / 1.39 s | 200 但同 SPA 壳 6,572 B | 200 但同 SPA 壳 6,572 B | **不可用（需 JS）** | 无口径，记 unavailable |

`robots.txt`（实测：均 200）：anthropic 只有 `Sitemap` 与 `Allow: /`；volcengine 禁 `/search`、`/api/`、`/signin/`；zhipu 禁 `/agent`、`/dev/` 等。三家 pricing 页均未禁抓。
### 4.3 volcengine 的交叉校验

`Lite Plan` 与 `Pro Plan` 两张**月档卡片**的 `priceConfig` 逐字相同（都是 `9.9 / 40月`，实测），说明月档价是占位符。季/年档自洽：`120/季→40`、`480/年→40`、`600/季→200`、`2400/年→200`。故适配器规则：**季折算与年折算一致才采用折算月费**，与月档卡片价冲突时视为占位符并降级。实测折算 `Lite=40 / Pro=200`，与仓库 2 档全一致。
### 4.4 覆盖率前后（同口径，实测原型）

标准：本组已录非零价位是否全部命中页面月费集合。

| 态 | 前（全页价格集合） | 后（月费集合 + 完整性守卫） |
|---|---|---|
| 一致 | 20 | 22（+volcengine 2） |
| 不一致（会告警改档/下架） | 10（百度 4、OpenAI 6） | 0 |
| 仅低置信证据 | 0 | 4（百度，全是促销价） |
| 无法判定 | 25 | 29（+OpenAI 6，−volcengine 2） |
| 噪音候选值 | **61**（anthropic 29 / opencode 9 / stepfun 8 / copilot 6 / baidu 5 / google 2 / aliyun 1 / openai 1） | **0** 高置信 + 17 低置信 + 1 异常 |

`无法判定` 25→29 是刻意取舍：OpenAI 页只解析出 1 个月费价位（`$100`），旧逻辑据此报 4 条假下架 + 1 条假合并，新逻辑判「月费集合不完整」（实测：`incomplete 1/5 monthly=[100]`）。**完整性守卫**：已录值全命中 → 一致；命中率 ≥ 50% 且页面月费集合 ≥ 2 个价位 → 允许判下架/合并；否则 `unknown` + `reason=月费集合不完整`。
### 4.5 不可用的表达

`unavailable[] = { provider, providerId, url, httpStatus, kind: 'js-rendered'|'http-error'|'no-monthly-evidence', reason, evidence: { bytes, contentType, probe } }`，报告单列一段；zhipu 明写「纯前端渲染，`.md`/`llms.txt` 均实测无内容」，不假装支持。
## 5. B3 输出
### 5.1 结果对象
```
{ ok, readOnly,
  coverage: { total, consistent, lowOnly, unknown, anomalies },
  groups: [{ provider, providerId, url, source, recordedPrices, pageMonthlyPrices,
             evidence: { monthly, annual, seat, promo, multi, conflict, allowance, unit, noContext } }],
  candidates:    [{ provider, providerId, url, price, currency, recordedPrices, evidence: { kind, reason, channel }, confidence: 'high', action: '新增档位' }],
  lowConfidence: [{ 同上 + confidence: 'low', action: '新增档位'|'疑似下架需复核', reason }],
  anomalies:     [{ provider, url, value, reason, snippet, action: '疑似解析异常' }],
  unavailable:   [{ provider, url, httpStatus, kind, reason, evidence }] }
```

`source` ∈ `html` / `json-props` / `markdown-table`。`action` 只取需求给的四个值；`confidence` 与 `reason` 另列，不混写。
### 5.2 置信度与动作

| 情形 | confidence | action |
|---|---|---|
| 未录月费 + R7/R8/R12 干净证据 | high | 新增档位 |
| 未录月费 + annual/seat/promo/multi/conflict | low | 新增档位 + `reason` |
| 已录 >0、集合可靠、找不到 | high | 疑似下架需复核 |
| 已录多档、集合可靠、只剩 1 档命中 | high | 疑似合并 |
| 集合不可靠（命中 < 50% 或 < 2 个价位） | — | 归 unknown，不出动作 |
| 值域异常 / 跨标签拼接 | — | 疑似解析异常 |
### 5.3 文本报告
```
== 套餐档位发现（候选清单，只读） ==
覆盖率：一致 22/55 · 仅低置信 4 · 无法判定 29 · 解析异常 1
-- 高置信候选（0）--
  无
-- 低置信 / 需复核（17）--
  百度千帆 · ¥4.9/月 · 促销/首月价 · 已录 9.9/40/200/600
-- 疑似解析异常（1）--
  OpenCode · 1201001 · 跨标签拼接（$120 + 坐标轴 100/1K）
-- 无法判定（29）--
  zhipu · GLM Coding Plan Lite · 纯前端渲染（.md / llms.txt 已实测无内容）
```

每段最多 20 条，超出打「另有 N 条，见 --json」；空段保留标题写「无」。文本**不输出**被排除的单价，只留分类计数，否则又变回一屏数字。
### 5.4 `--json`、退出码、与旧命令的关系

- `--json` 保留完整清单：`candidates` / `lowConfidence` / `anomalies` 不截断（含证据与窗口片段）；被排除项只给分类计数 + 每类至多 5 个样本值。
- 退出码：抓到、判完 → 0（含无候选）；某家抓不到 → 该家 `unavailable`，整体 0（沿 F9）；`--plans-file` 不存在/JSON 非法、`--timeout-ms` 越界 → `CliError` 非 0。
- 旧命令原样保留（workflow 继续跑旧报告），新命令接入同一 workflow 的 report-only 步骤；两者共享 `normalizePage` / `extractPriceTokens` / `quantityEvidence` 纯函数，不复制实现。
不做的事（红线）：不模糊匹配猜档名、不自动落库；不改 `src/data/**`、不改旧命令输出形状、不改 workflow 阻塞语义；不解析 JS 壳、不抓镜像、不拿旧值补位；不为单一厂商写死选择器。
