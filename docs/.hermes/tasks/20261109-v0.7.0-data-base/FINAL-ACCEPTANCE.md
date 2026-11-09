# v0.7.0 数据基座与可信度 · 最终验收报告

> 迭代：v0.7.0（里程碑 `v0.7.0 数据基座与可信度`） · 分支 `feature/v0.7.0-data-base` → `develop`
> 交付提交：`92b312b`（迭代交付） · 合并提交：`8ffbab2`（`--no-ff` 入 develop） · tag `v0.7.0`
> 结论：**验收通过**。三锻全程留痕，对抗轮判 Kill 后定点返工，窄复核 `approved-with-conditions`。

## 一、迭代范围与任务清单

| 票 | 交付 | 状态 |
|---|---|---|
| #16 价格历史快照管道 | `scripts/data/history.mjs` + `lib/history.mjs` + `src/data/history/price-history.jsonl` + workflow 接入 | 完成 |
| #15 智能指数取数脚本化 | `scripts/data/pull-benchmarks.mjs` + `lib/benchmarks-pull.mjs` + `lib/benchmarks-drift.mjs` + CLI `benchmarks-drift` + basis 根级 `tierPolicy` | 完成（覆盖率未提升，见 §5） |
| #10 数据漂移监控 | `scripts/data/lib/plans-structure-drift.mjs` + CLI `plans-structure-drift` + workflow 报告 | 完成 |
| 迭代基建（非票面） | `docs/.hermes/gates.json` 修两条恒红旧判据；新增 `scripts/qa/run-gates.mjs` | 完成 |

阶段与执行体：Hermes 编排/裁定/验收 → OpenCode 设计 → Codex 编码 → Codex 对抗审查 → Codex 定点返工 → Codex 窄复核。

## 二、逐项验收结论与证据

### 2.1 门禁（编排层亲跑，非采信自述）

`node scripts/qa/run-gates.mjs`：**6/6 全绿**

| 门 | 读数 |
|---|---|
| typecheck | 4.9s，exit 0（vue-tsc 零错误） |
| test | 11.1s，**33 文件 / 580 项全过**（基线 30 文件 / 493 项，本迭代 +19 项） |
| build | 5.1s，「已写出 6 条路由」 |
| data-verify | 314ms，「结论：通过」 |
| derived-estimates / derived-benchmarks | 231 / 227ms，两次 `--check` 均一致 |

### 2.2 #16 快照管道

| 判据 | 实测 |
|---|---|
| 同日双跑幂等 | `written:false` 两次，`price-history.jsonl` md5 不变（`a1ff090f…`） |
| 跨日改价产生一条 `price` | 8→9（`now=2026-11-10`）：恰 1 条，`change:"price"`，before/after 完整 |
| 单条事件体积 | 419 B（判据 < 500 B） |
| 只改 `verifiedAt` / `fetchedAt` | `written:false`，不产生事件（不读 aggregate 文件） |
| `replay --id` | 三时点回放正确；币种切换输出 `currency` 而不是涨价 |
| 首次落盘 | 133 条 official 全量，29,315 B / 1 事件 |

### 2.3 #15 指数取数

| 判据 | 实测 |
|---|---|
| 单次 HTTP | 真拉取 1.9s，`modelCount=282`，`candidateCount=23` |
| `--check` 语义 | 产物缺失 → `OUT_STALE` exit 1；对齐后 exit 0 |
| 同日两跑字节一致 | candidates 与 `.cache/aa-models.json` md5 均不变 |
| 漂移告警 | `benchmarks-drift`：分数变化 1（Claude Opus 5.5 58.41→59.11）、档位切换 0、slug 消失 0 |
| 红线 | basis 保持 251 CRLF / 0 裸 LF；`tierPolicy` 在根级，`methodology` 仍为纯字符串 |

### 2.4 #10 套餐结构漂移

| 判据 | 实测 |
|---|---|
| 只读 | 13.0s exit 0，`plans.json` 与 fixture 哈希不变 |
| 三分类 | 疑似漏档 8 / 合并 1 / 下架 4；额度语义变化 7；无法判定 32（可判 23/55） |
| 多列可用表 | `Model/Plus/Pro/Free` + `No/Yes/No` → 只报 Plus 与 Free，Pro 不报 |
| CSV/CSR 页面 | 价格 SSR 但额度 CSR → `unknown`，不报额度变化 |
| 真实额度变化 | 10000 → 20000 credits 仍正确报出（防「永远 unknown」） |

### 2.5 红线复查（编排层 grep）

`dependencies` 仍为 vue / vue-router / zod；`src/data/generated/` 零手改；`src/` 无网络调用与 `price-history` 引用；新增代码无 emoji；basis CRLF 未破坏。

## 三、失败 → 返工 → 复验链

| 轮 | 结论 | 处理 |
|---|---|---|
| 编码轮 | 自述 561/561、verify 0 | 编排层亲跑门禁 6/6 后进对抗轮 |
| 对抗审查 | **Kill**，5 条阻断（B1 坏缓存绕过校验被覆盖、B2 冲突 RSC 载荷取首份、B3 多列可用表互相掩盖、B4 价格 SSR/额度 CSR 误报语义变化、B5 workflow 守卫对命令缺失恒绿）+ B5-b 行尾守卫缺口 | 编排层亲验 B1/B4/B5 成立后派返工，范围锁死 6 项 |
| 返工 | 5 源/测试文件被改（哈希核对确认无越界），测试 561 → 580 | 编排层自建反例复验：B1 五种坏缓存全部 exit 1 且零写入；B2 冲突载荷抛 `BENCH_RSC_AMBIGUOUS`、相同重复接受；B3 多列只报 Plus/Free；B4 CSR 归 unknown、真实变化仍报；B5 变异测试删 verify/删 snapshot 各 2 项红，还原后 17/17 绿 |
| 窄复核 | `approved-with-conditions` | 六项均判「真修」，无新阻断；157 项文件哈希核对只有指定 5 项变化，新增 0 项越界 |

## 四、实际提交

| 项 | 值 |
|---|---|
| 迭代交付提交 | `92b312b` |
| 合并入 develop | `8ffbab2`（`--no-ff`） |
| tag | `v0.7.0`（annotated，`dd6171d`） |
| 推送 | `develop` 与 tag 已推，远端回读与本地一致 |

## 五、遗留边界与后续承接项

| 项 | 现状 | 承接 |
|---|---|---|
| **N1 覆盖率未提升** | `pull-benchmarks` 的 candidates 只遍历手写 `mapping`，实测 32/133 → 32/133 **提升 0**。自动化交付的是「消除手抄 + 漂移可见」，不是覆盖 | 已登记 ROADMAP 偏差项。后续可新增**只读未映射清单**（AA 有分但我方未映射）+ 人工审核流程；需新票，本迭代不做 |
| **N2 阈值 0.5 偏钝** | 实测 16/23 条分数已变，其中 12 条 >0.1、仅 1 条 >0.5。按规格实现 0.5，但读者会误以为「只有一个模型变过」 | 建议另开 `changedCount` / 0.1 观察档，属下批改进 |
| **N3 异常类型不一致** | 语法/fs 异常被 CLI 兜底成 `UNEXPECTED`，非业务 `CliError`；不影响退出码与零写入 | 下批统一 |
| **N4 任务材料含转录 emoji** | `issues-dossier.md` 等来自 GitHub 正文的转录含符号（非代码产物） | 归档时不视为代码红线，保持转录原样 |
| #10 的 Copilot 额度条目 | 报缺 `13.3:x`，审查确认「证据文本不匹配」成立但「是否真变了」需人工核对 | 人工看一次官方页再决定是否改 `plans.json` |
| 门禁判据的历史债 | `gates.json` 两条 Astro 时代正则已修；`build` 门改用「已写出 6 条路由」判据 | 已在本迭代修复并入库 |
