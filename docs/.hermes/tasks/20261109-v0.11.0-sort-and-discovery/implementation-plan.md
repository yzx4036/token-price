# v0.11.0 实施计划

## 1. 总顺序与门禁

严格串行 A → B1 → B2。每批先写纯函数与 fixture 测试，再接 UI/CLI/workflow；最终执行 `node scripts/qa/run-gates.mjs`，测试总数不得低于 644（实证：`docs/.hermes/tasks/20261109-v0.11.0-sort-and-discovery/requirements.md:68-79`）。

## 2. A 批：全量排序

### 2.1 文件清单与步骤

1. 修改 `src/lib/pricing.ts`：新增 `valueInCny`，按字段选择币种 grouping，保留空值和 pending 规则（实证：`src/lib/pricing.ts:102-184`）。验证：`npx vitest run tests/pricing.test.ts`。
2. 修改 `src/lib/copy.ts` 与 `src/lib/fx.ts`：增加性价比折算/降级两条单一真源文案及格式化函数（实证：`src/lib/copy.ts:51-62`；`src/lib/fx.ts:24-37`）。验证：`npx vitest run tests/fx.test.ts tests/copy.test.ts tests/copy-guard.test.ts`。
3. 修改 `src/views/ApiPricingView.vue` 与 `src/components/PriceTable.vue`：在现有表级 note 显示动态口径，修正 caption、摘要和旧注释；`PriceCard.vue` 不改，新提示天然覆盖移动端（实证：`src/views/ApiPricingView.vue:145-164`；`src/components/PriceTable.vue:11-20,37`）。验证：`npm run typecheck && npm run build`。
4. 修改 `tests/pricing.test.ts`：保留价格字段旧序断言，新增跨币种排序、fx 降级与错币种报价用例（实证：`tests/pricing.test.ts:163-207`）。验证：`npx vitest run tests/pricing.test.ts`。
5. 跑回归探针：`node scripts/qa/chart-probe.mjs`、`node scripts/qa/copy-guard.mjs --dist dist`、`npm run metrics:copy:compare`（实证：图表边界 `tests/chart-geometry.test.ts:43`；任务书要求 `requirements.md:78-79`）。

### 2.2 判据与验证

| 判据 | 测试落点与断言名 |
|---|---|
| 智能指数 178 行整体单调不增、CNY/USD 可相邻、空值末尾 | `tests/pricing.test.ts`：`智能指数跨币种全量降序且空值统一置末` |
| 性价比按 CNY 单调不减 | 同文件：`性价比按报价币种折算到 CNY 后全量升序` |
| `reportedCurrency !== billingCurrency` 不误算 | 同文件：`聚合条目按报价币种折算性价比` |
| fx 缺失时分段且无 1:1 | 同文件：`性价比缺汇率退回币种分段且错币种报价置空` |
| 价格列与旧行为逐行一致 | 同文件：`价格字段仍保持 USD 前 CNY 后及组内原值序` |
| desc 空值末尾、pending 不前移 | 同文件：`全量降序仍把空值和 pending 置末` |
| URL 排序状态不退化 | 既有 URL 测试 + `node scripts/qa/run-gates.mjs`（实证：`src/views/ApiPricingView.vue:110-124`） |
| 文案单一真源且页面仅一处 | `tests/copy-guard.test.ts`：新增 `性价比排序声明不重复` |

## 3. B1 批：discover 消噪

### 3.1 文件清单与步骤

1. 新增 `scripts/data/config/provider-aliases.mjs`，只放五项人工确认的 alias → canonical 显式映射（实测：`.cache/models-dev.json` 的 name/family/name 对照，详见 architecture 候选表）。验证：`node scripts/data/cli.mjs discover --json --top 300`。
2. 修改 `scripts/data/lib/discover.mjs`：在 unknown 判定前应用映射，保留 before 集合，返回命中对照、前后数量和完整剩余清单；不改变 pull、squeezed 或文件写入（实证：`scripts/data/lib/discover.mjs:93-174`）。
3. 修改 `scripts/data/cli.mjs` 的 discover 帮助，说明显式归一和报告字段（实证：`scripts/data/cli.mjs:87-96,268-278`）。
4. 修改 `tests/discover.test.ts` fixture，加入三项必含 alias、两项扩展 alias 和一个拒绝映射渠道；执行 `npx vitest run tests/discover.test.ts`。
5. 执行真实缓存验收：`node scripts/data/cli.mjs discover --top 300`，预期 174 → 169，差 5，且剩余清单不含五项 alias。

### 3.2 判据与验证

| 判据 | 测试落点与断言名 |
|---|---|
| `zai/minimax/moonshotai` 不重复计数 | `tests/discover.test.ts`：`已知三项 alias 显式归一到国内主 key` |
| 扩展 alias 仅按表命中 | 同文件：`stepfun-ai 与 alibaba 命中而渠道候选保留` |
| 差值恰等于命中数 | 同文件：`归一前后差等于被移除 alias 集合大小`，同时集合全等 |
| 报告含对照、前后数、剩余清单 | 同文件：`文本与 JSON 报告解释全部归一命中` |
| 只读且不偷偷联网 | 保留 `tests/discover.test.ts:93-117` 两项既有断言 |

## 4. B2 批：官方页 diff 告警

### 4.1 文件清单与步骤

1. 新增 `scripts/data/lib/official-price-drift.mjs`，含三家配置、Markdown 抓取、三个显式 parser、canonicalize、SHA-256、diff 与格式化（实测 URL 与片段见 architecture M2 表）。验证：fixture 单测，不先联网。
2. 新增 `tests/fixtures/official-price-drift/deepseek.md`、`aliyun.md`、`volcengine.md`、`changed.md`、`invalid.md`，内容裁自 2026-11-09 官方响应且只保留解析所需表格（实测：M2 curl 响应）。
3. 新增 `tests/official-price-drift.test.ts`，注入 fetch 与基准；覆盖三 parser、未改、改价、超时、坏表格、确定性指纹（实证：任务书三输入要求 `requirements.md:57`）。验证：`npx vitest run tests/official-price-drift.test.ts`。
4. 修改 `scripts/data/cli.mjs`，新增 `official-price-drift` 帮助和 case；业务变化与逐厂商失败均返回 0（实证：现有 command 接线 `scripts/data/cli.mjs:248-278`）。验证：`node scripts/data/cli.mjs official-price-drift --json`。
5. 修改 `.github/workflows/data-refresh.yml`，在每周 report-only 区新增 summary step，命令后带 `|| echo`；不接 diff、commit、deploy 条件（实证：`.github/workflows/data-refresh.yml:122-190`）。验证：`npx vitest run tests/workflows.test.ts tests/data-cli.test.ts`。
6. 联网烟测：`node scripts/data/cli.mjs official-price-drift`；只核对状态和差异报告，不写任何仓库文件。

### 4.2 判据与验证

| 判据 | 测试落点与断言名 |
|---|---|
| 三家能抽取模型、输入、输出、CNY | `tests/official-price-drift.test.ts`：三项 `解析…官方 Markdown` |
| 无变化不报 | 同文件：`规范化集合一致时 unchanged` |
| 改价 fixture 报字段差异 | 同文件：`输入或输出改价时 changed 并列出旧新值` |
| 日期和无关文案不抖动 | 同文件：`更新时间与说明变化不改变指纹` |
| 抓取/解析失败告警且不阻塞 | 同文件：`超时与坏表格返回 unavailable 且 CLI 退出 0` |
| 不写数据、不提交、不部署 | `tests/workflows.test.ts`：`官方价格 drift 仅写 summary 且 report-only`；运行前后比较 `src/data` 文件清单与内容 hash |

## 5. 明确不碰

- 不修改 `src/data/**` 的任何既有文件或数据值；B2 基准只读 `src/data/entries/api.json`。
- 不修改 `src/lib/chart-geometry.ts`、`src/lib/pricing-chart-data.ts`、图表坐标、层切换路由或图表组件。
- 不在 `copy.ts` 文案真源以外新增页面中文硬编码；不在 `PriceCard.vue` 重复声明。
- 不改汇率值、评分值、套餐、官方历史；不加入运行时依赖；不把网络请求放进 `src/`。
- 不实现 #17 P2 套餐新档位发现，不执行 Git 操作。

## 6. 测试数量预估

- 基线 644。A 新增 7 项、B1 新增 4 项、B2 新增 8 项，预计净增 19 至 663 项；现有价格分组断言只改名不删除。
- 新测试主要落在 `tests/pricing.test.ts`、`tests/discover.test.ts`、新增 `tests/official-price-drift.test.ts`，另在 `tests/copy-guard.test.ts` 与 `tests/workflows.test.ts` 各补接入断言。
- 最终验证：`node scripts/qa/run-gates.mjs`；若实际计数低于 663，逐项核对计划断言，不得以合并用例掩盖缺口。
