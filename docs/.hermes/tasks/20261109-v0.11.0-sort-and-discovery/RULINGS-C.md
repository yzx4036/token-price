# 编排层裁定 C（v0.11.0）—— 审查后收口

审查 `REVIEW-OPENCODE.md` 判定 `approved-with-conditions`，无阻断；3 条 Medium 必须收口，部分 Low 顺手修，其余登记不改。

## R13 结论卡「性价比最优」的选法与展示必须同口径 —— 改选法（不打补丁改文案）

- 现状：`ApiPricingView.vue:97-98` 用**跨币种原始 `costPerPoint`** 取最小，展示却是折算后的 `¥/分`；无 fx 时 note 还写「按币种分段比较」，与选法相反。
- 裁定：**有合法 fx 时用 `costPerPointInCny` 选最小**（全表比较，与排序同口径）；**无 fx 时按币种分组各选最优**，note 写明「无汇率，按币种分段」。
- note 文案随之调整，禁止再出现「选法一套、说明另一套」。
- 必须补反例测试：构造「USD 原始值 0.0055、CNY 原始值 0.02」的 fixture，断言有 fx 时选中 USD 条目（0.0368 > 0.02 → 实际应选 CNY 条目），把期望值**由测试独立计算**（不调用被测函数取期望）。

## R14 `discover --top` / `--cache-file` 缺值必须报错

- 现状：`scripts/data/lib/io.mjs:85-90` + `cli.mjs:279-280` 缺值时静默回落默认值并 exit 0，违反「入口参数禁止无意义 fallback」。
- 裁定：`flags.has('top') || flags.has('cache-file')` 但无值时抛 `BAD_ARGUMENT`（非 0）。补无值用例。

## R15 基准数据损坏必须非 0

- 现状：`official-price-drift.mjs:276,282,295` 在价格基准 JSON 不可解析时，三家全 `unavailable` 且 **exit 0**，与「官网抓不到」同形，仓库坏了 CI 仍绿。
- 裁定：**基准侧**不可解析/字段缺失 → 抛 `CliError`（非 0）；**只有官网侧**失败才 `unavailable` + exit 0。补两条用例分别覆盖。

## R16 顺手修（Low，成本低）

1. N-5 `tests/ux-refactor.test.ts` 的 `GROUPED_KEYS` 补回 `cacheReadPrice` / `cacheWritePrice`（`valueFor` 已支持）。
2. N-7 `tests/value-display.test.ts:64-65` 的源码字符串断言删掉（可被注释绕过），由行为断言承担。
3. N-11 `copy.ts:73` `API_SORT_SUMMARY` 补一句「有汇率时性价比也全表排序」。
4. N-4 `cli.mjs:98` 与 `discover.mjs:9` 的「只读，不写任何数据文件」改为「不加 `--pull` 时只读；加 `--pull` 会更新聚合快照与生成物」。

## R17 登记不改（写进终验报告遗留段）

- N-6 值合法性三处各写一份（今天等价）→ 留待后续统一 `normalizeCostPerPoint()`。
- N-9 无 fx 退化态下 `aggregate` 行的展示/排序错位（仅在无汇率时出现）。
- N-10 `costPerPoint` 为负时卡片单位显示（现实不可达）。
- N-12 `diffOfficialPrices` 的 `currency` 分支永不触发（防御性代码）。

## 判据
1. 门禁全绿；`copy-guard`、`--compare`、`chart-probe` 五档维持通过。
2. 结论卡：有 fx 时选中的条目 == 折算后最小值（测试独立计算期望）；无 fx 时按币种分组。
3. `discover --top`（缺值）exit 非 0；`--top 2` 正常。
4. 基准损坏 → exit 非 0；官网 404 → exit 0 且该厂商 `unavailable`。
5. 上述每条各给一个变异证明（改回旧行为必须变红）。
