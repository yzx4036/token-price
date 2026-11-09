# 本迭代 issue 全文（dossier）

> 生成自 GitHub，正文与线上一致；改动需求请同时改 GH 与这里。

## #16 价格历史快照管道：为走势图与智能成本指数攒序列

## 为什么现在做

#14 的 Phase 3（价格走势图）与「每分智能成本」指数化都卡在同一件事上：**没有历史序列**。

实测现状：`src/data/entries/api.json` 在 git 里只有 2026-10-31 到 11-02 三天的 6 次提交，之后每天的自动刷新只改 `fx.generated.json` 与聚合快照。也就是说今天开始攒，满 6 周（约 2026-12-21）才画得出第一张有意义的走势图；再拖一个迭代，解锁时间就整体后移一个迭代。

本票只建管道与契约，不画图（画图归 #14）。

## 要做什么

### 1. 新增 `scripts/data/history.mjs`

- 入参：合并后的官方条目（`api.json` 的 official 部分，聚合条目不进历史，避免第三方快照抖动污染序列）；
- 每条记录字段：`id` / `inputPrice` / `outputPrice` / `cacheReadPrice` / `cacheWritePrice` / `billingCurrency` / `provenance` / `verifiedAt`；
- **只记变化**：与上一份快照逐字段比对，无变化不写。**`fetchedAt` 不参与比对**（每次抓取都变，认它等于每天写一条空记录，与 `data-refresh.yml` 既有判据保持一致）；
- 每月 1 日额外写一条 `kind: "baseline"` 的全量快照，便于任意区间回放，不必从年初滚 delta；
- 同日重跑覆盖当日记录（幂等），不产生重复。

### 2. 落盘格式

`src/data/history/price-history.jsonl`，一行一条事件：

```json
{"date":"2026-11-09","kind":"delta","entries":{"deepseek-deepseek-flash-idle":{"inputPrice":1,"outputPrice":4,"cacheReadPrice":0.02,"cacheWritePrice":null,"billingCurrency":"CNY","change":"price"}}}
```

- `change` 取值 `price` / `currency` / `new` / `removed`，用于区分「涨价」与「条目下架」；
- 只增不改，按月可拆分为 `price-history-2026-11.jsonl`（单文件超过 2000 行时再拆，别提前优化）。

### 3. 接入 `data-refresh.yml`

在 `verify` 通过之后跑 `node scripts/data/history.mjs snapshot`，有变化才随当次提交一起提交；**快照失败只告警不阻塞数据刷新**（历史是增值数据，不该拖死每日更新）。

### 4. 查询口子

`node scripts/data/history.mjs replay --id <entryId>` 输出该条目的完整变动序列（日期 + 旧值 → 新值），供 #14 Phase 3 与人工核对共用同一份实现，避免图里再算一遍。

## 验收判据

1. 同日跑两次，`price-history.jsonl` 字节数不变（幂等，造一次反例证明会拦）
2. 手工改一条价格再跑，delta 里恰好一条记录，且 `change: "price"`、新旧值都在
3. 只改 `aggregate.generated.json` 的 `fetchedAt` 后跑，**不产生记录**（排除 fetchedAt 的判据必须有测试）
4. `replay --id <x>` 能还原任意历史日期的价格，写一条测试固定三个时间点的取值
5. 单条 delta 记录 < 500 字节，正常日增量 ≤ 5 条；按此推算一年文件 < 1MB（给出实测数字，别估）
6. 快照失败时 `data-refresh` 仍能提交汇率与聚合更新，且 Actions 摘要里有告警行
7. 不给 `api.json` / `aggregate.generated.json` 引入任何新字段（历史是旁路，不改真源结构）

## 难点（诚实登记）

- **币种切换会被误判成涨价**：某国际厂商若从 USD 改标 CNY，四个价格字段全变。必须靠 `change: "currency"` 单独标出，否则 `replay` 会造出一段虚假的「价格暴涨」；
- **条目下架与 id 改名**：厂商改模型名后我方 id 会变，历史里表现为「旧 id 消失 + 新 id 出现」，不是下架。`replay` 输出要能一眼看出这种成对出现，别让读者以为厂商下架了模型；
- **不要为了画图提前塞进 `dist`**：历史文件只给构建期取点用，若不参与任何图则**不应**被打进产物（避免每页多背几百 KB）。是否引入由 #14 决定，本票不加。

---

## #15 智能指数 Step 1-3：AA 取数脚本化 + 映射档位政策 + 分数漂移监控

## 背景

v0.5.0 已上线「智能指数 / 性价比」两列，数据来自 Artificial Analysis 综合分。当前实现是**手写映射**：`src/data/estimates/benchmark-basis.json` 里 23 条 `aaSlug + score + tierUsed`，人工从官网抄，再由 `scripts/data/gen-benchmarks.mjs` 生成产物。

预研文档：`docs/research/intelligence-index-plan.md`（本 issue 只做其中 Step 1 到 Step 3）。

## 实测现状（2026-11-09）

| 项 | 实测 |
|---|---|
| 覆盖率 | 32 / 133 official 条目 = **24.1%**，23 个基座模型 |
| AA 页面可抓性 | `curl` HTTP 200 / 1.76MB / 2.6s，`robots.txt` 为 `Allow: /` |
| 页面内结构化数据 | RSC 载荷 `initialModels` **282 个模型**，99 个有智能指数，94 个有分数且有价格，另有 20+ 分项 |
| 现有 23 条 slug 对拍今日榜单 | **失配 0 条**（slug 稳定，可作匹配主键） |
| 分数漂移 | 录入 8 天后 **15 / 23 条分数已变**，最大 +0.70（Claude Opus 5.5：58.41 → 59.11），中位约 +0.15 |
| 国内覆盖面 | AA 上字节 Doubao **0 个模型**、百度 ERNIE 0 分、阿里 29 个模型仅 5 档有分 |

两个结论直接决定了做法：

1. 手抄分数已经明显过期（65% 不准），必须自动化；
2. 覆盖面不是映射问题，是数据源没有，自动化的上限只能是 AA 的上限，这点要在页面上讲清楚，不许暗示「没分数就是差」。

## Step 1 取数脚本化

新增 `scripts/data/pull-benchmarks.mjs`：

- 单次 GET `https://artificialanalysis.ai/leaderboards/models`，UA 带站点标识与联系方式，全流程只此一次请求，不并发；
- 解析 RSC 载荷：先取 `self.__next_f.push([1,"…"])` 字符串字面量做一次 JSON 反转义，再对 `"initialModels":` 后的数组括号配平截取，最后 `JSON.parse`。禁止用正则直接抠自转义片段（`\"slug\"` 那种，实测会漏）；
- 产出 `.cache/aa-models.json`（全量快照，不入库）与 `src/data/generated/benchmark-candidates.generated.json`（已匹配部分，入库）；
- 失败语义对齐 `rate` / `pull`：网络失败、解析失败、模型数比上次骤降 >30%，一律退出码非 0 且**不写文件**；只报告不改真源。

## Step 2 映射与档位政策

- 匹配键：`providerId → modelCreatorName` 白名单 + `aaSlug` 精确命中；**禁止模糊匹配**，未命中就空着（页面显示「—」）；
- 档位政策写死并记录：同一模型多档取「实际分数最高」的那一档，`tierUsed` 落库。实测 Grok 4.7 的 High 35.21 / Xhigh 35.49，与当初录入的 35.01 都不同，政策必须在页面显式声明；
- 现有 `findSemanticMismatches`（防张冠李戴）与 `danglingMappings`（硬报错）保留，新脚本产出的候选也要过这两道；
- 覆盖率如实登记到 `generated` 的 `coverage` 字段，页面照旧展示「N 条无评测数据」。

## Step 3 漂移监控与展示

- 新增 `benchmarks-drift`（接 #10 的监控框架）：对拍当日快照与 basis，输出三类差异：**分数变化 / 档位切换 / slug 消失**；只告警不改数据；
- 详情折叠补 4 个代表性分项（数据已有，零成本）：`aa-briefcase`、`omniscience`、`terminal-bench-science`、`hle-diamond`；全 20+ 分项不进页面（与 #13 文本简约冲突）；
- 展示 `fetchedAt`，明确「分数是第三方评测快照，会变」。

## 明确不做（写下来防止范围膨胀）

- **不自建综合指数**：权重造出来就要辩护，收益只是覆盖率，而覆盖率恰恰是「国内厂商没被评测」，调权重解决不了；
- **不引多源合成**（SuperCLUE / FlagEval / OpenCompass 实测均 200 可达，但口径统一成本高）。触发条件：国内条目覆盖率连续两个月低于 30% 再启动；
- **不做模糊匹配**、不用 0 分顶替未评测。

## 验收判据

1. `node scripts/data/pull-benchmarks.mjs` 成功时只发 1 个 HTTP 请求；断网 / 造坏页面时退出码非 0 且 `src/data/` 无改动（造两种反例各验一次）
2. 同一天跑两次，第二次产物与第一次逐字节一致（`--check` 幂等）
3. 分数漂移 >0.5 的条目在 `benchmarks-drift` 输出里列全；实测应至少包含 Claude Opus 5.5 这条
4. 覆盖率提升给出前后数字（当前 32/133），并说明提升来自映射还是来自 AA 新增模型
5. 页面回归：未评测条目仍显示「—」且排序稳定在币种组末尾；`npm test -- --run` 全绿；产物门禁 P1–P5 通过
6. 禁 JS 时静态 HTML 里分数与 `fetchedAt` 仍可见（预渲染不退化）

## 难点（诚实登记）

- **RSC 解析脆弱**：AA 随时可能换 payload 结构。降级策略只能是「告警 + 不写文件」，绝不允许静默沿用过期快照或把分数清零；
- **档位政策会被读者质疑**：同一模型 High 与 Max 差 5 分以上很常见，必须在口径页写清「页面显示的是该模型最高档分数」；
- **覆盖率天花板要预期管理**：自动化后覆盖率大概率仍在 40% 以下，验收判据不能写成「覆盖率 ≥80%」，那是数据源决定的，不是脚本决定的。

---

## #10 数据漂移监控：档位结构（漏档/合并/下架）+ 额度语义（plans-drift 只查价格数字）

## 现象

`plans-drift` 只检查「当初录入的**价格数字**是否还出现在官方页上」。

它不检查两类更重要的漂移：

### A. 额度语义

- `allowance` 文字（「每周 10,000 积分」→ 官方改成 8,000）

- `availableModels`（「GPT-6 Luna 可用」→ 官方收回）

- `allowanceNature`（`mixed` / `quota` 的判定依据变了）

### B. 档位结构（本条新增范围）

- **档位数量变了**：官方加了新档 / 某档下架

- **档位名变了**：`Pro 200` → 改名

- **整条产品线没录入**：阿里云百炼 TokenPlan 三档全缺就是这一类

## 为什么需要

2026-11-01 逐家重核时一次抓到的问题量：

| 类型 | 实例 |

|---|---|

| 额度口径不准 | OpenAI 一家就 4 处（Pro 漏了 GPT-5 Thinking Mini 不限量、漏了 GPT-5.6 Sol Pro 限流、Plus 没说「GPT-6 全系有限」、Free/Go 没点出可用模型只有两个） |

| 档位被合并 | ChatGPT Pro（3档→1条）、Google AI Ultra（2档→1条） |

| 整档漏录 | 腾讯 Buddy One VIP、阿里 TokenPlan 三档 |

| 编造数据 | 腾讯「¥700 打包价」官方页命中 0 次 |

这些结论现在**零监控**。

### 为什么档位结构比额度语义更该先做

现有守卫（`tests/plan-tiers.test.ts`）能拦住「**已录入**的档位被合并」——检测 `billingCycle` 里的「N 档 / 起价 / From $X / 或 $X」、档名与月费不符、同名重复。

但它拦不住**完全没录入的档位**。阿里 TokenPlan 整个产品线缺失，所有测试都是绿的。

**档位名清单的抓取成本远低于额度语义解析**：只需要「页面上出现了哪些套餐名 + 价格」，不需要理解额度是怎么算的。所以这一半应该先做，且能顺带解决额度侧的「数字是否还在」部分。

## 难点（必须正视）

我们的 `allowance` 是**转述**，不是官方原文：

- 各家页面结构不同（OpenAI 是逐模型 × 逐档位的功能对比表，智谱是积分表，Kimi 只有定性描述）

- 通用解析不可行，写死路径会因任一厂商改版就整套崩

- 部分页面按访问地区切换币种（Kimi 本机抓美元、代理抓人民币），抓取结果不稳定

所以不能照搬 `plans-drift` 的「数字在不在」判据。

## 可考虑的思路（待设计）

### 1. 档位结构监控（优先，成本低）

对每个 provider 抓官方页 → 抽出「价格 token 集合」→ 与 `plans.json` 里该厂商的 `monthlyPrice` 集合比对：

- 已录入的价格**不在**页面上了 → 「可能已下架」

- 页面上有价格但我们**没录入** → 「可能漏档」（阿里 TokenPlan 那类）

- 数量对得上但无法判定（纯 CSR 页面）→ 「无法判定」

⚠️ 关键：只比对**数字集合**，不比对档名。档名各家写法差异太大（`Pro 100` / `个人版 Standard` / `旗舰版`），强行匹配必然误报。

### 2. 额度语义监控（次要，成本高）

- 只监控最有信息量的少数点：OpenAI 的逐模型可用表（`Unlimited* / Expanded / Yes / No`）—— 这张表最有价值也最好解析

- **页面指纹**：抽「所有数字 + 所有模型名」集合，与上次快照比对，变了就进 run 摘要。不做语义解析，只做变更提示。

### 3. 失败的姿态

抓不到（Cloudflare / JS 渲染 / 404）就标「无法判定」，**不许**冒充漂移，也不许掩盖成「无变化」。

已知抓取困难的：火山方舟（价格在 JS 里）、OpenCode（pricing 页 404）、阶跃（文档页无价格表）。

## 验收判据

- [ ] 每周随 `data-refresh` 跑，结果进 GitHub Actions run 摘要（只告警，不改数据）

- [ ] **档位结构**：全部 55 档的 `monthlyPrice` 是否仍出现在官方页；反向检出「页面有价但我方未录」

- [ ] **额度语义**：至少覆盖 OpenAI 的模型可用表

- [ ] 抓取失败的档位标「无法判定」并计入报告，不混入「无变化」

- [ ] 报告给出覆盖率（可判 N 档 / 无法判定 M 档），不许宣称「全覆盖」

- [ ] 有测试钉住：纯 CSR 页面 → 「无法判定」；价格真变了 → 「待确认」；没变 → 「一致」；页面多出一个我方未录的价格 → 「疑似漏档」

- [ ] 用历史数据回放验证：输入 2026-11-01 之前的 `plans.json` + 当时的官方页，应能检出 ChatGPT Pro / Google Ultra 合并、腾讯与阿里漏档

## 明确不做

- **不自动改数据**。改额度语义、加档位都是人工判断（要读官方上下文），机器只能提示。

- **不做档名匹配**。名称归一化误报率太高，只比数字集合 + 数量。

- **不宣称全覆盖**。抓不到的如实报，覆盖率写清楚。

## 相关

- 现有守卫：`tests/plan-tiers.test.ts`（10 项，拦「已录入档位被合并」）

- 现有漂移检测：`scripts/data/lib/plans-drift.mjs`（只查价格数字存在性）

- 本次审计发现的问题清单见 commit `76c34ff` 的提交信息

---
