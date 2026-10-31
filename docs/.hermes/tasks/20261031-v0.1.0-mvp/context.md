# v0.1.0 实施上下文

## 已核实事实

| 编号 | 事实 | 实证 |
|---|---|---|
| F1 | 当前目录是新建空仓，无旧代码与旧产品真源 | 初始化时 `git init -b release/v0.1.0` |
| F2 | 本机 Node 可用 | `node.exe --version` → v25.8.2 |
| F3 | 本机 npm 可用 | `npm.cmd --version` → 11.13.0 |
| F4 | OpenCode 可用 | `opencode --version` → v2.2.0 |
| F5 | Codex 可用 | `codex --version` → 0.161.0 |

## 数据来源纪律

只允许引用厂商官方定价/文档页面。无法从官方页面确认的字段写 `null` 或 `pending`。不要凭模型记忆填价格，不要把搜索摘要、博客或中转商价格写成官方价格。

已知可尝试的官方入口：
- https://ai.google.dev/gemini-api/docs/pricing
- https://api-docs.deepseek.com/quick_start/pricing
- https://openai.com/api/pricing/
- https://docs.anthropic.com/en/docs/about-claude/pricing

网络失败不构成编造理由；宁可交付少量已核验数据和完整维护机制。

## 执行要求

1. 直接执行，不等待确认；方向已由 requirements.md 拍板。
2. 先产出 architecture.md 和 implementation-plan.md，再实现源码与测试。
3. 不做任何 git 操作。
4. 所有框架命令、配置字段与路径须以真实安装包/API 为准，不得臆造。
5. 完成后写 coding-result.md：改动文件、测试读数、数据来源、未决问题、下一执行体须知。
6. 更新 status.json 到 `ready_for_adversarial`，stage=`opencode_complete`。
7. 非交互模式下不要停在 plan 或等待批准。
