# v0.1.0 验收记录（Hermes / L3）

- 验收时间：2026-10-31
- 迭代：v0.1.0（`release/v0.1.0`）
- 验收对象：OpenCode 编码轮 + Codex 对抗轮产物 + Hermes 定点返工
- 实际执行体：编码 `openai/gpt-5.6-sol`（OpenCode 侧失败切换记录于日志），对抗 `openai/gpt-5.6-sol`（Codex CLI 0.161.0，`reasoning_effort=high`，单代理）

> 效力声明：本轮未发生「换人降级」。编码轮与对抗轮均为独立进程、独立模型会话，但**同属 gpt-5.6-sol 模型家族**，因此对抗轮不构成跨模型独立审查；本文件的机械结论（门禁、变异、浏览器）全部由 Hermes 亲跑，不采信执行体自述。

## 1. 逐项验收结论

| # | 验收项 | 判据 | 结果 | 证据 |
|---|---|---|---|---|
| A1 | 依赖可复现安装 | `npm ci` 退出码 0 | ✅ | 编码轮实测，lockfile 已提交 |
| A2 | 类型检查 | `npm.cmd run typecheck` 0 errors | ✅ | L1 报告第 1 项，3.1s，exit=0；22 files / 0 errors |
| A3 | 单元测试 | `npm.cmd test -- --run` 全绿 | ✅ | L1 报告第 2 项；实测 4 files / 48 tests passed |
| A4 | 静态构建 | `npm.cmd run build` 退出码 0、产 5 页 | ✅ | L1 报告第 3 项；`page(s) built` 命中 |
| A5 | 五路由可访问 | `/`、`/api-pricing/`、`/plans/`、`/calculator/`、`/methodology/` 均 200 | ✅ | 本地静态服务实测，浏览器五页 `readyState=complete` |
| A6 | 桌面视口 | 1440×900 无横向溢出 | ✅ | 五页 `scrollWidth-clientWidth = 0` |
| A7 | 移动视口 | 375×812 无横向溢出 | ✅ | 五页 `scrollWidth-clientWidth = 0` |
| A8 | 运行期无 JS 错误 | 五页 `error`/`unhandledrejection` 均为空 | ✅ | `Page.addScriptToEvaluateOnNewDocument` 注入探针，五页 errs=[] rej=[] |
| A9 | 无失败资源 | 五页无 4xx/5xx 资源 | ✅ | `performance.getEntriesByType('resource')` 过滤 responseStatus≥400 → 空；dist 内 9 条站内引用全部可解析 |
| A10 | 非法价格变异翻红 | 注入负价格后测试与构建均红 | ✅ | `inputPrice: 0.3 → -0.3`：测试 3 files 失败 / 2 failed，构建抛 `parseUniqueCollection` 错误；还原后 48 tests 全绿 |
| A11 | 非根路径构建 | `PUBLIC_BASE_PATH=token-price` 构建成功且无根路径泄漏 | ✅ | 根路径链接 0 条，`/token-price/...` 链接 23 条 |
| A12 | 计算器正确性 | 与手算一致 | ✅ | Gemini 默认值 1M+0.1M → `$0.55`；DeepSeek 峰值 1M 输入 → `$0.30`；三项混合预期 1.506 → `$1.506`；低谷三项混合预期 0.753 → `$0.753` |
| A13 | 缺价 fail closed | 有用量无价格拒算 | ✅ | Gemini cacheWrite=1000 且无该价 → `无法完整计算 / cacheWrite 暂无已核验价格` |
| A14 | 非法输入 fail closed | 负数/清空拒算 | ✅ | `-5` → `必须是非负安全整数`；清空 → `所有 Token 用量都必须填写` |
| A15 | 筛选与排序 | 搜索、无匹配空态、排序生效 | ✅ | `deepseek` → 2 行；`zzzz-none` → 0 行且空态显示；按 outputPrice 升序 0.6 < 1.2 < 2.5 |
| A16 | 价格真实性（对抗编造） | 每条价格可回原厂官方页 | ✅ | 编排层亲自抓取官方页核对：Gemini 3.5 Flash-Lite Standard input $0.30 / output $2.50 / context caching $0.03；DeepSeek `deepseek-flash` OFF-PEAK $0.003 / $0.15 / $0.6，PEAK $0.006 / $0.3 / $1.2 —— 与 `src/data/api-prices.ts` 逐项一致 |
| A17 | 数据纪律 | API 与 Plan 分栏、未核验不参与比较、无演示假数据 | ✅ | Plan 为空集合，页面走产品化空状态；schema `superRefine` 拒绝 verified 缺核心字段 |
| A18 | 交付物齐备 | workflow / README / .gitignore / lockfile / 设计交接件 | ✅ | 见提交文件清单 |

## 2. 验收发现与定点返工链

验收中亲跑发现 3 项缺陷（均由 Hermes 直改，属 `cross-agent-design-pipeline` §A5.2 直改准入：≤3 项、单点可枚举、改动面集中在 2 个模块、门禁可自跑）：

| 编号 | 缺陷 | 发现方式 | 修复 | 判据 |
|---|---|---|---|---|
| R1 | `deploy.yml` 只在 push `main` 时触发，而本仓 git flow 稳定支是 `master`、当前工作支 `release/v0.1.0` ⇒ Pages 部署永不触发 | 读 workflow 与分支策略比对 | `branches: [master, main]` | YAML 可解析；分支名含 master |
| R2 | 首页「代表性模型」直接插值 `item.inputPrice`/`item.outputPrice`，任一条目 `status=pending` 或价格 `null` 时渲染出 `$null` | 读源码 + 构造 pending 场景推演 | 抽出 `src/lib/format.ts`（`formatUsdPrice`/`formatContextTokens`/`formatPricePair`），首页改用已验证集合 + 统一格式化 | 新增 `tests/format.test.ts`：null/NaN/Infinity/负数一律 `待核验`；变异回填裸插值后该测试 2 项翻红，还原后全绿 |
| R3 | `meta viewport` 缺 `initial-scale=1` | 读 `BaseLayout.astro` | 补 `initial-scale=1` | 构建后 HTML 含该属性；双视口无溢出 |

连带修复：新增 `@types/node` 开发依赖（`tests/format.test.ts` 使用 `node:fs`/`node:path`，缺失导致 typecheck 9 红）。修复后 22 files / 0 errors。

**返工验证**：R1–R3 修复后复跑全部门禁（typecheck 0 errors / 48 tests / build 5 pages），重跑五路由 × 双视口浏览器检查与运行期错误探针，全部通过。

## 3. 未跑第二轮对抗审查的替代验证（效力声明）

R1–R3 为机械性/单点缺陷，未再派 Codex 窄复核。替代的硬验证：

1. **变异测试**：对 R2 新增守卫注入反例（回填裸 `${item.inputPrice}`）→ 测试翻红 → 还原后复绿，证明新门不是恒绿装饰。
2. **数据层变异**：负价格注入 → 测试与构建双红。
3. **浏览器实跑**：五路由 × 双视口 × 运行期错误 × 资源失败，全量读数落在本文件 A5–A9。
4. **官方页逐项对价**：A16，防「看起来合理但不存在」的价格。

未覆盖项：无跨模型独立审查；无真机/真网络部署验证（无远端、未配域名）。

## 4. 遗留与边界

| 项 | 说明 | 承接 |
|---|---|---|
| 自定义域名与 CNAME | 域名未定，`public/CNAME` 未预填 | 部署时按 README 第 4 步配置 |
| Token Plan 无条目 | 有意留空，非缺口 | 后续按核价纪律录入即渲染表格 |
| 数据仅 3 条口径 | 「少而真」结果 | 后续扩充需逐条核官方页 |
| 本地 Node 25 | Vitest 5 声明支持 22/24/26，实测通过但输出 EBADENGINE 警告 | CI 固定 Node 22；建议本地用 22 LTS |
| 无远端仓库 | 未执行 push | 用户确认后建远端再推 |

## 5. 验收裁决

**通过（acceptance passed）** → 进入 `accepted_pending_commit`，由编排层执行本迭代唯一交付提交。
