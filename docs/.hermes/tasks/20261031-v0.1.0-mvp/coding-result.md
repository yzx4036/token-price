# Token Price v0.1.0 OpenCode 编码结果

## 1. 结论

Astro + TypeScript 纯静态 MVP 已完成，架构、源码、测试、README、npm lockfile 与 GitHub Pages workflow 均已落盘。当前状态可交给下一执行体做对抗验收。本阶段未执行任何 git 命令、提交、建分支或推送。

## 2. 主要改动文件

### 设计与交接

- `architecture.md`
- `implementation-plan.md`
- `coding-result.md`
- `status.json`

### 工程与部署

- `package.json`、`package-lock.json`、`.npmrc`
- `astro.config.mjs`、`tsconfig.json`、`.gitignore`
- `.github/workflows/deploy.yml`
- `README.md`
- `public/.nojekyll`、`public/favicon.svg`

### 数据与领域逻辑

- `src/data/api-prices.ts`
- `src/data/token-plans.ts`
- `src/lib/schema.ts`
- `src/lib/data.ts`
- `src/lib/pricing.ts`
- `src/lib/url.ts`

### 展示与交互

- `src/layouts/BaseLayout.astro`
- `src/pages/index.astro`
- `src/pages/api-pricing.astro`
- `src/pages/plans.astro`
- `src/pages/calculator.astro`
- `src/pages/methodology.astro`
- `src/scripts/api-table.ts`
- `src/scripts/calculator.ts`
- `src/styles/global.css`

### 测试

- `tests/schema.test.ts`
- `tests/pricing.test.ts`

## 3. 实际门禁读数

以下均在 `<repo>` 实际执行：

| 门禁 | 真实结果 |
|---|---|
| `npm ci` | 退出码 0，新增 278 packages |
| `npm run typecheck` | 退出码 0；19 files，0 errors / 0 warnings / 0 hints |
| `npm test -- --run` | 退出码 0；2 files passed，16 tests passed |
| `npm run build` | 退出码 0；静态生成 5 pages，`dist/` 已生成 |
| 五路由 HTTP 冒烟 | `/`、`/api-pricing/`、`/plans/`、`/calculator/`、`/methodology/` 全部 HTTP 200 |
| 非根路径构建 | `PUBLIC_BASE_PATH=/token-price npm run build` 退出码 0；检查 5 个 HTML，根路径违规 URL 0 |
| 非法价格变异 | 将仓库首条 `inputPrice` 临时改为 `-0.3` 后 schema 测试退出码 1、2 tests failed；恢复文件后退出码 0、6 tests passed |
| 浏览器桌面检查 | Edge headless 1440×900；5 路由均 200、页面级横向溢出 0、console/page error 0 |
| 浏览器移动检查 | Edge headless 375×812；5 路由均 200、页面级横向溢出 0、console/page error 0 |
| 交互探针 | 计算器空白输入显示“无法完整计算”；API 无匹配搜索显示空状态 |

补充事实：本机 Node 为 v25.8.2。`npm ci` 因 Vitest 5 官方 engine 支持 Node 22/24/26 而输出 `EBADENGINE` warning，但安装、类型检查、16 项测试和构建均真实通过；Pages workflow 使用受支持的 Node 22。

## 4. 数据来源与口径

核验日期均为 2026-10-31，只使用厂商官方页面：

1. Google Gemini Developer API pricing  
   https://ai.google.dev/gemini-api/docs/pricing
   - Gemini 3.5 Flash-Lite Standard：input 0.30、output 2.50、context cache 0.03 USD / 1M Token。
   - Cache write 未在该口径中作为独立价格确认，保持 `null`；缓存每小时存储费不计入计算器并已显式提示。
2. DeepSeek Models & Pricing  
   https://api-docs.deepseek.com/quick_start/pricing
   - `deepseek-flash` 拆分峰值与低谷两条，分别记录 cache miss 输入、输出和 cache hit 输入价格。
   - 页面和计算器均显示峰谷适用时段，不用低谷价代表全天价格。

Token Plan 首版为空集合。无法完整确认月费、额度语义、周期、可用模型和用途限制的条目没有录入，页面提供独立的产品化空状态。

## 5. 回审与返工

主人格回审发现并修复：空输入被 `Number('')` 当作 0、pending 条目可参与计算、Plan verified schema 约束不足、Plan 非空展示分支缺失、favicon 404 控制台错误。修复后已复跑类型检查、16 项测试、构建及桌面/移动浏览器探针，全部通过。

## 6. 未决问题

- 自定义域名未知，因此未预填 `public/CNAME`；部署者需在 Pages 设置和 DNS 中配置。
- Token Plan 尚无条目，这是“少而真”的有意结果，不是用假数据填充的缺口。
- 当前数据是静态快照，不承诺实时价格；后续维护必须重新访问官方来源并更新核验日期。
- 本机 Node 25 不是 Vitest 5 声明支持的版本；本次实测通过，CI 固定 Node 22。建议本地日常开发也使用 Node 22 LTS 或 24。

## 7. 下一执行体须知

1. 从当前工作区实况开始对抗检查，不采信摘要代替复现。
2. 优先复测空输入、pending 拒算、负价格变异、DeepSeek 峰谷口径与 `/token-price` base。
3. 若发现失败，只返工失败项并复跑相关门禁；不得删断言、放宽 schema 或移出范围。
4. 当前仅进入 `ready_for_adversarial`，尚未完成最终 acceptance；提交与最终报告仍由 Hermes 统一处理。

## 对抗测试

Codex Mode A 对工作区实现独立补测并复现，不采信编码轮摘要替代执行。新增 `tests/client-scripts.test.ts`，扩充 `tests/pricing.test.ts` 与 `tests/schema.test.ts`；测试总数由 16 项增至 41 项。

| 范围 | 覆盖证据 | 结论 |
|---|---|---|
| 计算器输入 | 空字符串、纯空格、负值、小数、超安全整数、`Infinity`、`1e30`、安全整数科学计数法、全 0、部分字段缺失 | 非法值 fail closed；`1e6` 作为安全整数接受；全 0 正常解析 |
| 成本计算 | 只填一种非零用量、pending 条目、Cache 价格为 `null` 且用量大于 0、非有限数 | pending 与缺价均拒算；单项用量只计对应费用 |
| 浮点与展示 | `0.3 × 3` | 逻辑层用 `toBeCloseTo` 验证近似值；客户端展示为 `$0.90`，不对 IEEE 754 原值做错误精确断言 |
| 数据 schema | API/Plan 重复 id、负价格、非有限价格、非 HTTPS 来源、pending 缺字段、verified 缺 input/output、非法日历日期、额外字段 | 全部拒绝；pending 允许价格为 `null` 但不允许缺少 schema 字段 |
| 筛选排序 | 空查询、大小写、中文、无匹配、带 `null` 字段、pending 排位 | 查询行为正确；可比较值优先、已核验空值其次、pending 最后 |
| 客户端适配 | `calculator.ts` 与 `api-table.ts` 的 DOM/FormData 适配 | 空输入提示、金额格式化、筛选后的重排/隐藏均已覆盖 |

首次定向运行真实出现 2 个红项：1 个实现缺陷（pending 排在已核验空值之前）和 1 个测试桩错误（误用 `data` 而非 DOM `dataset`）。分别修复实现与测试装置后，定向运行 3 files / 41 tests 全绿。

变更后门禁实测：

| 命令 | 结果 |
|---|---|
| `npm.cmd test -- --run` | RC=0；3 files / 41 tests passed |
| `npm.cmd run typecheck` | RC=0；20 files，0 errors / 0 warnings / 0 hints |
| `npm.cmd run build` | RC=0；5 pages built |

本轮无沙箱 spawn 或联网故障，`fault` 为空。官方价格沿用编排层已人工核验基线，本轮未重复联网抓取，也未改价格数据。

## 架构回审

| 检查面 | 代码证据 | 判定 |
|---|---|---|
| 模块边界与依赖方向 | 页面只从 `src/lib/data.ts` 读取已解析集合；客户端脚本复用 `src/lib/pricing.ts`；原始数据仅由数据出口与 schema 测试直接读取；`src/data` 对 schema 的引用是 type-only | ✅ 符合架构，无运行时逆向依赖 |
| 公共契约 | `Usage`、`CostResult`、`PriceField`、schema 导出及函数签名未改；本轮仅强化既有排序语义 | ✅ 无公共接口漂移 |
| 依赖声明 | `npm.cmd ls --depth=0` 显示 Astro、Zod、Vitest、TypeScript、`@astrojs/check` 均与 `package.json` 声明一致；对抗测试未新增依赖 | ✅ 一致 |
| 数据模型 | strict schema、唯一 id、有限非负价格、HTTPS 来源、ISO 日期、verified 核心字段约束均由运行时测试覆盖；API 与 Plan 仍为独立模型 | ✅ 一致 |
| 计价与比较 | 公式仍为四类用量按每 1M Token 求和；正用量遇缺价 fail closed；只有 verified 非空字段进入数值比较，pending 稳定排后 | ✅ 一致 |
| 安全与持久化 | 纯静态输出；无 `fetch`、密钥、Cookie、Web Storage、数据库或遥测；客户端 JSON 来自构建时已校验数据，并在嵌入前转义 `<` | ✅ 无新增安全/持久化风险 |
| 路由与部署 | 站内链接继续经 `BASE_URL`/`sitePath`；构建仍生成 5 个目录式静态路由；Pages 使用官方 Actions | ✅ 一致 |

结论：未发现 `⚠️ needs_architecture`。本轮没有修改架构、数据模型、依赖、持久化、安全边界或部署设计。

## 修复记录

1. `src/lib/pricing.ts`：排序比较器先按核验状态分组，再比较目标价格与名称，确保 pending 不会因模型名字典序跑到已核验空值前；不改变函数签名。
2. `tests/pricing.test.ts`：补齐计算、解析、筛选排序与浮点边界断言。
3. `tests/schema.test.ts`：补齐 API/Plan 负向 schema 与集合唯一性断言。
4. `tests/client-scripts.test.ts`：新增无第三方 DOM 依赖的客户端适配测试；首次测试桩字段错误已修正，产品代码未为测试装置妥协。
5. 无遗留失败项；交付状态仅推进到 `ready_for_acceptance`，最终验收、统一迭代提交与完成状态仍由 Hermes 负责。

建议索引: 排序时不可比较状态优先级 → 墨典:memory/testing-patterns.md#pending-与空值排序
