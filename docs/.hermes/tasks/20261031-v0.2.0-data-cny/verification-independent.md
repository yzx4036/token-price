# 独立复核笔记（第二执行体视角，2026-10-31 19:5x）

> 本文件不修改任何实现文件，只记录复核结论与并发写入事故，供验收时与 `coding-result.md` 对读。

## 0. 必须先说明的事故：同一工作树上有两个执行体

本次迭代执行期间，`<repo>` 同时被两个 OpenCode 会话写入：

| 时间 | 事件 |
|---|---|
| 19:38 | 出现第二份工作副本 `<repo>-riven`（无 .git） |
| 19:41:05 / 19:41:29 | 本会话写的 `src/data/providers.json`、`src/data/entries/api.json` 被替换为另一套数据（provider 名形如「阿里云百炼 通义千问」） |
| 19:45:47–19:45:49 | `src/lib/*`、`tests/*`、`src/pages/*`、`src/scripts/*` 被全量重写为另一套实现（JSON 直接 import，`mergeApiPrices` 移入 `schema.ts`），本会话的 `src/lib/merge.ts` 被删除 |
| 19:45 | 出现 `architecture.md`、`coding-result.md`，`status.json` 置为 `implementation_done`，`actual_executors.implementation = "opencode/riven-main"` |
| 19:46 | 混合态导致门禁全红：`verify` 报 `PROVIDER_MISSING: meta...`（本会话 19:44 生成的 `aggregate.generated.json` 与对方 `providers.json` 不匹配）、`build` 抛错、`vitest` 14 个文件红 |
| 19:48:43 起 | 对方停止写入，工作树稳定；门禁恢复全绿 |

结论：**当前工作树是第二个执行体的完整实现，本会话的实现文件已被其覆盖。** 本会话随即停止写入实现文件，改为独立复核，避免互相踩踏。若后续仍要并行，请为每个执行体分配独立 worktree（`opencode worktree_create`），不要共用同一目录。

## 1. 复核口径

- 复核对象：当前工作树（第二个执行体的实现）。
- 复核方法：本会话自己抓取的官方页面正文（`.cache/mine/*.html` 与 `*.txt` 抽取结果）逐条对拍；不采信 `coding-result.md` 的自述。
- 本会话实际抓取并解析过的页面：DeepSeek 中文定价页、Anthropic pricing、Google Gemini pricing、MiniMax 定价概览、火山方舟「模型价格」、阿里百炼「模型计费」、智谱 `pricing.md`、Mistral `inference/pricing`、xAI `docs/models`、models.dev 快照。

## 2. official 条目抽查结果（全部对得上）

| 厂商 | 条目 | 页面原文（本会话抓取） | 结论 |
|---|---|---|---|
| DeepSeek | deepseek-flash 空闲 1 / 4 / 0.02；高峰 2 / 8 / 0.04 | 「空闲时段 \| 0.02元 / 0.04元」「百万tokens输入（缓存未命中）空闲 1元 高峰 2元」「百万tokens输出 空闲 4元 高峰 8元」 | 一致 |
| DeepSeek | deepseek-v4-pro 空闲 4.5 / 13.5 / 0.15；高峰 9 / 27 / 0.30 | 同表 v4-pro 列：4.5 / 9.0、13.5 / 27.0、0.15 / 0.30 | 一致 |
| Anthropic | Fable 5.1 10/50/0.25/12.5；Opus 5.5 4/20/0.20/5；Sonnet 5.5 2/10/0.10/2.50；Opus 5 5/25/0.50/6.25；Sonnet 5 2/10/0.20/2.50；Sonnet 4.6 3/15/0.30/3.75；Haiku 4.5 1/5/0.10/1.25 | 「Claude Fable 5.1 \| $10 / MTok \| $50 / MTok \| $12.50 \| $20 \| $0.25」等逐列一致；Additional models 表列 Opus 5 / Sonnet 5 | 一致 |
| Anthropic | Haiku 5.5 两档 0.10/0.50 与 0.50/2.50 | 「$0.10 / MTok for prompts up to 100,000 tokens」「$0.50 / MTok for prompts over 100,000 tokens」 | 一致 |
| Google | 3.5 Flash-Lite 0.30/2.50/0.03；4 Argon 2/10/0.10；3.8 Flash 与 3.6 Flash 0.75/3.75/0.075；3.1 Flash-Lite 0.25/1.50/0.025；2.5 Pro 1.25/10/0.125；2.5 Flash 0.30/2.50/0.03；2.5 Flash-Lite 0.10/0.40/0.01；3 Flash Preview 0.50/3.00/0.05；3.1 Pro Preview 2.00/12.00/0.20 | 各模型 Standard 表逐项一致；Argon 标注 2026-11-30 后调价 | 一致 |
| MiniMax | M3.1-Flash 1/4/0.10 | 「MiniMax-M3.1-Flash \| 1.00 \| 4.00 \| 0.10」 | 一致 |
| 火山方舟 | evolving 6/30/1.20；2.1-pro 6/30/1.20；2.1-lite 0.8/2.7/0.16；2.1-turbo 3/15/0.60；2.0-pro 3.2/16/0.64；2.0-lite 0.6/3.6/0.12；2.0-mini 0.2/2/0.04；2.0-code 3.2/16/0.64；character 0.8/2/0.16；translation 1.2/3.6 | 「doubao-seed-evolving \| 6.00 \| 1.20 \| 30.00」等逐行一致 | 一致 |
| 阿里百炼 | qwen3.8-max 12/36；qwen3.7-max 12/36；qwen-max 2.4/9.6；qwen3.8-flash 0.8/2.7；qwen3.7-flash 0.2/0.8；qwen3.6-flash 1.2/7.2；qwen3.5-plus 0.8/4.8；qwen3.6-plus 2/12；qwen-long 0.5/2；qwen3.8-omni-flash 0.8/2.7/0.1 | 华北2（北京）表逐行一致 | 一致 |
| 智谱 | GLM-5.3 8/28/2；GLM-5.3-Flash 0.8/2.8/0.23；GLM-5.3-FlashX 2/7/0.57；GLM-5.2 8/28/2；GLM-5.1 6/24/1.3 与 8/28/2；GLM-5 4/18/1；GLM-4.7 2/8/0.4；GLM-4.5-Air 0.8/2/0.16；GLM-4-Plus 5/5/2.5；GLM-4-Long 1/1/0.5 | `docs.bigmodel.cn/cn/guide/start/pricing.md` 表格逐行一致 | 一致 |
| Mistral | Large 4 0.7/2.1/0.07；Small 4 0.15/0.6/0.015；Ministral 3 14B/8B/3B；Codestral 0.3/0.9/0.03 | 「Mistral Large 4 ↗ \| $0.7 \| $0.07 \| $2.1」等逐行一致 | 一致 |
| xAI | grok-4.7 2 / 6 | 「Input $2.00 / 1M tokens」「Output $6.00 / 1M tokens」 | 一致 |

**没有发现编造价格。** 抽查覆盖 9 家厂商、40+ 条 official 条目。

## 3. 需要验收人注意的 3 个判断题（不是错误，但影响读数）

1. **MiniMax-M3 两条录的是标准价（4.20 / 16.80 / 0.84）而非页面标注的「永久五折」实付价（2.10 / 8.40 / 0.42）。** 差异 100%。行内 note 已写明五折后实付值，但主列按标准价显示，与「账单真相」有 2 倍偏差。建议改成实付价，或把两档都拆成独立条目。
2. **阿里百炼 qwen3.7-plus 录 2 / 8，页面标注「原价 2 元（限时 8 折）」。** 同属口径选择：录原价而非折后价。已注明「不含活动优惠」。
3. **DeepSeek 峰谷价拆成两条，`drift` 会把它与聚合源的单一价格比出 +99.9% 差异。** 这是预期行为（聚合源只有一条），不是数据错误；`drift` 输出里已按「只报告」处理。

## 4. 门禁实跑（本会话独立执行，2026-10-31 19:49–19:51）

```text
$ npm run typecheck
Result (25 files):
- 0 errors
- 0 warnings
- 0 hints

$ npm test -- --run
Test Files  7 passed (7)
     Tests  95 passed (95)

$ npm run build
[build] 6 page(s) built in 313ms
[build] Complete!

$ node scripts/data/cli.mjs verify
问题清单：无
结论：通过（退出码 0）
统计：120 条 · 15 厂商 · official 47 · aggregate 73 · CNY 28 · USD 92

$ node scripts/data/cli.mjs drift
对拍条目：47 条 official · 匹配 38 条 · 未匹配 9 条
差异清单（阈值 5%）：DeepSeek 峰谷价 +99.9%/+104.5%、MiniMax M3 +100.7%、阿里百炼 qwen3.6/3.7 系列 +6%~+9%
```

产物抽查：`dist/api-pricing/index.html` 120 行，国内行显示「人民币官方原价 / 官方原价 / ¥0.20」，国际行显示「按 6.669566 汇率估算（2026-10-31）」+「¥5.00」「$0.75 原价」；溯源筛选 `all / official / aggregate` 齐全；`dist/sources/index.html` 的 15 / 120 / 47 / 73 与 `verify` 输出一致；`dist/` 共 6 个路由（index、api-pricing、calculator、methodology、plans、sources）。
