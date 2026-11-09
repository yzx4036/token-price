# 编排层裁定 B（v0.11.0）—— 性价比「展示值与排序值不一致」

## R11 触发原因（编排层真人实测，不是猜的）

A 批把排序改成「性价比折算 CNY 后全表比较」，但**表格里显示的仍是原始币种数值**。1440 视口实测 `?sort=value&order=asc` 首三行：

```
1. USD 0.0055  Anthropic Claude Haiku 5
2. CNY 0.0468  智谱 GLM GLM-5.3-Flash
3. USD 0.0072  OpenAI GPT-6 Luna
```

按折算后的人民币值排序是**正确**的（0.0055×6.6908=0.0368 < 0.0468 < 0.0072×6.6908=0.0482），但用户看到的数字是 0.0055 → 0.0468 → 0.0072，**看起来就是没排序**。

结论：排序口径改了，展示口径没跟上。这是真实缺陷，必须修——**同一个数字，排序依据和显示值必须是同一个**。

## R12 修法（钉死，不许自由发挥）

1. **单一真源**：`src/lib/pricing.ts` 导出 `costPerPointInCny(entry, costPerPoint, fx): number | null`，内部与 `valueInCny` 复用同一段折算逻辑（`reportedCurrency → CNY`），排序与展示都调它。
2. **行数据带展示值**：`RowScore` 增加 `costPerPointCny: number | null` 与 `costPerPointText: string`，在 `buildPriceRow(item, fx, score)` 里算好（该函数已有 `fx` 参数）。
3. **展示文本**：有 fx 且可折算 → 显示折算后的 `¥` 值（沿用 `formatCostPerPoint` 的位数规则）；`title` 里给原始值 + 汇率，例如「原币种 $0.0055，按 1 USD = 6.6908 CNY 折算」。
4. **无 fx 时**：`costPerPointText` 用原始币种值，列头/提示明说「无汇率，按币种分段比较」——不许 1:1 兜底，不许静默降级。
5. **列头/标签**：`PriceTable` 列头在有 fx 时写「性价比（¥/分）」，无 fx 时写「性价比」；`PriceCard` 的 `<em>每分</em>` 改「¥/分」。
6. **结论卡**：`ApiPricingView` 的「性价比最优」**选法不变**（仍是同币种内最低），但展示同样折算成 ¥/分，并在 note 里注明「按 ¥/分 展示」，避免同页出现两种量纲。
7. **口径文案**：`copy.ts` 里现有那句「性价比排序统一用 CNY：1 USD = …」改成同时覆盖展示——「性价比统一按 CNY 折算展示与排序：1 USD = …」。

## 判据（编排层会用这些复验）

1. 单测：对同一 fixture，**表格 `costPerPointText` 的数值 == 排序时用的折算值**（同源断言，不能各算一遍）。
2. 单测：`fx = null` 时 `costPerPointCny` 为 null、`costPerPointText` 回落到原始值，且列头文案切换。
3. 变异：把展示改回 `formatCostPerPoint(row.score.costPerPoint)`（原始值），第 1 条断言必须红。
4. 真机/无头实测：`?sort=value&order=asc` 首 5 行的**显示值**（去掉符号后）整体不降；不得再出现 0.0055 → 0.0468 → 0.0072 这种「看着没排序」的序列。
5. `copy-guard` 仍通过（声明各 ≤1、免责要素 5/5）；`--compare` 仍退出码 0；`chart-probe` 五档不退化。
6. 门禁全绿。

## 边界

- 只动展示与文案接线：`src/lib/pricing.ts`（导出函数）、`src/lib/price-row.ts`、`src/components/PriceTable.vue`、`src/components/PriceCard.vue`、`src/views/ApiPricingView.vue`、`src/lib/copy.ts` 与相关测试。
- **不动**：排序比较器结构、`reportedCurrency` 折算口径、数据文件、图表几何、散点入图逻辑。
