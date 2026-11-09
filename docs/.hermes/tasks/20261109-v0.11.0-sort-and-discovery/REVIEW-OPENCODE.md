# REVIEW-OPENCODE — v0.11.0 排序与发现（对抗审查）

> 审查对象：工作区相对 `HEAD` 的全部未提交改动
> 仓库：`E:/_Proj/WebProj/token-price`
> 审查方式：只读（未改源码、未做 git 写操作、未跑 build / run-gates）

## 1. 效力声明与出口判定

### 1.1 效力声明

- 本轮编码由 **Codex（gpt-6.1-sol / high）** 完成两轮；本审查由 **OpenCode** 执行。
- 本迭代的**设计稿与裁定（RULINGS-A/B）也是 OpenCode 出的**。
- 因此：**与编码者跨家，结论对编码实现有效**；**与设计者同源，存在把「设计稿这么写」当既成事实的偏差风险**。
- 规避方式：RULINGS 只作为「要求」而非「事实」。凡设计文字与代码冲突，一律回到 `HEAD`、`file:line` 与可复现命令。实际已发现一处：RULINGS-B R12#6 的「仍是同币种内最低」与代码不符（见 N-1），本报告不因设计稿这样写就判它正确。
- `coding-result.md` / `coding-result-rework.md` 只作对照，不采信；自述与仓库状态冲突处见 A8。

### 1.2 实际跑过的命令（本会话有 shell，以下均为真实执行）

| 命令 | 读数 |
|---|---|
| `npx.cmd vitest run tests/value-display.test.ts tests/pricing.test.ts tests/ux-refactor.test.ts tests/discover.test.ts tests/official-price-drift.test.ts tests/workflows.test.ts tests/copy-guard.test.ts tests/fx.test.ts` | 8 files / **152 passed** |
| `node scripts/data/cli.mjs discover --json` | exit 0；`174 → 169`、`normalizationHits=5`、剩余 169 项完整 |
| `node scripts/data/cli.mjs discover --top 2` | exit 0；归一对照 5 条全部打印，仅剩余清单截断 |
| `node scripts/data/cli.mjs discover --top`（故意缺值） | **exit 0，静默回落到 20**（N-2） |
| `node scripts/data/cli.mjs official-price-drift` | exit 0；deepseek/aliyun/volcengine 均 200、`unchanged` |
| `official-price-drift --unknown` / `--cache-file x` / `--entries-file src/data` / `--timeout-ms 0` | 均 **exit 1** |
| 运行前后 `find src/data -type f -exec sha256sum` | **完全一致**（`DATA_UNCHANGED`） |

未执行（按纪律）：`npm run build`、`run-gates.mjs`、任何 git 写操作。

### 1.3 出口判定

**`approved-with-conditions`**

- 无 Critical / High，阻断项为零。
- 有 3 条 Medium（N-1 / N-2 / N-3）与若干 Low/Trivial。
- 判据逐项：同源不是假的（A1）；表格展示与排序同源，无 fx 的退化路径另有说明（A2）；R4 未破（A3）；归一计数实现正确、仅测试断言有一处恒真（A4）；B2 不写文件、失败逐厂商隔离、不阻塞 workflow（A5）；指纹稳定（A6）；红线未破（A7）；ux 新断言能抓回退，但改写时漏了两个键（A8）。

---

## 2. 阻断项

**无。**

（最接近阻断的是 N-1「结论卡选法 ≠ 展示口径」，但它被 RULINGS-B R12#6 明文冻结为「选法不变」，且当前真实数据下选出的与折算后最优是同一条目；按本轮出口判据归 Medium + 条件收口，不判 rejected。）

---

## 3. 非阻断项

| # | 级别 | 问题 | 位置 | 收口建议 |
|---|---|---|---|---|
| N-1 | **Medium** | 结论卡「性价比最优」按**跨币种原始 `costPerPoint`** 最小值选，展示却是折算后的 `¥/分`；无 fx 时 note 还声称「按币种分段比较」，与选法相反。RULINGS-B R12#6 括注「仍是同币种内最低」与代码不符 | `src/views/ApiPricingView.vue:97-98,107`；`RULINGS-B.md:24` | 二选一：① 选法改为有 fx 时用 `costPerPointInCny`、无 fx 时按币种分段；② 若坚持冻结选法，note 改为「按原始 costPerPoint 选，按 ¥/分 展示」，不再声称「按币种分段」。补「USD 0.0055 vs CNY 0.02」反例，且期望值由测试独立计算 |
| N-2 | **Medium** | `discover --top` / `--cache-file` **缺值时静默回落默认值并 exit 0**，违反 failure-log 的「入口参数禁止无意义 fallback」 | `scripts/data/lib/io.mjs:85-90`；`scripts/data/cli.mjs:279-280` | `flags.has('top') || flags.has('cache-file')` 时抛 `BAD_ARGUMENT`；补无值用例 |
| N-3 | **Medium** | 价格基准 JSON 损坏时，三家全部 `unavailable` 且 **exit 0**，与「官网抓不到」在退出码上完全同形；仓库基准坏了 CI 仍绿 | `scripts/data/lib/official-price-drift.mjs:276,282,295` | 基准不可解析抛 `CliError`（非 0）；只有官网侧失败才 `unavailable` + exit 0 |
| N-4 | Low | `discover` help / 模块注释称「只读，不写任何数据文件」，但显式 `--pull` 会写 `.cache/models-dev.json` **和** `src/data/generated/aggregate.generated.json` | `scripts/data/cli.mjs:98`；`scripts/data/lib/discover.mjs:9`；`pull.mjs:50,147`；`io.mjs:16-17` | 文档改成「不加 `--pull` 时只读；加 `--pull` 会更新聚合快照与生成物」 |
| N-5 | Low | ux 回归改写时把 `cacheReadPrice` / `cacheWritePrice` 从参数化断言里丢掉，只剩 3 个分组键 | `tests/ux-refactor.test.ts:69`；`src/lib/filters.ts:32-41` | `GROUPED_KEYS` 补回这两个键（`valueFor` 已支持） |
| N-6 | Low | 「值合法性」判定写了三份：排序、换算、展示各一处；今天等价，未来只改一处会静默分叉 | `src/lib/pricing.ts:113`；`src/lib/fx.ts:77`；`src/lib/price-row.ts:56` | 收成一个 `normalizeCostPerPoint()`；加 `{NaN, ±Infinity, -1, 0}` 的对照断言 |
| N-7 | Low | `value-display.test.ts:64-65` 的源码字符串断言可被注释绕过（实测：把调用换成注释 + `return value`，字符串断言仍通过）；不是空断言，但不是有效守卫 | `tests/value-display.test.ts:64-65` | 删掉，或换成行为断言（已有 `:50-56`、`pricing.test.ts:55-68` 可承担） |
| N-8 | Low | `discover.test.ts:180,183` 是结构性恒真（`after = before - hits`、`hits = unique aliases`）；真正有反证力的是 `:181-182` | `tests/discover.test.ts:180-183` | 把 180/183 标注为结构不变量，或改成独立计算的差集 |
| N-9 | Trivial | 无 fx 时 `aggregate`（USD 报价/CNY 账单）排序值为 null 排在 CNY 组末，但展示回落到 `$0.50`，组内出现「¥2.00 后面跟 $0.50」；提示写「按币种分段比较」 | `src/lib/pricing.ts:116,135`；`src/lib/price-row.ts:77`；`src/components/PriceTable.vue:100-101` | 仅在无 fx 的退化态出现；若在意，可让无 fx 时该行展示 `—` 或在 note 里点名「跨币种报价不参与排序」 |
| N-10 | Trivial | `costPerPoint` 为负时卡片仍走 `Number.isFinite` 分支，出现「`—` + `¥/分` 单位」；`score` 由 blend/score 恒正，现实不可达 | `src/components/PriceCard.vue:34-36` | 统一用 `rawText !== '—'` 或 `>= 0` 判定 |
| N-11 | Trivial | `API_SORT_SUMMARY` 只写「价格与上下文按币种分段，智能指数全表排序」，漏了「有 fx 时性价比也全表」 | `src/lib/copy.ts:73` | 补一句即可 |
| N-12 | Trivial | `diffOfficialPrices` 的 `currency` 差异分支永不触发（canonicalize 强制 CNY） | `scripts/data/lib/official-price-drift.mjs:77,244` | 删或保留作防御，不影响正确性 |

---

## 4. 被证伪的怀疑（必须有）

1. **怀疑 `dist` 是 rework 之前的旧产物** → **证伪**。`dist/api-pricing/index.html` mtime `2026-11-09 16:42:26`，晚于绝大多数源码（16:35）；命中 `<em>¥/分</em>` 33 处、`按 ¥/分 展示`、`原币种 $0.00550，按 1 USD = 6.6908 CNY 折算`。这些串只存在于 R12 之后的代码（`copy.ts:60-71`、`PriceCard.vue:35-36`）。
   例外：`src/lib/price-row.ts` mtime `16:43:53`，比 dist 晚 87 秒，**不能断言 dist 覆盖了最后一次 penny 级改动**；A2 的移动卡片结论以 dist + 当前源码 + 单测三方一致为准。
2. **怀疑 `normalizationHits` 会把「本来就 covered 的 key」算成命中** → **证伪**。`discover.mjs:100` 在构造 `unknown` 前已 `continue` 掉 covered key；`:127` 还要求 canonical ∈ coveredKeys。
3. **怀疑 `--top` 把 JSON 也截断** → **证伪**。`discover --json` 返回 `unknown` 169 项（topN 仍为 20），截断只在 `formatDiscoverReport:205` 的文本展示。
4. **怀疑无 fx 时发生 1:1 兜底折算** → **证伪**。`pricing.ts:107` 与 `fx.ts:77-80` 对 `!fx / rate<=0 / 非有限` 返回 null；`pricing.ts:116` 只允许 `reported === billing` 的原值；`pricing.test.ts:70-76` 用 null/0/NaN/Infinity 四组锁住。
5. **怀疑 `official-price-drift` 在异常路径写文件** → **证伪**。全文件只 import `readFileSync/statSync`（`:2`），无 write/mkdir/rename；跑前跑后 `src/data` 全量 SHA-256 相同；`--cache-file` 根本不在白名单（`:320`），传了 exit 1。
6. **怀疑 workflow 的 `|| echo` 在 `set -e` 下不生效 / 管道穿透** → **证伪**。该 step 是单条 `node ... || echo ...`，无管道；`{ } >> file` 的退出码取组内最后一条 echo，且 `tests/workflows.test.ts:25` 锁定 `official-price-drift || echo`。
7. **怀疑 ux-refactor 新断言变成空断言** → **证伪**。`ux-refactor.test.ts:111` 断言 178 行全量、`:117` 断言真实交错、`:122` 空值尾部、`:126-133` 有值段单调；期望值由测试自己用 `reportedCurrency + convertAmount` 算，不调生产 `valueInCny`。
8. **怀疑移动卡片仍显示原币种** → **证伪**。`PriceCard.vue:35-36` 输出 `costPerPointText` + `VALUE_UNIT_CNY`；dist 内 `¥/分` 33 处、`原币种/分` 0 处。
9. **怀疑 R4 被改写** → **证伪**。`git diff HEAD -- src/lib/pricing.ts` 中比较器只改了 `groupByCurrency` 的条件和 `value` 分支；对 `inputPrice/outputPrice/cacheReadPrice/cacheWritePrice/contextTokens` 恒为分组，后续分支与 HEAD 逐行同构（A3）。

---

## 5. A1~A8 逐条结论

| 项 | 结论 | 关键证据 | 级别 |
|---|---|---|---|
| **A1 同源** | **真同源**：折算算术只有 `convertAmount` 一份；`valueInCny` 委托 `costPerPointInCny`，展示端 `buildPriceRow` 也调同一函数。残留：值合法性判定有三份（pricing/fx/price-row），未来只改一处会分叉；源码字符串断言可被注释绕过（实测） | `src/lib/pricing.ts:106-116`；`src/lib/fx.ts:71-81`；`src/lib/price-row.ts:55`；`tests/value-display.test.ts:64-65`；实测 regex 匹配 440 字符，注释替换后仍通过 | 通过（N-6/N-7） |
| **A2 展示/排序一致** | **表格与卡片同源**：有 fx 时展示值 = 排序值；无 fx 时列头切「性价比」、单位切「原币种/分」、提示切「无汇率，按币种分段比较」。移动卡片显示折算值。结论卡存在 N-1 的选法/口径不一致 | `PriceTable.vue:21,100-101`；`PriceCard.vue:35-36`；`ApiPricingView.vue:97-98,107,151`；`value-display.test.ts:60,82-87`；dist 实测 | 通过（N-1） |
| **A3 R4** | **未破坏**：价格类 5 键的 `groupByCurrency` 恒 true，比较器后续分支与 HEAD 同构；`pricing.test.ts:91-109` 用固化旧比较器跑 5 键 × 2 方向 × fx{7,null} = 20 组，ID 序列全等 | `pricing.ts:169-170,188-198`；`git show HEAD:src/lib/pricing.ts:175-190`；`pricing.test.ts:91-109` | 通过 |
| **A4 归一计数** | **实现不可自证**：covered key 进不了 unknown，命中还要求 canonical ∈ covered；实测 `174→169 / hits 5`；alias 不在快照 → hits 0；alias 在快照且 canonical 覆盖 → hits 1、unknown 清空。**测试有恒真项**（`:180,183`），但 `:181-182` 是独立差集。归一对照在 `--top` 截断前打印，5 条均可见 | `discover.mjs:95,100,125-130,182,200-205`；`discover.test.ts:175-183`；`discover --json` / `--top 2` 实测 | 通过（N-8） |
| **A5 B2 只读/隔离** | **不写文件**（全量 hash 一致）；404 / 非 Markdown / 缺表头 / 非有限数值均逐厂商 `unavailable`、exit 0；参数错误 4 类均 exit 1；workflow 无管道、`|| echo` 不会阻塞 | `official-price-drift.mjs:2,250-295,314-330`；workflow `data-refresh.yml:164-173`；`workflows.test.ts:19-29`；实测 | 通过（N-3） |
| **A6 指纹稳定** | 行序、日期、表外空白均不抖；同价格加空行在表格**外**指纹不变，在表格**内**降级为 `unavailable`（不会假 `changed`）；数值非有限直接拒绝 | `official-price-drift.mjs:72-91,106-118`；实测 reverse+toFixed 指纹相同；三家加空行指纹相同 | 通过 |
| **A7 红线** | `src/data`、`package*.json`、图表两文件 diff 均为空；`src/` 无 fetch/XHR/axios；新增行无 emoji；UTF-8 无 BOM；`git diff --check` 0 | 见下方 A7 明细 | 通过 |
| **A8 ux 变异有效性** | **能抓回退**：分组恢复、折算改原值、改用 billingCurrency 三种变异均有确定红项；不是空断言。**改写漏键**：`cacheReadPrice/cacheWritePrice` 未进新参数化 | `ux-refactor.test.ts:69-70,111,117,122,126-133`；`pricing.test.ts:91-109`；`filters.ts:32-41` | 通过（N-5） |

### A1 补充：两个函数对照

- `costPerPointInCny`（`pricing.ts:106-109`）：`hasValidFx` → `convertAmount(costPerPoint, entry.reportedCurrency, 'CNY', fx)`。
- `valueInCny`（`pricing.ts:111-117`）：先做值合法性检查，再 **`return costPerPointInCny(entry, value, fx)`**，不是重写算术。
- 展示端 `price-row.ts:55`：`costPerPointInCny(item, score.costPerPoint, fx)`；文本 `:77` 用同一个返回值。
- 唯一算术在 `fx.ts:71-81`。结论：同源成立。
- 风险点：`pricing.ts:113`、`fx.ts:77`、`price-row.ts:56` 三处各写一次合法性；今天等价，未来可能分叉。
- `value-display.test.ts:64-65` 不是恒真：正则不匹配时 `?.[0]` 为 `undefined`，`toContain` 直接失败。但它是**源码文本自证**：实测把 `return costPerPointInCny(...)` 换成 `// costPerPointInCny(...)` + `return value`，字符串断言仍然通过。真正抓回归的是同文件 `:50-56` 的 SSR 取值断言和 `pricing.test.ts:55-68` 的独立换算断言。

### A2 补充：两种情形的序列对照

fixture 取自 `tests/pricing.test.ts:27-35`（`fx.rate=7`；`aggregate` 为 USD 报价 / CNY 账单）。

**fx 正常**

| 排序序列（`value`） | 排序值 CNY | `costPerPointText` |
|---|---:|---|
| cny-low | 2 | ¥2.00 |
| aggregate | 3.5 | ¥3.50 |
| usd-low | 7 | ¥7.00 |
| usd-high | 21 | ¥21.00 |
| missing | null | — |
| pending | null（status 优先） | ¥0.07 |

验证行：`pricing.test.ts:56` 期望 ID 序列；前四条展示值与排序值同源。`pending` 显示值存在但排在末尾，是「verified 优先」的既有规则，不是 R12 的口径问题。

**fx = null**

| 排序序列 | 排序值 | `costPerPointText` |
|---|---|---|
| usd-low | 1（USD 组） | $1.00 |
| usd-high | 3（USD 组） | $3.00 |
| missing | null | — |
| pending | null | $0.01 |
| cny-low | 2（CNY 组） | ¥2.00 |
| aggregate | null（跨币种不折算） | $0.50 |

验证行：`pricing.test.ts:70-76` 期望 ID 序列；`pricing.ts:116` 禁止 1:1；`value-display.test.ts:78-87` 断言列头不含「性价比（¥/分）」、含「性价比」、卡片含「原币种/分」和提示文案。
真实 dist 说明：SSR 是移动优先（`useMediaQuery.ts:10-17` 首帧 false），`dist` 只有卡片、没有 `<table>`（实测 `性价比（¥/分）` 0 处），所以**桌面列头切换无法从 dist 静态证明**，只能由 `value-display.test.ts:78-84` 的直接 SSR 渲染证明；该测试已执行通过。

### A3 补充：HEAD 对照

`git diff HEAD -- src/lib/pricing.ts` 只出现两处比较器相关改动：

1. 新增 `const groupByCurrency = PRICE_FIELDS.includes(sortBy) || sortBy === 'contextTokens' || (sortBy === 'value' && !hasValidFx(fx));`（`:169-170`）；
2. `if (a.billingCurrency !== b.billingCurrency)` 改成 `if (groupByCurrency && ...)`（`:188`）。

对 `inputPrice/outputPrice/cacheReadPrice/cacheWritePrice/contextTokens`，第 1 条恒 true；第 2 条因此与 HEAD 完全相同。`sortValue` 的价格分支仍 `return billingValue(entry, key, fx)`（`:135`），HEAD 同（`git show HEAD:src/lib/pricing.ts` 对应行）。20 组固化对照全绿。结论：R4 未破坏。
残留：测试里的「旧比较器」是复刻而非 `HEAD` 原文件；但本次 diff 已逐分支人工对照，复刻偏差风险被消除。

### A4 补充：计数与可见性

- `unknownBefore - unknownAfter === normalizationHits` 在实现上恒真（`after = before - hits`）；`discover.test.ts:180` 因此永远不可能红（除非重写结构）。`:183` 同样恒真。`:181-182` 用独立 `before/after` 集合算差集，是有效证据。
- 构造 1（alias 不在快照）：临时快照含 `openai + unknown-provider`（后者可计价但不收录）→ `hits=0, before=1, after=1, unknown=['unknown-provider']`，normalizations 为空。
- 构造 2（alias 在快照且 canonical 已覆盖）：快照含 `openai + zai` → `hits=1, before=1, after=0, normalizations=[{zai→zhipuai}]`。
- 「alias 在快照但主 key 未覆盖」：`discover.mjs:127` 的 `canonical && coveredKeys.has(canonical)` 返回 `[]`，alias 留在 unknown，hits 与差均为 0。此分支无直接测试，属静态结论；`provider-aliases.mjs` 当前 5 条 canonical 全部已覆盖，无法在不改配置的前提下构造。
- 可见性：`formatDiscoverReport:200-202` 在 `slice(0, topN)` 之前打印对照与计数；`discover --top 2` 实测 5 条 alias 全部可见；`--json` 的 `normalizations` / `unknown` 均完整（169 项）。

### A5 补充：四类输入与 workflow

| 输入 | 结果 |
|---|---|
| HTTP 404 | 三家 `unavailable`、`httpStatus=404`、`officialHash=null`、`reason='HTTP 404'`，命令 exit 0（函数级实测；CLI 的 503 同分支已有 `official-price-drift.test.ts:148-156` 锁 exit 0） |
| 非 Markdown / 缺表头 | 三家 `unavailable`，原因为「表头/节缺失」，exit 0（fixture 实测） |
| 数值非有限（`Infinity元`） | 解析阶段抛「价格数值或币种不可识别」，`unavailable`；即使漏过，`canonicalizePrices:81-84` 还有 `Number.isFinite` 兜底 |
| 参数错误 | `--unknown` / `--cache-file` / `--entries-file src/data` / `--timeout-ms 0` 均 exit 1 |

只读证据：`official-price-drift.mjs` 只 import `readFileSync/statSync`；全量 `src/data` SHA-256 跑前跑后一致。`--cache-file` 不在白名单（`:320`），传了就 `BAD_ARGUMENT`。
workflow：`data-refresh.yml:164-173` 是 `{ ...; node ... || echo ...; ... } >> "$GITHUB_STEP_SUMMARY"`，无管道；`tests/workflows.test.ts:25` 锁定 `official-price-drift || echo`，`:26` 断言块内无 git/deploy，`:27-28` 断言顺序在 `pull` 之后、「提交并推送」之前。不会阻塞数据刷新。

### A6 补充：指纹实测

- 行序：`canonicalizePrices` 固定字段顺序并按 `providerId/model/condition` 全序排序（`:72-91`）；reverse + `toFixed(6)` 字符串化后 `canonicalizePrices` 与 `priceFingerprint` 均相同。
- 日期：表外插入 `# 更新时间：2030-01-01` 并替换正文日期，指纹不变（测试 `:113-117`）。
- 空白：三家 fixture 在表格外插入额外空行，指纹不变（实测）。
- 空行在表格**内**：表格被截断 → DeepSeek 报「模型表头缺失或重复」→ `unavailable`，不会产生假 `changed`。这是正确降级，验收时不要把它当成「应 unchanged」。
- 数值：`Number(raw)` + `Number.isFinite` + `-0 → 0`（`:81-84`）。

### A7 明细

| 红线 | 结论 | 证据 |
|---|---|---|
| `src/data/**` 零改动 | 通过 | `git diff HEAD --stat -- src/data` 空；`git status --short` 无 `src/data`；跑 `discover` 前后 hash 一致 |
| 依赖未变 | 通过 | `git diff HEAD --stat -- package.json package-lock.json` 空 |
| `src/` 无网络 | 通过 | `grep -rEn "fetch\(|XMLHttpRequest|axios|node:https|node:http" src/` 无匹配（exit 1） |
| 图表几何未动 | 通过 | `git diff HEAD --stat -- src/lib/chart-geometry.ts src/lib/pricing-chart-data.ts` 空 |
| 行尾 / UTF-8 / BOM | 通过 | 仓库 `core.autocrlf=true`；未改文件同样在工作区为 CRLF，属基线；新增文件 LF、UTF-8、无 BOM；`git diff --check` 0 |
| 无 emoji | 通过 | `git diff HEAD -U0` 的新增行无 emoji；新文件 emoji 计数 0（`src/data` 里已有的警告符号属未改动内容） |
| 未做 git 操作 | 通过 | 本次审查未执行任何 git 写命令 |

### A8 补充：变异方式与预期红项

| 变异 | 预期红项 | 依据 |
|---|---|---|
| `pricing.ts:169-170` 把 `groupByCurrency` 改回恒 true | `ux-refactor.test.ts:117` `interleaved` 红 ×3（intelligence/value/provider） | 恢复分组后不可能出现「CNY 之后又跟 USD」 |
| `valueInCny` 有 fx 分支改成 `return value`（不折算） | `ux-refactor.test.ts:126-133` 单调红 | 真实数据原始序会出现 USD 0.0404（折 ¥0.2703）后跟 CNY 0.0468 的倒挂；测试期望由 `convertAmount` 独立计算 |
| 折算改用 `billingCurrency` | `pricing.test.ts:66-68` 红（aggregate 变 0.5，会排到 cny-low 2 前面） | 独立的 R1 锁 |
| `sortValue` 的 `value` 分支返回 null | `ux:117` 与 `pricing.test.ts:56` 红 | 全表值消失，交错与序列都不成立 |

不是空断言：`:111` 断言 178 行全长，`:117` 断言真实交错存在，`:122` 断言空值全部置末，`:126-133` 断言有值段单调。
被削弱处：`:69` 的 `GROUPED_KEYS` 只有 3 个键，`filters.ts:32-41` 有 8 个；`cacheReadPrice/cacheWritePrice` 没有替代用例。`pricing.test.ts:91-109` 目前仍覆盖这两个键，所以不是裸奔，但锁变薄了。

---

## 6. 收口条件（approved-with-conditions）

不阻断合并，但以下三项在收口前必须处理或由编排层书面裁定：

1. **N-1（结论卡）**：裁定 R12#6。若确认「选法不变」，则必须改 note，不能同时声称「按 ¥/分 展示」和「按币种分段比较」；若允许改选法，最小改动是用 `costPerPointInCny` 选优、无 fx 退回分段，并补 USD 0.0055 vs CNY 0.02 的反例（测试独立计算，不复刻实现）。
2. **N-2（discover 参数）**：缺值的 `--top` / `--cache-file` 必须 `BAD_ARGUMENT` 非 0；补无值用例。
3. **N-3（基准损坏）**：基准 JSON 不可解析必须非 0（或输出独立失败态），不能与官网不可用共用 exit 0。

可选补强：N-5 补回两个 cache 键；N-6 收拢合法性判定；N-7 删除源码字符串断言；N-4 修正 help 文案。

---

## 7. 与自述的冲突（不采信，仅记录）

- `coding-result.md:23,256` 称扩展回归有 3 红（`ux-refactor.test.ts:63` 的 `it.each(SORT_KEYS)`），等待裁定；但工作区 `:63` 是地区筛选的收尾，`:69` 已是 3+3 拆分版，`git diff HEAD` 也显示该文件被改写。该「3 红」状态在仓库里不存在。
- `coding-result-rework.md:97` 称手工改动未覆盖 `ux-refactor.test.ts`，而 `coding-result.md` 又把该文件列为扩展回归对象。两轮自述对同一文件的归属互相推诿；本报告只认 `git diff HEAD -- tests/ux-refactor.test.ts` 的实际内容。
