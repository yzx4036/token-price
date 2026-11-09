
# v0.11.0 裁定 B 返工结果（2026-11-09）

状态：R12 七条已落实，执行体定向验证通过，待编排层复验；不宣告最终验收。任务 ID：`20261109-v0.11.0-sort-and-discovery`。

已读 RULINGS-B、仍有效的 RULINGS-A、上一轮 coding-result、task/status 及架构/计划。起始状态 implementing / codex-coding running。采用 project-coder 的 architecture-driven 局部返工路径；本次用户指令禁止构建与总门禁，优先于旧计划中的构建命令。原 coding-result.md 与状态文件未改。

## ① R12 七条逐项落点

| 条目 | 落点（当前 file:line） | 实现 |
|---|---|---|
| 1 单一折算真源 | `src/lib/pricing.ts:106`、`:114`；`src/lib/price-row.ts:55` | 导出 costPerPointInCny；其内部仅调用 convertAmount(costPerPoint, reportedCurrency, CNY, fx)。valueInCny 与 buildPriceRow 均调用它；无合法 fx 返回 null。valueInCny 无 fx 的旧分段原值/null 规则保持。 |
| 2 行模型携带展示值 | `src/lib/price-row.ts:8`、`:25`、`:47`、`:55`、`:73` | RowScore 增加 costPerPointCny、costPerPointText 及 title。原始 buildRowScore 不接收 fx，为遵守不改 benchmark-view.ts 的边界，原始评分类型允许尚未填充展示字段；PriceRow.score 的交叉类型强制三个展示字段齐全，统一由 buildPriceRow 补齐。原 costPerPoint 保持原始值。 |
| 3 表格/卡片用折算 ¥ 值与 title | `src/lib/price-row.ts:77`；`src/components/PriceTable.vue:100`；`src/components/PriceCard.vue:35`；`src/lib/copy.ts:68` | 格式沿用 formatCostPerPoint；组件直接输出预计算的 costPerPointText，title 给原币种符号/数字与 1 USD 汇率。 |
| 4 无 fx 明示降级 | `src/lib/pricing.ts:107`；`src/lib/price-row.ts:56`、`:77`；`src/components/PriceTable.vue:55`；`src/views/ApiPricingView.vue:151` | 无 fx 或 rate 为 0/NaN/Infinity，CNY 字段为 null，保留原报价币种；列头 title 与页面可见提示明确按币种分段。无 fx 的提示对所有排序模式可见，不受 value 筛选限制；移动标签使用原币种/分。无 1:1。 |
| 5 列头/标签随 fx 切换 | `src/components/PriceTable.vue:9`、`:21`、`:101`；`src/components/PriceCard.vue:36`；`src/views/ApiPricingView.vue:154`；`src/lib/copy.ts:62` | View 传 fx 给表格，computed 列头合法 fx 为性价比（¥/分），否则性价比；卡片 em 合法折算时为 ¥/分。新增中文真源均在 copy.ts。 |
| 6 结论卡只改展示 | `src/views/ApiPricingView.vue:100`、`:107`；`tests/value-display.test.ts:112` | rankable、rankByCurrency、all 排序与 best 选法原样保留；选出 best 后再经 buildPriceRow 取得与表格相同文本，note 注明按 ¥/分 展示。SSR 测试隔离性价比结论卡 li 验证，防止误匹配页面其他值。 |
| 7 口径句 | `src/lib/copy.ts:60`；`tests/fx.test.ts:7` | 改为“性价比统一按 CNY 折算展示与排序：1 USD = …”，保留当前汇率与日期填充，未修改 fx.ts。 |

## ② 同源断言写法与实测读数

新增 `tests/value-display.test.ts:38`。使用实际 178 条 apiPrices、benchmarkDoc、fxRate，先按 filterAndSortApiPrices(value asc) 排序，再用同一评分表 buildPriceRow，真实编译并 SSR 执行 PriceTable。逐行提取第六列，避免误取智能指数。

核心断言（`:50` 起）：

```ts
const sortValue = costPerPointInCny(entry, score.costPerPoint, fxRate);
expect(rows[index].score!.costPerPointCny).toBe(sortValue);
const expected = `¥${formatCostPerPoint(sortValue!)}`;
expect(rows[index].score!.costPerPointText).toBe(expected);
expect(numberIn(displayedText(cells[index])))
  .toBe(Number(formatCostPerPoint(sortValue!)));
expect(displayedText(cells[index])).toBe(expected);
```

真实测试包含无分和 null 分支保护。测试不另写 USD × rate 的第二套换算；额外检查 valueInCny 与 buildPriceRow 的源码接线均使用 costPerPointInCny。所有已显示有效值整体不降。排序保留未舍入数值，屏幕按既有格式舍入，因此数值断言在相同显示精度上比较；内部 costPerPointCny 与共享函数结果为严格相等。

实际 fx.rate = 6.690826，title 显示 6.6908。首五行：

| ID | 原始 costPerPoint | 共享函数返回 / 行 CNY 数值 | 表格显示 |
|---|---:|---:|---|
| claude-haiku-5-5 | 0.0055 | 0.036799543 | ¥0.0368 |
| zhipu-glm-5-3-flash | 0.0468 | 0.0468 | ¥0.0468 |
| openai-gpt-6-luna | 0.0072 | 0.048173947200000004 | ¥0.0482 |
| deepseek-deepseek-flash-idle | 0.0539 | 0.0539 | ¥0.0539 |
| minimax-minimax-m3-1-flash | 0.0605 | 0.0605 | ¥0.0605 |

无头 Edge 通过 CDP 打开 Vite 开发服务 `http://127.0.0.1:8831/api-pricing/?sort=value&order=asc`，1440×900 的真实 DOM 首五行与上表一致，列头为“性价比（¥/分）▲”，横向溢出 false。第一行 title 为“原币种 $0.00550，按 1 USD = 6.6908 CNY 折算”。结论卡仍选 claude-haiku-5-5，显示 ¥0.0368，note 为“Anthropic Claude Haiku 5.5 · 按 ¥/分 展示”。

同一浏览器切换 375×667，178 张卡片，首卡为“智能 36.23 Max 性价比 ¥0.0368 ¥/分”，横向溢出 false。开发服务已停止。这里是开发入口的客户端 DOM 实测，不能代替新 dist 水合复验：开发 HTML 仍含 app-html 占位符，createSSRApp 在其上启动会报初始 hydration mismatch；未越界修改入口或将此读数冒充生产 SSR 结果。

## ③ 变异证明：原始值红，恢复绿

实际临时修改 `PriceTable.vue`：重新导入 formatCostPerPoint，把唯一的 `{{ row.score.costPerPointText }}` 改成 `{{ formatCostPerPoint(row.score.costPerPoint) }}`，其余排序、行模型和测试不改。

命令：

```text
npx.cmd vitest run tests/value-display.test.ts -t 同源断言 --reporter=verbose --disableConsoleIntercept
```

实测 **exit 1，1 failed / 7 skipped**，红在 `tests/value-display.test.ts:55` 的数字断言：

```text
claude-haiku-5-5: expected 0.0055 to be 0.0368
Expected: 0.0368
Received: 0.0055
```

变异在 finally 中逐字节恢复，恢复核验 `RESTORED_BYTES_IDENTICAL=true`。恢复后定向回归 **11 files / 180 tests passed，exit 0**；类型检查 exit 0。新增 SSR 测试关闭 HMR，避免与既有图表 SSR 服务竞争默认端口；该测试配置调整后与图表 SSR 合跑 **2 files / 17 tests passed，exit 0**，无端口冲突提示。

## ④ fx = null 分支读数

`tests/value-display.test.ts:70` 参数化 null / 0 / NaN / Infinity。三行使用相同原始 costPerPoint = 0.0055：

| reportedCurrency / billingCurrency | costPerPointCny | costPerPointText |
|---|---|---|
| USD / USD | null | $0.00550 |
| CNY / CNY | null | ¥0.00550 |
| USD / CNY（聚合） | null | $0.00550 |

四种 fx 输入读数一致。真实 SSR 表格列头只有“性价比”，没有“性价比（¥/分）”，title 为“无汇率，性价比按币种分段比较。”；移动 em 为“原币种/分”。已有 pricing.test.ts 的无 fx 聚合条目不参与比较、升降序分段与空值置末断言仍通过。CNY 原值的符号仍为 ¥，但 CNY 折算字段为 null，不冒称本次完成了汇率换算。

## ⑤ 验证与红线自查

实际命令：

```text
npx.cmd vitest run tests/value-display.test.ts tests/pricing.test.ts tests/fx.test.ts tests/copy.test.ts tests/copy-guard.test.ts tests/ux-refactor.test.ts tests/benchmarks.test.ts tests/nobreak.test.ts tests/chart-geometry.test.ts tests/pricing-chart-data.test.ts tests/pricing-charts-render.test.ts --reporter=verbose --disableConsoleIntercept
# 11 files，180 passed，exit 0
npm.cmd run typecheck
# exit 0
npx.cmd vitest run tests/value-display.test.ts tests/pricing-charts-render.test.ts
# 最后一次测试配置调整后：2 files，17 passed，exit 0
```

- 手工改动仅 R12 六个源码文件、相关的 tests/fx.test.ts 与新增 tests/value-display.test.ts，以及本报告。未覆盖开工前上一轮脏改动；logs/fix.log 为本会话自动日志变化。
- 比较器 compareValues、filterAndSortApiPrices 结构及无 fx 分段规则未改；仅 valueInCny 的有 fx 折算调用改为共享函数。价格/上下文字段逐行旧比较器回归通过。结论卡选法未改。
- reportedCurrency 口径未改，USD 报价/CNY 账单用例仍按 USD 报价折算。
- 开工前后 src/data 全部 11 个文件清单及 SHA-256 一致；路径→SHA 映射的整体 hash 均为 `d3c69f96a22c43d0cfd89eb9c220bcc50883b8cd3c97cea02519bcee7bb5cff7`。
- 未改 benchmark-view.ts、fx.ts、依赖、样式、图表几何、图表数据建模或散点入图逻辑；图表几何/数据/SSR 定向回归通过。
- 已有文件保留 CRLF，新测试为 LF，所有手工新增/改动严格 UTF-8 解码通过。git diff --check 无空白错误（已有 LF 文件的 Git 行尾转换提示保留）。
- copy-guard.test.ts 中有/无 fx 文案夹具通过，免责要素 5/5；未将夹具读数冒充新 dist 上的 copy-guard、copy-density 或图表五档探针结果。
- 未跑 npm run build、build:client、build:ssr 或 run-gates.mjs；未更新现有 dist，未部署。未提交/改状态，按迭代架构“验收后由编排层一次交付提交”的约定交接文档与代码。

## ⑥ 待编排层复验项

1. 从当前源码构建新的 dist，再检查正式预渲染/水合下 `?sort=value&order=asc` 1440 首五行、375 卡片和结论卡，确认与上述读数一致。
2. 新 dist 上跑 copy-guard（声明各 ≤1、免责要素 5/5）和 copy-density --compare（退出 0）；默认页与 value 查询页均检查。无 fx 分支已在单测中渲染验证，正式构建如需故障注入由编排层安排。
3. chart-probe 五档不退化，完整门禁全绿；本报告的定向回归不替代总门禁。
4. 确认后交接 code_review / 跨家对抗审查、汇总交付提交及终验；本执行体不宣告验收完成。

建议索引: 跨币种展示排序同源与组件变异验证 → 墨典:_inbox/pending/codex-currency-display-sort-source.md#同源与变异（仅建议，本任务未写长期知识库）
