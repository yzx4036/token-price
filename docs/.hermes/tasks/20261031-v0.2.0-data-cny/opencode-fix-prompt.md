# 返工任务 R1–R7：把可官方核验的厂商从 aggregate 升级为 official

基线已绿：typecheck 0 errors / 25 files、test 95 passed / 7 files、build 6 pages、`cli.mjs verify` RC=0。
本轮回工**只做数据溯源升级与相关文案**，不重构架构、不动已有通过的实现。

## 铁律

1. **不做 git 操作**。
2. **只用下面给出的官方 URL 取数**，数字必须来自你实际抓到的页面正文；抓不到就不升级，保持 aggregate 并说明。
3. **不许用汇率反推「官方价」**。官方页是 USD 就记 USD，是 CNY 就记 CNY。
4. 不改动其它厂商已有条目（DeepSeek/MiniMax/Anthropic/Google/阿里/火山 已 official 且已核对）。
5. 同步更新所有下游数字：`coding-result.md` 统计、`/sources/` 页、首页统计（应从 `src/lib/stats.ts` 自动派生，若手写了就改掉）。

## 关键取证技巧（本轮已验证有效，务必写进文档）

很多文档站提供 **llms.txt / `.md` 原文**版本，能绕过 JS 渲染直接拿到表格。本轮用到的：

| 厂商 | 官方源（已验证 HTTP 200 且有价格表） |
|---|---|
| 智谱 GLM | `https://docs.bigmodel.cn/cn/guide/start/pricing.md` |
| Mistral | `https://docs.mistral.ai/inference/pricing/` |
| OpenAI | `https://platform.openai.com/docs/pricing.md` |
| xAI | `https://docs.x.ai/docs/pricing.md` |
| Cohere | `https://docs.cohere.com/docs/model-vault/standard/pricing.md`（先试，失败则保持 aggregate） |

## R1 智谱 GLM（CNY → official）

来源：`https://docs.bigmodel.cn/cn/guide/start/pricing.md`（页面自述「除特别说明外，模型价格统一按照“元/百万 Tokens”展示」）。

编排层抓到的原文行（你可以复抓确认，数字必须一致）：

```
| GLM-5.3 | 1M | 8 | 28 | 限时免费 | 2 | 文本 |
| GLM-5.3-Flash | 1M | 0.8 | 2.8 | 限时免费 | 0.23 |
| GLM-5.3-FlashX | 1M | 2 | 7 | 限时免费 | 0.57 |
| GLM-5.2 | 1M | 8 | 28 | 限时免费 | 2 |
| GLM-5.1 | 输入长度 [0, 32K) | 6 | 24 | 限时免费 | 1.3 |
| GLM-5.1 | 输入长度 ≥32K | 8 | 28 | 限时免费 | 2 |
| GLM-5-Turbo | 输入长度 [0, 32K) | 5 | 22 | 限时免费 | 1.2 |
| GLM-5-Turbo | 输入长度 ≥32K | 7 | 26 | 限时免费 | 1.8 |
| GLM-5 | 输入长度 [0, 32K) | 4 | 18 | 限时免费 | 1 |
| GLM-5 | 输入长度 ≥32K | 6 | 22 | 限时免费 | 1.5 |
```

列序：模型名 / 上下文 / 输入单价 / 输出单价 / 缓存存储 / **缓存命中**。
**注意**：第 6 列是「缓存命中」价格，可映射到 `cacheReadPrice`；「缓存存储（元/百万 Tokens/小时）」是按时长的存储费，**不是 cacheRead，不要混用**。
同模型两档（<32K / ≥32K）请按现有 DeepSeek 峰谷条目的处理方式拆成两条 id（如 `zhipu-glm-5-1-le32k` / `zhipu-glm-5-1-gt32k`），并在条目里保留档位说明。

目标：智谱从 0 official / 12 aggregate 变为 ≥10 条 official。原有 aggregate 条目若与 official 同模型，official 胜出、删除重复 aggregate。

## R2 Mistral（USD → official）

来源：`https://docs.mistral.ai/inference/pricing/`（Standard 档，USD）。

编排层抓到的原文（表格列：Model / Input / Cached input / Output）：

```
Mistral Large 4     $0.7   $0.07   $2.1
Mistral Small 4     $0.15  $0.015  $0.6
Ministral 3 14B     $0.2   $0.02   $0.2
Ministral 3 8B      $0.15  $0.015  $0.15
Ministral 3 3B      $0.1   $0.01   $0.1
```

⚠️ **该页同时列出转售的第三方模型**（`Z.ai GLM 5.3 Flash`、`DeepSeek V4.1 Flash 1017`、`Z.ai GLM 5.3` 等）。这些**不是** Mistral 自己的模型，**禁止**把它们记成 mistral 厂商条目；也禁止用它们覆盖 zhipu/deepseek 的官方价（那些价格是 Mistral 转售价，与厂商官方价不同）。

目标：Mistral 12 条中，官方页实际列出的 Mistral/Ministral 自有模型全部转 official；页面上没有的（如 codestral 等）保持 aggregate。

## R3 OpenAI（USD → official）

来源：`https://platform.openai.com/docs/pricing.md`（页面自述「Prices per 1M tokens」，Standard 档）。

原文示例（列：Model / Short context input / Short context output / Short context cached input / … / Long context input…）：

```
| gpt-6-astra | $10.00 | $50.00 | $1.00 | $12.50 | $25.00 | $20.00 | $75.00 | $2.00 | $25.00 | $50.00 |
| gpt-6.1-sol | $2.00 | $10.00 | $0.10 | $2.50 | $5.00 | $4.00 | $15.00 | $0.20 | $5.00 | $10.00 |
| gpt-6.1-terra | $1.00 | $5.00 | $0.05 | $1.25 | $2.50 | $2.00 | $7.50 | $0.10 | $2.50 | $5.00 |
| gpt-6-luna | $0.10 | $0.50 | $0.01 | $0.125 | $0.25 | $0.20 | $0.75 | $0.02 | $0.25 | $0.50 |
| gpt-5.6-sol | $4.00 | $20.00 | $0.40 | $5.00 | $10.00 | $8.00 | $30.00 | $0.80 | $10.00 | $20.00 |
```

**只取 Short context 档**（当前网站不区分长短上下文档位，取最短档最保守），`cacheReadPrice` 取 `Short context cached input`。长短档差异请在 `notes` 里说明。

目标：OpenAI 12 条全部转 official（页面上存在的模型）。

## R4 xAI（USD → official）

来源：`https://docs.x.ai/docs/pricing.md`（「All prices are in USD」，列：Model / Context / Input / Cached input / Output）。

原文示例：

```
| grok-4.7 (< 200k prompt tokens) | 500k | $2.00 | $0.50 | $6.00 |
| grok-4.7 (≥ 200k prompt tokens) | 500k | $4.00 | $1.00 | $12.00 |
| grok-4.3 (< 200k prompt tokens) | 1M | $1.25 | $0.20 | $2.50 |
| grok-build-0.1 (< 200k prompt tokens) | 256k | $1.00 | $0.20 | $2.00 |
```

同模型两档按 R1 的拆分方式处理，`notes` 写明档位。

## R5 Cohere（先验证再定）

来源：`https://docs.cohere.com/docs/model-vault/standard/pricing.md`。
抓到且含价格表 → 升级 official；抓不到 → 保持 aggregate 并在 `coding-result.md` 记一行「Cohere 官方 .md 不可用」。

## R6 文档与页面同步

1. `README.md`「如何更新数据」增一节「**怎么核对官方价格**」，写明 `.md`/`llms.txt` 技巧与上述 5 个官方源 URL。
2. `/sources/` 页：把「哪些厂商用了 .md 技巧」写进来源说明；溯源覆盖率数字必须来自 `src/lib/stats.ts`（不得手写）。
3. `docs/.hermes/tasks/20261031-v0.2.0-data-cny/coding-result.md` 更新统计（厂商数 / 条目数 / official / aggregate / CNY / USD），并逐条列出新增 official 条目的「源 URL + 原文行摘录」。

## 门禁（必须全绿并贴真实输出）

```bash
npm run typecheck
npm test -- --run
npm run build
node scripts/data/cli.mjs verify
node scripts/data/cli.mjs drift
```

若某条测试因数据升级而失败：**改断言值可以，删用例不行**；在 `coding-result.md` 说明改了哪条、为什么。

## 完成标准

- official 条目数从 47 提升到 **≥80**（上限取决于官方页真实收录）。
- `verify` 输出中智谱 / Mistral / OpenAI / xAI 的「官方占比」不再为 0%（Cohere 视 R5 结果）。
- **不允许出现任何编造价格**：每条 official 都能对应到上面 URL 的真实行。
- 完成后把 `status.json` 的 `stage` 置为 `implementation_done_r2`，并在 `coding-result.md` 末尾追加「R1–R7 返工记录」小节。
