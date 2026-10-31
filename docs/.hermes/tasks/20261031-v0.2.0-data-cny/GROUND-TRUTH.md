# 编排层独立取数基线（2026-10-31，Hermes 亲抓官方页）

> 用途：验收时与编码体的 official 条目对拍。数字来源为本文件记录时点实际打开的官方页面正文。
> 若编码体给出的 official 数字与此不符，以本文件为准并要求返工。

## DeepSeek（CNY 原生）
来源：`https://api-docs.deepseek.com/zh-cn/quick_start/pricing`（HTTP 200，7553 B）
页面原文：「下表所列模型价格以“百万 tokens”为单位」「空闲时段价格为高峰时段价格的一半」

| 模型 | 缓存命中输入 | 缓存未命中输入 | 输出 |
|---|---|---|---|
| deepseek-flash（DeepSeek-V4.1-Flash-1017）空闲 | 0.02 元 | 1 元 | 4 元 |
| deepseek-flash 高峰 | 0.04 元 | 2 元 | 8 元 |
| deepseek-v4-pro 空闲 | 0.15 元 | 4.5 元 | 13.5 元 |
| deepseek-v4-pro 高峰 | 0.30 元 | 9.0 元 | 27.0 元 |

上下文：1M；最大输出 384K。高峰时段＝北京时间周一至周五 9:00-12:00、14:00-18:00（不含法定节假日）。

## MiniMax（CNY 原生）
来源：`https://platform.minimax.cn/docs/pricing/overview`（HTTP 200，46035 B）

| 模型 | 输入 | 输出 | 缓存读取 |
|---|---|---|---|
| MiniMax-M3.1-Flash | 1.00 | 4.00 | 0.10 |
| MiniMax-M3（≤512k 输入）标准 | 4.20 | 16.80 | 0.84 |
| MiniMax-M3（≤512k 输入）永久五折 | 2.10 | 8.40 | 0.42 |
| MiniMax-M3（>512k 输入）标准 | 8.40 | 33.60 | 1.68 |
| MiniMax-M3（>512k 输入）永久五折 | 4.20 | 16.80 | 0.84 |

单位：元 / 百万 tokens。

## Anthropic（USD 原生）
来源：`https://platform.claude.com/docs/en/about-claude/pricing`（HTTP 200，115601 B）

| 模型 | Input | Output | 5m writes | 1h writes | Hits/refresh |
|---|---|---|---|---|---|
| Claude Fable 5.1 | $10 | $50 | $12.50 | $20 | $0.25 |
| Claude Opus 5.5 | $4 | $20 | $5 | $8 | $0.20 |
| Claude Sonnet 5.5 | $2 | $10 | $2.50 | $4 | $0.10 |
| Claude Haiku 5.5 | $0.10 | $0.50 | $0.125 | $0.20 | — |

注意：Haiku 5.5 的 $0.10 附带条件「for prompts up to 100,000 tokens」。

## 抓取失败（本轮不作为 official 来源）
- `https://openai.com/api/pricing/` → 脚本访问 403
- `https://www.volcengine.com/docs/82379/1099320` → 静态抓取内容不完整（167 行，无模型表），疑 JS 渲染
- `https://help.aliyun.com/zh/model-studio/models` → 静态抓取 255 行，无价格表
- Kimi / 智谱 → JS 渲染

以上若编码体声称 official，必须提供其实际取到的原始行文本，否则视为未核实。
