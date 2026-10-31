# v0.1.0 终验报告

- 迭代：v0.1.0
- 分支：`release/v0.1.0`
- 交付提交：`93da15d` — `feat: 初始化 AI API 与 Token Plan 静态比价站 v0.1.0`
- 完成时间：2026-10-31
- 执行体：Hermes（编排/验收/返工）· OpenCode（架构与编码，实际模型 `openai/gpt-5.6-sol`）· Codex CLI 0.161.0（对抗测试与架构回审，`gpt-5.6-sol` / `reasoning_effort=high` / 单代理）

## ① 迭代范围与任务清单

单一迭代任务：从零交付「AI API 与 Token Plan 静态比价站」MVP。

| 编号 | 任务 | 责任方 | 状态 |
|---|---|---|---|
| T1 | 需求任务书与技术约束 | Hermes | 完成 |
| T2 | 架构设计与实施计划 | OpenCode | 完成 |
| T3 | Astro + TypeScript 源码、页面、客户端脚本 | OpenCode | 完成 |
| T4 | 数据模型、schema 校验、成本计算与排序 | OpenCode | 完成 |
| T5 | 基础测试与门禁脚本 | OpenCode | 完成 |
| T6 | GitHub Pages 工作流、README、静态资源 | OpenCode | 完成 |
| T7 | 对抗测试补测（16 → 41 项）、架构回审、轻量修复 | Codex | 完成 |
| T8 | L3 验收：机械门禁、变异测试、浏览器双视口、官方对价 | Hermes | 完成 |
| T9 | 定点返工 R1–R3 + 返工守卫测试 | Hermes | 完成 |
| T10 | 本迭代统一交付提交 | Hermes | 完成 `93da15d` |

## ② 逐项验收结论与证据

| 验收项 | 判据 | 读数 | 结论 |
|---|---|---|---|
| 类型检查 | `npm.cmd run typecheck` | 22 files / 0 errors / 0 warnings / 0 hints，exit=0 | ✅ |
| 单元测试 | `npm.cmd test -- --run` | 4 files / 48 tests passed，exit=0 | ✅ |
| 静态构建 | `npm.cmd run build` | 5 pages built，exit=0 | ✅ |
| L1 门禁 | `threeforge_gate.py --task-dir` | 通过 3/3；报告 `gate-report.md` | ✅ |
| 路由可达 | 五路由 HTTP 200 | 本地静态服务实跑，五页 `readyState=complete` | ✅ |
| 桌面视口 | 1440×900 | 五页 `scrollWidth-clientWidth = 0` | ✅ |
| 移动视口 | 375×812 | 五页 `scrollWidth-clientWidth = 0` | ✅ |
| 运行期错误 | 五页 `error` / `unhandledrejection` | 全为空 | ✅ |
| 失败资源 | 五页 `performance` 中 status ≥ 400 | 全为空；dist 内 9 条站内引用全部可解析 | ✅ |
| 数据层变异 | 负价格注入 | 测试 2 failed、构建抛错；还原后 48 tests 全绿 | ✅ |
| 展示层变异 | 裸插值回填 | `tests/format.test.ts` 2 项翻红；还原后全绿 | ✅ |
| 非根路径构建 | `PUBLIC_BASE_PATH=token-price` | 构建成功；根路径泄漏 0 条，前缀链接 23 条 | ✅ |
| 计算正确性 | 手算对拍 | 0.55 / 0.30 / 1.506 / 0.753 全部一致 | ✅ |
| 缺价 fail closed | 有用量无价格 | 拒绝输出总价并给出原因 | ✅ |
| 价格真实性 | 官方页逐项核对 | Gemini 3.5 Flash-Lite 与 DeepSeek flash 峰谷六项数值全一致 | ✅ |

## ③ 失败 → 返工 → 复验链

| 轮次 | 触发 | 内容 | 复验读数 |
|---|---|---|---|
| 对抗轮 R0 | Codex 自测 | 排序缺陷：pending 排在已核验空值之前；测试桩误用 `data` 应为 `dataset` | 3 files / 41 tests 全绿 |
| 验收轮 R1 | Hermes 发现 | `deploy.yml` 只监听 `main`，与 `master`/`release` 分支策略不符 | YAML 可解析，含 `master` |
| 验收轮 R2 | Hermes 发现 | 首页裸插值 nullable 价格会产生 `$null` | 新增格式化层 + 守卫测试；变异翻红、还原复绿 |
| 验收轮 R3 | Hermes 发现 | `viewport` 缺 `initial-scale=1` | 构建产物含该属性，双视口无溢出 |
| 连带 | 守卫测试引入 `node:fs` | typecheck 9 红 | 补 `@types/node` 后 22 files / 0 errors |

返工只改失败项及必要关联根因，未重做整轮、未放宽任何判据、未删除既有断言。

## ④ 实际提交

| 仓库 | 提交 | 说明 |
|---|---|---|
| `<repo>` | `93da15d` | 本迭代唯一交付提交，44 个文件 / 6884 行新增 |

- 未建远端、未 push（用户尚未指定仓库地址）。
- 提交由编排层执行；OpenCode 与 Codex 全程未做任何 git 操作。

## ⑤ 遗留边界与后续承接

| 项 | 性质 | 承接方式 |
|---|---|---|
| 自定义域名 / CNAME | 未定 | 用户在 Pages 设置配置，必要时补 `public/CNAME` |
| Token Plan 条目为空 | 有意留白 | 按核价纪律录入后自动渲染表格 |
| 数据仅 3 条口径 | 有意保守 | 扩充需逐条核官方页并更新核验日期 |
| 无远端仓库 | 待定 | 确认后建仓、推 `release/v0.1.0` |
| 本地 Node 25 触发 EBADENGINE 警告 | 环境 | CI 固定 Node 22，本地建议 22 LTS |
| 未做跨模型对抗审查 | 效力边界 | 编码轮与对抗轮同属 gpt-5.6-sol 家族；后续重大改动建议换模型复查 |

## 完成判定

`accepted_pending_commit → committed_pending_report → completed`：本报告落盘且 `status.json` 回填后，迭代 v0.1.0 记为 **completed**。
