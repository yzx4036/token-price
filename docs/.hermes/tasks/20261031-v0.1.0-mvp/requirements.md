# Token Price v0.1.0 MVP 需求任务书

> 本文件是本迭代需求真源。项目为新建仓库，无既有产品真源。

## 1. 产品定位

面向中文开发者的 AI API 与 Token Plan 静态比价站。核心价值不是“最低价榜”，而是让用户按输入、输出与 Cache 用量计算真实月成本，并明确区分按量 API 与订阅型 Token/Coding Plan。

## 2. 已定决策，不要重问

- 技术栈：Astro + TypeScript，纯静态输出；不得引入服务端、数据库、登录或密钥。
- 部署目标：GitHub Pages + 自定义域名；必须支持非根路径 `base` 构建。
- 数据：仓库内 TypeScript/JSON 静态数据；价格必须带官方来源 URL、核验日期、币种、计量单位。
- API 与 Token Plan 必须分栏比较，不得混排统一“最便宜”。
- 未核验或无法确认的价格使用 `null` / `pending`，默认不参与排行榜，不得编造。
- 汇率不得冒充实时汇率；若提供 CNY 换算，必须显示“估算汇率”及配置日期。
- 中文界面，桌面和移动端可用；视觉风格专业、克制、数据密集但不拥挤。
- 第一版不做自动爬价、账号、收藏、评论、后端 API、广告与返佣。

## 3. MVP 范围

### 3.1 页面与功能

1. 首页：定位、数据更新时间、API/Plan 两个入口、代表性模型摘要、数据纪律说明。
2. API 比价：按厂商、模型名搜索/筛选；展示输入、输出、Cache read/write、上下文、来源与核验日期；支持按可比较数值排序。
3. Token Plan 比价：展示月费、额度语义、周期、可用模型、自动化/应用后端用途限制、来源与核验状态。
4. 成本计算器：输入每月 input/output/cache-read/cache-write Token 数量，选择模型后计算月成本；所有算式使用每 1M Token 单价；缺价时 fail closed，明确提示不能完整计算。
5. 详情/说明：至少提供数据口径与免责声明页面；每条来源可点击到官方页面。
6. 静态路由直接访问可用，导航与页脚完整。

### 3.2 数据要求

- 定义严格 schema 并在构建/测试时校验：唯一 id、provider、model/plan、currency、unit、numeric nullable fields、source URL、verifiedAt、status。
- 至少纳入 2 家可核验的 API 厂商和若干代表模型；只使用官方来源。若网络无法核价，可以少而真，不可多而假。
- Token Plan 数据允许首版仅包含已核验条目；若没有可核实数字，页面必须以产品化空状态解释“未核验条目不会参与比较”，不能塞演示假数据。
- 排名/“最便宜”等结论必须显示核验日期与比较口径；若数据不足则不下结论。

## 4. 工程约束

- 包管理使用 npm；锁定依赖并提交 lockfile。
- 逻辑层与展示层分离；成本计算、筛选排序、数据校验必须有单元测试。
- 避免重量级 UI 表格库；优先原生 Astro/TypeScript/CSS。
- 默认无客户端框架水合；仅交互部件按需加载。
- 无 `any` 滥用，无控制台错误，无失效内部链接。
- 提供 `.github/workflows/deploy.yml`，使用官方 GitHub Pages Actions 构建发布。
- 提供 README：本地启动、数据维护、核价纪律、GitHub Pages 与自定义域名配置。
- 提供 `.gitignore`，禁止提交构建输出与依赖。

## 5. 验收标准

- `npm ci` 成功。
- `npm run typecheck` 退出码 0。
- `npm test -- --run` 或等价一次性测试退出码 0，且覆盖计算器和数据校验的负向用例。
- `npm run build` 退出码 0，生成静态 `dist/`。
- 用本地 HTTP 服务实际访问：首页、API、Plan、计算器、方法页均为 HTTP 200。
- 浏览器桌面与移动视口检查：关键内容可见、无横向溢出、交互可操作、控制台无 error。
- 注入一个非法价格条目后，数据校验测试必须翻红；撤销变异后恢复全绿。
- Codex 对抗轮完成边界/负向测试、架构回审与轻量 bugfix；无 `needs_architecture`。
- Hermes 复跑全部门禁并核对产物，全部通过后才允许提交。

## 6. 明确排除

- 不实现实时价格承诺。
- 不抓取或存储用户 API Key。
- 不声称任何厂商“最强”“最新”。
- 不做未经官方来源证实的套餐用途判断。
- 不添加遥测与第三方统计脚本。

## 7. 三锻收口纪律（必须遵守）

状态链：implementing → acceptance；失败则 rework（仅失败项）→ acceptance 循环；全过后 accepted_pending_commit → 统一迭代提交 → committed_pending_report → 终验报告与状态回填 → completed。

五条硬规：验收通过才提交；失败只返工失败部分；一次迭代一个交付提交；终验报告是完成门；报告收口不得夹带未复验代码。OpenCode/Codex 不做任何 git commit/push/branch 操作，提交由 Hermes 编排层统一执行。

## 8. 交付文件

- `architecture.md`、`implementation-plan.md`
- 完整 Astro 项目源码、测试、部署 workflow、README
- `coding-result.md`、`review-result.md`
- L1 门禁报告与最终 `FINAL-ACCEPTANCE.md`
