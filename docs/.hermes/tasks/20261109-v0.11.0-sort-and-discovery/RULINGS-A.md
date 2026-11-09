# 编排层裁定 A（v0.11.0 排序口径与数据发现增强）

> 设计稿 `architecture.md`（101 行）/ `implementation-plan.md`（84 行）已过证据门（PASS，0 缺文件 / 0 越界；3 条符号零命中均为计划新增的 `valueInCny` / `unavailable` 与组件文件名，属预期）。
> 编排层已独立复核 M2 三家可达性，读数与设计稿一致（见 R5）。以下为裁决，编码轮按此执行。

## R1 性价比折算按 `reportedCurrency`，不按 `billingCurrency` —— 采纳设计稿

- 依据：`blendPerMillion(item)` 直接用 `inputPrice` / `outputPrice`（`src/lib/benchmark-view.ts:38-42`），这两个值是**报价币种**（`reportedCurrency`）的原始数字；`costPerPoint = blend / score` 因此也是报价币种单位。
- 若按 `billingCurrency` 折算，会把「USD 报价、CNY 账单」的聚合条目错当人民币，反而不折算。**按 `reportedCurrency → CNY`**。
- 单位在代码注释里写清：`CNY / 智能分 / 百万混合 token`。

## R2 智能指数不分组 —— 采纳

分数无量纲，与币种无关，直接全表比。分组条件收敛为：`价格类字段`、`contextTokens`、`value 且无合法 fx`。

## R3 无 fx 时的性价比降级 —— 采纳，但补一条

`fx` 缺失/非法时：`value` 退回按币种分段；`reportedCurrency !== billingCurrency` 的条目返回 null（不参与比较），**禁止 1:1**。同时界面必须显示「无汇率，性价比按币种分段比较」提示，不许静默降级。

## R4 价格列行为不变 —— 强制

`inputPrice` / `outputPrice` / `contextTokens` 排序结果必须与改动前**逐行一致**。编码轮要给出改动前后同一 fixture 的输出对比（`tests/pricing.test.ts:163-180` 现有断言保留，只改用例名与描述，**不得放宽**）。

## R5 B2 三家可达性 —— 编排层已独立复核，准予实施

| 厂商 | 设计稿读数 | 编排层复核（2026-11-09） |
|---|---|---|
| DeepSeek `.md` | 200 / 10917 B | 200 / **10917 B**，含「百万」表头 7 处 |
| 阿里百炼 `.md` | 200 / 700820 B | 200 / **700820 B**，含表头 206 处 |
| 火山方舟 `.md` | 200 / 29175 B | 200 / **29175 B**，含表头 11 处 |

字节数逐一吻合，准予实施。**若实现期发现解析不稳，只许降级为「该厂商 unavailable」，不许回退解析 JS 壳、不许抓第三方镜像、不许拿旧值冒充新抓取。**

## R6 B1 归一表 —— 批准 5 条，附三条硬要求

批准：`zai→zhipuai`、`minimax→minimax-cn`、`moonshotai→moonshotai-cn`、`stepfun-ai→stepfun`、`alibaba→alibaba-cn`。

编排层已核 `providers.json` 主键：`stepfun → stepfun`、`aliyun → alibaba-cn`，别名方向正确。

硬要求：
1. 每条落表必须带注释：快照 name、共同模型名证据、人工确认日期。
2. 归一只影响「是否已覆盖」的报告判断，**不改变** pull 来源、`AGGREGATE_LIMITS` 与 squeezed 计算。
3. 报告里「归一掉的 alias」必须**单独成列可见**，不许静默消失——读者要知道国际站 key 存在但被归并。
4. 不落 `tencent-token-plan`、`google-vertex`、`google-vertex-anthropic`（渠道/跨品牌），设计稿判断正确，保持。

## R7 退出码语义 —— 采纳并收紧

`official-price-drift`：改价、未改价、抓取失败一律 **exit 0**（report-only，不阻塞数据刷新）；只有**参数错误**（未知参数、非法路径）才非 0。workflow 外层仍保留 `|| echo` 双保险。

## R8 新增文案必须过三道既有守卫

A 批会新增排序口径提示，硬要求：
1. 中文走 `copy.ts` 常量，模板不硬写；
2. `node scripts/qa/copy-guard.mjs --dist dist` 必须仍通过（声明各 ≤1、免责要素 5/5）——新提示与既有 `fx-disclaimer` / `cny-estimate` / `billing-currency` 不得撞句式；
3. `node scripts/metrics/copy-density.mjs --compare docs/metrics/copy-density-baseline.json --live <本地>` 必须仍退出码 0（`/api-pricing/` 1440 现为 134 字，阈值 220，有余量但别写成一大段）。

## R9 不做项（本迭代边界）

- #17 P2 套餐新档位发现：不做，已在任务书第八节登记偏差。
- 价格列跨币种排序：不做，维持分段。
- 图表几何与散点入图口径：不动。

## R10 编码执行体与效力

本轮编码由 **Codex**（`gpt-6.1-sol`, high）执行，与本迭代设计者（OpenCode）**不同厂商不同模型家族**，属有效跨家配对。编码完成后由编排层跑门禁与判据，再派对抗审查。
