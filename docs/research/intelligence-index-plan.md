# 智能指数实现方案预研

> 预研日期 2026-11-09 · 站点数据日期 2026-11-08 · 全部数字为本机实测
> 关联：#5（智能性能维度，已交付 v0.5.0）、#10（数据漂移监控）、#3（用量-成本曲线）

## 0. 结论先行

「智能指数」不是从零开始做，v0.5.0 已经上线了「智能指数 / 性价比」两列（来源 Artificial Analysis 综合分，手写映射 23 个基座模型，覆盖 32/133 官方条目）。本预研要回答的是「怎么把它做深」，结论：

1. **不新建自研综合指数**。第三方综合分已经够用，自建权重体系只会引入不可辩护的主观性。
2. **取数层脚本化**（方案 B）：AA 榜单页 RSC payload 里就是结构化 JSON，`initialModels` 一次拿到 282 个模型，无需 API key。现在手写 23 条分数的做法应当退化为「只维护映射表」。
3. **覆盖率有硬天花板**：AA 有分模型 99/282，国内厂商尤其稀薄（字节 0 个模型上分、阿里 29 个模型只有 5 个档有分）。沿用 AA 无论怎么优化，国内条目覆盖率上不去。所以「自建 / 多源合成」（方案 C）不作为本期路线，只在触发条件下启动。
4. **指数化（方案 D）依赖快照积累**，与「价格曲线图」共用同一份历史数据，应当合并排期，不要各造一套。

## 1. 现状实测

| 项 | 实测值 | 出处 |
|---|---|---|
| 线上数据日期 | 2026-11-08 | 线上页 `/api-pricing/` 页脚 |
| 合并后条目 | 178 条 / 16 家（official 133 条 / 12 家，aggregate 45 条） | `cli.mjs verify` |
| 有智能指数的 official 条目 | 32 / 133 = 24.1% | `benchmarks.generated.json` |
| 有智能指数的基座模型 | 23 / 105 唯一模型 | 同上 |
| 数据真源 | `src/data/estimates/benchmark-basis.json`（手写 23 条 aaSlug + score + tierUsed） | 仓库 |
| 生成器 | `scripts/data/gen-benchmarks.mjs`（含悬空映射硬报错、语义错配校验、`--check` 幂等） | 仓库 |
| 前端接入 | `src/lib/benchmark-view.ts`：3:1 混合单价 ÷ 分数 = 每分智能成本 | 仓库 |

已经做对的三件事，改造时要保住：

- 缺分数一律显示「—」，不拿 0 顶替，不模糊匹配到近名模型；
- `findSemanticMismatches` 拦住「A 的分数安到 B 头上」这类结构合法的笔误；
- 排序时未评分条目稳定排在所属币种组末尾，不参与排名结论。

## 2. 数据源实测（2026-11-09）

### 2.1 Artificial Analysis

```text
curl -s https://artificialanalysis.ai/leaderboards/models
→ HTTP 200 / 1,763,448 B / 2.6 s
robots.txt: User-Agent: * / Allow: /（允许抓取）
```

页面里 `self.__next_f.push([1,"..."])` 的 RSC 载荷中含 `"initialModels":[...]`，解出后实测：

| 指标 | 实测 |
|---|---|
| 模型总数 | 282 |
| 有 `intelligenceIndex` | 99（35%） |
| 有 `price1mInputTokens` | 167 |
| 分数与价格都有 | 94 |

单条记录字段（实测取全部）：`slug`、`name`、`shortName`、`deprecated`、`isReasoning`、`isOpenWeights`、`paramClass`、`priceClass`、`modelCreatorName`、`contextWindowTokens`、`intelligenceIndex`、`omniscience`、`scores{}`、`price1mInputTokens`、`price1mOutputTokens`、`cacheHitPrice`、`cacheWritePrice`。

`scores` 里 20+ 分项，出现频次前几：`aa-briefcase` 99、`omniscience-accuracy` 99、`omniscience-non-hallucination` 99、`automationbench-aa` 99、`terminal-bench-science` 99、`frontiercode-2-0` 99、`hle-diamond` 99、`gdp-pdf` 99、`terminalbench-4-0` 99、`critpt-v2-hard` 99、`scicode` 90、`gpqa-diamond` 39。

这些分项是 v0.5.0 没用的存量价值：详情折叠里可以直接给出「代码 / 长上下文 / 知识面」的强弱，不必新增数据源。

### 2.2 国内厂商覆盖（AA 的硬天花板）

| 厂商 | AA 上模型数 | 有分 | 有分的基座 |
|---|---:|---:|---|
| Alibaba (Qwen) | 29 | 5 | Qwen3.8 27B、Qwen3.8 Max |
| Z AI (GLM) | 3 | 3 | GLM-5.3、GLM-5.3-Flash |
| MiniMax | 2 | 2 | MiniMax-M3、MiniMax-M3.1-Flash |
| Xiaomi | 2 | 2 | MiMo-V2.6-Flash、MiMo-V2.6-Pro |
| Kimi | 3 | 1 | Kimi K3.1 Pro |
| StepFun | 2 | 1 | Step 5 Preview |
| Tencent | 2 | 1 | Tencent Hy4 |
| DeepSeek | 5（实为 2 基座多档） | 5 | DeepSeek V4 Pro、V4.1 Flash |
| **字节 Doubao** | **0** | **0** | — |
| **百度 ERNIE** | 2 | **0** | — |

结论：我们站点 133 条 official 里 90 条是人民币账单（国内厂商），而这 90 条能被 AA 覆盖的上限是个位数基座模型。**覆盖率问题不是映射做得糙，是数据源没有**。

### 2.3 其他候选源可达性

| 源 | 结果 | 备注 |
|---|---|---|
| superclueai.com | HTTP 200 | 中文榜单，需确认是否提供可解析数据 |
| flageval.baai.ac.cn | HTTP 200 | 智源，页面结构待探 |
| opencompass.org.cn | HTTP 200 | 同上 |
| lmarena.ai/leaderboard | 301（此前实测 403 Cloudflare） | 不稳定，不作为主源 |

## 3. 方案对比

| 方案 | 做法 | 增量覆盖 | 成本 | 风险 | 判断 |
|---|---|---|---|---|---|
| A 手写扩充（现状继续） | 人工从 AA 抄分数，basis 从 23 条扩到能写的全部 | 上限仍受 AA 约束（理论上 40 条左右条目） | 每次重抓都要人工核对，随时间腐化 | 抄错一条就是张冠李戴 | 不采用 |
| **B 抓取自动化 + 映射表** | 脚本抓 AA → 产出候选、自动按 slug 匹配 → 人只维护 mapping 与档位政策 | 与 A 相同上限，但可复现、可对拍 | 一次开发，后续零人工取数 | 页面改版导致解析失效（需降级为告警，不静默） | **推荐，作为骨架** |
| C 多源合成自建指数 | AA + SuperCLUE/FlagEval/OpenCompass + 自跑轻量评测，加权成「本站智能指数」 | 能补国内空白 | 高：口径统一、权重辩护、跑评测的算力钱 | 混合口径不可辩护；第三方分数转载边界；维护多套解析 | 本期不做，条件触发 |
| D 指数化（每分智能成本时间序列） | 每次抓取落快照，算「代表性模型篮子的每分智能成本中位数」并出走势 | 不增覆盖，增解释力 | 中：依赖 6 到 8 周快照积累 | 篮子权重主观；早期样本少易误读 | 与价格曲线图合并排期 |

### 3.1 为什么不选自建指数

自建综合分的核心是权重。权重一旦公开就要能辩护，否则读者会问「为什么代码占 30% 不是 40%」。AA 已经把这套方法公开并承担了争议，我们转载分数并标来源是低风险动作；自己造一个分是高风险动作，收益只是覆盖率，而覆盖率恰恰是评分本身解决不了的（国内厂商没被评测，不是我们权重调不好）。

## 4. 推荐路线

### Step 1 取数层脚本化（约 0.5 天）

新增 `scripts/data/pull-benchmarks.mjs`：

- 单次 GET `https://artificialanalysis.ai/leaderboards/models`，UA 带站点名与联系方式，全流程只此一次请求；
- 解析 RSC 载荷：正则取出所有 `self.__next_f.push([1,"…"])` 的字面量，先做一次 JSON 字符串反转义，再对 `"initialModels":` 后的数组做括号配平截取，最后 `JSON.parse`。**不要**用正则直接抠 `\"slug\"` 这类自转义片段；
- 产出 `.cache/aa-models.json`（全量快照，不入库）与 `src/data/generated/benchmark-candidates.generated.json`（已匹配部分，入库）；
- 网络失败 / 解析失败 / 模型数骤降 30% 以上：退出码非 0，写出文件不动，与 `rate`、`pull` 的失败语义一致。

类似 `drift` 的口径：脚本**只报告不改真源**，人确认后才更新 `benchmark-basis.json`。

### Step 2 映射与档位政策（约 0.5 天）

- 匹配键：`providerId → modelCreatorName` 白名单 + `aaSlug` 精确命中；禁止模糊匹配。实测我们现有 23 条 slug 在今日榜单上 **失配 0 条**，说明 slug 稳定、可作主键；
- 档位政策沿用现状并写死：同一模型多档取「实际分数最高」的那一档，记录 `tierUsed`。今日实测 Grok 4.7 的 High 35.21 / Xhigh 35.49，档位最高分已经和录入时的 35.01 不同，政策必须显式写在页面上；
- 未命中：保持空值（页面「—」），不猜；
- 把「分数漂移」纳入 `verify` 的提醒区：与 basis 记录值差 >0.5 分就列出来，不改数据。

### Step 3 漂移监控与展示升级（约 1 天）

- 接 #10 的监控框架：`benchmarks-drift` 每次抓取对拍 basis，输出「分数变化 / 档位切换 / slug 消失」三类；
- 详情折叠补 `scores` 分项（数据已有，零成本）；
- 首页与 API 页展示 `fetchedAt`，明确「分数是第三方评测快照，会变」。

### Step 4 指数化（挂在价格曲线图之后）

只有当快照积累满 6 周、且价格曲线图的数据层已经存在时才做。篮子建议：按 `priceClass` 分层各取 3 个模型，算「每分智能成本」中位数，避免被个别涨价带偏。

## 5. 分数漂移实测（为什么要做监控）

用今日 AA 快照对拍 `benchmark-basis.json` 的 23 条记录（录入日 2026-11-01）：

- slug 失配 0 条；
- 分数变动 15 条，最大 +0.70（Claude Opus 5.5：58.41 → 59.11），中位约 +0.15；
- 未变动 8 条。

也就是说，站点上线 8 天，页面上的分数已经有 65% 不准了。这不需要复杂方案，一个对拍告警就能覆盖。

## 6. 合规与风险

- AA `robots.txt` 为 `Allow: /`，可抓；限频单次请求，不做批量压测；
- 只存分数与 slug、抓取时间，不存整页、不重发其表格编排与说明文案（沿用 `docs/compliance/data-fetching.md` 第 4 条）；
- 展示侧：明确标「第三方独立评测」，不得写成官方口径，不得作为选型唯一依据；
- 解析失效要「告警 + 不写文件」，不允许静默把分数清零或沿用过期快照。

## 7. 待决问题

1. 是否接受「分数会变导致页面数值变动」，还是固定某个 `snapshotDate` 直到人工确认？（推荐前者 + 展示 `fetchedAt`）
2. 详情里要不要展开 6 个领域与 20+ 分项？（数据免费，但会增加文本量，与本轮「文本简约」冲突，建议只放 4 个代表性分项）
3. 方案 C 的触发条件是否设为「国内条目覆盖率 <30% 且连续两个月无改善」？
