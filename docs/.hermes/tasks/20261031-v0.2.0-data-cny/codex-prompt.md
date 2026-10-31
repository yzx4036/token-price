# Codex 任务（Mode A）：v0.2.0 对抗审计 + 架构回审

工作目录：`<repo>`。Hermes 已跑通基线，你的职责是**找问题**，不是重写。

## 当前基线（Hermes 亲跑，全部绿）

- `npm run typecheck` → 0 errors / 25 files
- `npm test -- --run` → 95 passed / 7 files
- `npm run build` → 6 pages
- `node scripts/data/cli.mjs verify` → RC=0，15 厂商 / 168 条口径 / official 122 / aggregate 46
- 编排层已做过一轮 R1–R6 数据升级（智谱/Mistral/OpenAI/xAI 从 aggregate 升为 official），改动落在 `src/data/entries/api.json`、`src/data/providers.json`、`src/pages/sources.astro`、`README.md`

你的职责是**找问题**，不是重写。

1. **不做任何 git 操作**。
2. **不放宽既有断言、不删测试、不把失败项移出范围**来让门禁变绿。修不了就如实报告。
3. 你修复的范围仅限**明确缺陷**（真实 bug、数据错误、fail-open、断言缺失）。架构层面的不满写进报告，不要大改。
4. 不得编造价格。数字只能来自官方页或聚合源。

## 已知环境事实（不要浪费时间重复踩）

- bash 下 `curl` 抓 OpenAI 官方定价页返回 403；Kimi、智谱、火山方舟、阿里百炼定价页为 JS 渲染，静态抓不到表格。
- 可 Static 抓：DeepSeek 中文页、MiniMax、Anthropic（`platform.claude.com/docs/en/about-claude/pricing`）、Google。
- `$TMPDIR` 在 bash 里是 `/tmp`，但真实落盘在 `<tmp>`。

## 权威取数基线（Hermes 亲抓，与实现冲突时以此为准）

`docs/.hermes/tasks/20261031-v0.2.0-data-cny/GROUND-TRUTH.md`

**必须逐条对拍**：实现中所有 `provenance: "official"` 且属于 DeepSeek / MiniMax / Anthropic 的条目，数字与基线不符者判为**数据错误**（最高优先级）。

## 重点审计清单（按优先级）

### P0 数据正确性与 honesty
1. `official` 条目是否有真实官方数字支撑？抽查其 `sourceUrl` 与 `verifiedAt`；无法自证的 official 必须降级为 `aggregate` 或删除。
2. 聚合条目（models.dev）是否被误标为 `official`？
3. 是否存在编造/推演的价格（例如用汇率反算出「官方人民币价」却标 official）？
4. 国内厂商条目是否错用 USD 口径、或国际厂商被错标 CNY 口径（`billingCurrency` 与真实计价币种不符）？

### P1 币种与汇率
5. 汇率是否只来自生成文件、没有硬编码在组件里？删掉 `generated/fx.generated.json` 后构建**必须失败**（验证一次）。
6. 页面是否明确显示「估算」与汇率日期？`billingCurrency=CNY` 的条目是否被误做汇率换算（应原样显示）？
7. 是否有把 USD 估算值当成官方人民币价的文案（如「官方价 ¥xx」）？

### P2 数据 CLI
8. `add`：负价格 / 非 https / 缺 `verifiedAt` / official 缺 `sourceUrl` 是否**全部拒绝**且文件字节不变？（逐个实测，贴退出码）
9. 写文件是否原子（临时文件 + rename）？中途失败是否可能留下半截 JSON？
10. `drift`：把本地一条 official 价格人为改错，`drift` 是否报出差异？改回后是否恢复无差异？
11. `verify` 与页面统计是否共用同一份 stats 源？两处数字是否一致（抽一家厂商核对）？
12. `publish` 是否真的串联 verify→typecheck→test→build→deploy，任一步失败即中止？
13. `--json` 输出是否为合法 JSON（可被 `node -e` 解析）？

### P3 fail-closed 与测试
14. 缺价是否仍拒算（不得给部分总价）？
15. 新增测试是否只是「跑通」而没有真正覆盖负向路径？构造函数级变异（把某条价格改成负数、把 aggregate 伪装成 official），确认对应测试与门禁**翻红**，再还原。
16. v0.1.0 原有 48 个用例是否被删除或弱化？（改断言值可接受，删用例不可接受 —— 报告删除清单）

### P4 构建与静态站点
17. 构建期是否真的没有网络请求（断网/无 FX 文件时行为）？
18. `PUBLIC_BASE_PATH=/token-price npm run build` 是否仍无根路径泄漏？
19. 新增 `/sources/` 路由是否在构建产物中存在且可访问？

## 交付

写 `docs/.hermes/tasks/20261031-v0.2.0-data-cny/review-result.md`：

- 结论段：`pass` 或 `needs_fix`
- 问题表：编号 / 级别(P0-P4) / 现象 / 证据（命令 + 真实输出）/ 处置（已修 / 待返工）
- 你已修复的项：改了什么、验证命令与真实输出
- 你未修但认为有问题：说明为什么不修
- 架构回审：是否出现 `needs_architecture`（只有存在方向性错误时才写，如币种模型设计错误）

同时把你实测的门禁输出原样贴进报告（不要写「应该通过」）。
