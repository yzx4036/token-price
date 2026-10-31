你是三锻协作的 OpenCode 编码主力。工作目录是 <repo>。

严格读取并执行：
1. docs/.hermes/tasks/20261031-v0.1.0-mvp/requirements.md（需求真源）
2. docs/.hermes/tasks/20261031-v0.1.0-mvp/context.md（事实与执行约束）
3. docs/.hermes/tasks/20261031-v0.1.0-mvp/task.json 与 status.json

【已定决策，不要重问】
- Astro + TypeScript 纯静态站，API 与 Token Plan 分开，数据少而真，不得编价格。
- 直接完成架构、实施、测试和交接；非交互模式不要停在计划或等待批准。
- 先写 architecture.md 与 implementation-plan.md，再实现完整源码和基础测试。
- 你不做任何 git 操作，不提交、不建分支、不推送。
- 如果沙箱无法联网或跑某个门禁，登记事实并继续实现；受限门由 Hermes 代跑。真红测试必须修。

【完成条件】
- npm 依赖、源码、测试、README、GitHub Pages workflow 全部落盘。
- 实际执行 typecheck、一次性测试和 build；记录真实退出结果，禁止编造。
- 写 docs/.hermes/tasks/20261031-v0.1.0-mvp/coding-result.md，包含改动文件、门禁读数、数据来源、未决问题、下一执行体须知。
- 更新 status.json 为 ready_for_adversarial，stage=opencode_complete，并记录 actual_executors.opencode。
- 最后输出文件清单和测试读数。

三锻收口纪律：implementing→acceptance；失败只返工失败项；全部验收通过后才由 Hermes 统一做一个迭代提交；终验报告落盘后才 completed。不得为通过而删断言、放宽判据或把失败项移出范围。
