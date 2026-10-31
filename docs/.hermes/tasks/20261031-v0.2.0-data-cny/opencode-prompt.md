# OpenCode 实现任务：Token Price v0.2.0（人民币基准 + 多厂商 + 数据 CLI）

你是本迭代的编码执行体。工作目录：`<repo>`（已有 v0.1.0 可运行代码）。
**先完整读 `docs/.hermes/tasks/20261031-v0.2.0-data-cny/requirements.md`，它是需求真源。**

## 铁律（违反即失败）

1. **不做任何 git 操作**（不 add/commit/push/branch/tag）。提交由编排层统一执行。
2. **不编造价格**。拿不到官方页就标 `aggregate`；任何一条 official 条目必须能在你实际打开过的官方页上找到对应数字。
3. **不删断言、不放宽判据**。v0.1.0 现有测试必须继续通过（币种改造需要改断言值时，同步改值并说明原因，不许删用例）。
4. 构建期与运行期**不得发网络请求**；抓取只允许发生在 `scripts/data/cli.mjs` 的命令里。
5. 不要引入客户端框架水合、不要引入服务端。

## 现有代码地图（先读这些再动手）

```
src/data/api-prices.ts      当前唯一价格源（2 家 / 3 条，USD）
src/data/token-plans.ts     空集合
src/lib/schema.ts           Zod 严格校验（唯一 id / currency / unit / 可空数值）
src/lib/pricing.ts          每 1M token 计价，fail-closed
src/lib/format.ts           formatUsdPrice / formatContextTokens / formatPricePair
src/lib/data.ts             导出 apiPrices、DATA_VERIFIED_AT
src/lib/url.ts              sitePath() 处理 base 前缀
src/pages/{index,api-pricing,plans,calculator,methodology}.astro
src/scripts/{api-table,calculator}.ts
tests/{schema,pricing,format,client-scripts}.test.ts   （4 文件 48 用例，全绿）
scripts/deploy-site.sh      构建 + 同步 dist 到站<td>点仓 + 推送
```

## 必须交付的结构（按此落地，不要另起架构）

```
src/data/
  providers.json            # 厂商元数据：id/中文名/英文名/地区(cn|intl)/官网/定价页 URL
  entries/api.json          # API 价格条目数组（手写 + CLI 维护，JSON 便于脚本改）
  entries/plans.json        # Token Plan 条目数组
  generated/fx.generated.json    # 汇率生成物（入库）：{base,quote,rate,source,sourceUrl,fetchedAt,date}
  generated/aggregate.generated.json  # 聚合导入生成物（入库）：含 fetchedAt 与每条 provenance
src/lib/
  schema.ts                 # 扩展：billingCurrency / provenance / aggregateSource
  fx.ts                     # 纯函数：toCny(amount, currency, fx) / formatCny / 汇率标注文案
  pricing.ts                # 保持 fail-closed，增加 CNY 口径
  format.ts                 # 保留 formatUsdPrice，新增 formatCnyPrice / formatDualPrice
  stats.ts                  # 纯函数：厂商数/模型数/official/aggregate 计数（页面与 CLI 共用同一份）
scripts/data/
  cli.mjs                   # 唯一入口，子命令路由
  lib/{http,fx,pull,add,verify,drift,io}.mjs
```

`src/data/entries/*.json` 是数据真源；`src/data/generated/*` 由 CLI 写入，**必须入库**（干净检出要能直接构建）。

## 数据字段（api 条目）

沿用 v0.1.0 字段，新增/调整：

- `billingCurrency`: `"CNY" | "USD"` —— 厂商实际计价币种（必填）
- `provenance`: `"official" | "aggregate"`（必填）
- `aggregateSource` + `aggregateFetchedAt`：仅 `aggregate` 必填
- `sourceUrl`：必须 `https://`，official 必填，aggregate 填聚合源条目 URL 或聚合源主页
- `verifiedAt`：`YYYY-MM-DD`（必填）
- 价格字段保持「每 1M tokens」语义不变

Schema 约束：`official` 必须有 `sourceUrl` 且 `verifiedAt`；`aggregate` 必须有 `aggregateSource`；数值有限非负；`verified` 状态至少 input+output 非空；id 全局唯一。

## 厂商与覆盖（目标 ≥15 厂商 / ≥100 条）

### 国内（billingCurrency=CNY，尽量 official）
先自己 curl 这些页面试取真实 CNY 价格，取到就记 official（写清 sourceUrl + verifiedAt=今天日期）：
- DeepSeek：`https://api-docs.deepseek.com/zh-cn/quick_start/pricing`（已实测可抓，v0.1.0 已有 USD 口径条目 —— 改为 CNY 口径并以中文页为准）
- 阿里百炼（通义千问）：`https://help.aliyun.com/zh/model-studio/models`
- 字节豆包/火山方舟：`https://www.volcengine.com/docs/82379/1099320`（已实测可抓）
- MiniMax：`https://platform.minimax.cn/docs/pricing/overview`（已实测可抓）
- Kimi（月之暗面）：`https://platform.moonshot.cn/docs/pricing/chat`
- 智谱 GLM：`https://open.bigmodel.cn/pricing`

### 国际（billingCurrency=USD）
- OpenAI / Anthropic / Google / xAI / Mistral / Cohere / Meta
- Anthropic 官方页可抓：`https://platform.claude.com/docs/en/about-claude/pricing`
- Google 官方页可抓：`https://ai.google.dev/gemini-api/docs/pricing`
- OpenAI 官方页对脚本返回 403 → 该家用 `aggregate`（models.dev）并如实标注

### 聚合铺底
本地已有快照：`.cache/models-dev.json`（HTTP 200，235 厂商 / 8938 模型，`cost.input/output/cache_read/cache_write` 单位是 USD/1M）。
用它补齐国际厂商与国内厂商的空缺，全部标 `aggregate`，`aggregateFetchedAt` 写实际抓取日期。
**聚合条目不得覆盖同 id 的 official 条目。**

### 工时约束
不要为了凑数硬塞冷门模型。宁可 12 家厂商 110 条真实条目，不要 20 家厂商 500 条半真半假。

## 数据 CLI（用户核心诉求，做扎实）

入口 `node scripts/data/cli.mjs <command>`，`package.json` 暴露：

```json
"data":        "node scripts/data/cli.mjs",
"data:rate":   "node scripts/data/cli.mjs rate",
"data:pull":   "node scripts/data/cli.mjs pull",
"data:verify": "node scripts/data/cli.mjs verify",
"data:drift":  "node scripts/data/cli.mjs drift",
"data:add":    "node scripts/data/cli.mjs add",
"publish":     "node scripts/data/cli.mjs publish"
```

要求：
- 无参数或 `--help` 打印中文帮助（命令表 + 示例），退出码 0。
- `rate`：主源 `https://open.er-api.com/v6/latest/USD`，失败回落 `https://api.frankfurter.app/latest?from=USD&to=CNY`；写入 `generated/fx.generated.json`。
- `pull`：下载 models.dev 到 `.cache/`，打印厂商/模型统计。
- `add`：`--provider --model --billing-currency --input --output [--cache-read] [--cache-write] [--context] [--provenance] --source-url --verified-at`；自动生成 id（如 `deepseek-deepseek-chat`）；已存在时提示并需 `--force` 才覆盖。拒绝负价格 / 非 https / 缺日期 / official 缺来源，退出码非 0 且文件字节不变。
- `verify`：跑 schema + 完整性（厂商存在、id 唯一、official 有来源），输出问题清单与统计；有严重问题退出码 1。
- `drift`：把本地条目与 `.cache/models-dev.json`（不存在则先 pull）对比，输出「本地 official 值 vs 聚合值」差异表；只报告，绝不改写。找不到对应模型时列出未匹配数。
- `publish`：依次 verify → `npm run typecheck` → `npm test -- --run` → `npm run build`，全绿后执行 `bash scripts/deploy-site.sh`；任一失败立即中止且退出码非 0。
- 所有写文件的命令：**先写临时文件再原子 rename**，校验失败绝不落盘。
- 全部命令支持 `--json` 输出机器可读结果。

## 页面与展示

- 人民币为主列；国际厂商双显示（¥ 估算 + $ 原价 + 「按 6.6696 估算（2026-10-31）」），国内厂商标「官方原价 ¥」。
- 新增「溯源」列 + 筛选（全部 / 官方核验 / 聚合数据）；排序按人民币值。
- 新增 `/sources/`：各厂商溯源覆盖率、聚合源说明与链接、汇率来源与抓取时间、「如何更新数据」段落（命令示例）。
- 首页统计数字必须由 `src/lib/stats.ts` 从真实数据算出（厂商数、模型数、official/aggregate 数），不得手写常量。
- `/methodology/` 增补：人民币换算口径、汇率非实时声明、official 与 aggregate 的差异。
- 计算器：人民币输出 + 汇率标注；缺价仍 fail closed。

## 测试要求（必须新增）

- 币种换算：CNY 原样、USD×汇率、缺汇率抛错。
- 溯源优先级：official 不被 aggregate 覆盖；同模型双来源时官方胜出。
- 统计纯函数与 CLI verify 输出一致（同一份 stats 源）。
- CLI 失败路径：负价格、非 https、缺 verifiedAt、official 缺 sourceUrl → 全部拒绝且文件不变。
- 保留并适配原有 48 个用例。

## 自检门禁（交付前你必须让它全绿并贴真实输出）

```bash
npm run typecheck
npm test -- --run
npm run build
node scripts/data/cli.mjs verify
node scripts/data/cli.mjs drift
```

## 交付物

1. 上述全部代码与数据。
2. `docs/.hermes/tasks/20261031-v0.2.0-data-cny/architecture.md`：增量设计 + 对 v0.1.0 的变更点表。
3. `docs/.hermes/tasks/20261031-v0.2.0-data-cny/coding-result.md`：做了什么、门禁真实输出、**每条 official 条目的取数依据**（sourceUrl + 你看到的原始行文本摘录）、未达成项与原因。
4. `README.md` 增补「如何更新数据」：面向不懂前端的人，命令 + 示例 + 常见错误。
5. 更新 `status.json` 的 `stage` 为 `implementation_done`。

**再次强调：不做 git 操作。不编造价格。门禁输出必须是真实终端结果，不是描述。**
