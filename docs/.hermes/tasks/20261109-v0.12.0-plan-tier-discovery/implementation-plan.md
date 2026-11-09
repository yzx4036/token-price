# v0.12.0 套餐档位发现 · 实施计划

> 依据 `architecture.md`。顺序：B1 降噪 → B2 覆盖率 → B3 输出。全程只读运行、不写数据、不做 git。
> 基线：`npm test -- --run` 当前 709 项；`node scripts/qa/run-gates.mjs` 6 门全绿。

## 1. 文件清单

| 类型 | 文件 | 职责 |
|---|---|---|
| 新增 | `scripts/data/lib/plans-tier-context.d.mts` | 类型声明，跟随仓库每个 lib 一份 d.mts 的约定（参照 `scripts/data/lib/plans-structure-drift.d.mts`） |
| 新增 | `scripts/data/lib/plans-tier-context.mjs` | 纯函数：三通道抽取（C1 属性 / C2 表格 / C3 文本）、R1~R12 单次判定、值级合并。无网络、无 IO，测试直接 import |
| 新增 | `scripts/data/lib/plans-tier-discovery.d.mts` | 命令结果类型（含 `coverage`/`groups`/`candidates`/`lowConfidence`/`anomalies`/`unavailable`） |
| 新增 | `scripts/data/lib/plans-tier-discovery.mjs` | 命令层：读 plans、抓取（复用 `fetchWithTimeout`）、分组差集、完整性守卫、`json-props` 源适配、报告与 `parseArgs` 白名单 |
| 新增 | `tests/plans-tier-context.test.ts` | 抽取与判定的单元断言（fixture 驱动，不联网） |
| 新增 | `tests/plans-tier-discovery.test.ts` | 命令级断言：候选/低置信/异常三段、只读、退出码、`--json` 完整性 |
| 新增 | `tests/fixtures/plans-tiers/*.{json,html,md}` | 见第 3 节，共 5 档 plans + 9 个页面 fixture |
| 修改 | `scripts/data/cli.mjs` | 3 处：`import`、`HELP` 命令列表、`COMMAND_HELP['plans-tier-discovery']`、`case 'plans-tier-discovery'`（实证：现有 `case 'plans-structure-drift'` 在 `scripts/data/cli.mjs:264-270`） |
| 修改 | `.github/workflows/data-refresh.yml` | 在 `套餐结构与额度漂移` 步骤之后插入一个 report-only 步骤（实证：插入点 `.github/workflows/data-refresh.yml:153-162`（步骤结束于 162 行）），照抄 `\|\| echo` 不阻断写法 |
| 修改 | `tests/workflows.test.ts` | 新增一条断言：新步骤必须含 `>> "$GITHUB_STEP_SUMMARY"`、`\|\| echo`、且不含 `git add/commit/push`（参照现有 `official-price-drift` 用例，实证：`tests/workflows.test.ts:19-30`） |

## 2. 步骤序与验证

| 步 | 内容 | 验证命令 |
|---|---|---|
| S1 | 写 9 个页面 fixture + plans.json（先 fixture 后代码） | `ls tests/fixtures/plans-tiers/` 逐个 `cat` 核对，页面 fixture 必须含真实片段（`/ MTok`、`axis-tick`、`data-plan-field`） |
| S2 | `plans-tier-context.mjs`：C1/C2/C3 抽取 | `npx vitest run tests/plans-tier-context.test.ts -t '抽取'` |
| S3 | R1~R12 判定 + 值级合并（含已录/未录不对称） | `npx vitest run tests/plans-tier-context.test.ts` |
| S4 | `plans-tier-discovery.mjs`：分组差集 + 完整性守卫 + 三段输出 | `npx vitest run tests/plans-tier-discovery.test.ts` |
| S5 | `json-props` 源适配（volcengine 形态）+ 不可用判定的 `content-type` 口径 | `npx vitest run tests/plans-tier-discovery.test.ts -t '不可用'` |
| S6 | CLI 注册（`--plans-file` / `--json` / `--timeout-ms` 白名单，缺值报错，参照 `scripts/data/lib/official-price-drift.mjs:321-338`） | `node scripts/data/cli.mjs plans-tier-discovery --help`；`node scripts/data/cli.mjs plans-tier-discovery --timeout-ms 0`（必须非 0） |
| S7 | workflow 步骤 + 工作流断言 | `npx vitest run tests/workflows.test.ts` |
| S8 | 真跑一次（只读）并核对覆盖率读数 | `node scripts/data/cli.mjs plans-tier-discovery`；`node scripts/data/cli.mjs plans-tier-discovery --json` |
| S9 | 门禁 + 变异证明 | `node scripts/qa/run-gates.mjs`；第 4 节逐条改回旧行为 |

## 3. 验收判据 → 验证方式

| # | 判据 | 验证 | fixture / 断言名 |
|---|---|---|---|
| 1 | 门禁全绿，测试不少于 709 | `node scripts/qa/run-gates.mjs` 退出 0；`npm test -- --run` 的 `Tests  N passed` 读 N ≥ 709 | 无 |
| 2 | 降噪反例：Anthropic 单价不得进候选 | `npx vitest run tests/plans-tier-context.test.ts -t 'Anthropic 单价不参与月费'` | `anthropic-noise.html`：断言 `candidates` 不含 `0.01/0.125/0.5/10/50`，`pageMonthlyPrices` 恰为 `[20,100,200]`，`evidence.unit` ≥ 5 |
| 3 | 残渣反例：`1201001` 必须落异常 | `-t '坐标轴刻度不得拼成候选'` | `opencode-axis.html`：断言 `anomalies` 含 `{ value: 1201001, reason: '跨标签拼接' }`，且 `candidates` 空 |
| 4 | 正例：真多出 ¥129 报新增档位 | `-t '页面真多出 ¥129 档'` | `new-tier.html`：`candidates` 深等于 `[{ price: 129, confidence: 'high', action: '新增档位' }]` |
| 5 | 消失价位：¥9.9 报下架且不误报其它档 | `-t '仓库有 ¥9.9、页面只剩 4.9/19.9'` | `removed-cny.html`：`lowConfidence` 含 `{ price: 9.9, action: '疑似下架需复核' }`，且不含 9.9 以外的下架项；`candidates` 为 `[4.9, 19.9]` |
| 6 | 表格列头：季/年付不得当月费 | `-t '月付列只取月付列'` | `columns.md`：`pageMonthlyPrices` = `[49]`，`evidence.annual` 含 129/456 |
| 7 | 额度行不得当月费 | `-t '额度行与额度上限'` | `copilot-flex.html`：`$5/$31` 落低置信（`同块多价`），`$15/$70/$200` 归 allowance，`$10` 仍判存在 |
| 8 | 促销语境降级而非硬判 | `-t '促销页整组降级'` | `promo.html`：4.9 为 `low` + `reason` 含 `促销`；已录 9.9 不出 `疑似下架需复核` |
| 9 | 干净但缺价位：不可靠集合不判下架 | `-t '月费集合不完整不判下架'` | `partial-set.html`：整组进 `unknown` + `reason=月费集合不完整` |
| 10 | 不可用不假装支持 | `-t '纯前端渲染判不可用'` | `csr-shell.html`：`unavailable[0].kind === 'js-rendered'`，且 `probe` 写明 `.md`/`llms.txt` |
| 11 | 覆盖率可复现 | S8 文本首行 `覆盖率：一致 X/55`；`--json` 的 `coverage` 四项相加 = 55 | 真跑读数写进 coding-result（前值见 `architecture.md` §4.4） |
| 12 | 只读 | 跑前 `sha256sum $(git ls-files src/data)` 存表，跑后比对；另 `npx vitest run tests/plans-tier-discovery.test.ts -t '只读'` 断言结果 `readOnly === true` 且未调用任何写接口 | 真跑 + 单测 |
| 13 | workflow 仍 report-only | `npx vitest run tests/workflows.test.ts` | 新增断言：含 `\|\| echo`、`>> "$GITHUB_STEP_SUMMARY"`，不含 `git add/commit/push` |
| 14 | 退出码语义 | 子进程用例：正常 → 0；抓取全失败 → 0 且 `unavailable` 非空；`--plans-file /nope` → 非 0 | `tests/plans-tier-discovery.test.ts` 的 `spawnSync` 用例（参照 `tests/plans-structure-drift.test.ts` 的子进程写法） |

fixture 清单（5 档 plans + 9 页）：

- `plans.json`：`tier-basic` 20 / `tier-plus` 100 / `tier-free` 0（同 `https://example.com/pricing`）；`cny-mini` 9.9 / `cny-lite` 49.9（同 `https://example.com/cny`）。
- `anthropic-noise.html`：`Read$0.01 / MTokWrite$0.125 / MTok`、`Input$10 / MTokOutput$50 / MTok`、`$0.05 per hour per container`、`Cost$10 / 1K searches`、`Up to $500 per month in pooled API credits`、`$17Per month with annual subscription discount ($200 billed up front)`、`$125 if billed monthly`、三个卡片价（其中 max/ultra 卡片**只有** `data-plan-field` 属性、没有 `Per month` 文本，用来单独证明属性通道）。
- `opencode-axis.html`：额度表 `<th>Monthly usage</th>` + 行内 `$15$60`，卡片 `$10per month`/`$40per month`，末行 `$120` 后接 `axis-tick` 的 `100`/`1K`（原文不含连续 `$1201001`）。
- `new-tier.html`：`$20 / month`、`$100 / month`、`$129 / month`。
- `removed-cny.html`：`¥4.9/月`、`¥19.9/月`（无 9.9）。
- `columns.md`：`| 档位 | 月度 Credit | 月付 | 季付 | 年付 |` + `| Mini | 400M | ¥49 | ¥129 | ¥456 |`。
- `copilot-flex.html`：`Pro$10 per month`、`$15 monthly total credits for Pro`、`<table>` 行标签 `Flex allotment` + `Pro plan$5 per month` / `Pro+ plan$31 per month`。
- `promo.html`：`Mini限时5折特惠 ¥4.9/月`，plans 用 `cny-mini` 9.9。
- `partial-set.html`：`$100 / month` 一处（对应 3 档里只命中 1 档）。
- `csr-shell.html`：`<div id="app"></div>` + `doesn't work properly without JavaScript`。

## 4. 变异证明计划

每条新判据都要能改回旧行为并变红；执行方式为「改一处 → 跑指定用例 → 记录红条 → 还原」（不用 git）。

| 判据 | 变异操作 | 预期红 |
|---|---|---|
| 异常先于语境（R1/R2 位置） | 把 anomaly 判定移到语境过滤之后 | #3 `1201001` 用例：`anomalies` 为空 |
| 单价后缀排除（R5） | 删掉 R5 的 `MTok`/`per hour`/`/1K` 词表 | #2：`candidates` 冒出 `0.01/0.125` |
| 额度排除（R3/R6） | 删掉 R6（月费后接 credits）与行标签规则 | #2：`500` 进候选；#7：`$15/$70` 变候选 |
| 表格列头（R7） | 让列头不参与判定 | #6：`pageMonthlyPrices` 为空 → 4 档全报下架 |
| 属性通道（R8） | 关闭 C1 通道 | #2：max/ultra 卡片价丢失 → `pageMonthlyPrices` 只剩 `[20]` |
| 同块多价（R11） | 删掉 R11 | #7：`$5/$31` 变高置信候选 |
| 已录/未录不对称 | 去掉「已录值宽松」分支 | #7：`$10` 被判下架 |
| 完整性守卫 | 命中率 < 50% 也照样判下架 | #9：报 2 条假下架 |
| 促销降级（R10） | 删掉 promo 词表 | #8：4.9 变高置信候选 |
| 可达性口径 | 判 `.md` 只看 `status === 200` | #10：`csr-shell` 被判 `available` |
| 只读 | 在命令末尾加一次 `writeFileSync` | #12：`src/data` 哈希变化 + `readOnly` 用例红 |
| 退出码 | 把 `unavailable` 改成 `throw new CliError` | #14：全失败用例退出码变非 0 |

## 5. 不碰的文件

- `src/data/**`（含 `entries/plans.json`、`entries/api.json`、`generated/*`）：一个字节都不改。
- 既有 lib：`plans-structure-drift.mjs`、`plans-drift.mjs`、`official-price-drift.mjs`、`benchmarks-*.mjs`、`discover.mjs`、`drift.mjs`、`verify.mjs`、`reachability.mjs`（只 import `normalizePage` / `extractPriceTokens` / `quantityEvidence`）。
- 既有测试：`tests/plans-structure-drift.test.ts`、`tests/plans-drift.test.ts`、`tests/official-price-drift.test.ts` 的断言不动（`plans-structure-drift` 的结果形状被全量 `toEqual` 锁定，实证：`tests/plans-structure-drift.test.ts:21`）。
- 展示层与图表：`src/components/**`、`src/views/**`、`src/lib/**`、`scripts/prerender.mjs`、`scripts/gen-*`、`scripts/site-*`、样式与 SEO 相关脚本。
- `docs/.hermes/gates.json`、`scripts/qa/**`：不加门、不改门禁口径。
- 交付纪律：UTF-8；改既有文件必须保持原行尾——`scripts/data/cli.mjs` 与 `.github/workflows/data-refresh.yml` 实测都是 **CRLF**（实证：`node -e` 统计 `cli.mjs` CRLF=329 / LF=0，`data-refresh.yml` CRLF=249 / LF=0），新建文件用 LF；不写 emoji；不做 git 操作。
