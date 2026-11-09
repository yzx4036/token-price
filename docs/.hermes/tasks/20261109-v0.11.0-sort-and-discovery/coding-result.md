# v0.11.0 编码结果

状态：三批实现及定向自检完成；扩展回归有 3 项旧断言与裁定冲突，等待小贤哥/编排层裁定，未宣告最终验收。

任务：`20261109-v0.11.0-sort-and-discovery`。按 RULINGS-A → implementation-plan → architecture → requirements 读取；开始状态为 implementing，coding 阶段 running。采用 project-coder 的 architecture-driven 路径，无架构重设计，无 Git 操作。R1 修正任务书 F4 的单位描述，以 reportedCurrency 为准。

## 1. 三批完成表

| 批 | 文件 | 完成步骤 | 实测命令与读数 |
|---|---|---|---|
| A | `src/lib/pricing.ts`、`fx.ts`、`copy.ts`、`src/views/ApiPricingView.vue`、`src/components/PriceTable.vue`；`tests/pricing.test.ts`、`fx.test.ts`、`copy-guard.test.ts` | 私有 valueInCny，字段选择币种分组；reportedCurrency → CNY；缺合法汇率时分段，错币种报价置空；单一真源文案及仅 value 显示的表级提示；同步旧摘要/caption/注释 | `npx.cmd vitest run tests/pricing.test.ts tests/fx.test.ts tests/copy.test.ts tests/copy-guard.test.ts`：61/61；`npm.cmd run typecheck`：0 |
| B1 | `scripts/data/config/provider-aliases.mjs`；`scripts/data/lib/discover.mjs`、`discover.d.mts`；`scripts/data/cli.mjs`；`tests/discover.test.ts` | 冻结五条带证据/日期的映射；只改变覆盖报告；完整 JSON 清单、文本归一对照/计数/剩余清单；top 仅截文本 | `npx.cmd vitest run tests/discover.test.ts`：14/14；`node scripts/data/cli.mjs discover --json`：0，174→169、命中5、完整剩余169；`node scripts/data/cli.mjs discover --top 3`：0；typecheck：0 |
| B2 | `scripts/data/lib/official-price-drift.mjs`、`official-price-drift.d.mts`；`scripts/data/cli.mjs`；`.github/workflows/data-refresh.yml`；`tests/official-price-drift.test.ts`、`tests/workflows.test.ts`；`tests/fixtures/official-price-drift/{deepseek,aliyun,volcengine,changed,invalid}.md` | 三个显式 parser、条件/区域/单位验证、确定性 SHA-256、逐字段 diff、逐厂商失败隔离；严格参数白名单；每周 report-only summary 接线 | `npx.cmd vitest run tests/official-price-drift.test.ts tests/workflows.test.ts tests/data-cli.test.ts`：74/74；`node scripts/data/cli.mjs official-price-drift`：三家 HTTP200，4/11/10 行，均 unchanged，exit0；typecheck：0 |

每批自检通过才进入下一批。定向最终复验：上述八个测试文件合跑 **149/149**。新增测试数：A 17、B1 5、B2 37，共 59；基于任务书基线644，预期全套703，尚未用总门禁实测。

扩展回归命令：

```text
npx.cmd vitest run tests/pricing.test.ts tests/fx.test.ts tests/copy.test.ts tests/copy-guard.test.ts tests/discover.test.ts tests/official-price-drift.test.ts tests/workflows.test.ts tests/data-cli.test.ts tests/ux-refactor.test.ts tests/v040-features.test.ts tests/benchmarks.test.ts tests/chart-geometry.test.ts tests/pricing-chart-data.test.ts
```

读数：**258 passed / 3 failed / 261**。三个失败都来自 `tests/ux-refactor.test.ts:63` 的 `it.each(SORT_KEYS)`，要求 intelligence/value/provider 也固定 USD 组在前。新裁定明确这些字段全表比较；未擅自删除/放宽旧断言。已通过异步问题请求允许按新口径更新这三项，待答复。价格字段及 contextTokens 的既有断言均通过。

## 2. A：同 fixture 排序前后

固定六行 fixture 见 `tests/pricing.test.ts`：usd-high(score60,cost3,USD)、usd-low(30,1,USD)、cny-low(40,2,CNY)、aggregate(50,0.5,USD报价/CNY账单)、missing(无分)、pending(score100但待处理)。汇率固定7，原始输入/输出价继承同一 Google 条目；pending 即使带分也不前移。

| 排序 | 改前完整序列 | 改后完整序列 |
|---|---|---|
| intelligence desc | usd-high, usd-low, missing, pending, aggregate, cny-low | usd-high, aggregate, cny-low, usd-low, missing, pending |
| value asc | usd-low, usd-high, missing, pending, aggregate, cny-low | cny-low, aggregate, usd-low, usd-high, missing, pending |
| inputPrice asc | usd-high, usd-low, missing, pending, cny-low, aggregate | usd-high, usd-low, missing, pending, cny-low, aggregate |

value 的 CNY 数值序列为 **2, 3.5, 7, 21, null, null**，单位 CNY / 智能分 / 百万混合 token。aggregate 按 USD 报价折算为3.5，不能按 CNY 账单币种误读为0.5。缺汇率、0、NaN、Infinity 四种输入均退回币种分段，aggregate 为 null；测试同时验证升降序。

真实178行 fixture 使用修改前同一份 apiPrices、benchmarkDoc、fxRate。改前已保存完整序列再动源码；真实 rate 为6.690826，展示四位为6.6908。改前智能降序索引86~90为：`meta-muse-spark-1-3-contributor, meta-muse-wonder-1-0, moonshot-kimi-k3-1-pro, aliyun-qwen3.8-max, deepseek-deepseek-flash-peak`，无分条目曾排在46分之前。改后单测验证全表分数单调不增、全部空值在末端、币种可相邻；真实性价比验证 CNY 值单调不减。

价格/上下文的五个字段 × 双方向 × 178行，修改前后逐项比较，**1780 个行位置差异为0**。另有独立固化的旧比较器，覆盖全部数据+pending+null fixture、合法/缺失汇率，两方向共20组。`tests/pricing.test.ts` 原 outputPrice 分组测试的函数体与修改前文本全等，只改名称与 describe。

以下为每条完整 ID 序列的 SHA-256（以 ID 用 LF 连接、无尾换行；before=after）：

| 字段 | 方向 | 行数 | 不同位置数 | 前后相同 SHA-256 |
|---|---|---|---|---|
| inputPrice | asc | 178 | 0 | `ceafe2b4abededbf5f338d2097619450193eac7266695e6bb2daf0b0212c4488` |
| inputPrice | desc | 178 | 0 | `32cd8a7524d55127ccab45fff2f529118303eb801c91f3f229c1047131080746` |
| outputPrice | asc | 178 | 0 | `b045139f3a83a2dea5bbb58152a1db28fd8361e1ffea35fa30898c348b717b28` |
| outputPrice | desc | 178 | 0 | `9e054dad833461634fab0f522dfdff5a7a1b441ce178ef5d12d05d7f2b400249` |
| cacheReadPrice | asc | 178 | 0 | `c3d697a8d744976053b35194768eb804b1cd9dc79a21ec40561a3ef781745088` |
| cacheReadPrice | desc | 178 | 0 | `7fd229c95af19caa0d611778ef0a220c0ab33da729e8b577615d5c54bdff83b2` |
| cacheWritePrice | asc | 178 | 0 | `9ea01d539e4258da954032024afabc575b97a1790035563da74a06982bc58bd2` |
| cacheWritePrice | desc | 178 | 0 | `02c3df08d0e82bc775518f722afa8fdb9fda27e917b3fced6d42200c35838968` |
| contextTokens | asc | 178 | 0 | `1228f3c440c42200d9b42204499e2622aa85d016a4f2b01383458e3b6e12dba5` |
| contextTokens | desc | 178 | 0 | `069fdb30b7dd84ab3d8a006b60535acaa77cfa462adf4f479ffa0f51c1652008` |

真实序列完整输出（折叠，保留供编排层逐行复核）：

<details>
<summary>178 行 intelligence/value 修改前后与不变的 inputPrice asc</summary>

```text
intelligence:desc before:
claude-opus-5-5, openai-gpt-6-astra, openai-gpt-6-astra-long-context, openai-gpt-6-1-sol, openai-gpt-6-1-sol-long-context, claude-sonnet-5-5, openai-gpt-6-1-terra, openai-gpt-6-1-terra-long-context, google-gemini-4-argon, claude-fable-5-1, claude-haiku-5-5, claude-haiku-5-5-long, xai-grok-4-7-prompt-200k-lt200k, xai-grok-4-7-prompt-200k-ge200k, google-gemini-3-8-flash, openai-gpt-6-luna, openai-gpt-6-luna-long-context, mistral-mistral-large-4, google-gemini-3-5-flash-lite, mistral-mistral-small-4, cohere-c4ai-aya-expanse-32b, claude-haiku-4-5, claude-opus-5, claude-sonnet-4-6, claude-sonnet-5, cohere-command-a-03-2025, cohere-command-a-plus-05-2026, cohere-command-a-reasoning-08-2025, cohere-command-a-translate-08-2025, cohere-command-a-vision-07-2025, cohere-command-r7b-12-2024, cohere-command-r7b-arabic-02-2025, openai-gpt-daybreak-blue-latest, openai-gpt-daybreak-red-latest, mistral-deepseek-v4-1-flash-1017, mistral-devstral-2512, google-gemini-2-5-flash, google-gemini-2-5-flash-lite, google-gemini-2-5-pro, google-gemini-3-flash-preview, google-gemini-3-1-flash-lite, google-gemini-3-1-pro-preview, google-gemini-3-6-flash, mistral-glm-5-2, mistral-zai-glm-5-3, mistral-zai-glm-5-3-flash, openai-gpt-5-4-272k-context-length, openai-gpt-5-4-pro-272k-context-length, openai-gpt-5-5-272k-context-length, openai-gpt-5-5-pro-272k-context-length, openai-gpt-5-6, openai-gpt-5-6-luna, openai-gpt-5-6-sol, openai-gpt-5-6-terra, openai-gpt-6-astra-law, openai-gpt-6-rosalind, openai-gpt-6-sol, openai-gpt-6-sol-long-context, openai-gpt-realtime-2-1, xai-grok-4-20-0309-non-reasoning, xai-grok-4-20-multi-agent-0309, xai-grok-4-20-0309-non-reasoning-prompt-200k-lt200k, xai-grok-4-20-0309-non-reasoning-prompt-200k-ge200k, xai-grok-4-20-0309-reasoning-prompt-200k-lt200k, xai-grok-4-20-0309-reasoning-prompt-200k-ge200k, xai-grok-4-20-multi-agent-0309-prompt-200k-lt200k, xai-grok-4-20-multi-agent-0309-prompt-200k-ge200k, xai-grok-4-3-prompt-200k-lt200k, xai-grok-4-3-prompt-200k-ge200k, xai-grok-4-5-prompt-200k-lt200k, xai-grok-4-5-prompt-200k-ge200k, xai-grok-4-6-prompt-200k-lt200k, xai-grok-4-6-prompt-200k-ge200k, xai-grok-build-0-1-prompt-200k-lt200k, xai-grok-build-0-1-prompt-200k-ge200k, mistral-ministral-3-14b, mistral-ministral-3-3b, mistral-ministral-3-8b, mistral-mistral-large-4-0-8, mistral-mistral-medium-latest, mistral-mistral-medium-2604, mistral-mistral-small-latest, meta-muse-spark-1-1, meta-muse-spark-1-2, meta-muse-spark-1-2-contributor, meta-muse-spark-1-3, meta-muse-spark-1-3-contributor, meta-muse-wonder-1-0, moonshot-kimi-k3-1-pro, aliyun-qwen3.8-max, deepseek-deepseek-flash-peak, deepseek-deepseek-flash-idle, zhipu-glm-5-3, minimax-minimax-m3-1-flash, stepfun-step-5-preview, zhipu-glm-5-3-flash, deepseek-deepseek-v4-pro-peak, deepseek-deepseek-v4-pro-idle, minimax-minimax-m3-512k-plus, minimax-minimax-m3-512k, volcengine-doubao-seed-2-0-code, volcengine-doubao-seed-2-0-lite, volcengine-doubao-seed-2-0-mini, volcengine-doubao-seed-2-0-pro, volcengine-doubao-seed-2-1-lite, volcengine-doubao-seed-2-1-pro, volcengine-doubao-seed-2-1-turbo, volcengine-doubao-seed-character, volcengine-doubao-seed-evolving, volcengine-doubao-seed-translation, zhipu-glm-4-air-250414, zhipu-glm-4-airx, zhipu-glm-4-assistant, zhipu-glm-4-flash-250414, zhipu-glm-4-flashx-250414, zhipu-glm-4-long, zhipu-glm-4-plus, zhipu-glm-4-1v-thinking-flash, zhipu-glm-4-1v-thinking-flashx, zhipu-glm-4-5-air-le32k-long-output, zhipu-glm-4-5-air-le32k, zhipu-glm-4-5-air-gt32k, zhipu-glm-4-5v-le32k, zhipu-glm-4-5v-gt32k, zhipu-glm-4-6, zhipu-glm-4-6v-flash, zhipu-glm-4-6v-flashx-le32k, zhipu-glm-4-6v-flashx-gt32k, zhipu-glm-4-6v-le32k, zhipu-glm-4-6v-gt32k, zhipu-glm-4-7-flash, zhipu-glm-4-7-flashx, zhipu-glm-4-7-le32k-long-output, zhipu-glm-4-7-le32k, zhipu-glm-4-7-gt32k, zhipu-glm-4v-flash, zhipu-glm-4v-plus-0111, zhipu-glm-5-turbo-le32k, zhipu-glm-5-turbo-gt32k, zhipu-glm-5-1-le32k, zhipu-glm-5-1-gt32k, zhipu-glm-5-2, zhipu-glm-5-3-flashx, zhipu-glm-5-3-flashx-legal, zhipu-glm-5-le32k, zhipu-glm-5-gt32k, zhipu-glm-5v-turbo-le32k, zhipu-glm-5v-turbo-gt32k, zhipu-glm-ocr, zhipu-glm-z1-air, zhipu-glm-z1-airx, zhipu-glm-z1-flash, zhipu-glm-z1-flashx, tencent-hy4-preview, moonshot-kimi-k2-6, moonshot-kimi-k2-7-code, moonshot-kimi-k2-7-code-highspeed, moonshot-kimi-k3, moonshot-kimi-k3-1-pro-highspeed, xiaomi-mimo-v2-5, xiaomi-mimo-v2-5-pro, xiaomi-mimo-v2-5-pro-ultraspeed, xiaomi-mimo-v2-6-flash, xiaomi-mimo-v2-6-pro, xiaomi-mimo-v2-6-pro-ultraspeed, aliyun-qwen-long, aliyun-qwen-max, aliyun-qwen3.5-plus, aliyun-qwen3.6-flash, aliyun-qwen3.6-plus, aliyun-qwen3.7-flash, aliyun-qwen3.7-max, aliyun-qwen3.7-plus, aliyun-qwen3.8-flash, aliyun-qwen3-8-omni-flash, stepfun-step-3-5-flash, stepfun-step-3-5-flash-2603, stepfun-step-3-7-flash

intelligence:desc after:
claude-opus-5-5, openai-gpt-6-astra, openai-gpt-6-astra-long-context, openai-gpt-6-1-sol, openai-gpt-6-1-sol-long-context, claude-sonnet-5-5, openai-gpt-6-1-terra, openai-gpt-6-1-terra-long-context, google-gemini-4-argon, claude-fable-5-1, moonshot-kimi-k3-1-pro, claude-haiku-5-5, claude-haiku-5-5-long, xai-grok-4-7-prompt-200k-lt200k, xai-grok-4-7-prompt-200k-ge200k, aliyun-qwen3.8-max, deepseek-deepseek-flash-peak, deepseek-deepseek-flash-idle, zhipu-glm-5-3, google-gemini-3-8-flash, minimax-minimax-m3-1-flash, stepfun-step-5-preview, openai-gpt-6-luna, openai-gpt-6-luna-long-context, zhipu-glm-5-3-flash, mistral-mistral-large-4, deepseek-deepseek-v4-pro-peak, deepseek-deepseek-v4-pro-idle, minimax-minimax-m3-512k-plus, minimax-minimax-m3-512k, google-gemini-3-5-flash-lite, mistral-mistral-small-4, cohere-c4ai-aya-expanse-32b, claude-haiku-4-5, claude-opus-5, claude-sonnet-4-6, claude-sonnet-5, cohere-command-a-03-2025, cohere-command-a-plus-05-2026, cohere-command-a-reasoning-08-2025, cohere-command-a-translate-08-2025, cohere-command-a-vision-07-2025, cohere-command-r7b-12-2024, cohere-command-r7b-arabic-02-2025, openai-gpt-daybreak-blue-latest, openai-gpt-daybreak-red-latest, mistral-deepseek-v4-1-flash-1017, mistral-devstral-2512, volcengine-doubao-seed-2-0-code, volcengine-doubao-seed-2-0-lite, volcengine-doubao-seed-2-0-mini, volcengine-doubao-seed-2-0-pro, volcengine-doubao-seed-2-1-lite, volcengine-doubao-seed-2-1-pro, volcengine-doubao-seed-2-1-turbo, volcengine-doubao-seed-character, volcengine-doubao-seed-evolving, volcengine-doubao-seed-translation, google-gemini-2-5-flash, google-gemini-2-5-flash-lite, google-gemini-2-5-pro, google-gemini-3-flash-preview, google-gemini-3-1-flash-lite, google-gemini-3-1-pro-preview, google-gemini-3-6-flash, zhipu-glm-4-air-250414, zhipu-glm-4-airx, zhipu-glm-4-assistant, zhipu-glm-4-flash-250414, zhipu-glm-4-flashx-250414, zhipu-glm-4-long, zhipu-glm-4-plus, zhipu-glm-4-1v-thinking-flash, zhipu-glm-4-1v-thinking-flashx, zhipu-glm-4-5-air-le32k-long-output, zhipu-glm-4-5-air-le32k, zhipu-glm-4-5-air-gt32k, zhipu-glm-4-5v-le32k, zhipu-glm-4-5v-gt32k, zhipu-glm-4-6, zhipu-glm-4-6v-flash, zhipu-glm-4-6v-flashx-le32k, zhipu-glm-4-6v-flashx-gt32k, zhipu-glm-4-6v-le32k, zhipu-glm-4-6v-gt32k, zhipu-glm-4-7-flash, zhipu-glm-4-7-flashx, zhipu-glm-4-7-le32k-long-output, zhipu-glm-4-7-le32k, zhipu-glm-4-7-gt32k, zhipu-glm-4v-flash, zhipu-glm-4v-plus-0111, zhipu-glm-5-turbo-le32k, zhipu-glm-5-turbo-gt32k, zhipu-glm-5-1-le32k, zhipu-glm-5-1-gt32k, zhipu-glm-5-2, mistral-glm-5-2, mistral-zai-glm-5-3, mistral-zai-glm-5-3-flash, zhipu-glm-5-3-flashx, zhipu-glm-5-3-flashx-legal, zhipu-glm-5-le32k, zhipu-glm-5-gt32k, zhipu-glm-5v-turbo-le32k, zhipu-glm-5v-turbo-gt32k, zhipu-glm-ocr, zhipu-glm-z1-air, zhipu-glm-z1-airx, zhipu-glm-z1-flash, zhipu-glm-z1-flashx, openai-gpt-5-4-272k-context-length, openai-gpt-5-4-pro-272k-context-length, openai-gpt-5-5-272k-context-length, openai-gpt-5-5-pro-272k-context-length, openai-gpt-5-6, openai-gpt-5-6-luna, openai-gpt-5-6-sol, openai-gpt-5-6-terra, openai-gpt-6-astra-law, openai-gpt-6-rosalind, openai-gpt-6-sol, openai-gpt-6-sol-long-context, openai-gpt-realtime-2-1, xai-grok-4-20-0309-non-reasoning, xai-grok-4-20-multi-agent-0309, xai-grok-4-20-0309-non-reasoning-prompt-200k-lt200k, xai-grok-4-20-0309-non-reasoning-prompt-200k-ge200k, xai-grok-4-20-0309-reasoning-prompt-200k-lt200k, xai-grok-4-20-0309-reasoning-prompt-200k-ge200k, xai-grok-4-20-multi-agent-0309-prompt-200k-lt200k, xai-grok-4-20-multi-agent-0309-prompt-200k-ge200k, xai-grok-4-3-prompt-200k-lt200k, xai-grok-4-3-prompt-200k-ge200k, xai-grok-4-5-prompt-200k-lt200k, xai-grok-4-5-prompt-200k-ge200k, xai-grok-4-6-prompt-200k-lt200k, xai-grok-4-6-prompt-200k-ge200k, xai-grok-build-0-1-prompt-200k-lt200k, xai-grok-build-0-1-prompt-200k-ge200k, tencent-hy4-preview, moonshot-kimi-k2-6, moonshot-kimi-k2-7-code, moonshot-kimi-k2-7-code-highspeed, moonshot-kimi-k3, moonshot-kimi-k3-1-pro-highspeed, xiaomi-mimo-v2-5, xiaomi-mimo-v2-5-pro, xiaomi-mimo-v2-5-pro-ultraspeed, xiaomi-mimo-v2-6-flash, xiaomi-mimo-v2-6-pro, xiaomi-mimo-v2-6-pro-ultraspeed, mistral-ministral-3-14b, mistral-ministral-3-3b, mistral-ministral-3-8b, mistral-mistral-large-4-0-8, mistral-mistral-medium-latest, mistral-mistral-medium-2604, mistral-mistral-small-latest, meta-muse-spark-1-1, meta-muse-spark-1-2, meta-muse-spark-1-2-contributor, meta-muse-spark-1-3, meta-muse-spark-1-3-contributor, meta-muse-wonder-1-0, aliyun-qwen-long, aliyun-qwen-max, aliyun-qwen3.5-plus, aliyun-qwen3.6-flash, aliyun-qwen3.6-plus, aliyun-qwen3.7-flash, aliyun-qwen3.7-max, aliyun-qwen3.7-plus, aliyun-qwen3.8-flash, aliyun-qwen3-8-omni-flash, stepfun-step-3-5-flash, stepfun-step-3-5-flash-2603, stepfun-step-3-7-flash

value:asc before:
claude-haiku-5-5, openai-gpt-6-luna, openai-gpt-6-luna-long-context, claude-haiku-5-5-long, openai-gpt-6-1-terra, mistral-mistral-large-4, google-gemini-3-8-flash, mistral-mistral-small-4, openai-gpt-6-1-terra-long-context, google-gemini-3-5-flash-lite, openai-gpt-6-1-sol, claude-sonnet-5-5, google-gemini-4-argon, xai-grok-4-7-prompt-200k-lt200k, openai-gpt-6-1-sol-long-context, claude-opus-5-5, xai-grok-4-7-prompt-200k-ge200k, openai-gpt-6-astra, claude-fable-5-1, openai-gpt-6-astra-long-context, cohere-c4ai-aya-expanse-32b, claude-haiku-4-5, claude-opus-5, claude-sonnet-4-6, claude-sonnet-5, cohere-command-a-03-2025, cohere-command-a-plus-05-2026, cohere-command-a-reasoning-08-2025, cohere-command-a-translate-08-2025, cohere-command-a-vision-07-2025, cohere-command-r7b-12-2024, cohere-command-r7b-arabic-02-2025, openai-gpt-daybreak-blue-latest, openai-gpt-daybreak-red-latest, mistral-deepseek-v4-1-flash-1017, mistral-devstral-2512, google-gemini-2-5-flash, google-gemini-2-5-flash-lite, google-gemini-2-5-pro, google-gemini-3-flash-preview, google-gemini-3-1-flash-lite, google-gemini-3-1-pro-preview, google-gemini-3-6-flash, mistral-glm-5-2, mistral-zai-glm-5-3, mistral-zai-glm-5-3-flash, openai-gpt-5-4-272k-context-length, openai-gpt-5-4-pro-272k-context-length, openai-gpt-5-5-272k-context-length, openai-gpt-5-5-pro-272k-context-length, openai-gpt-5-6, openai-gpt-5-6-luna, openai-gpt-5-6-sol, openai-gpt-5-6-terra, openai-gpt-6-astra-law, openai-gpt-6-rosalind, openai-gpt-6-sol, openai-gpt-6-sol-long-context, openai-gpt-realtime-2-1, xai-grok-4-20-0309-non-reasoning, xai-grok-4-20-multi-agent-0309, xai-grok-4-20-0309-non-reasoning-prompt-200k-lt200k, xai-grok-4-20-0309-non-reasoning-prompt-200k-ge200k, xai-grok-4-20-0309-reasoning-prompt-200k-lt200k, xai-grok-4-20-0309-reasoning-prompt-200k-ge200k, xai-grok-4-20-multi-agent-0309-prompt-200k-lt200k, xai-grok-4-20-multi-agent-0309-prompt-200k-ge200k, xai-grok-4-3-prompt-200k-lt200k, xai-grok-4-3-prompt-200k-ge200k, xai-grok-4-5-prompt-200k-lt200k, xai-grok-4-5-prompt-200k-ge200k, xai-grok-4-6-prompt-200k-lt200k, xai-grok-4-6-prompt-200k-ge200k, xai-grok-build-0-1-prompt-200k-lt200k, xai-grok-build-0-1-prompt-200k-ge200k, mistral-ministral-3-14b, mistral-ministral-3-3b, mistral-ministral-3-8b, mistral-mistral-large-4-0-8, mistral-mistral-medium-latest, mistral-mistral-medium-2604, mistral-mistral-small-latest, meta-muse-spark-1-1, meta-muse-spark-1-2, meta-muse-spark-1-2-contributor, meta-muse-spark-1-3, meta-muse-spark-1-3-contributor, meta-muse-wonder-1-0, zhipu-glm-5-3-flash, deepseek-deepseek-flash-idle, minimax-minimax-m3-1-flash, deepseek-deepseek-flash-peak, minimax-minimax-m3-512k, deepseek-deepseek-v4-pro-idle, stepfun-step-5-preview, minimax-minimax-m3-512k-plus, zhipu-glm-5-3, aliyun-qwen3.8-max, moonshot-kimi-k3-1-pro, deepseek-deepseek-v4-pro-peak, volcengine-doubao-seed-2-0-code, volcengine-doubao-seed-2-0-lite, volcengine-doubao-seed-2-0-mini, volcengine-doubao-seed-2-0-pro, volcengine-doubao-seed-2-1-lite, volcengine-doubao-seed-2-1-pro, volcengine-doubao-seed-2-1-turbo, volcengine-doubao-seed-character, volcengine-doubao-seed-evolving, volcengine-doubao-seed-translation, zhipu-glm-4-air-250414, zhipu-glm-4-airx, zhipu-glm-4-assistant, zhipu-glm-4-flash-250414, zhipu-glm-4-flashx-250414, zhipu-glm-4-long, zhipu-glm-4-plus, zhipu-glm-4-1v-thinking-flash, zhipu-glm-4-1v-thinking-flashx, zhipu-glm-4-5-air-le32k-long-output, zhipu-glm-4-5-air-le32k, zhipu-glm-4-5-air-gt32k, zhipu-glm-4-5v-le32k, zhipu-glm-4-5v-gt32k, zhipu-glm-4-6, zhipu-glm-4-6v-flash, zhipu-glm-4-6v-flashx-le32k, zhipu-glm-4-6v-flashx-gt32k, zhipu-glm-4-6v-le32k, zhipu-glm-4-6v-gt32k, zhipu-glm-4-7-flash, zhipu-glm-4-7-flashx, zhipu-glm-4-7-le32k-long-output, zhipu-glm-4-7-le32k, zhipu-glm-4-7-gt32k, zhipu-glm-4v-flash, zhipu-glm-4v-plus-0111, zhipu-glm-5-turbo-le32k, zhipu-glm-5-turbo-gt32k, zhipu-glm-5-1-le32k, zhipu-glm-5-1-gt32k, zhipu-glm-5-2, zhipu-glm-5-3-flashx, zhipu-glm-5-3-flashx-legal, zhipu-glm-5-le32k, zhipu-glm-5-gt32k, zhipu-glm-5v-turbo-le32k, zhipu-glm-5v-turbo-gt32k, zhipu-glm-ocr, zhipu-glm-z1-air, zhipu-glm-z1-airx, zhipu-glm-z1-flash, zhipu-glm-z1-flashx, tencent-hy4-preview, moonshot-kimi-k2-6, moonshot-kimi-k2-7-code, moonshot-kimi-k2-7-code-highspeed, moonshot-kimi-k3, moonshot-kimi-k3-1-pro-highspeed, xiaomi-mimo-v2-5, xiaomi-mimo-v2-5-pro, xiaomi-mimo-v2-5-pro-ultraspeed, xiaomi-mimo-v2-6-flash, xiaomi-mimo-v2-6-pro, xiaomi-mimo-v2-6-pro-ultraspeed, aliyun-qwen-long, aliyun-qwen-max, aliyun-qwen3.5-plus, aliyun-qwen3.6-flash, aliyun-qwen3.6-plus, aliyun-qwen3.7-flash, aliyun-qwen3.7-max, aliyun-qwen3.7-plus, aliyun-qwen3.8-flash, aliyun-qwen3-8-omni-flash, stepfun-step-3-5-flash, stepfun-step-3-5-flash-2603, stepfun-step-3-7-flash

value:asc after:
claude-haiku-5-5, zhipu-glm-5-3-flash, openai-gpt-6-luna, deepseek-deepseek-flash-idle, minimax-minimax-m3-1-flash, openai-gpt-6-luna-long-context, deepseek-deepseek-flash-peak, claude-haiku-5-5-long, minimax-minimax-m3-512k, openai-gpt-6-1-terra, mistral-mistral-large-4, deepseek-deepseek-v4-pro-idle, google-gemini-3-8-flash, stepfun-step-5-preview, minimax-minimax-m3-512k-plus, mistral-mistral-small-4, zhipu-glm-5-3, openai-gpt-6-1-terra-long-context, google-gemini-3-5-flash-lite, openai-gpt-6-1-sol, claude-sonnet-5-5, google-gemini-4-argon, aliyun-qwen3.8-max, xai-grok-4-7-prompt-200k-lt200k, moonshot-kimi-k3-1-pro, deepseek-deepseek-v4-pro-peak, openai-gpt-6-1-sol-long-context, claude-opus-5-5, xai-grok-4-7-prompt-200k-ge200k, openai-gpt-6-astra, claude-fable-5-1, openai-gpt-6-astra-long-context, cohere-c4ai-aya-expanse-32b, claude-haiku-4-5, claude-opus-5, claude-sonnet-4-6, claude-sonnet-5, cohere-command-a-03-2025, cohere-command-a-plus-05-2026, cohere-command-a-reasoning-08-2025, cohere-command-a-translate-08-2025, cohere-command-a-vision-07-2025, cohere-command-r7b-12-2024, cohere-command-r7b-arabic-02-2025, openai-gpt-daybreak-blue-latest, openai-gpt-daybreak-red-latest, mistral-deepseek-v4-1-flash-1017, mistral-devstral-2512, volcengine-doubao-seed-2-0-code, volcengine-doubao-seed-2-0-lite, volcengine-doubao-seed-2-0-mini, volcengine-doubao-seed-2-0-pro, volcengine-doubao-seed-2-1-lite, volcengine-doubao-seed-2-1-pro, volcengine-doubao-seed-2-1-turbo, volcengine-doubao-seed-character, volcengine-doubao-seed-evolving, volcengine-doubao-seed-translation, google-gemini-2-5-flash, google-gemini-2-5-flash-lite, google-gemini-2-5-pro, google-gemini-3-flash-preview, google-gemini-3-1-flash-lite, google-gemini-3-1-pro-preview, google-gemini-3-6-flash, zhipu-glm-4-air-250414, zhipu-glm-4-airx, zhipu-glm-4-assistant, zhipu-glm-4-flash-250414, zhipu-glm-4-flashx-250414, zhipu-glm-4-long, zhipu-glm-4-plus, zhipu-glm-4-1v-thinking-flash, zhipu-glm-4-1v-thinking-flashx, zhipu-glm-4-5-air-le32k-long-output, zhipu-glm-4-5-air-le32k, zhipu-glm-4-5-air-gt32k, zhipu-glm-4-5v-le32k, zhipu-glm-4-5v-gt32k, zhipu-glm-4-6, zhipu-glm-4-6v-flash, zhipu-glm-4-6v-flashx-le32k, zhipu-glm-4-6v-flashx-gt32k, zhipu-glm-4-6v-le32k, zhipu-glm-4-6v-gt32k, zhipu-glm-4-7-flash, zhipu-glm-4-7-flashx, zhipu-glm-4-7-le32k-long-output, zhipu-glm-4-7-le32k, zhipu-glm-4-7-gt32k, zhipu-glm-4v-flash, zhipu-glm-4v-plus-0111, zhipu-glm-5-turbo-le32k, zhipu-glm-5-turbo-gt32k, zhipu-glm-5-1-le32k, zhipu-glm-5-1-gt32k, zhipu-glm-5-2, mistral-glm-5-2, mistral-zai-glm-5-3, mistral-zai-glm-5-3-flash, zhipu-glm-5-3-flashx, zhipu-glm-5-3-flashx-legal, zhipu-glm-5-le32k, zhipu-glm-5-gt32k, zhipu-glm-5v-turbo-le32k, zhipu-glm-5v-turbo-gt32k, zhipu-glm-ocr, zhipu-glm-z1-air, zhipu-glm-z1-airx, zhipu-glm-z1-flash, zhipu-glm-z1-flashx, openai-gpt-5-4-272k-context-length, openai-gpt-5-4-pro-272k-context-length, openai-gpt-5-5-272k-context-length, openai-gpt-5-5-pro-272k-context-length, openai-gpt-5-6, openai-gpt-5-6-luna, openai-gpt-5-6-sol, openai-gpt-5-6-terra, openai-gpt-6-astra-law, openai-gpt-6-rosalind, openai-gpt-6-sol, openai-gpt-6-sol-long-context, openai-gpt-realtime-2-1, xai-grok-4-20-0309-non-reasoning, xai-grok-4-20-multi-agent-0309, xai-grok-4-20-0309-non-reasoning-prompt-200k-lt200k, xai-grok-4-20-0309-non-reasoning-prompt-200k-ge200k, xai-grok-4-20-0309-reasoning-prompt-200k-lt200k, xai-grok-4-20-0309-reasoning-prompt-200k-ge200k, xai-grok-4-20-multi-agent-0309-prompt-200k-lt200k, xai-grok-4-20-multi-agent-0309-prompt-200k-ge200k, xai-grok-4-3-prompt-200k-lt200k, xai-grok-4-3-prompt-200k-ge200k, xai-grok-4-5-prompt-200k-lt200k, xai-grok-4-5-prompt-200k-ge200k, xai-grok-4-6-prompt-200k-lt200k, xai-grok-4-6-prompt-200k-ge200k, xai-grok-build-0-1-prompt-200k-lt200k, xai-grok-build-0-1-prompt-200k-ge200k, tencent-hy4-preview, moonshot-kimi-k2-6, moonshot-kimi-k2-7-code, moonshot-kimi-k2-7-code-highspeed, moonshot-kimi-k3, moonshot-kimi-k3-1-pro-highspeed, xiaomi-mimo-v2-5, xiaomi-mimo-v2-5-pro, xiaomi-mimo-v2-5-pro-ultraspeed, xiaomi-mimo-v2-6-flash, xiaomi-mimo-v2-6-pro, xiaomi-mimo-v2-6-pro-ultraspeed, mistral-ministral-3-14b, mistral-ministral-3-3b, mistral-ministral-3-8b, mistral-mistral-large-4-0-8, mistral-mistral-medium-latest, mistral-mistral-medium-2604, mistral-mistral-small-latest, meta-muse-spark-1-1, meta-muse-spark-1-2, meta-muse-spark-1-2-contributor, meta-muse-spark-1-3, meta-muse-spark-1-3-contributor, meta-muse-wonder-1-0, aliyun-qwen-long, aliyun-qwen-max, aliyun-qwen3.5-plus, aliyun-qwen3.6-flash, aliyun-qwen3.6-plus, aliyun-qwen3.7-flash, aliyun-qwen3.7-max, aliyun-qwen3.7-plus, aliyun-qwen3.8-flash, aliyun-qwen3-8-omni-flash, stepfun-step-3-5-flash, stepfun-step-3-5-flash-2603, stepfun-step-3-7-flash

inputPrice:asc before = after:
cohere-command-r7b-12-2024, cohere-command-r7b-arabic-02-2025, claude-haiku-5-5, google-gemini-2-5-flash-lite, openai-gpt-6-luna, mistral-ministral-3-3b, meta-muse-spark-1-2-contributor, meta-muse-spark-1-3-contributor, mistral-zai-glm-5-3-flash, mistral-ministral-3-8b, mistral-mistral-small-latest, mistral-mistral-small-4, openai-gpt-5-6-luna, openai-gpt-6-luna-long-context, mistral-ministral-3-14b, google-gemini-3-1-flash-lite, mistral-deepseek-v4-1-flash-1017, google-gemini-2-5-flash, google-gemini-3-5-flash-lite, mistral-devstral-2512, cohere-c4ai-aya-expanse-32b, claude-haiku-5-5-long, google-gemini-3-flash-preview, mistral-mistral-large-4, mistral-mistral-large-4-0-8, google-gemini-3-6-flash, google-gemini-3-8-flash, claude-haiku-4-5, openai-gpt-6-1-terra, xai-grok-build-0-1-prompt-200k-lt200k, google-gemini-2-5-pro, xai-grok-4-20-0309-non-reasoning, xai-grok-4-20-multi-agent-0309, xai-grok-4-20-0309-non-reasoning-prompt-200k-lt200k, xai-grok-4-20-0309-reasoning-prompt-200k-lt200k, xai-grok-4-20-multi-agent-0309-prompt-200k-lt200k, xai-grok-4-3-prompt-200k-lt200k, meta-muse-spark-1-1, meta-muse-spark-1-2, meta-muse-spark-1-3, mistral-glm-5-2, mistral-zai-glm-5-3, mistral-mistral-medium-latest, mistral-mistral-medium-2604, claude-sonnet-5, claude-sonnet-5-5, google-gemini-3-1-pro-preview, google-gemini-4-argon, openai-gpt-5-6-terra, openai-gpt-6-sol, openai-gpt-6-1-sol, openai-gpt-6-1-terra-long-context, xai-grok-4-5-prompt-200k-lt200k, xai-grok-4-6-prompt-200k-lt200k, xai-grok-4-7-prompt-200k-lt200k, xai-grok-build-0-1-prompt-200k-ge200k, cohere-command-a-03-2025, cohere-command-a-plus-05-2026, cohere-command-a-reasoning-08-2025, cohere-command-a-translate-08-2025, cohere-command-a-vision-07-2025, openai-gpt-5-4-272k-context-length, xai-grok-4-20-0309-non-reasoning-prompt-200k-ge200k, xai-grok-4-20-0309-reasoning-prompt-200k-ge200k, xai-grok-4-20-multi-agent-0309-prompt-200k-ge200k, xai-grok-4-3-prompt-200k-ge200k, claude-sonnet-4-6, claude-opus-5-5, openai-gpt-daybreak-blue-latest, openai-gpt-5-6, openai-gpt-5-6-sol, openai-gpt-6-sol-long-context, openai-gpt-6-1-sol-long-context, openai-gpt-realtime-2-1, xai-grok-4-5-prompt-200k-ge200k, xai-grok-4-6-prompt-200k-ge200k, xai-grok-4-7-prompt-200k-ge200k, meta-muse-wonder-1-0, claude-opus-5, openai-gpt-5-5-272k-context-length, claude-fable-5-1, openai-gpt-6-astra, openai-gpt-6-astra-law, openai-gpt-daybreak-red-latest, openai-gpt-6-rosalind, openai-gpt-6-astra-long-context, openai-gpt-5-4-pro-272k-context-length, openai-gpt-5-5-pro-272k-context-length, zhipu-glm-4-flash-250414, zhipu-glm-4-1v-thinking-flash, zhipu-glm-4-6v-flash, zhipu-glm-4-7-flash, zhipu-glm-4v-flash, zhipu-glm-z1-flash, zhipu-glm-4-flashx-250414, zhipu-glm-z1-flashx, zhipu-glm-4-6v-flashx-le32k, volcengine-doubao-seed-2-0-mini, zhipu-glm-ocr, aliyun-qwen3.7-flash, zhipu-glm-4-6v-flashx-gt32k, zhipu-glm-4-air-250414, zhipu-glm-4-7-flashx, zhipu-glm-z1-air, aliyun-qwen-long, volcengine-doubao-seed-2-0-lite, stepfun-step-3-5-flash, stepfun-step-3-5-flash-2603, volcengine-doubao-seed-2-1-lite, volcengine-doubao-seed-character, zhipu-glm-4-5-air-le32k-long-output, zhipu-glm-4-5-air-le32k, zhipu-glm-5-3-flash, aliyun-qwen3.5-plus, aliyun-qwen3.8-flash, aliyun-qwen3-8-omni-flash, xiaomi-mimo-v2-5, xiaomi-mimo-v2-6-flash, deepseek-deepseek-flash-idle, zhipu-glm-4-long, zhipu-glm-4-6v-le32k, minimax-minimax-m3-1-flash, volcengine-doubao-seed-translation, zhipu-glm-4-5-air-gt32k, aliyun-qwen3.6-flash, stepfun-step-3-7-flash, deepseek-deepseek-flash-peak, zhipu-glm-4-1v-thinking-flashx, zhipu-glm-4-5v-le32k, zhipu-glm-4-6v-gt32k, zhipu-glm-4-7-le32k, zhipu-glm-5-3-flashx, zhipu-glm-5-3-flashx-legal, aliyun-qwen3.6-plus, aliyun-qwen3.7-plus, minimax-minimax-m3-512k, aliyun-qwen-max, xiaomi-mimo-v2-5-pro, xiaomi-mimo-v2-6-pro, volcengine-doubao-seed-2-1-turbo, zhipu-glm-4-7-le32k-long-output, volcengine-doubao-seed-2-0-code, volcengine-doubao-seed-2-0-pro, zhipu-glm-4-5v-gt32k, zhipu-glm-4-7-gt32k, zhipu-glm-4v-plus-0111, zhipu-glm-5-le32k, zhipu-glm-4-6, minimax-minimax-m3-512k-plus, deepseek-deepseek-v4-pro-idle, zhipu-glm-4-assistant, zhipu-glm-4-plus, zhipu-glm-5-turbo-le32k, zhipu-glm-5v-turbo-le32k, zhipu-glm-z1-airx, tencent-hy4-preview, volcengine-doubao-seed-2-1-pro, volcengine-doubao-seed-evolving, zhipu-glm-5-1-le32k, zhipu-glm-5-gt32k, moonshot-kimi-k2-6, moonshot-kimi-k2-7-code, zhipu-glm-5-turbo-gt32k, zhipu-glm-5v-turbo-gt32k, stepfun-step-5-preview, zhipu-glm-5-1-gt32k, zhipu-glm-5-2, zhipu-glm-5-3, xiaomi-mimo-v2-5-pro-ultraspeed, deepseek-deepseek-v4-pro-peak, zhipu-glm-4-airx, aliyun-qwen3.7-max, aliyun-qwen3.8-max, moonshot-kimi-k2-7-code-highspeed, moonshot-kimi-k3-1-pro, moonshot-kimi-k3, moonshot-kimi-k3-1-pro-highspeed, xiaomi-mimo-v2-6-pro-ultraspeed
```

</details>

### 文案与可见性自检

- 新中文都在 copy.ts；valueSortNote 共用合法汇率判定，缺汇率提示为「无汇率，性价比按币种分段比较」。桌面/移动端共用唯一 table-note。
- copy.test + copy-guard fixture：正常及缺汇率两种新提示均不撞 fx-disclaimer / cny-estimate / billing-currency；两项新 guard 用例通过。
- `node scripts/qa/copy-guard.mjs --dist dist` exit0，六路由声明均≤1、估算日期0、免责5/5。**这是会话原有 dist 的基线检查，未重新构建，不冒充新产物验收。**
- 临时 Vite 本地服务8859运行当前源码。`node scripts/metrics/copy-density.mjs --compare docs/metrics/copy-density-baseline.json --live http://127.0.0.1:8859/` exit0；API首屏375/768/1440分别127/162/210字，1440阈值220，全部路由无溢出。
- 额外 CDP 当前源码实测：1440 inputPrice 时新提示0次，value时1次且保留URL `?sort=value`、178行；value首屏218字；375移动端提示1次、桌面table行数0、首屏132字。
- `node scripts/qa/chart-probe.mjs --url http://127.0.0.1:8859/api-pricing/ --viewport 375,768,1024,1440,1920` exit0，五档全部PASS，各档7个可见SVG，重叠/裁切/溢出均0。
- 新构建产物上的 copy-guard 与总门禁仍由编排层执行。

## 3. B1：数量与集合证明

真实缓存235个provider，覆盖映射16个。归一前174、归一后169、差5、命中5；JSON完整剩余169项，文本 --top 仅截展示。

| alias（独立可见） | canonical（已覆盖） | 原分类 |
|---|---|---|
| alibaba | alibaba-cn | reseller=true |
| minimax | minimax-cn | reseller=false |
| moonshotai | moonshotai-cn | reseller=false |
| stepfun-ai | stepfun | reseller=false |
| zai | zhipuai | reseller=false |

设 B=归一前unknown key集合，A=归一后集合，H=normalizations中的alias集合。实际集合差：

```text
B \ A = H = {alibaba, minimax, moonshotai, stepfun-ai, zai}
A \ B = {}
|B| - |A| = 174 - 169 = |H| = normalizationHits = 5
```

fixture测试同时断言集合全等、去重后命中数与差相等。canonical必须已在coveredKeys中才移除alias；没有模糊相似度匹配。`tencent-token-plan/google-vertex/google-vertex-anthropic` 不映射；大小写变体 ZAI 也保留。

非转售数实测 **33→29**，与设计稿预计28有差异：alibaba被既有families分类判为渠道，所以五次移除只减少四个非转售。没有改变渠道判定以凑预计值。真实运行前后 squeezed 结构全等；pull.mjs 和 AGGREGATE_LIMITS 字节不变。

## 4. B2：三家输出与退出码

只读基准取 api.json 的 official + verified：DeepSeek4、百炼11、方舟10行。DeepSeek按缓存未命中/命中和峰谷取值；百炼只读北京Tab、非思考列、已录首档和Omni中国内地行；方舟只读常规非音频、已录输入长度档。缓存存储/音频/低延迟/批量/境外/高阶梯不混入。缺表头、缺模型条件、重复键、非法价格均 unavailable。

指纹先固定字段顺序和数值规范化，再按 providerId/model/condition 排序，最后 SHA-256；日期/说明不进入指纹。不新增指纹文件，不进入构建产物。每次同时输出逐字段差异。

真实联网命令 `node scripts/data/cli.mjs official-price-drift`：

```text
deepseek | 200 | 4 | 4 | unchanged
aliyun | 200 | 11 | 11 | unchanged
volcengine | 200 | 10 | 10 | unchanged
exit=0
```

可达性复核初次读取字节数：DeepSeek10917、百炼700820、方舟29172（设计证据29175，本次响应有3B差异；成功解析且价格结构未变）。无第三方镜像、无JS壳回退、无旧值冒充抓取。

以下每家分正常与异常两段；异常段同时列出改价与失败。正常/改价/失败均使用真实CLI的子进程，离线阶段仅用Node `--import`替换fetch输入，未给生产CLI增加fixture选项。可复现入口：`npx.cmd vitest run tests/official-price-drift.test.ts`；其中真实CLI normal/changed/failed/invalid用例覆盖文本和JSON、exit0及src/data全目录hash不变。

### deepseek

正常（官方实抓和未改价fixture一致）：

```text
URL：https://api-docs.deepseek.com/zh-cn/quick_start/pricing.md
deepseek | 200 | 4 | 4 | unchanged
SHA-256 仓库：13af5756523e3b017d7f63e79f999266add060a318d096e3f49ce7d7d045cece
SHA-256 官网：13af5756523e3b017d7f63e79f999266add060a318d096e3f49ce7d7d045cece
未发现价格变化。
exit=0
```

异常输入（受控fixture）：

```text
改价：deepseek | 200 | 4 | 4 | changed
SHA-256 仓库：13af5756523e3b017d7f63e79f999266add060a318d096e3f49ce7d7d045cece
SHA-256 官网：cf73afc6488e62d64335b6d3bed7a84e0ea56f18384f50fdef6aa973c7220494
模型 | 条件 | 字段 | 仓库值 | 官网值
deepseek-flash | 空闲时段 | input | 1 | 1.5
exit=0

失败：deepseek | - | 0 | 4 | unavailable
URL：https://api-docs.deepseek.com/zh-cn/quick_start/pricing.md
无法判定：fixture timeout
exit=0
```

### aliyun

正常（官方实抓和未改价fixture一致）：

```text
URL：https://help.aliyun.com/zh/model-studio/model-pricing.md
aliyun | 200 | 11 | 11 | unchanged
SHA-256 仓库：f976d14b32cc04dc8508b3ea9042165797016733d694d0a7a342617dd8243cb1
SHA-256 官网：f976d14b32cc04dc8508b3ea9042165797016733d694d0a7a342617dd8243cb1
未发现价格变化。
exit=0
```

异常输入（受控fixture）：

```text
改价：aliyun | 200 | 11 | 11 | changed
SHA-256 仓库：f976d14b32cc04dc8508b3ea9042165797016733d694d0a7a342617dd8243cb1
SHA-256 官网：113ba5f4bb5938a44520c0953b5f222d6ca453d10fe76785710229ca1f032076
模型 | 条件 | 字段 | 仓库值 | 官网值
qwen3.8-max | 0<Token≤1M | input | 12 | 15
exit=0

失败：aliyun | - | 0 | 11 | unavailable
URL：https://help.aliyun.com/zh/model-studio/model-pricing.md
无法判定：fixture timeout
exit=0
```

### volcengine

正常（官方实抓和未改价fixture一致）：

```text
URL：https://docs.volcengine.com/docs/zh/ark/model-pricing.md
volcengine | 200 | 10 | 10 | unchanged
SHA-256 仓库：f0bcdb08c7de119353ad8b1cbaa137de6927ce945aee64a1f229809bb26c05b6
SHA-256 官网：f0bcdb08c7de119353ad8b1cbaa137de6927ce945aee64a1f229809bb26c05b6
未发现价格变化。
exit=0
```

异常输入（受控fixture）：

```text
改价：volcengine | 200 | 10 | 10 | changed
SHA-256 仓库：f0bcdb08c7de119353ad8b1cbaa137de6927ce945aee64a1f229809bb26c05b6
SHA-256 官网：d4b785caaec632e4561aceaec7f1be55362b816fb30c60b271289689eeeacbf4
模型 | 条件 | 字段 | 仓库值 | 官网值
doubao-seed-evolving | [0,1024] | input | 6 | 7.5
exit=0

失败：volcengine | - | 0 | 10 | unavailable
URL：https://docs.volcengine.com/docs/zh/ark/model-pricing.md
无法判定：fixture timeout
exit=0
```

HTTP503、正文超时、请求超时、坏表格也分别测试为unavailable、exit0。未知参数、位置参数、非法json选项、非法超时、缺路径值、不存在路径、目录路径共8类参数用例均非0。非法JSON基准按厂商无法判定处理。

workflow新增一步仅受 `steps.plan.outputs.pull == 'true'` 控制，向 `$GITHUB_STEP_SUMMARY` 追加文本，并保留 `|| echo`。既有diff/提交/部署块原文不变，不增加GITHUB_OUTPUT或发布条件。

## 5. 变异反例（均实际执行、随后恢复）

| 编号 | 变异方式 | 检验命令 | 红灯读数 |
|---|---|---|---|
| A-原实现 | 先加新测试，在旧比较器上执行 | `npx.cmd vitest run tests/pricing.test.ts` | 9 failed / 29 passed，智能/性价比/无FX错币种/provider均能红 |
| A-R4 | 临时把PRICE_FIELDS分组条件换成false | 同上 | 2 failed / 36 passed；旧价格分组及逐行旧比较器对照均红 |
| A-R5（裁定R3） | 无FX时删掉reportedCurrency===billingCurrency保护，直接返回cost原值 | 同上 | 4 failed / 34 passed；null/0/NaN/Infinity四种错币种场景全红 |
| A-copy | 给新文案加入「按汇率估算」，制造cny-estimate重复 | `npx.cmd vitest run tests/copy-guard.test.ts` | 1 failed / 7 passed |
| B1-原实现 | 先加归一测试，在未实现归一时运行 | `npx.cmd vitest run tests/discover.test.ts` | 4 failed / 10 passed |
| B1-alias | 临时将zai目标改成missing-canonical | 同上 | 3 failed / 11 passed；命中对照及差值集合证明都能红 |
| B2-diff | 临时把diff官网新值写成仓库旧值 | `npx.cmd vitest run tests/official-price-drift.test.ts` | 5 failed / 31 passed；逐字段旧新值与文本输出都能红 |
| B2-parser | 临时把方舟output取值列从r[7]改为r[2] | 同上 | 8 failed / 28 passed；正确夹具、哈希与CLI状态能红 |
| B2-exit | 临时令CLI在changed/unavailable时exit1 | 同上 | 4 failed / 32 passed；changed/failed/invalid及文本改价用例能红 |
| B2-workflow | 先加接线断言，再加workflow步骤 | `npx.cmd vitest run tests/workflows.test.ts` | 步骤不存在时1 failed / 14 passed；接入后15/15 |

生产文件的七项临时变异均在finally恢复，最后定向149/149、typecheck0。夹具反例还覆盖改价、缺表头、重复键、非有限数、不精确模型名、境外价、高阶梯及超时。

## 6. 红线自查

- 数据：`src/data/**` 文件清单及全部 **11 个文件** SHA-256逐项与开工快照相同，零新增/删除/改值。路径→SHA映射规范JSON的整体hash前后均为 `d3c69f96a22c43d0cfd89eb9c220bcc50883b8cd3c97cea02519bcee7bb5cff7`。
- 依赖：package.json、package-lock.json字节不变；新逻辑只用Node内置crypto/fs/path及既有项目代码。
- 网络：新增真实抓取只在scripts/data/lib/official-price-drift.mjs；src新增行没有fetch/网络调用；测试fetch为离线注入。
- 图表：chart-geometry.ts、pricing-chart-data.ts及图表组件未改，相关单元测试通过，五档live探针PASS。
- pull/来源/上限：pull.mjs字节不变，AGGREGATE_LIMITS不改；discover归一只影响报告覆盖判断，squeezed前后全等。
- 行尾：修改既有文件保留原风格。src五文件、CLI、workflow、copy-guard/discover/fx/workflows测试为CRLF；discover.mjs、discover.d.mts、pricing测试为LF。新增mjs/d.mts/TS为LF，官方Markdown夹具为UTF-8 CRLF。按行对照恢复未修改部分的原行尾。
- UTF-8：所有新增/修改文件严格UTF-8解码通过；新增行emoji扫描0。
- Git：未运行任何Git命令；文档提交和最终交付由编排层执行。
- 未跑npm run build、node scripts/qa/run-gates.mjs，未更新数据或现有dist，未部署。
- 自动写入的logs/coding.log由会话日志机制持续变化，不属于手工编辑；临时排序/变异证据保存在系统临时目录，未塞入站点或新知识库。

## 7. 未完成 / 编排层验证

1. **需要裁定的实际冲突**：tests/ux-refactor.test.ts:63按SORT_KEYS参数化，intelligence/value/provider仍要求USD组恒前，与R2及新groupByCurrency边界相反。保持原判据，因此扩展回归3红；已向小贤哥提出异步澄清，未收到允许前不改。建议批准这三项按全表口径验证，价格/context分组断言原样保留。不能以缺scores时偷偷恢复分组规避裁定。
2. 编排层重新构建并跑新dist上的copy-guard、总门禁、全套测试实际计数，确认新产物与当前源码一致；本轮仅报告定向实测，不替代终验。
3. 编排层按实际裁定处理上述旧测试后，建议转code_review并执行跨家对抗审查；status.json未擅自改阶段，未自宣最终验收。
4. P2套餐新档位发现按R9不做。未来官方结构变化将按厂商unavailable，需人工更新显式解析契约，不回退JS壳或第三方镜像。
5. B1非转售数量33→29的预计偏差已据实解释；方舟本次响应字节数差3B但结构指纹未变，未用字节数当价格变化判据。

建议索引: 跨币种排序回归与报告型抓取变异测试 → 墨典:_inbox/pending/codex-currency-sort-and-report-only-drift.md#可复用验证方法（仅建议，本任务未授权长期知识写入，未落库）
