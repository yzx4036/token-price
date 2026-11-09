# 本迭代 issue 全文（dossier）

## #18 智能指数与性价比在「全部厂商」下应全量排序，不再被币种分组切断

## 一、现象（实测，非推测）

在 `/api-pricing/?sort=intelligence&order=desc`、厂商筛「全部」的状态下，**排序被账单币种硬切成两段**：

- 全表 178 行，第 **1–88 行**全是 USD 记账条目，第 **89–178 行**才是 CNY 记账条目（实测切换发生在索引 88）。
- 更明显的是断点两侧的数值倒挂：USD 组末尾几条是**无智能分（—）**的聚合条目，而紧接着的 CNY 组第一条是 **Kimi K3.1 Pro 46.00 分**、第二条 **qwen3.8-max 33.55 分**。

也就是说：**46 分的模型排在一堆「没有分」的条目后面**，只因为它的账单币种是人民币。用户看到的结果不是「智能指数从高到低」，而是「美元条目按分排完，人民币条目重来一遍」。

根源在 `src/lib/pricing.ts:172-185`：

```ts
.sort((a, b) => {
  // 分组优先：desc 也不能把 CNY 组翻到 USD 组前面
  if (a.billingCurrency !== b.billingCurrency) {
    return currencyRank(a.billingCurrency) - currencyRank(b.billingCurrency);
  }
  ...
```

币种比较排在排序字段之前，任何字段（含智能指数、性价比）都被它截断。函数头注释 `src/lib/pricing.ts:138-143` 也明写了「按账单币种分组，跨币种不直接比较」。

## 二、期望

**当筛「全部厂商」时，智能指数与性价比两列直接全量排序**，不按国内/国外、也不按币种切段：178 行作为**一个序列**降序/升序，空值统一置末。

选单个厂商时同样走全量排序（此时通常只有一种币种，结果与现状一致，无副作用）。

## 三、两列的前提不同，必须区别对待

| 列 | 能否直接跨币种比较 | 依据 |
|---|---|---|
| **智能指数** | 可以 | 分数无量纲（0–100），`sortValue` 直接返回 `score`（`src/lib/pricing.ts:114-117`），与币种无关 |
| **性价比** | **不可以直接比** | 性价比 = 每分智能成本 `costPerPoint`，由 `blendPerMillion(item) / score` 得出（`src/lib/benchmark-view.ts:66`），**单位是各条目自己的账单币种**。¥0.5/分 与 $0.5/分 相差约 6.69 倍，直接排序等于把两种货币的量纲混在一起 |

所以性价比要全量排序，必须**先把 `costPerPoint` 折算到统一币种**（用站点现成汇率，当前 1 USD = 6.6908 CNY），并在界面标注该口径（例如表头提示「性价比跨币种按 1 USD = 6.6908 CNY 折算后比较」）。没有汇率数据时（`fx` 为 null）应**退回按币种分段**，不许用 1:1 兜底。

## 四、不能破坏的既有纪律

1. **空值不伪造 0**：无分/无价条目一律排末，`desc` 时也不许顶到前面（现有逻辑 `src/lib/pricing.ts:182` 已处理，改动要保住）。
2. **pending 条目仍排在有价条目之后**，不因全量排序而混入。
3. **价格列（输入/输出/上下文）保持现状**，仍按币种分段——不同币种的单价直接排序没有意义，本票只针对智能指数与性价比。
4. `reportedCurrency !== billingCurrency` 的条目（聚合源以 USD 报 CNY 账单价）不能当作可比较值参与全量排序，与散点图同样的口径：先排除或按 `billingCurrency` 折算后再比。
5. 排序状态仍要进 URL（`?sort=intelligence&order=desc`），刷新与分享保持可复现。

## 五、落点

- `src/lib/pricing.ts:106-124` `sortValue()`：性价比分支需要能拿到折算后的值（现在只有 `fx` 参数在手，够用）。
- `src/lib/pricing.ts:172-185` 比较器：币种分组改为**仅在「价格类字段」或「无汇率」时生效**。
- `src/lib/pricing.ts:138-143` 注释同步改口径，别留「跨币种不直接比较」这种与实现相反的说明。
- `PriceTable.vue` / `PriceCard.vue`：如需表头口径提示，走 `copy.ts` 常量，不硬写中文。
- 测试：`tests/` 里现有的排序断言若有「USD 组恒在 CNY 组前」的前提，需要按新口径更新（属正常更新，不是放宽判据）。

## 六、验收判据

1. `?sort=intelligence&order=desc` + 厂商全部：**178 行整体分数单调不增**，无分条目全部在末尾；CNY 与 USD 条目可以相邻出现。
2. `?sort=value&order=asc`（性价比升序）+ 厂商全部：折算到 CNY 后 `costPerPoint` 整体单调不减；表头或页内有一处口径说明。
3. 价格列（`sort=inputPrice` 等）行为与改动前逐行一致（回归对比）。
4. `desc` 时无分/无价条目仍在末尾，`pending` 仍排在有价条目之后。
5. 汇率缺失（`fx === null`）时自动退回按币种分段，并给出提示，不出现 1:1 折算。
6. 门禁全绿 + 图表探针五档不退化（排序改动动了 `pricing.ts`，散点图的入图口径来自 `pricing-chart-data.ts`，需回归确认没被带偏）。

---

## #17 数据自动发现与更新：现状台账 + 消噪(P0) + 国内厂商价格页 diff 告警(P1)

## 一、为什么开这张票

小贤哥问「所有厂商、套餐、模型能不能通过脚本自动发现、自动更新」。编排层逐层实测后确认：**一半全自动，一半只能人工**，而且「自动」那半边对国内主力的覆盖恰好最弱。本票把现状钉成台账，再按 P0/P1/P2 补齐，避免每周报告看着热闹、实际没人补数据。

## 二、现状台账（2026-11-09 实测，全部可复跑）

| 对象 | 自动程度 | 落点 | 实测读数 |
|---|---|---|---|
| 汇率 | 全自动，每天 | `cli.mjs rate`（`data-refresh.yml`） | 有校验，任一条不过即放弃本次更新 |
| 聚合价格快照 | 全自动，每周 | `cli.mjs pull` ← models.dev | 上游快照 **235 个 provider**，落 `src/data/generated/aggregate.generated.json` |
| 已映射厂商的新模型 | 半自动 | 同上 | 按 `AGGREGATE_LIMITS` 每家取最新 N 条（openai 12 / xai 8 / meta 6 …），有单价才进；超上限的旧模型被顶掉 |
| 派生数据 / 数据校验 / 官方价格历史快照 | 全自动 | workflow | 校验不过则整批放弃 |
| 候选发现 `discover` | 只报告 | workflow 第 136 行 → run summary | **174 家未收录厂商（33 家非转售）** |
| 套餐漂移 `plans-drift` / `plans-structure-drift` | 只告警 | workflow 第 146 / 160 行 | 只发现「已录套餐改价了」，发现不了新套餐 |
| 新厂商映射 | 人工 | `src/data/providers.json` | **19 家全手写**；16 家有 `aggregateProvider`，`baidu` / `opencode` / `github` 为 `null` → 永远 0 条目 |
| 官方页价格条目 | 人工 | `cli.mjs add`（`--source-url` `--verified-at` 必填） | 133 条，入库前过校验；不做自动抓取（站点已对外承诺） |
| 套餐档位 | 人工 | `src/data/entries/plans.json` | 55 档，无发现机制 |
| 智能指数覆盖 | 人工映射 | `benchmark-basis.json` | 23 条映射 → 覆盖 32/133 |

### 缺口一：国内主力厂商的「自动进站」实际是空的

聚合快照每家条数实测：

```
openai 12 · mistral 12 · zhipu 12 · cohere 8 · xai 7 · moonshot 6 · meta 6 · xiaomi 6 · stepfun 4 · tencent 1
deepseek 0 · aliyun 0 · volcengine 0 · minimax 0 · anthropic 0 · google 0
```

DeepSeek、阿里云、火山引擎三家是站点主力，聚合源一条都没产出 → 新模型发布不会自动进站，全靠人盯官网。

### 缺口二：`discover` 报告有重复键噪音，数字虚高

`providers.json` 映射的是国内站 key（`zhipu → zhipuai`、`minimax → minimax-cn`、`moonshot → moonshotai-cn`），但 `discover` 把国际站 key（`zai` / `minimax` / `moonshotai`）当成「未收录厂商」报出来。所以「174 家 / 33 家非转售」两个数字都偏高，看久了会被当成噪音忽略。

### 缺口三：套餐与智能指数完全没有发现能力

55 档套餐靠人工录，`plans-*drift` 只比对已录项；智能指数映射 23 条手写，覆盖率 32/133 就是卡在这里（v0.7.0 已登记为偏差项）。

## 三、建议分级

**P0 消噪（必做）**：`discover` 先做「同一厂商多 key 归一」（`zai`↔`zhipuai`、`minimax`↔`minimax-cn`、`moonshotai`↔`moonshotai-cn` 等），再报数。判据：归一时输出「已归一 → 主 key」对照，未收录厂商数与归一前逐条可解释。

**P1 国内厂商直连 diff 告警（核心）**：对聚合源无产出的厂商（至少 deepseek / aliyun / volcengine），抓官方 pricing 页的 Markdown 版（复用 `llms.txt` 那套办法），只告警「价格段落变了」，输出进 run summary，不改数据。判据：造改价 fixture 能报，不改变更不误报；失败不阻塞数据刷新。

**P2 套餐新档位发现（谨慎）**：官方定价页出现新的价格数字组合时告警，仍由人工确认是否收录。判据：能识别「新价位出现」与「旧价位消失」两类事件。

**明确不做**：
- 官方价格全自动入库——与 `/sources/` 对外承诺（人工逐条录入 + 校验）直接冲突，v0.10.0 刚修掉这类「说一套做一套」的语义漂移；
- 用模糊匹配猜厂商/模型对应关系（#15 已定「不做模糊匹配、不拿 0 分顶替」）。

## 四、验收口径

- `discover` 归一前后数字差可解释，报告带对照表；
- P1 告警在「改价 / 不改价 / 抓取失败」三种输入下分别表现为 报 / 不报 / 告警但不阻塞；
- 所有新增步骤仍走 `data-refresh.yml` 的 report-only 通道，不写数据文件、不触发部署；
- 红线不变：不改 `src/data/**` 的数据值、不新增运行时依赖、失败不写文件。

---
