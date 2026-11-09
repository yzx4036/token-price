# v0.7.0 数据基座与可信度实施计划

## 1. 执行纪律

- 严格 B1 → B2 → B3；每批先专项测试，再执行总门禁 `node scripts/qa/run-gates.mjs`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:34），期望 6/6 通过、测试不少于 493 项、verify 严重错误 0。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:70）
- 新文件统一 UTF-8 + LF；修改 `src/data/estimates/benchmark-basis.json`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:26）前先做字节探针确认 CRLF，写回保持 CRLF。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:56）
- 不手改 `src/data/generated/`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:50）；所有生成物只能由对应脚本产生。全程不执行 add、commit、checkout 或其他 git 写操作。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:64）

## 2. B1：价格历史快照管道

### 文件清单

- 新增 `scripts/data/history.mjs`（待验证：入口 CLI 测试）。
- 新增 `scripts/data/lib/history.mjs`（待验证：单元测试覆盖导出）。
- 新增 `src/data/history/price-history.jsonl`（待验证：首次 snapshot 生成，不手写）。
- 修改 `.github/workflows/data-refresh.yml`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:31），只增加 verify 后的非阻塞快照与摘要告警。（待验证：workflow 文本断言）
- 新增 `tests/history.test.ts`（待验证：Vitest 收集结果）与 `tests/fixtures/history/`（待验证：实施前查看既有 `tests/fixtures/` 命名和加载方式后照抄）。

### 步骤序

1. 在纯函数层实现 `PriceState` 提取、六字段比较、`price|currency|new|removed` 分类和 official 过滤。（待验证：参数化 fixture）
2. 实现 JSONL 全文件校验、上一状态重放、月初 baseline、当日 `date+kind` 替换、无变化零写入与 `HISTORY_SPLIT_THRESHOLD_LINES = 2000`（待验证：边界单测）；只做阈值，不做分片。
3. 实现 `snapshot` 与 `replay --id`（待验证：子进程测试），写入采用同目录临时文件 + rename 的原子模式。（实证：scripts/data/lib/io.mjs:41）
4. 用三时点 fixture 验证回放，再接入工作流；失败步骤追加 warning 摘要并吞掉该步骤退出码，不影响后续提交。（待验证：workflow 文本断言）

### 测试断言与 fixture

- `tests/history.test.ts`（待验证：测试收集）使用 `tests/fixtures/history/api-before.json`、`api-price-changed.json`、`api-fetched-at-only.json`（待验证：按现有 fixture 风格创建）：同日双跑字节相同；单价格变化仅 1 条、类型为 price 且 before/after 完整；只变 fetchedAt 零事件。
- 同文件使用 `tests/fixtures/history/three-points.jsonl`（待验证：回放快照测试）：指定 id 还原三个日期；currency/new/removed 分类正确；月初同时允许 baseline 与 delta。（待验证：参数化断言）
- 同文件构造坏 JSONL 与不可写目标（待验证：临时目录测试）：非 0、原文件哈希不变；单条 delta UTF-8 字节数 `<500`。（待验证：Buffer.byteLength 断言）

### 验收、回退与禁区

- 专项命令 `npx vitest run tests/history.test.ts`（待验证：实施后执行），期望全部通过；`node scripts/data/history.mjs snapshot`（待验证：实现后执行）连续两次文件字节数相同；`node scripts/data/history.mjs replay --id <fixtureId>`（待验证：fixture id 落定后执行）输出三个时点。
- 随后执行总门禁并期望 6/6 绿。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:72）失败则停在 B1，仅修复 B1；不产生 B2/B3 文件，保留通过的 fixture 与历史契约。（待验证：批次检查表）
- B1 不碰 `src/lib/*`、`scripts/data/gen-benchmarks.mjs`、`src/data/estimates/*`、既有 `scripts/data/lib/plans-drift.mjs`。（实证：scripts/data/lib/plans-drift.mjs:71）

## 3. B2：AA 取数、档位政策与分数漂移

### 文件清单

- 新增 `scripts/data/pull-benchmarks.mjs`（待验证：入口测试）、`scripts/data/lib/benchmarks-pull.mjs`（待验证：解析测试）、`scripts/data/lib/benchmarks-drift.mjs`（待验证：漂移测试）。
- 修改 `scripts/data/cli.mjs`（实证：scripts/data/cli.mjs:181），增加 `benchmarks-drift`（待验证：分发测试）及帮助。
- 修改 `src/data/estimates/benchmark-basis.json`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:26），只增 `methodology.tierPolicy.mode`（待验证：schema 断言），值为 `highest-score`（待验证：最高档 fixture）。
- 由脚本生成 `.cache/aa-models.json` 与 `src/data/generated/benchmark-candidates.generated.json`（待验证：成功拉取集成测试），前者不入库、后者入库。
- 新增 `tests/benchmarks-pull.test.ts`、`tests/benchmarks-drift.test.ts` 与 `tests/fixtures/benchmarks/`（待验证：先照抄现有 fixture 组织方式）。

### 步骤序

1. 先以字节探针记录 basis 行尾，再结构化加入政策字段并保持原中文说明与 CRLF。（待验证：改前后字节测试）
2. 实现 RSC 字符串字面量提取器：只用正则定位 push 调用边界，字符串本体交给 JSON 解码；拼接后定位 initialModels，再以字符串/转义感知的括号配平截数组。（待验证：含转义引号和嵌套数组 fixture）
3. 单次调用既有 `fetchWithTimeout`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:23），在内存完成结构检查、30% 降幅检查、mapping slug 全存在检查、最高分档选择和稳定排序；首次无缓存跳过降幅。（待验证：fetch spy 与三组基线 fixture）
4. 所有校验通过后才原子写两份文档；`--check`（待验证：入口测试）只比对、不写；日期字段按 UTC 日稳定。（待验证：同日双跑与 mtime/hash）
5. 实现只读比较和 CLI 格式化；分数差绝对值严格 `>0.5` 才报告，档位切换与 slug 消失独立列出。（待验证：0.5/0.51 fixture）

### 测试断言与 fixture

- `tests/benchmarks-pull.test.ts`（待验证：测试收集）使用 `tests/fixtures/benchmarks/aa-rsc.html`、`aa-rsc-bad.html`、`aa-models-previous.json`、`basis.json`（待验证：按既有 fixture 风格创建）：一次 HTTP；多段反转义和括号配平正确；坏页、断网、下降 30.1%、mapping slug 消失均抛 `CliError` 且两个目标哈希不变。
- 同文件断言下降恰 30% 可继续、首次无基线可继续、同 slug 多档取最高分、缺分不补 0、不模糊匹配、不回写 mapping、候选稳定排序且同日两跑逐字节一致。（待验证：表驱动断言）
- `tests/benchmarks-drift.test.ts`（待验证：测试收集）使用 `tests/fixtures/benchmarks/drift-current.json`（待验证：含 Claude Opus 5.5 案例）：列全 >0.5 分变化，并分别命中 tierChanges 与 missingSlugs；执行前后输入哈希相同。
- 回归现有 `gen-benchmarks.mjs --check`（实证：scripts/data/gen-benchmarks.mjs:51），确认 danglingMappings 与语义错配守卫仍生效。（实证：scripts/data/gen-benchmarks.mjs:34）

### 验收、回退与禁区

- 专项命令 `npx vitest run tests/benchmarks-pull.test.ts tests/benchmarks-drift.test.ts`（待验证：实施后执行）、`node scripts/data/pull-benchmarks.mjs --check`（待验证：成功拉取后执行）、`node scripts/data/cli.mjs benchmarks-drift --json`（待验证：实现后执行）；期望测试全绿、check 一致、JSON 三类数组齐全且 Opus 变化入列。
- 再跑总门禁，期望 6/6 绿；失败停在 B2，保留已验收的 B1 历史产物，不启动 B3；B2 写前失败保留原缓存与原 candidates。（待验证：故障注入哈希）
- B2 不碰 `src/lib/*`、页面组件、`src/data/entries/*`、`scripts/data/lib/plans-drift.mjs` 与 B1 历史文件。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:50）

## 4. B3：套餐结构与额度语义漂移

### 文件清单

- 新增 `scripts/data/lib/plans-structure-drift.mjs`（待验证：单元测试）。
- 修改 `scripts/data/cli.mjs`（实证：scripts/data/cli.mjs:238），新增 `plans-structure-drift`（待验证：分发测试）并保持原 `plans-drift` 分支不变。
- 修改 `.github/workflows/data-refresh.yml`（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:31），在 pull 周期追加只读报告与 Actions 摘要。（待验证：workflow 文本断言）
- 新增 `tests/plans-structure-drift.test.ts` 与 `tests/fixtures/plans-structure/`（待验证：实施前照抄现有 fixture 组织方式）。

### 步骤序

1. 复用或等价调用页面归一化和价格 token 规则，但新逻辑独立落在新 lib；不得修改 `runPlansDriftCommand`。（实证：scripts/data/lib/plans-drift.mjs:71）
2. URL 去重抓取后按 provider/page 做录入价格集合与页面价格集合双向比较，依次分类漏档、合并、下架；抓取失败、纯 CSR、无 token 归 unknown。（待验证：分类 fixture）
3. 从 allowance、availableModels 与 allowanceNature 的记录值提取数字和模型名证据，与可解析页面高信息 token 比较；证据消失只报告 allowanceChanges，不自动改数据。（待验证：语义变化 fixture）
4. 接 CLI 文本/JSON 与工作流摘要；报告漂移不设非 0，仅输入结构错误失败。（待验证：子进程测试）

### 测试断言与 fixture

- `tests/plans-structure-drift.test.ts`（待验证：测试收集）使用 `tests/fixtures/plans-structure/unchanged.html`、`missing-tier.html`、`merged-tier.html`、`removed-tier.html`、`allowance-changed.html`、`csr.html` 与 `plans.json`（待验证：按既有 fixture 风格创建）：分别断言一致、漏档、合并、下架、额度变化、无法判定，且覆盖率 N/M 正确。
- 同文件用 fetch spy 断言共享 URL 只请求一次；报告前后 plans 与页面 fixture 哈希不变；页面多出价格不能误写套餐。（待验证：只读断言）
- 原有套餐漂移测试全量回归，固定 `plans-drift` 输出和行为不变。（实证：scripts/data/lib/plans-drift.mjs:145）

### 验收、回退与禁区

- 专项命令 `npx vitest run tests/plans-structure-drift.test.ts`（待验证：实施后执行）与 `node scripts/data/cli.mjs plans-structure-drift --json`（待验证：实现后执行），期望四类漂移、unknown、coverage 字段齐全且磁盘零改动。
- 最后执行总门禁，期望 6/6 绿。（实证：docs/.hermes/tasks/20261109-v0.7.0-data-base/requirements.md:72）失败只返工 B3，保留 B1/B2 已通过产物和测试，不回退它们。（待验证：批次结果记录）
- B3 不碰 `scripts/data/gen-benchmarks.mjs`、`scripts/data/pull-benchmarks.mjs`、`scripts/data/lib/benchmarks-*`、`src/data/estimates/*`、`src/data/generated/*`、`src/lib/*`，也不修改既有 `scripts/data/lib/plans-drift.mjs`。（实证：scripts/data/lib/plans-drift.mjs:1）
