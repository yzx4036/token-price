# v0.11.0 排序与数据发现架构设计

## 1. 范围、顺序与实测基线

- 固定按 A → B1 → B2 实施；A 与 B1 无文件交集。只设计，不改源码、数据值或 Git。
- 红线：不引运行时依赖；网络只在 CLI；B2 只告警；不碰图表几何；UTF-8 与既有行尾不变。
- M1：用 Node 25 + Vite `ssrLoadModule` 直接调用 `filterAndSortApiPrices`，得到 178 行、USD 88 行、CNY 90 行；唯一切换点为索引 88（第 89 行），前项 `meta-muse-wonder-1-0` 无分，后项 `moonshot-kimi-k3-1-pro` 为 46 分（实测：`node C:/Users/E_Ye/AppData/Local/Temp/opencode/m1-sort-baseline.mjs`）。
- M3 前提已满足：`.cache/models-dev.json` 存在；当前 `discover` 为 235 个 provider、16 个已映射 key、174 个未收录、其中 33 个非转售（实测：`node scripts/data/cli.mjs discover --json --top 300`）。若缓存不存在，须先显式执行 `node scripts/data/cli.mjs discover --pull`；命令默认禁止偷偷联网（实证：`scripts/data/lib/discover.mjs:80-91`）。

## 2. A 批：排序

### 2.1 比较器最终形状

币种分组只对 `PRICE_FIELDS`、`contextTokens`，以及“`value` 但无合法 fx”生效；`provider` 与 `intelligence` 让位给字段值全量排序。智能指数无量纲，不再 grouping（实证：`src/lib/pricing.ts:12-19,114-117`）；价格类保持分段符合 D3。

```text
groupByCurrency = PRICE_FIELDS 含 sortBy || sortBy === contextTokens
                  || (sortBy === value && !validFx(fx))
compare(a, b):
  if groupByCurrency && billingCurrency 不同: return USD 在前
  if status 不同: return verified 在前
  av = verified ? sortValue(a) : null；bv 同理
  cmp = compareValues(av, bv)
  if 任一为空: return cmp                         // 不反转，空值永远末尾
  if cmp != 0: return cmp * direction
  return model 中文序
```

该顺序使智能指数和有 fx 的性价比全表比较；价格列逐行行为不变；`pending` 仍在各排序域的已核验项之后（实证：`src/lib/pricing.ts:172-184`）。

### 2.2 性价比折算

- 在 `pricing.ts` 新增私有 `valueInCny(entry, fx, scores): number | null`（实测依据：当前 `costPerPoint` 来自原始报价币种，`src/lib/benchmark-view.ts:57-67`）。单位写为“CNY / 智能分 / 百万混合 token”。
- 取 `scores[entry.id].costPerPoint`，按 `entry.reportedCurrency → CNY` 调 `convertAmount`；不能按 `billingCurrency`，否则会把“USD 报价、CNY 账单”的聚合条目误作人民币（实证：`scripts/data/lib/pull.mjs:91-105`）。
- fx 合法时，`sortValue` 的 `value` 分支返回 CNY 值；fx 缺失/非法时，`reportedCurrency === billingCurrency` 才返回原值，币种分段生效；币种不一致者返回 null，禁止 1:1 兜底（实证：`src/lib/fx.ts:62-71`）。
- `rankByCurrency` 继续用于结论卡，不属于表格排序，不在 A 批改变（实证：`src/views/ApiPricingView.vue:87-105`）。

### 2.3 口径提示与文案去重

- 在 `copy.ts` 增加 `VALUE_SORT_CNY_NOTE_TEMPLATE` 与 `VALUE_SORT_NO_FX_NOTE`（实测依据：`copy-guard` 以 `copy.ts` 模板为声明真源，`src/lib/copy.ts:51-62`）。
- 在 `fx.ts` 增加 `valueSortNote(fx)` 填入汇率与日期（实测依据：已有 `FX_TABLE_NOTE` 同型实现，`src/lib/fx.ts:24-31`）。
- 可见提示放 `ApiPricingView` 现有 `.table-note`，仅 `sortBy === 'value'` 时追加；有 fx 说明统一折算 CNY，无 fx 明说按币种分段。此位置同时覆盖桌面表格和移动卡片（实证：`src/views/ApiPricingView.vue:145-153`）。
- 同步改表格 caption 和页尾排序摘要，移除“所有字段都跨币种不排名”的过时陈述，但不在 `PriceTable.vue`、`PriceCard.vue` 硬写新中文（实证：`src/components/PriceTable.vue:37`；`src/views/ApiPricingView.vue:162-174`）。

### 2.4 现有断言盘点

- `tests/pricing.test.ts:163-180` 明确断言 USD 连续在前、CNY 连续在后；它只测 `outputPrice`，按 D3 不改期望，改用例名为“价格字段仍按账单币种分组”，并新增智能指数反例。
- `tests/pricing.test.ts:134` 的 describe 文案把全部排序概括成“跨币种不排名”，改成“按字段选择跨币种口径”；它不是断言。
- 其余排序断言没有“USD 恒在前”前提；`tests/benchmarks.test.ts:193-199` 只验证结论卡按币种分组，不改。

## 3. B1 批：discover 消噪

### 3.1 显式归一表与候选实测

新增 `scripts/data/config/provider-aliases.mjs`，导出冻结对象 `DISCOVER_PROVIDER_ALIASES`，键为快照 alias key，值为 `providers.json.aggregateProvider` 主 key；每项同行注释“快照 name、共同模型族、人工确认日期”，禁止运行时相似度猜测（实测依据：`.cache/models-dev.json` 与 `src/data/providers.json:3-144`）。归一只影响“是否已覆盖”的报告判断，不改变 pull 来源和 squeezed 计算。

| 候选 key | 主 key | name / creator 证据 | 共同模型族 | 决策 |
|---|---|---|---|---|
| `zai` | `zhipuai` | Z.AI / Zhipu AI | glm、glm-flash、glm-air，样本序列相同 | 落表 |
| `minimax` | `minimax-cn` | MiniMax `.io` / `.cn` | minimax，8 个模型名相同 | 落表 |
| `moonshotai` | `moonshotai-cn` | Moonshot AI / China | kimi-k2、kimi-k3，6 个模型名相同 | 落表 |
| `stepfun-ai` | `stepfun` | StepFun Global / China | step，7 个模型名相同 | 落表 |
| `alibaba` | `alibaba-cn` | Alibaba / China | qwen、glm、deepseek-flash 等 | 落表 |
| `tencent-token-plan` | `tencent-tokenhub` | Tencent Token Plan / TokenHub | Hy | 不落；产品渠道不同，避免隐藏独立候选 |
| `google-vertex` | `google` | Vertex / Google | 部分 Gemini | 不落；Vertex 横跨 Claude、Mistral，属于渠道 |
| `google-vertex-anthropic` | `anthropic` | Vertex (Anthropic) / Anthropic | Claude | 不落；渠道不同 |

以上读数来自 provider `name` 与模型 `family/name`；快照无独立 `creator` 字段，不能伪称已读 creator（实测：Node 扫描 `.cache/models-dev.json`）。当前五项落表均命中 unknown，预计 174 → 169、非转售 33 → 28。

### 3.2 报告与可证明判据

- 结果新增 `normalizations: [{ alias, canonical }]`、`unknownBefore`、`unknownAfter`、`normalizationHits`、`unknownAfterNormalization`（实测依据：当前返回字段位于 `scripts/data/lib/discover.mjs:161-174`）。
- 文本报告先打印归一对照表，再打印“归一前 / 后 / 差 / 命中数”，最后列“归一后仍未收录”；JSON 保留完整清单，`--top` 只截展示。
- 定义命中为“原始 unknown 中出现且主 key 已在 coveredKeys 的不同 alias 数”；用集合差计算。测试断言 `unknownBefore - unknownAfter === normalizationHits`，并断言被移除集合恰等于命中 alias 集合，排除靠重复计数凑等式。

## 4. B2 批：官方价格页 diff 告警

### 4.1 M2 可行性实测

| 厂商 | 页面 / Markdown / llms.txt 实测 | 稳定结构化证据 | robots.txt | 结论 |
|---|---|---|---|---|
| DeepSeek | 页面 200、7393 B、1.366 s；`.md` 200、10917 B、0.098 s；llms 200、8492 B、0.202 s | Markdown 表含 `deepseek-flash`，缓存未命中输入 1/2 元、输出 4/8 元，币种“元” | 200、132 B；`User-agent: * Allow: /` | 可用 |
| 阿里百炼 | 旧 URL 跳到 `model-pricing`：页面 200、84219 B、0.850 s；`.md` 200、700820 B、1.181 s；`/zh/llms.txt` 200、86007 B | 表头为模型 ID、输入/输出每百万 Token；`qwen3.8-max` 为 12/36 元 | 200、213 B；仅禁 `/search?*`，并声明 LLMS | 可用 |
| 火山方舟 | canonical Markdown 200、29175 B、0.300 s；产品 llms 200、30173 B、0.371 s；旧页虽 200 但仅 2166 B 跳转壳 | `doubao-seed-evolving` 行为输入 6.00、输出 30.00，表头明确元/百万 token | 200、426 B；普通 UA 禁 search、`/api/`，文档路径未禁；AI crawler Allow `/` | 可用 |

实测命令统一为 `curl -L --compressed -A token-price-design-probe/1.0 --max-time 30 -w ...`，日期 2026-11-09。三家均有可解析 Markdown，故“需 JS / 已验证不可用”当前为空；若未来 Markdown 失效则降级为告警，不回退解析 JS 壳。

### 4.2 抓取、解析、基准与指纹

- 新增 `scripts/data/lib/official-price-drift.mjs`，入口 `runOfficialPriceDriftCommand`（实测依据：现有只读命令模式见 `scripts/data/lib/plans-drift.mjs`，CLI 接线见 `scripts/data/cli.mjs:248-278`）。
- URL：DeepSeek `https://api-docs.deepseek.com/zh-cn/quick_start/pricing.md`；阿里 `https://help.aliyun.com/zh/model-studio/model-pricing.md`；火山 `https://docs.volcengine.com/docs/zh/ark/model-pricing.md`（实测：上表）。
- 三个显式 parser 输出 `{providerId, model, condition, currency:'CNY', input, output, cacheRead}`；只取仓库已收录模型及其常规/首档/峰谷条件，不做模糊模型匹配。表头缺失、重复键或数值非有限即该厂商“无法判定”。
- 基准直接取 `src/data/entries/api.json` 中三家 `official + verified` 条目（实证：DeepSeek `src/data/entries/api.json:3-88`、阿里 `:91-330`、火山 `:333-550`）；不新增指纹文件，不进入构建产物。
- 指纹为上述结构按 `providerId/model/condition` 排序、数值规范化后的 JSON，再用 Node `crypto` SHA-256；排除抓取时间、更新时间、说明文案和 HTML，避免日期与无关文案抖动。比对同时保留逐字段 diff，不能只报 hash。

### 4.3 告警与 workflow

- 报告先给厂商表“HTTP / 解析行数 / 基准行数 / unchanged|changed|unavailable”，再给差异表“模型 / 条件 / 字段 / 仓库值 / 官网值”，最后列失败原因与 URL。
- CLI 子命令 `official-price-drift` 在改价时仍退出 0；抓取超时、非 200、解析失败均被逐厂商捕获为 `unavailable` 且退出 0。参数错误才非 0；workflow 外层仍加 `|| echo` 双保险（实证：现有 report-only 写法 `.github/workflows/data-refresh.yml:127-162`）。
- workflow 仅在每周 pull 后把报告追加 `$GITHUB_STEP_SUMMARY`；命令不写文件，因此不会进入 `git add src/data`、不会触发提交或部署（实证：`.github/workflows/data-refresh.yml:164-190`）。
- 若某家以后不可用，只继续支持仍能稳定解析的厂商，并在“已验证不可用”列 URL、状态和原因；不抓第三方镜像、不把旧值冒充新抓取结果，因为操作成功不等于能力已验证。
