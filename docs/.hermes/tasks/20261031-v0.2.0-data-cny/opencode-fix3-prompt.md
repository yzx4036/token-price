# 追加返工 R-03：国际厂商美元为主、人民币作估算副列

需求见 `requirements-addendum-cny.md`。**本条覆盖此前任何「人民币为主列」的写法**（含 `opencode-fix2-prompt.md` 中的展示规则表）。

上一轮 R-02/R-06 的结构改动（`reportedCurrency` 拆分、`verify --check-sources`）必须保留，不要回退。

## 只改展示层，不动数据

不修改任何 `inputPrice`/`outputPrice`/`cacheReadPrice`/`cacheWritePrice` 数值，不改 schema 字段。

## 规则

### `src/lib/format.ts`

1. `priceCells()` 的主/副行按**账单币种**决定：
   - `billingCurrency === 'CNY'`：`main = ¥x`、`sub = '官方原价'`（保持不变）。
   - `billingCurrency === 'USD'`：`main = $x`（美元原价），`sub = '≈ ¥y · 按 {rate} 估算（{date}）'`。
     - **主行必须是美元**，人民币只能在副行且必须带 `≈` 与「估算」。
     - 缺汇率时：`main` 仍显示美元原价，`sub = '汇率数据缺失，暂不给人民币估算'`，**不得 throw**、不得显示 0。
   - `reportedCurrency === 'USD'` 且 `billingCurrency === 'CNY'` 的聚合条目：`main = ¥x`，`sub = '聚合源 USD 折算 · 按 {rate} 估算'`，**禁止出现「官方原价」**。
2. `formatDualPrice()` 同步：USD 条目输出 `${formatUsdPrice}/1M · ≈ ¥x（按 … 估算）`。
3. 保留 `formatUsdPrice` / `formatCnyPrice` 的原有守卫测试（`待核验` 占位）。

### `src/pages/api-pricing.astro`

- 列头改为：`输入（原币种）/1M`、`输出（原币种）/1M` …（若已有列头文案是「输入 ¥/1M」必须改，否则列头与内容不符）。
- 排序：默认按**美元值优先**比较 —— USD 条目按其美元值参与排序，CNY 条目按其人民币值；两者**不得直接混排成一个「最便宜」榜首**。若现有排序是混排，改为「同币种内排序，跨币种不排名」或按估值折算并显式标注「按估算汇率折算」。
- 页面顶部或表格上方加一行提示：**「美元为厂商原价；人民币为按 {rate} 估算的参考值，汇率随时变化，不准确。」**

### `src/pages/calculator.astro`

- 标题与描述去掉「（人民币）」的绝对化表述，改为「成本计算器」。
- 结果区双值：`$x.xx`（主）+ `≈ ¥y.yy（按 6.6696 估算 · 2026-10-31）`（副）；选中国内厂商模型时以 `¥` 为主且不带估算标注。
- 缺汇率：美元结果照常给出，人民币位置显示「汇率缺失，无法估算」，不得 fail 掉整个计算（美元部分仍有效）；若模型是 CNY 币种则完全不需要汇率，不得因缺汇率而报错。

### 免责文案（三处必须一致）

`api-pricing.astro`、`calculator.astro`、`methodology.astro`、`sources.astro` 都要出现这句或等效表述：

> 汇率随时变化，人民币数值为按某日汇率估算的参考值，不准确；最终账单以厂商原币种为准。

## 测试

- `priceCells` 对 USD 条目：`main` 以 `$` 开头、`sub` 含 `≈` 与 `估算` 与日期；不含「官方原价」。
- `priceCells` 对 CNY official：`main` 以 `¥` 开头、`sub === '官方原价'`。
- `priceCells` 对 CN 厂商 + reportedCurrency=USD 的聚合条目：`sub` 含「折算」，不含「官方原价」。
- 缺汇率时 USD 条目：`main` 仍为 `$` 值、`sub` 含「汇率数据缺失」，不抛错。
- 计算器：USD 模型输出含 `$` 与 `≈ ¥`；CNY 模型输出以 `¥` 为主不含 `≈`。
- 原有测试保留；若断言写死了「人民币为主」，改成新口径并说明。

## 门禁（全绿并贴真实输出）

```bash
npm run typecheck
npm test -- --run
npm run build
node scripts/data/cli.mjs verify
```

## 产物自检（贴 grep 结果）

```bash
# 国际厂商行必须同时有 $ 与 ≈ ¥
grep -o 'GPT-6 Astra.\{0,400\}' dist/api-pricing/index.html | head -2
# 国内厂商行不得出现「估算」
grep -o 'GLM-5.3-Flash.\{0,300\}' dist/api-pricing/index.html | head -2
# 全站不得把 USD 估算写成官方人民币价
grep -c '官方原价 ¥' dist/api-pricing/index.html   # 期望 0
```
