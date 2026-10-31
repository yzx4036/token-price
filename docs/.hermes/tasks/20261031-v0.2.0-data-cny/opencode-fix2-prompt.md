# 返工 R-02 / R-06：币种模型拆分 + verify 可达性抽查

Codex 对抗审计返回 `needs_architecture`，两项待返工。以下是**架构裁定**，按此实现，不要再另方案。

当前基线：typecheck 0 errors / 97 tests / 6 pages / `verify` RC=0（15 厂商 · 168 条 · official 122 · aggregate 46）。

## 铁律

1. **不做任何 git 操作**。
2. 不放宽断言、不删用例；改断言值需说明原因。
3. 不编造价格：只改字段语义与展示，不改任何已有 official 数字。
4. 只做下面两项 + 必带的文案同步，不顺手重构其它模块。

---

## R-02 币种模型拆分（架构裁定：采用「拆分 reportedCurrency」方案）

### 问题

`billingCurrency` 同时被当作两件事用：厂商账单币种、聚合源发布数字所用币种。国内厂商（Kimi/小米/阶跃/智谱残条）的 aggregate 行因此写成 USD，页面「国内厂商即官方原价」的规则被破坏。

### 已查明的事实（实测，可复算）

models.dev 对**国内厂商也以 USD 发布**，且该 USD 值 = 厂商人民币挂牌价 ÷ 汇率：

- `moonshotai-cn / kimi-k3.1-pro` input `1.9437`；`1.9437 × 6.669566 = 12.96` CNY
- `zhipuai / glm-5.3` input `1.19516`；`1.19516 × 6.669566 = 7.97` CNY ≈ 官方页 ¥8
- `stepfun / step-3.5-flash-2603` input `0.10461` → `0.6977` CNY ≈ ¥0.70

结论：这些厂商的**账单币种是 CNY 没错**，错的是把「源报价币种」记进了 `billingCurrency`。

### 实现

1. `apiPriceSchema` 新增必填字段 `reportedCurrency: 'CNY' | 'USD'` = **这条数字本身以什么币种表达**。
2. `billingCurrency` 语义固定为**厂商实际账单币种**。
3. 新增不变式（superRefine）：`provenance === 'official'` 时必须有 `reportedCurrency === billingCurrency`（官方页标 CNY 就都 CNY，标 USD 就都 USD）。违反即 schema 报错。
4. `pull`（`scripts/data/lib/pull.mjs`）生成的聚合条目：
   - `reportedCurrency` 恒为 `'USD'`（models.dev 事实）；
   - `billingCurrency` 按该厂商 `providers.json` 的 `region`：`cn` → `'CNY'`，`intl` → `'USD'`；
   - `notes` 里写清楚「聚合源以 USD 发布，折算自厂商人民币挂牌价，未逐条核官方」。
5. `providers.json`：`moonshot` 的 `aggregateProvider` 改为 `moonshotai-cn`（国内端点，价格更贴近大陆挂牌价）。`xiaomi` / `stepfun` 无 `-cn` 变体，保持不动。
6. **数据迁移**：`src/data/entries/api.json` 的 122 条 official 条目补 `reportedCurrency`，值等于其 `billingCurrency`。之后跑一次 `node scripts/data/cli.mjs pull` 重建 `aggregate.generated.json`。

### 展示规则（api-pricing 表 / calculator / sources 页）

| 条件 | 主价格标注 | 计价说明 |
|---|---|---|
| `official` + CNY | 「官方原价」 | 人民币原价，无需换算 |
| `official` + USD | 「按 {rate} 汇率估算（{date}）」+「$x 原价」 | 账单以美元为准 |
| `aggregate` + `billingCurrency=CNY` + `reportedCurrency=USD` | 「聚合数据 · 聚合源 USD 折算」+ 折算后 ¥ 值 | **禁止**出现「官方原价」字样 |
| `aggregate` + USD | 「聚合数据 · USD」+「按…估算」 | 同上 |

- `sources.ts` 的「需要汇率换算的条目占比」改为按 `reportedCurrency === 'USD'` 计算（不是 `billingCurrency`）。
- `stats.ts` 若按币种统计，区分 `billingCurrency`（账单）与 `reportedCurrency`（报价），页面两处数字都要自洽。

### 文案同步（必做）

删掉 `src/pages/methodology.astro` 里这段过时说明：「聚合数据：OpenAI 官方定价页对脚本返回 403，Kimi 与智谱的定价页为 JS 渲染，静态抓取拿不到价格表」。改为当前真实情况：

- 可用 `页面 URL + .md` 或 `llms.txt` 直接取到官方价格表：OpenAI、智谱、xAI、Mistral；
- 仍只走聚合的：Kimi、小米、阶跃、Cohere（其 Standard Vault 按实例小时计费，与 per-token 不可比）、Meta；
- 国内厂商的聚合条目：聚合源以 USD 发布、折算自人民币挂牌价，因此标「聚合折算」而非「官方原价」。

---

## R-06 verify 来源可达性抽查（架构裁定：默认关闭的独立开关）

需求要求 `verify` 做来源可达性抽查，但发布门禁不得依赖网络。故：

1. 新增 `node scripts/data/cli.mjs verify --check-sources`，**默认不开**。
2. 开启时：对去重后的 `official` 条目的 `sourceUrl` 做可达性探测——超时 8 秒、跟随重定向、最多探测 12 个唯一 URL、串行。
3. 结果只产出**提醒**级别：`HTTP 403`、JS 空壳页（正文 < 500 字符）都算提醒，不算严重；**永不改变退出码**（可达性失败 → RC 仍由 schema/完整性决定）。
4. `--json` 输出新增 `reachability: { checked, ok, failed: [...] }` 字段。
5. `publish` **不**调用该开关，保持发布可复现、无网络。
6. `--help` 与 `README.md` 补该命令说明，并写明「这是抽查，不是发布门禁」。

---

## 测试要求（新增）

- official 条目 `reportedCurrency !== billingCurrency` 时 schema 报错（造变异，确认翻红）。
- 聚合 CN 厂商条目的展示标签**不含**「官方原价」；聚合 USD 条目含「聚合数据」。
- `verify --check-sources` 注入一个不可达 URL（用 `http://127.0.0.1:9/x` 或可注入的假 URL）→ 产出提醒，RC 仍为 0，`--json` 含 `reachability`。
- `sources` 页占比按 `reportedCurrency` 计算（与 stats 同源）。
- 原有 97 个用例保留。

## 门禁（全绿并贴真实输出）

```bash
npm run typecheck
npm test -- --run
npm run build
node scripts/data/cli.mjs verify
node scripts/data/cli.mjs verify --check-sources --json
node scripts/data/cli.mjs drift
```

## 完成标准

- `verify` 输出中不再出现「国内厂商 aggregate 却是 USD 账单币种」的矛盾（报告里要能看出：按账单币种统计 CNY 条数增加、按报价币种统计 USD 条数增加）。
- 页面无任何 aggregate 行被标成「官方原价」。
- 上述门禁全绿，`status.json` 的 `stage` 置 `implementation_done_r3`，并在 `coding-result.md` 追加「R-02/R-06 返工记录」小节（含改动文件清单与门禁真实输出）。
