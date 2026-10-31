# Codex 对抗审计与架构回审 · v0.2.0

## 结论

`needs_fix`

实现的机械门禁在本轮窄修复后全部通过，但仍有两项未闭合：

1. 上线集合中有 17 条国内厂商 aggregate 条目以 `USD` 填入 `billingCurrency`，与需求和 schema 对该字段“厂商实际计价币种（账单真相）”的定义冲突；这是币种模型方向问题，判定 `needs_architecture`。
2. 需求明确要求 `verify` 做“来源可达性抽查”，当前实现完全没有网络可达性检查；是否把网络检查放进 `publish` 前置门禁会影响可复现发布，需要架构决定失败/警告策略。

本轮修复了 4 个明确缺陷：MiniMax 当前实付价高报 2 倍、aggregate 生成物测试假覆盖、`publish --json` 输出非法 JSON、Windows 下 `publish` 无法启动 npm 步骤。没有执行任何 git 命令。

## 问题表

| 编号 | 级别 | 现象 | 证据（命令 + 真实输出） | 处置 |
|---|---|---|---|---|
| R-01 | P0 | MiniMax-M3 两条主价格使用官方页删除价，页面当前“永久五折”实付价只写在备注，比较与计算会高报 2 倍 | 官方页当前表格：`≤512k: ~~4.20~~ 2.10 / ~~16.80~~ 8.40 / ~~0.84~~ 0.42`；`>512k: ~~8.40~~ 4.20 / ~~33.60~~ 16.80 / ~~1.68~~ 0.84`。修前 `api.json` 主值分别为 `4.2/16.8/0.84`、`8.4/33.6/1.68` | 已修：主值改为当前实付价，删除价保留在 notes；新增权威基线断言 |
| R-02 | P0 | 国内厂商 aggregate 数据错用 `USD` 作为 `billingCurrency`；该字段按需求应表示厂商实际账单币种，不是聚合源报价币种 | 统计脚本输出：`count: 28` 个 raw 条目（moonshot 6 / zhipu 12 / xiaomi 6 / stepfun 4）；合并后上线 17 条（zhipu 1 / moonshot 6 / xiaomi 6 / stepfun 4）。`sources.astro` 又说明这些 USD 数字是 models.dev 折算发布 | 待返工：不能用汇率反算成“官方人民币价”；需架构拆分 `sourceCurrency/reportedCurrency` 与 `billingCurrency`，或移除无法确认账单币种的国内 aggregate 条目 |
| R-03 | P3 | `tests/schema.test.ts` 的测试名声称校验 aggregate 生成物，实际未导入 `aggregate.generated.json`；把第一条 aggregate 改成 official 后测试仍 22/22 绿 | 修前实测：`npm test -- --run tests/schema.test.ts` → RC=0，`Tests 22 passed (22)`；同时 `verify` → RC=1，报 `官方核验条目不得填写 aggregateSource/aggregateFetchedAt` | 已修：测试真实调用 `parseAggregateFile` 与 `parseFxRate`；复验同一变异 RC=1，`1 failed / 22 passed` |
| R-04 | P2 | `publish --json` 先打印人类版 verify 报告和步骤日志，再打印 JSON，整体不可被 JSON 解析 | 缺 FX 安全短路实测：`node scripts/data/cli.mjs publish --json` → RC=1，`JSON_VALID=False`；输出先出现 `== 数据校验 ==`，后出现 JSON 对象 | 已修：JSON 模式抑制人类报告与步骤日志；新增无副作用命令桩测试，实际 `JSON.parse` 成功并断言五步顺序 |
| R-05 | P2 | Windows 下 `publish` 使用 `spawnSync('npm.cmd', ..., shell:false)`，在当前 Node 返回 `EINVAL`，无法进入 typecheck | `node -e` 实测：`{"shell":false,"status":null,"error":"spawnSync npm.cmd EINVAL"}`；`shell:true` 才能启动，但会触发参数拼接安全告警 | 已修：Windows 显式走 `cmd.exe /d /s /c npm.cmd ...`，非 Windows 仍直接调用 npm；隔离测试五步通过 |
| R-06 | P2 | `verify` 未实现需求中的“来源可达性抽查” | `rg -n "\b(fetch|request|https?\.request)\b" scripts/data/lib/verify.mjs` → RC=1，`NO_NETWORK_REACHABILITY_CHECK_FOUND`；需求书第 53 行明确写“来源可达性抽查” | 待返工：未擅自把网络依赖塞进发布门禁；需要决定抽样范围、超时、403/JS 页面、失败是 warning 还是 error |

## P0 数据正确性与 honesty

### DeepSeek / MiniMax / Anthropic 权威基线逐条对拍

命令对 `GROUND-TRUTH.md` 明确列出的 11 个档位逐字段比较 `input/output/cacheRead/cacheWrite/billingCurrency`，并汇总三个厂商全部 official 行的日期和 URL。MiniMax 采用官方页当前未删除的永久五折实付价；删除前标准价保留在 notes，不冒充当前账单价。

```text
{
  "expectedRows": 11,
  "scopedOfficialRows": 16,
  "mismatches": [],
  "dates": [
    "2026-10-31"
  ],
  "urls": [
    "https://api-docs.deepseek.com/zh-cn/quick_start/pricing",
    "https://platform.minimax.cn/docs/pricing/overview",
    "https://platform.claude.com/docs/en/about-claude/pricing"
  ]
}
```

在线与仓内官方快照抽查：

- DeepSeek 官方页直接显示 4 条峰谷价，与实现一致。
- MiniMax 官方页直接显示当前永久五折价；R-01 已按此修正。
- Anthropic 官方页显示 9 条实现所用档位及缓存列；实现币种为 USD。
- 智谱、Mistral、OpenAI、xAI 的 official 行均有官方 URL、`verifiedAt=2026-10-31`，并能在 `.cache/truth2/` 的官方抓取快照中逐行找到。
- 所有 manual official 行均未使用 models.dev URL；aggregate 生成物全部来自 models.dev。未发现 models.dev 行在最终数据中误标 official。
- official 国内厂商行为 CNY，official 国际厂商行为 USD。问题仅出在 R-02 的国内 aggregate 行：实现把“聚合源折算币种”当成了“厂商账单币种”。

### 国内 aggregate 币种冲突原始统计

```text
{
  "count": 28,
  "byProvider": {
    "moonshot": 6,
    "zhipu": 12,
    "xiaomi": 6,
    "stepfun": 4
  }
}
```

其中 11 条智谱 aggregate 被 official 合并规则覆盖，最终页面仍有 17 条国内厂商 USD aggregate 行。页面行级会标“聚合数据”和汇率估算，没有把它们直接写成“官方人民币价”；但 `billingCurrency` 的字段语义和页面“国内厂商即官方原价”的总括文案不再成立。

## P1 币种与汇率

### 运行时汇率来源

`rg -n "6\.669566|6\.6696" src scripts` 的唯一数据值位于 `src/data/generated/fx.generated.json`；`src/lib/fx.ts` 只在注释示例中出现 `6.6696`，运行时统一读取 `fx.rate`。组件未硬编码运行汇率。

删除（实际以同目录移动模拟，结束后恢复）FX 生成物后构建真实输出：

```text
MISSING_FX_BUILD_RC=1
> token-price@0.2.0 build
> astro build

19:59:38 [ERROR] [vite] ✗ Build failed in 67ms
[UNRESOLVED_IMPORT] Could not resolve '../data/generated/fx.generated.json' in src/lib/data.ts
   ╭─[ src/lib/data.ts:4:19 ]
   │
 4 │ import fxRaw from "../data/generated/fx.generated.json";
   │                   ──────────────────┬──────────────────
   │                                     ╰──────────────────── Module not found.
───╯
FX_RESTORED_BYTE_IDENTICAL=True
```

页面逐行对 USD 显示“按汇率估算（日期）”和 USD 原价；CNY 由 `toCny` 原样返回。`tests/fx.test.ts` 与 `tests/client-scripts.test.ts` 覆盖 CNY 不换算、USD 估算、缺汇率拒算。未发现“官方价 ¥xx”用于 USD 估算值。

## P2 数据 CLI

### add 四类非法输入与文件字节不变

```text
CASE=负价格 RC=1 BYTE_IDENTICAL=True
[失败] --input 不能为负数（收到 -1）；价格未知时不要传该参数，而不是填负数
CASE=非 HTTPS RC=1 BYTE_IDENTICAL=True
[失败] --source-url 必须使用 https://，收到：http://api-docs.deepseek.com/pricing
CASE=缺 verifiedAt RC=1 BYTE_IDENTICAL=True
[失败] --verified-at 必须是 YYYY-MM-DD，收到：undefined
CASE=official 缺 sourceUrl RC=1 BYTE_IDENTICAL=True
[失败] 缺少参数 --source-url
```

### 原子写中途失败

把临时副本标成只读，使 `rename` 在写完同目录临时文件后失败：

```text
RC=1 BYTE_IDENTICAL=True TEMP_REMAINS=0
[失败] EPERM: operation not permitted, rename '...\api.json.tmp-14544-1793447972179' -> '...\api.json'
```

原文件字节不变，临时文件被清理。实现为同目录临时文件 + `renameSync`。

### drift 变异与恢复

```text
BASELINE_RC=0 DIFFS=75 TARGET_DIFFS=0 MATCHED=92 UNMATCHED=30
MUTATED_RC=0 DIFFS=76 TARGET_DIFFS=1
TARGET field=input localRaw=999 aggregate=0.15 diffPercent=99756.6
RESTORED_HASH=9E0656DF052989953044686F405E89CA357BFDE9997CB0F0FF0215F12EF77725 MATCH=True
RESTORED_RC=0 DIFFS=75 TARGET_DIFFS=0
```

随后 R-01 合法修正 MiniMax 价格，最终正常 drift 为 `compared=122 / diffs=72`。drift 始终 RC=0，因为它按设计只报告、不自动改写。

### stats 同源与页面读数

`tests/stats.test.ts` 实际把 `verify --json` 的完整 `stats` 对象与页面使用的 `computeStats(apiPrices)` 做 `toEqual`。最终静态产物实测：

```text
apiRows=168
officialBadges=122
aggregateBadges=46
sourcesExists=true
sourcesHas168=true
sourcesHas122=true
sourcesHas46=true
```

抽查智谱：`verify` 为 `共 43 / official 42 / aggregate 1 / 97.7%`，`/sources/` 使用同一 `computeProviderCoverage` 结果，没有第二套手写统计。

### publish 链与 JSON

代码顺序为 `verify → typecheck → test → build → deploy`，任一步非 0 抛 `CliError`，后续步骤不执行。缺 FX 时实测 publish 在 verify 中止，没有运行构建与部署。修复后用 PATH/BASH 无副作用命令桩运行真实 CLI，并由测试内 `JSON.parse(stdout)` 解析：

```text
> token-price@0.2.0 test
> vitest --run tests/data-cli.test.ts -t publish 的机器输出与步骤链

 RUN  v5.0.5 <repo>

 Test Files  1 passed (1)
      Tests  1 passed | 18 skipped (19)
   Start at  20:08:08
   Duration  442ms (tests 82%, import 15%, transform 2%, worker 1%)
```

安全命令的 `--json` 管道解析：

```text
verify JSON ok=true entries=168 official=122 aggregate=46
drift JSON ok=true readOnly=true compared=122 diffs=72
VERIFY_JSON_PIPE_RC=0 DRIFT_JSON_PIPE_RC=0
```

`add --json` 与 `publish --json` 由 `tests/data-cli.test.ts` 直接 `JSON.parse`；publish 测试还断言步骤名严格等于 `['verify','类型检查','单元测试','静态构建','发布站点']`。

## P3 fail-closed 与变异测试

### 缺价拒算

`calculateMonthlyCost` 对任一正用量且对应价格为 null 返回 `{ok:false}`，不会把 null 当 0；客户端显示“无法完整计算”。最终全量测试中的相关用例通过：

- `缺价且有对应使用量时 fail closed`
- `空白输入显示 fail-closed 提示`
- `缺汇率时人民币计算 fail closed，而不是给出 0 或旧值`
- `缺汇率时拒绝给出人民币金额`

### 负价格变异

把仓库第一条 `inputPrice: 1` 临时改为 `-1`：

```text
npm test -- --run tests/schema.test.ts
Test Files  1 failed (1)
Tests  3 failed | 19 passed (22)
RC=1

node scripts/data/cli.mjs verify
[严重] SCHEMA: src/data/entries/api.json 校验失败：0.inputPrice: Too small: expected number to be >=0
[严重] NO_OFFICIAL: 没有任何 official 条目：溯源纪律失效
结论：存在严重问题，构建不允许通过（退出码 1）
```

还原后 SHA-256 与变异前完全相同。

### aggregate 伪装 official 变异

修复 R-03 前：

```text
npm test -- --run tests/schema.test.ts
Test Files  1 passed (1)
Tests  22 passed (22)
RC=0
```

修复 R-03 后，同一变异：

```text
npm test -- --run tests/schema.test.ts
Test Files  1 failed (1)
Tests  1 failed | 22 passed (23)
ZodError: 官方核验条目不得填写 aggregateSource；官方核验条目不得填写 aggregateFetchedAt
RC=1
```

还原后 `aggregate.generated.json` SHA-256 为 `4D2B3D8AF972DBAABD71CBE5EFC0729DB46061C4D9CC865074AC74BAEB87F7BA`，与变异前一致。

### v0.1.0 的 48 个用例

删除清单：无。

在“不做任何 git 操作”的约束下，以 v0.1.0 `FINAL-ACCEPTANCE.md` 记录的 4 files / 48 tests 及其测试职责，与当前测试标题和断言逐类对照：schema 负向、成本/fail-closed、筛选排序、格式化裸插值守卫、客户端计算/筛选均仍存在；当前最终为 7 files / 97 tests。未发现通过删除原用例或放宽断言换绿的证据。由于禁止 git，本结论不是提交级逐行 diff，而是基于已归档验收清单的语义对照。

## P4 构建与静态站点

### 构建期无网络

源码扫描 `src/` 未发现 `fetch`、`XMLHttpRequest`、`http(s).request`。把 HTTP/HTTPS/ALL proxy 全指向不可用的 `127.0.0.1:9` 后构建：

```text
BLOCKED_PROXY_BUILD_RC=0
[build] 6 page(s) built in 505ms
[build] Complete!
```

缺 FX 文件时则按 P1 证据 fail closed。

### 非根路径

```text
PUBLIC_BASE_PATH=/token-price npm run build
BASE_PATH_BUILD_RC=0
[build] 6 page(s) built in 294ms
[build] Complete!

HTML_FILES=6 PREFIXED=54 ROOT_LEAKS=0
```

随后已重新执行默认 base 构建，`dist/` 最终为根路径版本。

### 六路由本地 HTTP

```text
ROUTE=/ STATUS=200 BYTES=5118
ROUTE=/api-pricing/ STATUS=200 BYTES=296642
ROUTE=/plans/ STATUS=200 BYTES=2021
ROUTE=/calculator/ STATUS=200 BYTES=138180
ROUTE=/methodology/ STATUS=200 BYTES=6434
ROUTE=/sources/ STATUS=200 BYTES=11956
```

## 已修复项

1. `src/data/entries/api.json`
   - MiniMax-M3 两档主价格改为官方页当前永久五折实付价。
   - notes 明确区分当前价与页面删除价，不删除官方原始口径。
2. `tests/schema.test.ts`
   - 真正解析 aggregate 与 FX 生成物。
   - 新增 DeepSeek / MiniMax / Anthropic 编排层基线 11 档的精确值、币种、provenance、verifiedAt 守卫。
3. `scripts/data/cli.mjs`
   - `publish --json` 不再混入人类报告或步骤日志。
   - Windows npm 步骤改用 `cmd.exe /d /s /c npm.cmd`，避免 `spawnSync npm.cmd EINVAL`。
   - 支持用 `BASH` 指定 Bash 命令，便于无副作用验证部署步骤；默认仍为 `bash`。
4. `tests/data-cli.test.ts`
   - 新增 publish JSON 合法性、五步顺序与全部步骤 RC=0 的隔离测试。

## 未修但认为有问题

### R-02：billingCurrency 模型方向错误

不修原因：将 models.dev 的 USD 折算值反算为 CNY 再标“厂商实际账单价”会制造并不存在的官方人民币价；直接改字段需要新增“聚合源报价币种”与“厂商账单币种/未知”表达，属于数据模型、跨模块契约和页面文案变更。按架构门禁返回设计层。

建议架构选项：

1. 推荐：拆分 `reportedCurrency`（源数据币种）与 `billingCurrency`（厂商账单币种，可 unknown），只有账单币种已确认时才展示“官方原价”。
2. 保守：删除 Kimi / 小米 / 阶跃等无法确认账单币种的 aggregate 条目，不用错误字段语义换覆盖数。
3. 不推荐：按汇率反推人民币并标 CNY，这会违反“不得编造价格”。

### R-06：verify 来源可达性未实现

不修原因：需求要求检查，但 architecture.md 的网络边界只允许 rate/pull（以及 drift 缓存缺失时 pull）访问网络。直接把在线请求加入 verify 会让 publish 是否可发布受临时网络、403 和 JS 渲染站点影响。需要先定“抽样/缓存/超时/状态码/降级”契约。

## 架构回审

`needs_architecture: yes`

核心方向性问题是 R-02：当前单一 `billingCurrency` 同时承担“厂商实际账单币种”和“models.dev 发布数字所用币种”，两者对国内 aggregate 厂商不相等。代码的换算函数本身正确，但输入字段语义已经漂移，因此页面会把国内厂商的第三方 USD 折算值当成 USD 账单原价。这个问题不能靠改文案彻底解决。

R-06 另有需求与架构冲突：需求要求 verify 在线抽查，架构却把 verify 设计为纯本地校验。应由架构层明确后再返工。

除此之外，静态数据出口、schema fail-closed、生成物缺失失败、official 优先合并、stats 单源、纯静态构建与 base-path 设计均未发现方向性错误。

## 最终门禁原样输出

### `npm run typecheck`

```text
> token-price@0.2.0 typecheck
> astro check

20:06:25 [types] Generated 44ms
20:06:25 [check] Getting diagnostics for Astro files in <repo>...
Result (25 files):
- 0 errors
- 0 warnings
- 0 hints
```

### `npm test -- --run`

```text
> token-price@0.2.0 test
> vitest --run

 RUN  v5.0.5 <repo>

 Test Files  7 passed (7)
      Tests  97 passed (97)
   Start at  20:06:24
   Duration  3.69s (tests 82%, import 13%, transform 5%, worker 1%)
```

### `npm run build`

```text
> token-price@0.2.0 build
> astro build

20:06:33 [types] Generated 60ms
20:06:33 [build] output: "static"
20:06:33 [build] mode: "static"
20:06:33 [build] directory: <repo>\dist\
20:06:33 [build] Collecting build info...
20:06:33 [build] ✓ Completed in 76ms.
20:06:33 [build] Building static entrypoints...
20:06:33 [vite] ✓ built in 111ms
20:06:33 [vite] ✓ built in 23ms
20:06:33 [build] Rearranging server assets...

 generating static routes
20:06:33   ├─ /api-pricing/index.html (+34ms)
20:06:33   ├─ /calculator/index.html (+4ms)
20:06:33   ├─ /methodology/index.html (+2ms)
20:06:33   ├─ /plans/index.html (+2ms)
20:06:33   ├─ /sources/index.html (+4ms)
20:06:33   ├─ /index.html (+3ms)
20:06:33 ✓ Completed in 57ms.

20:06:33 [build] ✓ Completed in 223ms.
20:06:33 [build] 6 page(s) built in 304ms
20:06:33 [build] Complete!
```

### `node scripts/data/cli.mjs verify`

```text
== 数据校验 ==
文件：src/data/entries/api.json · src/data/generated/aggregate.generated.json · src/data/generated/fx.generated.json
厂商 15 家 · 计价口径 168 条 · 唯一模型 168 个
溯源：official 122 条 · aggregate 46 条 · 未核验 0 条
计价币种：CNY 70 条 · USD 98 条 · Token Plan 0 条
汇率：1 USD = 6.669566 CNY（2026-10-31，open.er-api.com）
聚合源：models.dev 抓取于 2026-10-31T11:40:10.736Z（快照 235 厂商 / 8938 模型，收录 73 条）

各厂商覆盖：
  zhipu        共  43 条 · 官方  42 · 聚合   1 · 官方占比 97.7%
  xai          共  18 条 · 官方  16 · 聚合   2 · 官方占比 88.9%
  openai       共  16 条 · 官方  12 · 聚合   4 · 官方占比 75%
  mistral      共  14 条 · 官方   5 · 聚合   9 · 官方占比 35.7%
  aliyun       共  11 条 · 官方  11 · 聚合   0 · 官方占比 100%
  volcengine   共  10 条 · 官方  10 · 聚合   0 · 官方占比 100%
  google       共  10 条 · 官方  10 · 聚合   0 · 官方占比 100%
  anthropic    共   9 条 · 官方   9 · 聚合   0 · 官方占比 100%
  cohere       共   8 条 · 官方   0 · 聚合   8 · 官方占比 0%
  xiaomi       共   6 条 · 官方   0 · 聚合   6 · 官方占比 0%
  moonshot     共   6 条 · 官方   0 · 聚合   6 · 官方占比 0%
  meta         共   6 条 · 官方   0 · 聚合   6 · 官方占比 0%
  stepfun      共   4 条 · 官方   0 · 聚合   4 · 官方占比 0%
  deepseek     共   4 条 · 官方   4 · 聚合   0 · 官方占比 100%
  minimax      共   3 条 · 官方   3 · 聚合   0 · 官方占比 100%

问题清单（严重 0 / 提醒 23）：
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 zhipu-glm-5-3-flashx 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 zhipu-glm-5-3-flash 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 zhipu-glm-5-3 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 zhipu-glm-5-2 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_SUPERSEDED: 聚合条目 zhipu-glm-5-1 与 official 同模型，按规则以官方为准
  [提醒] AGGREGATE_SUPERSEDED: 聚合条目 zhipu-glm-5v-turbo 与 official 同模型，按规则以官方为准
  [提醒] AGGREGATE_SUPERSEDED: 聚合条目 zhipu-glm-5 与 official 同模型，按规则以官方为准
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 zhipu-glm-4-7-flashx 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_SUPERSEDED: 聚合条目 zhipu-glm-4-7 与 official 同模型，按规则以官方为准
  [提醒] AGGREGATE_SUPERSEDED: 聚合条目 zhipu-glm-4-6v 与 official 同模型，按规则以官方为准
  [提醒] AGGREGATE_SUPERSEDED: 聚合条目 zhipu-glm-4-5v 与 official 同模型，按规则以官方为准
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 openai-gpt-6-1-terra 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 openai-gpt-6-1-sol 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 openai-gpt-6-luna 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 openai-gpt-6-sol 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 openai-gpt-6-astra 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 openai-gpt-5-6-luna 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 openai-gpt-5-6-sol 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 openai-gpt-5-6-terra 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_OVERRIDDEN_BY_ID: 聚合条目 mistral-mistral-large-4 与手写条目同 id，已被忽略
  [提醒] AGGREGATE_SUPERSEDED: 聚合条目 mistral-mistral-small-2603 与 official 同模型，按规则以官方为准
  [提醒] AGGREGATE_SUPERSEDED: 聚合条目 mistral-ministral-14b-2512 与 official 同模型，按规则以官方为准
  [提醒] MERGED_DEDUPE: 合并时按溯源优先级丢弃 27 条聚合条目

结论：通过（退出码 0）
```

建议索引: 数据 CLI 对抗审计与 billingCurrency 语义漂移 → 墨典:memory/testing-patterns.md#数据溯源与币种模型
