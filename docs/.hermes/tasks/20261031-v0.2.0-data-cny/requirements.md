# Token Price v0.2.0 需求任务书（人民币基准 + 多厂商 + 数据更新脚本）

> 本文件是本迭代需求真源。v0.1.0 产品定义见 `../20261031-v0.1.0-mvp/requirements.md`，本轮在其基础上扩展，**不推翻**其数据纪律。

## 0. 一句话目标

把「USD 单币种、2 厂商、3 条口径」升级为「**人民币为比较基准、15+ 厂商、100+ 模型、每条可溯源**」，并提供一套**非开发者也能照着一条命�令更新的脚本**。

## 1. 已定决策（不要重问，直接执行）

### 1.1 币种体系

- **比较基准币种 = CNY（人民币）**。所有列表、排序、计算器默认以人民币呈现。
- 每条价格必须区分两个概念，不得混用：
  - `billingCurrency`：**厂商实际计价币种**（国内厂商 `CNY`，国际厂商 `USD`）。这是账单真相。
  - 展示用人民币值：由 `billingCurrency` + 汇率推导，**永远是估算**。
- **国内厂商不换算**：`billingCurrency=CNY` 时人民币就是原价，标注「官方原价」。
- **国际厂商必须双显示**：人民币估算值为主，原币种原价次之，并紧邻显示 `按 X 汇率估算（日期 YYYY-MM-DD）`。
- 汇率来源必须写进数据文件（source / fetchedAt / rate / date），页面与页脚都要显示「汇率非实时，仅用于横向比较」。
- **严禁**把汇率写死在代码常量里当唯一来源；页面渲染必须读生成的数据文件，缺失即构建失败。

### 1.2 数据溯源分级

新增必填字段 `provenance`，取值只允许两种：

| 值 | 含义 | 页面标注 |
|---|---|---|
| `official` | 人工打开厂商官方定价页逐项核对 | 「官方核验 · 日期」 |
| `aggregate` | 取自第三方聚合（models.dev 等），**未逐条核官方** | 「聚合数据 · 未逐条核官方 · 抓取于 YYYY-MM-DD」 |

- 同一模型同时存在两种来源时，**official 优先**，aggregate 只用于补空缺。
- 聚合条目**不得**覆盖或静默修改已有 official 条目的价格。
- 排行榜/「最便宜」类结论只允许基于 `official` 条目；若 official 数量不足，页面显式说明「样本不足，不构成结论」。

### 1.3 覆盖范围（本轮目标下限）

- **厂商 ≥ 15 家**，**模型口径 ≥ 100 条**。
- 国内厂商（原生 CNY，官方核验优先）：DeepSeek、阿里通义千问、字节豆包（火山方舟）、智谱 GLM、月之暗面 Kimi、MiniMax。
- 国际厂商（USD 原生）：OpenAI、Anthropic、Google Gemini、xAI Grok、Mistral、Cohere、Meta Llama。
- 达不到下限时**如实报告缺口与原因**，不得用编造条目凑数。聚合源可补齐国际厂商，但必须标 `aggregate`。

### 1.4 数据更新脚本（用户核心诉求）

必须提供**单一入口的数据维护 CLI**，用户不需要懂 Astro/TypeScript 就能更新站点数据。要求：

- 入口：`node scripts/data/cli.mjs <command>`，并在 `package.json` 暴露 npm scripts。
- 必须包含这些命令，每个都有中文 `--help` 与成功/失败明确输出：
  | 命令 | 作用 |
  |---|---|
  | `rate` | 拉取 USD→CNY 汇率并写入数据文件（带 source/fetchedAt/date） |
  | `pull` | 拉取聚合源（models.dev）到本地缓存，打印厂商/模型统计 |
  | `add` | 以命令行参数新增或更新一条价格（支持 official/aggregate，自动生成 id，重复时提示覆盖） |
  | `verify` | 校验全部数据（schema、必填、来源可达性抽查），列出 problem 清单 |
  | `drift` | 对比本地 official 条目与聚合源最新值，报告**差异清单**（只报告不自动改写） |
  | `publish` | 跑 verify + typecheck + test + build，全绿后调用部署脚本发布 |
- 所有会改数据的命令必须**先校验再落盘**，失败时保留原文件不动（原子写入）。
- `add` 必须拒绝：负价格、非 https 来源、缺失核验日期、official 但缺来源链接。
- 命令输出必须是人能读懂的中文摘要 + 机器可读的 `--json` 选项。

### 1.5 页面

- `/api-pricing/`：人民币为主列的表格；新增「溯源」列与筛选（官方核验 / 聚合）；支持按人民币价格排序。
- `/plans/`：保持独立；人民币呈现月费。
- `/calculator/`：人民币输出，明确标注估算汇率；缺价仍 fail closed。
- **新增 `/sources/`**：数据来源说明页 —— 各厂商溯源覆盖率（official / aggregate 各多少条）、聚合源名称与链接、汇率来源与时间、更新方法（指向 `scripts/data/cli.mjs`）。
- 首页统计改为真实数字（厂商数、模型数、official/aggregate 数量）。

## 2. 数据来源（已由编排层实测，可直接使用）

| 源 | 地址 | 形态 | 实测 |
|---|---|---|---|
| models.dev | `https://models.dev/api.json` | 单个 JSON，`cost.input/output/cache_read/cache_write` 为 **USD / 1M tokens** | HTTP 200，495 KB，235 厂商 / 8938 模型 |
| 汇率主源 | `https://open.er-api.com/v6/latest/USD` | JSON，`rates.CNY`，含 `time_last_update_utc` | 200，实测 CNY=6.669566（2026-10-31 00:02 UTC） |
| 汇率备源 | `https://api.frankfurter.app/latest?from=USD&to=CNY` | JSON，`rates.CNY` + `date` | 200，实测 6.6529（2026-10-30） |
| 官方：DeepSeek 中文 | `https://api-docs.deepseek.com/zh-cn/quick_start/pricing` | CNY 原生 | 200 |
| 官方：火山方舟 | `https://www.volcengine.com/docs/82379/1099320` | CNY 原生 | 200 |
| 官方：MiniMax | `https://platform.minimax.cn/docs/pricing/overview` | CNY 原生 | 200 |
| 官方：阿里百炼 | `https://help.aliyun.com/zh/model-studio/models` | CNY 原生 | 200 |
| 官方：Anthropic | `https://platform.claude.com/docs/en/about-claude/pricing` | USD | 200 |
| 官方：Google | `https://ai.google.dev/gemini-api/docs/pricing` | USD | 200 |

缺失项：Kimi 与智谱定价页为 JS 渲染，静态抓取拿不到价格表；OpenAI 官方页对脚本返回 403。这几家本轮按 `aggregate` 录入并如实标注，不得伪造 official。

## 3. 工程约束

- 保留 v0.1.0 的全部数据纪律与 fail-closed 语义（缺价拒算、非法输入拒算、schema 严格）。
- 依赖仍以 Astro + TypeScript + Zod + Vitest 为准；**不得**引入客户端框架水合。
- 生成的数据文件与手写真源必须分离：
  - 手写/CLI 维护：`src/data/entries/*.json`（或等价结构化文件）
  - 生成物：汇率、聚合缓存、派生统计 → `src/data/generated/*.ts`，**入库**（否则干净检出构建失败）
- 所有新逻辑（汇率换算、溯源分级、筛选、计算）必须是纯函数并有单元测试。
- 不得把网络请求放进构建期或浏览器运行期；抓取只发生在 CLI 命令里。

## 4. 验收标准（Hermes 亲跑）

- `npm run typecheck` / `npm test -- --run` / `npm run build` 全绿。
- 新增测试覆盖：币种换算、官方/聚合优先级、聚合不得覆盖官方、脚本命令的失败路径（负价格、非 https、缺日期）。
- `node scripts/data/cli.mjs verify` 退出码 0，并打印真实统计（厂商数/模型数/official/aggregate）。
- `node scripts/data/cli.mjs drift` 能对一条人为篡改的价格报出差异（造一次变异验证）。
- `node scripts/data/cli.mjs add` 能新增一条并让构建通过的条目；注入非法值必须拒绝且文件不变（字节比对）。
- 构建产物中：国际厂商行同时含人民币值与 USD 原价 + 汇率标注；国内厂商行标注「官方原价」。
- `/sources/` 存在且数字与 `verify` 输出一致（防两处各写一份）。
- 五+一路由线上返回 200，双视口无溢出、无运行期错误。
- 数据真实：抽查 ≥3 家厂商条目可回到官方页或明确的聚合源，**不得出现编造价格**。

## 5. 排除项

- 不做实时汇率承诺、不做自动定时抓官方页、不做用户账号/收藏。
- 不把 v0.1.0 的 methodology 页删除，只做内容扩充。

## 6. 三锻收口纪律（必须遵守）

状态链：implementing → acceptance；失败只返工失败项 → acceptance 循环；全过后 accepted_pending_commit → 统一迭代提交 → committed_pending_report → 终验报告与状态回填 → completed。

五条硬规：验收通过才提交；失败只返工失败部分；一次迭代一个交付提交；终验报告是完成门；报告收口不得夹带未复验代码。OpenCode/Codex **不做任何 git 操作**，提交由 Hermes 编排层统一执行。

## 7. 交付文件

- `architecture.md`（增量设计，注明对 v0.1.0 的变更点）、`implementation-plan.md`
- 数据 CLI 全套：`scripts/data/cli.mjs` + 其依赖模块
- 新增/改造的数据文件、schema、纯函数、页面、测试
- `coding-result.md`、`review-result.md`（Codex 写）
- README 增补「如何更新数据」一节（面向非开发者，命令 + 示例 + 常见错误）
