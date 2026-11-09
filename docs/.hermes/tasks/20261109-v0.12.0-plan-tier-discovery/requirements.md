# v0.12.0 套餐档位发现与降噪 · 任务书

> 本文件是**任务书**。需求真源 = GitHub #19（承接已关闭 #17 的 P2），全文见 `issues-dossier.md`。
> 迭代只做「套餐档位发现」这一件事：**降噪 → 提覆盖率 → 出可执行清单**，不改数据、不改展示层。

## 一、批次与顺序

| 批 | 内容 | 顺序理由 |
|---|---|---|
| B1 | 月费语境降噪：价格 token 必须是「月费」才有资格参与差集 | 先止血，否则覆盖率再高也还是一屏噪音 |
| B2 | 覆盖率提升：anthropic / volcengine / zhipu 的可解析源实测与接入 | 依赖 B1 的接收口径（新源同样要过月费校验） |
| B3 | 输出改造：高置信候选 + 低置信/异常分离，每条给建议动作 | 依赖 B1/B2 的字段，最后一步收口 |

## 二、已核实事实表（编排层亲验，设计轮直接引用）

| 编号 | 事实 | 实证 |
|---|---|---|
| F1 | 套餐 55 档 / 13 家，字段含 `providerId` `plan` `monthlyPrice` `billingCurrency` `sourceUrl` `status` `verifiedAt` `allowance` `availableModels` | `src/data/entries/plans.json` |
| F2 | 现有 `plans-structure-drift` **已产出两类事件**：`missingTiers`（页面有、仓库没录）与 `removedTiers`（仓库录了、页面没有），另有 `mergedTiers` / `allowanceChanges` | `scripts/data/lib/plans-structure-drift.mjs:147-166` |
| F3 | 实测覆盖率 **可判 23/55，无法判定 32**；疑似漏档 8 / 疑似合并 1 / 疑似下架 4 / 额度语义变化 7 | `node scripts/data/cli.mjs plans-structure-drift`（2026-11-09） |
| F4 | 噪音实证一：Anthropic `https://claude.com/pricing` 抓到 `0.01/0.05/0.08/0.1/0.125/0.2/0.25/0.3/0.5/0.625/1/1.25/2/2.5/3/3.75/4/5/6.25/8/10/12.5/15/17/25/40/50/125/500` 共 **29 个**「价格」，实际是每百万 token 单价 | 同上，`missingTiers[0].pagePrices`；`recordedPrices=[0,20,100,200]` |
| F5 | 噪音实证二：OpenCode `https://opencode.ai/console/go` 抓到 `1201001` | 同上 |
| F6 | 无法判定三家：anthropic 四档（「可用表多列无法定位本套餐列」）、volcengine 两档与 zhipu `GLM Coding Lite`（「页面无可解析价格（纯前端渲染或无价格 token）」） | 同上 `unknown[]` |
| F7 | 价格 token 抽取是「全页数字集合」，没有月费语境校验 | `scripts/data/lib/plans-structure-drift.mjs:119`（`extractPriceTokens(normalizePage(...))`） |
| F8 | 命令已接进 workflow 的 report-only 步骤（只进 run summary，不阻塞） | `.github/workflows/data-refresh.yml`（v0.11.0 起） |
| F9 | 失败语义基线（v0.11.0 裁定 R15）：官网侧失败 → `unavailable` + exit 0；基准/参数问题 → `CliError` 非 0 | `scripts/data/lib/official-price-drift.mjs` |

## 三、B1 月费语境降噪细则

1. **只接收月费语境**：数字附近出现 `/月`、`每月`、`/mo`、`per month`、`Monthly`、`/month`，或位于套餐价格卡片结构内（如同一行内有档名 + 价格 + 「/月」）。
2. **排除单价语境**：附近出现 `/百万`、`/1M`、`per 1M`、`/token`、`/千 token`、`USD/1M`、`每百万`；出现在「模型价格表」结构内的一律不当作月费。
3. **异常值单列**：非有限、负数、`> 100000` 的「月费」归入「疑似解析异常」，**不得**混进新档位候选，也不许静默丢弃（要看得见）。
4. 判据：用 F4 / F5 两个真实现象做 fixture，Anthropic 那批单价不得再进候选；`1201001` 必须落「疑似解析异常」。

## 四、B2 覆盖率提升细则

1. 对 anthropic（4 档）/ volcengine（2 档）/ zhipu（2 档）逐一实测：
   - 页面地址加 `.md` 是否 200、是否有 `llms.txt` 索引、响应大小与耗时；
   - 内容里**能否解析出「档名 + 月费 + 周期」**（给真实片段作证据）；
   - `robots.txt` 相关规定。
2. 结果写「可用 / 需 JS / 不可用」三档表，逐家给证据；抓不到就如实记，**不许回退解析 JS 壳、不许抓第三方镜像、不许拿旧值冒充新抓取**。
3. 覆盖率提升数必须可复现（给出可判档位前后数字）。

## 五、B3 输出细则

- 每条候选字段：厂商 / 页面 URL / 候选价位 / 已录价位 / 置信度（高 / 低-需复核 / 异常）/ **建议动作**（`新增档位` `疑似下架需复核` `疑似合并` `疑似解析异常`）。
- 报告顺序：高置信候选 → 低置信 + 异常；异常单独一段，别混在候选里。
- 仍 report-only：不写文件、不提交、不触发部署，exit 0；参数/基准问题才非 0（与 F9 一致）。

## 六、红线

1. 不改 `src/data/**` 数据值；不新增运行时依赖；网络只在 CLI。
2. 不做模糊匹配猜档位；建议动作只是候选，落库永远人工。
3. 不碰图表几何、排序口径、页面展示逻辑。
4. UTF-8；改既有文件保持原行尾；不写 emoji；不做 git。

## 七、验收口径

| 项 | 判据 |
|---|---|
| 门禁 | `node scripts/qa/run-gates.mjs` 全绿（测试不少于当前 709 项） |
| 降噪反例 | Anthropic fixture 不得产出 29 条新档位候选；`1201001` 落「疑似解析异常」 |
| 正例 | 「页面上真多出 ¥129 档」fixture → 报「新增档位」候选 + 建议动作 |
| 消失价位 | 「仓库有 ¥9.9、页面只剩 4.9/19.9/49.9」fixture → 报「疑似下架需复核」，不误报其它档 |
| 覆盖率 | 三家可达性各有结论与证据；可判档位数前后对比 |
| 只读 | 运行前后 `src/data` 哈希一致；workflow 仍 report-only 不阻塞 |
| 变异 | 每条新判据各配一个变异证明（改回旧行为必须变红） |
