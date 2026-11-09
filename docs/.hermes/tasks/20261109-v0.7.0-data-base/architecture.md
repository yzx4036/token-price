# v0.7.0 数据基座与可信度架构

## 1. 总体边界

- 交付严格按 B1 → B2 → B3；前批专项验收与总门禁均绿才进入后批，失败只返工当前批。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:8）
- 所有网络访问仅发生在数据 CLI 或工作流；运行时页面不取数，不新增依赖。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:50）
- 统一复用 `CliError`、`todayIso`、`readJson`、`readJsonIfExists` 与原子写模式。（实证：scripts/data/lib/io.mjs:21）

## 2. 命令契约

| 命令 | 入口与参数 | 输出 | 退出码 |
|---|---|---|---|
| `snapshot`（待验证：实现后执行 `node scripts/data/history.mjs snapshot`） | `scripts/data/history.mjs`（待验证：实现后检查入口测试），无必填参数 | 更新 `src/data/history/price-history.jsonl`（待验证：同日双跑比较字节）；无变化不写 | 成功 0；输入、历史格式或写入失败非 0；工作流捕获后只告警（待验证：故障 fixture + workflow 测试） |
| `replay`（待验证：实现后三时点 fixture） | `scripts/data/history.mjs replay --id <entryId>`（待验证：缺参反例） | stdout 输出日期、变化类型、旧值、新值；不写文件（待验证：前后文件哈希） | 成功 0；缺参、未知 id、历史损坏非 0（待验证：CLI 测试） |
| `pull-benchmarks`（待验证：实现后命令测试） | `scripts/data/pull-benchmarks.mjs [--check]`（待验证：仿照生成器入口）；`--check` 只校验磁盘产物，不覆盖 | 普通模式写两份快照；`--check` 报一致或陈旧（待验证：双跑 fixture） | 网络、解析、结构、slug 校验、模型数降幅 `>30%` 或 check 不一致均非 0，且校验类失败零写入（待验证：坏页与降幅 fixture） |
| `benchmarks-drift`（待验证：实现后 CLI 分发测试） | `scripts/data/cli.mjs benchmarks-drift [--json]`（待验证：扩展 `switch`）；无网络参数 | 文本或 JSON 报分数变化、档位切换、slug 消失；只读（待验证：产物哈希） | 报告到漂移仍为 0；输入/结构错误非 0（待验证：CLI 错误测试） |
| `plans-structure-drift`（待验证：实现后 CLI 分发测试） | `scripts/data/cli.mjs plans-structure-drift [--json]`（待验证：扩展 `switch`）；页面抓取沿用可注入 fetch 形态 | 文本或 JSON 报漏档、合并、下架、额度语义变化、无法判定；只读（待验证：fixture） | 发现漂移仍为 0；整体输入结构错误非 0；单页抓取失败进入无法判定（待验证：CLI 与 CSR fixture） |

`--json` 继续由顶层剥离并传递，命令分发沿用现有 `switch`。（实证：scripts/data/cli.mjs:160）`pull-benchmarks`（待验证：实现后脚本测试）保持顶层 `main()`、`--check` 和 `CliError` 包装，与现有生成器一致。（实证：scripts/data/gen-benchmarks.mjs:17）

## 3. 文件与职责

### B1
- `scripts/data/history.mjs`（待验证：实现后入口测试）：仅解析 `snapshot` / `replay`，格式化输出和设置退出码。
- `scripts/data/lib/history.mjs`（待验证：单测导出）：筛 official、计算 delta/baseline、同日替换、回放；不得依赖前端 `src/lib/*`。
- `src/data/history/price-history.jsonl`（待验证：快照验收）：版本化事件产物；阈值常量 `HISTORY_SPLIT_THRESHOLD_LINES = 2000`（待验证：常量单测），本轮不分片。
- `.github/workflows/data-refresh.yml`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:31）：在 verify 通过后调用快照，失败写 Actions 告警但不中断刷新。（待验证：workflow 文本断言）

### B2
- `scripts/data/pull-benchmarks.mjs`（待验证：解析 fixture）：单次 GET、RSC 解码、全量校验、两份产物的统一提交。
- `scripts/data/lib/benchmarks-pull.mjs`（待验证：解析单测）：提取全部 `self.__next_f.push([1,"…"])` 字符串字面量、逐段 JSON 反转义、拼接、定位 `"initialModels":`、数组括号配平和精确 slug 选择；禁止正则直接截取转义对象。
- `scripts/data/lib/benchmarks-drift.mjs`（待验证：漂移 fixture）：纯函数比较手写基座与 AA 快照并格式化报告。
- `.cache/aa-models.json`（待验证：成功拉取）：全量 AA 快照，不入库，亦是 30% 降幅基线。
- `src/data/generated/benchmark-candidates.generated.json`（待验证：生成测试）：仅保存 `mapping` 精确命中的今日候选，脚本生成并入库，人工不得手改。
- `src/data/estimates/benchmark-basis.json`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:26）：保留中文说明，并新增 `methodology.tierPolicy.mode = "highest-score"`（待验证：改前字节探针确认 CRLF，改后 schema 测试）。
- `scripts/data/cli.mjs`（实证：scripts/data/cli.mjs:181）：只增加漂移分发与帮助，不承载比较算法。（待验证：CLI 测试）

### B3
- `scripts/data/lib/plans-structure-drift.mjs`（待验证：fixture 单测）：独立实现价格集合双向比较与额度高信息 token 比较；不改既有实现。
- `scripts/data/cli.mjs`（实证：scripts/data/cli.mjs:238）：增加新命令并保留 `plans-drift` 原分支行为。（待验证：旧测试全绿）
- `.github/workflows/data-refresh.yml`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:31）：仅在 pull 周期执行只读报告并写摘要。（待验证：workflow 文本断言）

## 4. 数据结构

### 4.1 历史事件

每行是 `HistoryEvent = {date, kind, entries}`（待验证：JSONL schema 测试）：`date` 为 `YYYY-MM-DD`；`kind` 为 `delta | baseline`；`entries` 为 `Record<entryId, ...>`。每月 1 日写一条 `baseline`，并在有变化时另写同日 `delta`；同日同 kind 以新事件替换。（待验证：月初与同日 fixture）

`PriceState`（待验证：fixture schema）含 `inputPrice/outputPrice/cacheReadPrice/cacheWritePrice: number|null`、`billingCurrency: string`、`provenance: JSON value`、`verifiedAt: string|null`；仅前六个业务字段参与变化比较，`verifiedAt` 只随状态留档，`fetchedAt` 不读取也不输出。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:73）

`baseline.entries[id] = PriceState`（待验证：baseline fixture）；`delta.entries[id] = {change,before,after}`（待验证：delta fixture），其中 `change` 为 `price|currency|new|removed`，`before/after` 为 `PriceState|null`。币种变化优先归 `currency`；新增和移除分别允许一侧为 null；其余比较字段变化归 `price`。（待验证：四类参数化测试）

### 4.2 candidates 产物

`BenchmarkCandidatesDocument = {generatedAt,source,tierPolicy,candidates}`（待验证：schema fixture）：`generatedAt` 取 UTC 日期以保证同日稳定；`source = {name,url,fetchedAt,modelCount}`（待验证：拉取测试）；`tierPolicy = {mode:"highest-score"}`（待验证：政策测试）；`candidates` 按展示模型名稳定排序。（待验证：乱序 fixture）

每个 `candidate = {displayModel,aaSlug,aaName,creator,score,tierUsed,contextWindowTokens,inBasis}`（待验证：候选 fixture）；只来自权威 `mapping` 的精确 slug，AA 同 slug 多档取数值 `intelligenceIndex` 最高档；无分数不伪造候选，未进 `benchmarks` 者以 `inBasis:false` 暴露但不回写 mapping。（待验证：多档、缺分、未收录 fixture）

### 4.3 drift 结果

`BenchmarksDriftResult = {ok,readOnly,threshold,scoreChanges,tierChanges,missingSlugs}`（待验证：JSON 快照测试）；`threshold = 0.5`，仅 `abs(currentScore-basisScore)>0.5` 进入 `scoreChanges`，档位变化独立进入 `tierChanges`，快照无 slug 进入 `missingSlugs`。（待验证：边界值 0.5/0.51）

`PlansStructureDriftResult = {ok,readOnly,coverage,missingTiers,mergedTiers,removedTiers,allowanceChanges,unknown}`（待验证：JSON 快照测试）；页面新增价格归漏档，多个已录价格只剩一个可命中价格归合并，已录非零价格消失归下架；记录里的额度数字、模型名或 `allowanceNature` 证据在可解析页面消失归额度语义变化；抓取失败或无价格 token 归无法判定。（待验证：五类 fixture）

## 5. 依赖、失败与幂等

- B1 只消费合并输入后筛出的 official 条目并产历史；不消费 B2/B3 产物。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/issues-dossier.md:17）
- B2 拉取先在内存完成 HTTP、解析、数量降幅、mapping 全量存在性、最高分档选择与序列化，全部通过后才写缓存和 candidates；任一步失败均不进入写阶段。（待验证：每个故障点前后哈希）
- B2 漂移只消费 `benchmark-basis.json` 与 `.cache/aa-models.json`（待验证：依赖注入测试）；不联网、不改基座。首次无缓存不判降幅，已有缓存以模型总数为分母，下降严格超过 30% 才失败。（待验证：首次、30%、30.1% fixture）
- B3 只消费套餐真源与抓取页面，不依赖历史或 AA；页面按 URL 去重抓取，沿用既有“一 URL 一次”惯例。（实证：scripts/data/lib/plans-drift.mjs:95）
- JSONL 先完整读取和校验，再在内存按 `date+kind` 替换并以 LF 原子覆盖；无事件则不写。（待验证：坏历史、同日双跑、LF 字节测试）两份 AA 产物在所有校验完成后才提交；`--check` 永不写。（待验证：mtime 与哈希）

## 6. 本轮不做

- 不做走势图、历史文件打包或页面展示改动。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/issues-dossier.md:13）
- 不展示 AA 新分项，不改前端评分列，不自建指数、不引多源、不模糊匹配。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/issues-dossier.md:108）
- 不自动新增 mapping、不自动改 benchmark 分数、不自动改套餐或价格真源。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:50）
- 不实现历史月分片；只保留 2000 行阈值常量。（待验证：常量存在且无分片文件测试）
