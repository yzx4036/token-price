# v0.7.0 数据基座与可信度 · 任务书

> 本文件是**任务书**，不是需求真源。需求真源 = GitHub issue #16 / #15 / #10，全文见 `issues-dossier.md`（与本文件同目录）。
> 本文件只做三件事：钉死已核实事实、划定批次与验收口径、声明红线。

## 一、迭代范围

| 批 | 票 | 交付 |
|---|---|---|
| B1 | #16 | 价格历史快照管道（只建管道与契约，不画图） |
| B2 | #15 | 智能指数取数脚本化 + 映射档位政策 + 分数漂移告警 |
| B3 | #10 | 数据漂移监控：档位结构 + 额度语义（在既有 plans-drift 上扩，不重写） |

批次顺序固定，前批验收绿才做后批。失败只返工失败批，已通过批保留。

## 二、已核实事实表（编排层亲验，可直接引用，**不得改写成别的名字**）

| 编号 | 事实 | 实证 |
|---|---|---|
| F1 | CLI 入口 `scripts/data/cli.mjs`，命令在 `main()` 的 `switch (command)` 内分发（rate / pull / add / verify / plans-drift / discover / drift / publish）；`--json` 由顶层剥离后传给各 run 函数 | `scripts/data/cli.mjs:160`-`266` |
| F2 | 路径真源 `PATHS`：providers / apiEntries / planEntries / fx / aggregate / modelsDevCache / deployScript | `scripts/data/lib/io.mjs:11` |
| F3 | 原子写 `writeJsonAtomic(file, value)`（临时文件 + rename）；`readJson` / `readJsonIfExists` / `relative` / `todayIso` / `CliError` / `fail` 同文件导出 | `scripts/data/lib/io.mjs:21`-`58` |
| F4 | 网络只走 `fetchWithTimeout(url,{timeoutMs,headers,method})` 与 `fetchJson`；UA 固定 `token-price-data-cli/0.2 (+https://github.com/yzx4036/token-price)`；非 2xx 抛 `CliError`（code `HTTP_STATUS`） | `scripts/data/lib/http.mjs:3`-`27` |
| F5 | `runVerifyCommand({now})` 返回 `{ok, stats, coverage, problems, errorCount, warningCount, ...}`；警告码含 `AGGREGATE_OVERRIDDEN_BY_ID` / `AGGREGATE_SUPERSEDED` / `PROVIDER_EMPTY` / `FX_STALE` / `AGGREGATE_STALE`；错误码含 `SCHEMA` / `UNLIMITED_UNSCOPED` / `FX_MISSING` / `AGGREGATE_MISSING` / `NO_OFFICIAL` | `scripts/data/lib/verify.mjs:39`-`160` |
| F6 | 智能基准生成器 `gen-benchmarks.mjs` 读 `src/data/estimates/benchmark-basis.json` + `api.json`，写 `src/data/generated/benchmarks.generated.json`；`--check` 只比 `byEntryId` | `scripts/data/gen-benchmarks.mjs` |
| F7 | `benchmark-basis.json` 结构：`{$comment, source{name,url,fetchedAt,note}, methodology{...}, benchmarks[{aaSlug,aaName,creator,score,tierUsed,isEstimated,contextWindowTokens}], mapping{展示模型名 → aaSlug}}`，现 23 条 benchmarks / 23 条 mapping | 实读该文件 |
| F8 | 基准计算库导出：`buildBenchmarkDocument(basis, apiEntries)` / `computeCoverage(entries)` / `findSemanticMismatches(basis)` / `baseModelName(model)` / `blendedPricePerMillion(entry)` / `computeValueScore(entry, score)` / `rankByValue(rows)` | `scripts/data/lib/benchmark.mjs:13`-`179` |
| F9 | 派生产物结构：`{generatedAt, source, methodology, coverage{uniqueModels,scoredModels,unscoredModels,apiEntries,apiEntriesScored,danglingMappings}, models{baseModel:{aaSlug,aaName,creator,score,tierUsed,isEstimated}}, byEntryId{entryId:{score,aaSlug,tierUsed,baseModel}\|null}}` | `src/data/generated/benchmarks.generated.json` |
| F10 | 前端只查表不算映射：`benchmarkDoc` 直读 JSON，`buildRowScore` 用 `byEntryId[item.id]`，缺分数返回 null（页面显示「—」） | `src/lib/data.ts:35`、`src/lib/benchmark-view.ts` |
| F11 | 官方价与聚合价的合并规则在 `mergeApiPrices(primary, aggregate)`；official 优先，同 id / 同模型的聚合条目被丢弃 | `src/lib/schema.ts:248` |
| F12 | 定时工作流步骤序：plan → `rate` → `pull`(仅周一/手动) → 重建派生(`gen-token-estimates` + `gen-benchmarks`) → 判断实质变化（排除 `fetchedAt` 行后仍有 diff）→ `verify` + 两个 `--check` → `drift`(仅 pull) → `discover`(仅 pull) → `plans-drift`(仅 pull) → 提交/发布 | `.github/workflows/data-refresh.yml` |
| F13 | 既有漂移实现：`runDriftCommand({now, entriesFile, cacheFile, allowPull})`（本地 official vs models.dev，阈值 5%）；`runPlansDriftCommand({plans, fetchPage, timeoutMs})`（抽价格数字集合判命中） | `scripts/data/lib/drift.mjs:43`、`scripts/data/lib/plans-drift.mjs:71` |
| F14 | 测试：vitest node 环境，`include: tests/**/*.test.ts`，现有 30 个测试文件、493 项全绿 | `vitest.config.ts`、本地实跑 |
| F15 | 门禁执行器 `scripts/qa/run-gates.mjs` 读 `docs/.hermes/gates.json` 跑 6 条门（typecheck / test / build / data-verify / derived-estimates / derived-benchmarks），判据 = exit + optional regex | 本迭代新增，编排层自写 |
| F16 | 现有官方条目 133 条 / 12 家；有基准分数的 official 条目 32 条、基座模型 23 个（覆盖率 24.1%） | `cli.mjs verify --json`、`benchmarks.generated.json` |

**AA 取数侧已由编排层实测（2026-11-09）**：`https://artificialanalysis.ai/leaderboards/models` HTTP 200 / 1.76MB / 2.6s，`robots.txt` 为 `Allow: /`；页面 `self.__next_f.push([1,"…"])` 载荷内 `"initialModels":[...]` 共 282 条记录，字段为 `slug / name / shortName / deprecated / isReasoning / isOpenWeights / paramClass / priceClass / modelCreatorName / contextWindowTokens / intelligenceIndex / omniscience / scores{} / price1mInputTokens / price1mOutputTokens / cacheHitPrice / cacheWritePrice`；其中 99 条有 `intelligenceIndex`，94 条同时有分数与输入价；现有 23 条 basis 的 slug 对今日快照失配 0 条，分数变动 15 条（最大 +0.70）。

## 三、待设计轮定的问题（有设计空间，别当照稿实现）

1. **快照文件形态**：`price-history.jsonl` 单文件 vs 按月分片；delta 记录粒度（逐条 vs 逐日一条事件）；`baseline` 全量条的触发规则。
2. **AA 解析的失败语义**：模型数骤降 30% 的基线从哪来（固定常量 / 上一次快照 / 首次不判）。
3. **候选产物边界**：`benchmark-candidates.generated.json` 入库还是只落 `.cache`；它和手写 basis 的权威关系（谁覆盖谁）。
4. **档位政策落点**：政策写在 basis 的 `methodology` 里（现状）还是要升级成结构化字段，以便脚本自动执行「取实际最高分档」。
5. **漂移告警口径**：#15 的分数漂移与 #10 的档位结构漂移，是合并成一个 `drift-report` 还是两个命令各自输出。
6. **#10 与既有 plans-drift 的关系**：扩展现有实现还是新增 `plans-structure-drift`（票面要求「档位结构 + 额度语义」，现实现只查月费数字）。

## 四、红线（违反即打回）

1. **不手改 `src/data/generated/`** 下任何文件：它们是生成物，改了会被下次生成覆盖。
2. **不改任何官方价格与 `api.json` 条目内容**：本迭代只做取数与监控，价格维护走 `cli add` 人工核验。
3. **不给项目新增运行时依赖**（`package.json` 的 `dependencies` 保持 vue / vue-router / zod 三项）；解析与写入只用 Node 内置能力。
4. **不在构建期或浏览器运行期发网络请求**：网络只允许出现在 CLI 命令与 workflow 里。
5. **未评测就不给分**：缺分数一律 null / 「—」，禁止 0 分、禁止模糊匹配到近名模型、禁止用别的档位顶替。
6. **失败不写文件**：网络失败 / 解析失败 / 结构异常时保持磁盘原样并以非 0 退出码结束。
7. 文件编码 UTF-8、行尾跟目标文件既有风格（JS/JSON 为 LF，`src/data/estimates/*.json` 为 CRLF，改前用字节探针确认）；不写 emoji。

## 五、三锻收口铁律（本轮所有阶段继承，执行体照此办）

状态链：`implementing → acceptance →（failed → rework → acceptance）→ accepted_pending_commit → committed_pending_report → completed`。

1. **验收通过才可提交**：本迭代全部必需验收项通过才解锁提交；编码完成、单测部分绿均不算。
2. **失败只返工失败部分**：按失败项编号派修复单，范围限该失败项与必要根因；不重开整轮、不夹带新需求；不许删断言/放宽判据换通过。
3. **按迭代合并提交**：由编排层把代码 + 测试 + 配置 + 文档合成一个迭代交付提交；执行体**不做任何 git 操作**。
4. **终验报告是完成门**：报告在提交后定稿，五段：范围与清单 / 逐项结论与证据 / 失败返工复验链 / 实际提交哈希 / 遗留边界。
5. **报告入库不算第二个功能批**：允许随后只提交报告与状态回填，禁止夹带未复验代码。

## 六、验收口径（编排层亲跑，执行体不要试构建）

| 项 | 判据 |
|---|---|
| 门禁 | `node scripts/qa/run-gates.mjs` 6 条全绿（含 typecheck / 493+ 项测试 / 构建 / verify / 两个 `--check`） |
| #16 | 同日两次快照字节数不变（幂等）；改一条价格后 delta 恰好 1 条且 `change:"price"` 带新旧值；只改 `fetchedAt` 不产生记录；`replay --id` 能还原三个历史时点；单条 delta < 500 字节 |
| #15 | `pull-benchmarks` 成功时只 1 个 HTTP 请求；断网/坏页面时非 0 且 `src/data/` 零改动；同日两跑产物逐字节一致；分数漂移 >0.5 列出清单且含 Claude Opus 5.5 |
| #10 | 档位结构漂移能输出「漏档 / 合并 / 下架」三类；额度语义变化不再被当成「无法判定」；只告警不改数据 |
| 回归 | 页面仍显示「—」而非 0 分；`verify` 严重 0；构建 6 路由；禁 JS 静态 HTML 仍有分数与 `fetchedAt` |

## 七、产物落点（约定）

```
docs/.hermes/tasks/20261109-v0.7.0-data-base/
  requirements.md        ← 本文件
  issues-dossier.md      ← 三张票全文
  architecture.md        ← 阶段 A 产出（OpenCode）
  implementation-plan.md ← 阶段 A 产出（OpenCode）
  coding-result.md       ← 阶段 B 产出（Codex）
  REVIEW-CODEX.md        ← 阶段 C 产出
  FINAL-ACCEPTANCE.md    ← 编排层
  status.json / task.json
```
