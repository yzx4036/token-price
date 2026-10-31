# Token Price v0.2.0 架构（增量设计）

> 基线：`../20261031-v0.1.0-mvp/architecture.md`。本文只描述本轮改动，未提及的部分沿用 v0.1.0。

## 1. 目标与边界

把「USD 单币种 / 2 厂商 / 3 条口径」升级为「人民币为比较基准 / 15 厂商 / 120 条口径 / 每条可溯源」，并提供单一入口的数据维护 CLI。

硬边界：
- 构建期与浏览器运行期**不发任何网络请求**；抓取只发生在 `scripts/data/cli.mjs` 的命令里。
- 仍是 Astro 纯静态输出 + 原生 TS 客户端脚本，不引入任何客户端框架水合，不引入服务端。
- 数据文件随仓库版本化，构建时经 Zod 严格校验，非法数据使构建失败。

## 2. 数据分层

```text
src/data/providers.json                   厂商元数据（id/中英文名/地区/官网/定价页/聚合源 key）
src/data/entries/api.json                 价格真源（手写 + CLI add 维护）
src/data/entries/plans.json               Token Plan 真源（本轮仍为空集合）
src/data/generated/fx.generated.json      汇率生成物（CLI rate 写，必须入库）
src/data/generated/aggregate.generated.json  聚合导入生成物（CLI pull 写，必须入库）
```

两层分离的理由：手写/核验数据由人负责，生成物由脚本负责。生成物入库后，干净检出即可直接 `npm run build`，无需联网。

## 3. 数据模型（schema 增量）

`apiPriceSchema` 新增字段：

| 字段 | 取值 | 约束 |
|---|---|---|
| `providerId` | providers.json 的 id | 必填，verify 校验存在性 |
| `billingCurrency` | `CNY` / `USD` | 必填，**厂商计价币种**（账单真相），不是展示币种 |
| `provenance` | `official` / `aggregate` | 必填 |
| `aggregateSource` | 字符串 / null | `aggregate` 必填；`official` 必须为 null |
| `aggregateFetchedAt` | `YYYY-MM-DD` / null | `aggregate` 必填；`official` 必须为 null |

原有约束保留：价格有限非负、`verified` 至少 input+output、`sourceUrl` 必须 https、`verifiedAt` 必须真实日期、id 全局唯一、拒绝多余字段。

新增集合 schema：
- `providerSchema`：id 仅小写字母数字连字符、`website`/`pricingUrl` 必须 https。
- `fxSchema`：`{base:'USD', quote:'CNY', rate>0, source, sourceUrl(https), fetchedAt(ISO datetime), date(YYYY-MM-DD)}`。
- `aggregateFileSchema`：`{source, sourceUrl, fetchedAt, providerStats, entries[]}`，且 entries 必须全部是 `aggregate`。

`tokenPlanSchema` 把 `currency` 改名为 `billingCurrency`（与 API 条目统一），其余不变。

## 4. 溯源优先级（合并规则）

`mergeApiPrices(手写条目, 聚合条目)`，纯函数，页面与 CLI 共用：

1. **id 相同 → 丢弃聚合条目**（聚合永不覆盖同 id 的 official）。
2. **同厂商 + 同模型（去掉括号内的计费时段描述后比较）已有 official → 丢弃聚合条目**（同模型双来源时官方胜出）。
3. 聚合内部同模型只保留第一条。
4. 输出顺序：手写条目在前，聚合补位在后。

`verify` 会把被规则丢弃的条目以 `warning` 列出（`AGGREGATE_SUPERSEDED` / `AGGREGATE_OVERRIDDEN_BY_ID`），避免「悄悄丢弃」变成不可见行为。

## 5. 币种与汇率口径

两个概念严格分开：

- `billingCurrency`：厂商实际计价币种。CNY 条目的人民币值就是官方原价；USD 条目的人民币值是估算。
- 展示人民币值：`toCny(amount, currency, fx)`；`currency === 'CNY'` 原样返回，`USD` 乘 `fx.rate`，缺 `fx` 直接抛错。

汇率不进代码常量：页面 `src/lib/data.ts` 读取 `generated/fx.generated.json`，文件缺失或非法 → 构建失败。页脚、列表行、计算器统一显示「汇率非实时，仅用于横向比较」，页脚印 `按 6.6696 估算（2026-10-31）`。

## 6. 计价与 fail-closed

- `calculateMonthlyCost(model, usage)` 返回 `{ok, total, currency}`，`currency` 为条目自身的 `billingCurrency`。
- `calculateMonthlyCostInCny(model, usage, fx)` 在其之上换算人民币，并标 `estimated`（USD 条目为 true）。
- 某类用量 > 0 而对应价格为 null → 拒绝计算；缺汇率 → 拒绝计算；非法用量 → 拒绝计算。
- 排序：`filterAndSortApiPrices(models, filters, fx)` 以人民币值升序，null 与 pending 置后；支持 `query / provider / provenance / sortBy` 四个筛选维度。

## 7. 数据 CLI 架构

```text
scripts/data/cli.mjs          唯一入口：命令路由、中文帮助、--json、退出码
scripts/data/lib/io.mjs       ROOT/PATHS、原子写、参数解析、CliError
scripts/data/lib/http.mjs     fetch 封装（UA、超时、错误码）
scripts/data/lib/fx.mjs       汇率主源 + 备源、区间校验、写 fx.generated.json
scripts/data/lib/pull.mjs     models.dev 下载 + 聚合补位白名单 + 生成 aggregate.generated.json
scripts/data/lib/add.mjs      参数校验 + 构造条目 + 重复检测 + schema 全量回验 + 写 entries/api.json
scripts/data/lib/verify.mjs   schema / 厂商存在性 / 溯源完整性 / 新鲜度，输出问题清单与统计
scripts/data/lib/drift.mjs    official 值 vs 聚合值对拍，只读
```

关键工程约定：

- **原子写**：所有写文件的命令先序列化到同目录临时文件，再 `rename` 覆盖；校验失败时根本不进入写函数，原文件字节不变。
- **单一 schema 源**：CLI 通过 Node 原生 TS 类型剥离直接 `import` `src/lib/schema.ts`，与页面用同一份校验规则（Node < 22.18 时 CLI 顶部会用 `--experimental-strip-types` 重新拉起自身）。
- **单一统计源**：CLI `verify` 与 `/sources/`、首页统计都调用 `src/lib/stats.ts` 的 `computeStats` / `computeProviderCoverage`。
- **聚合补位白名单**：`pull.mjs` 里的 `AGGREGATE_LIMITS` 只列出允许用聚合数据补位的厂商（OpenAI、xAI、Mistral、Cohere、Meta、Kimi、智谱、小米、阶跃），已官方核验的厂商不在表内，从生成阶段就不会产生覆盖。
- **网络边界**：`http.mjs` 只被 `fx.mjs`、`pull.mjs` 使用，而这两者只被 CLI 的 `rate` / `pull`（以及 `drift` 在缓存缺失时的自动 pull）调用。

## 8. 页面

| 路由 | 变化 |
|---|---|
| `/` | 统计改由 `computeStats` 计算；代表性条目只取 official 并按人民币输入价排序；汇率声明 |
| `/api-pricing/` | 人民币主列 + 原币种副行；新增「溯源」列与筛选；按人民币排序；120 行静态渲染 + 客户端重排 |
| `/plans/` | 月费改人民币口径（`billingCurrency` + 汇率），仍为独立比较，空集合展示空状态 |
| `/calculator/` | 人民币输出 + 汇率标注 + 原币种金额；缺价/缺汇率 fail closed |
| `/sources/`（新增） | 统计、各厂商覆盖率表、汇率来源与时间、聚合源说明、更新命令 |
| `/methodology/` | 增补溯源分级、币种口径、汇率口径、阶梯/峰谷说明、聚合源说明 |

客户端脚本仍只有两个：`api-table.ts`（筛选 + 重排）与 `calculator.ts`（计算）。二者只消费构建期已校验数据的 JSON 投影，不发网络请求。

## 9. 对 v0.1.0 的变更点

| 项 | v0.1.0 | v0.2.0 | 原因 |
|---|---|---|---|
| 价格真源 | `src/data/api-prices.ts` / `token-plans.ts`（TS 常量） | `src/data/entries/*.json` + `generated/*.json` | CLI 需要可机读、可原子改写、可 diff 的文件 |
| 币种 | `currency: 'USD'` 单值 | `billingCurrency: 'CNY'|'USD'` + 汇率换算 | 人民币为比较基准，同时保留账单真相 |
| 溯源 | 无（隐含全部官方核验） | `provenance` + `aggregateSource` + `aggregateFetchedAt` | 聚合补位必须显式降级标注 |
| Token Plan 币种字段 | `currency` | `billingCurrency` | 与 API 条目统一，避免两套命名 |
| 汇率 | 无（明确不做换算） | `generated/fx.generated.json`（CLI 维护，入库） | 需求改为人民币基准；仍坚持「不实时、只估算」 |
| 排序 | 原币种数值 | 人民币值（`cnyValue`） | 跨币种可比较 |
| 筛选项 | 查询 + 厂商 + 排序字段 | 增加「溯源」维度 | 需求要求官方/聚合可分视图 |
| 统计 | 页面内 `Set` 现算 | `src/lib/stats.ts` 纯函数，CLI 复用 | 防两处各写一份数字 |
| 页面 | 5 个 | 6 个（新增 `/sources/`） | 溯源可查 |
| 数据规模 | 2 厂商 / 3 条 | 15 厂商 / 120 条（47 official + 73 aggregate） | 需求下限 15 / 100 |
| 测试 | 4 文件 48 用例 | 7 文件 95 用例 | 新增汇率、溯源优先级、统计同源、CLI 失败路径 |

## 10. 测试矩阵

| 文件 | 覆盖 |
|---|---|
| `tests/schema.test.ts` | schema 严格性（负价、重复 id、缺 input/output、非 https、非 ISO 日期、非有限数、多余字段、official 缺来源、official 带聚合字段、aggregate 缺来源/缺抓取日期）+ 溯源合并四条规则 |
| `tests/fx.test.ts` | CNY 原样、USD×汇率、缺价 null、缺汇率抛错、标注文案 |
| `tests/pricing.test.ts` | 四类 token 汇总、fail closed、人民币口径、缺汇率拒绝、非法用量、筛选/溯源筛选/人民币排序/空值置后 |
| `tests/format.test.ts` | USD/CNY 格式化、双显示、溯源文案、单元格拆分 + 页面不得裸插值 nullable 价格 |
| `tests/stats.test.ts` | 统计自洽、覆盖率求和、与 CLI `verify --json` 完全一致 |
| `tests/data-cli.test.ts` | 帮助/未知命令、`add` 8 条失败路径（字节不变）、成功新增/`--force`、`verify --json`、`drift` 只读 + 变异报警 |
| `tests/client-scripts.test.ts` | 计算器 fail-closed、USD→人民币展示、CNY 官方原价、缺汇率拒绝、表格筛选与重排、溯源筛选 |

## 11. 未采纳方案

- **构建期抓官方页**：违反「构建期不发网络请求」，且让构建不可复现。
- **把汇率写进 TS 常量**：需求明确禁止；且汇率变动后无法追溯。
- **让 CLI 自己实现一套 schema**：必然与页面漂移，改为直接 import `src/lib/schema.ts`。
- **聚合条目按 id 覆盖同名模型**：会静默改写官方值，改为「同 id / 同模型一律官方胜出 + verify 显式列出被丢弃条目」。
- **为凑数收录冷门模型**：聚合补位按「每厂商最多 N 条、按发布日期倒序、只收对话模型」确定性挑选，厂商数达标但不灌水。
