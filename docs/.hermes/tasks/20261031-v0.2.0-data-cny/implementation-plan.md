# Implementation Plan · v0.2.0

按依赖顺序推进，每步结束都能构建/自测，不出现「半个仓库编译不过」的中间态。

| 阶段 | 内容 | 产出 | 状态 |
|---|---|---|---|
| P0 · 取数 | 实抓 6 家官方定价页（DeepSeek 中文 / 阿里百炼价格文档 / 火山方舟 / MiniMax / Anthropic / Gemini），记录原文行；模型可用性验证（Kimi、智谱 JS 渲染；OpenAI 403） | `.cache/pages/*` 原始 HTML/文本 + 本报告第 3 节摘录 | 完成 |
| P1 · schema | `billingCurrency / provenance / aggregateSource / aggregateFetchedAt`、provider/fx/aggregate 集合 schema、`mergeApiPrices` | `src/lib/schema.ts` | 完成 |
| P2 · 数据 | `providers.json`、`entries/api.json`（47 official）、`entries/plans.json` | 数据真源 | 完成 |
| P3 · CLI | `io/http/fx/pull/add/verify/drift` + `cli.mjs`，原子写、`--json`、中文帮助 | `scripts/data/**` | 完成 |
| P4 · 生成物 | `cli rate` 写 fx；`cli pull` 写 aggregate（73 条） | `src/data/generated/*.json`（入库） | 完成 |
| P5 · 纯函数 | `fx.ts / stats.ts / pricing.ts / format.ts / data.ts` | 页面与 CLI 共用 | 完成 |
| P6 · 页面 | 5 页改造 + `/sources/` 新增 + 布局页脚汇率声明 + CSS | `src/pages/**`、`BaseLayout`、`global.css` | 完成 |
| P7 · 测试 | 7 文件 95 用例（原 48 个保留并适配） | `tests/**` | 完成 |
| P8 · 门禁 | typecheck / test / build / verify / drift 全绿 | 本目录 `coding-result.md` 第 2 节 | 完成 |
| P9 · 文档 | `architecture.md`、`coding-result.md`、README「如何更新数据」、status.json | 本目录 + 仓库 README | 完成 |

## 关键决策记录

1. **数据文件用 JSON 而不是 TS 常量**：`add` 需要机读改写、`drift` 需要逐字段比对、review 需要 diff 可读；TS 常量做不到原子改写与稳定序列化。
2. **CLI 直接 import `src/lib/schema.ts`**：Node 原生类型剥离可用（Node ≥ 22.18 默认，低版本由 CLI 顶部 `--experimental-strip-types` 兜底），换来「只有一份 schema」。
3. **聚合补位白名单在生成阶段生效**：不依赖合并期兜底，避免生成物里塞满会被丢弃的条目。
4. **人民币排序 + 原币副行**：主列必须可跨厂商比较（CNY），但账单真相不能丢（原币 + 汇率标注）。
5. **统计只用一份实现**：`computeStats` 同时供首页、`/sources/`、`verify --json`，测试用 CLI 子进程比对两者完全相等。

## 待编排层决定的事项

- 并发执行体冲突（见 `coding-result.md` 第 0 节）：是否采用本轮产物、对方备份是否保留。
- 火山方舟 / 阿里百炼是否接受为 official（本轮已抓到完整价格表并附原文摘录，与编排层基线记录不同）。
