# 编排层裁定 R（v0.7.0 · 轮 A 后）

> 本文件是**硬约束**，优先于 `architecture.md` 与 `implementation-plan.md` 的字面表述。
> 每条都有编排层亲验的实证；编码轮照此执行，偏离必须附实证并显式提请裁决。

## R1 `tierPolicy` 不得放进 `methodology`，改为 basis 根级键

- **设计稿原文**：`architecture.md` §3 B2 与 `implementation-plan.md` §3 要求「在 `benchmark-basis.json` 的 `methodology` 增加 `tierPolicy: { mode: "highest-score" }`」。
- **问题**：`scripts/data/lib/benchmark.mjs:80` 把 `basis.methodology` 原样拷进生成物 `benchmarks.generated.json`；而前端类型声明 `src/lib/benchmark-view.ts:22` 是 `methodology: Record<string, string>`。若塞入对象，生成物与声明类型不一致，且因为 `src/lib/data.ts:35` 用 `as unknown as` 断言，**类型检查不会报错**（静默说谎）。
- **裁定**：`tierPolicy` 作为 **basis 根级键**新增：`{"$comment":…, "source":…, "methodology":{…字符串…}, "tierPolicy": {"mode":"highest-score"}, "benchmarks":[…], "mapping":{…}}`。`methodology` 保持纯字符串值不动。
- **连带**：
  - `gen-benchmarks.mjs` 若需读取政策，从 `basis.tierPolicy` 读；**不得**把 `tierPolicy` 写进生成物（生成物结构不变，`BenchmarkDoc` 类型不动）。
  - `pull-benchmarks.mjs` 的 candidates 产物可以带 `tierPolicy` 字段（那是新产物，不受 `BenchmarkDoc` 约束）。
  - 修改 `benchmark-basis.json` 前先用字节探针确认 CRLF，写完保持 CRLF。

## R2 快照的 `verifiedAt` 不入比对字段

- **设计稿原文**：`architecture.md` §4.1 的 `PriceState` 含 `verifiedAt`，且写「仅前六个业务字段参与变化比较」。
- **裁定**：确认按此执行：`verifiedAt` 只随状态留档、不参与变化判定；`fetchedAt` 既不读取也不输出。判据测试必须两条同时在：改 `verifiedAt` 不产生事件、改 `inputPrice` 产生 1 条 `change:"price"`。

## R3 工作流步骤必须「吞掉退出码但仍可见」

- **设计稿原文**：B1 第 4 步「失败追加 warning 摘要并吞掉该步骤退出码」。
- **裁定**：写成 `node scripts/data/history.mjs snapshot || echo "::warning::快照失败（不阻断数据刷新）"` 形态（或 `|| true` + 单独上报），且**不得**因此让「有实质变化才提交」的判据失效：快照写盘落在 `git diff` 判定**之前**，这样快照变化会被一并提交；失败时不产生 diff，属预期。

## R4 禁止把历史文件打进产物

- **裁定**：`src/data/history/price-history.jsonl` 只作为仓库内数据文件存在，**不得**被 `src/lib/data.ts` 或任何 `.vue` 引用（本轮不展示）。验收要有一条 grep 断言：`src/` 下无 `price-history` 引用。
