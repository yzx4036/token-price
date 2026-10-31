# Token Price v0.1.0 架构

## 1. 架构目标

以 Astro 纯静态输出交付中文 AI 价格比较站。所有产品数据随仓库版本化，构建时经 Zod 严格校验；浏览器端只承载筛选、排序和成本计算，不访问厂商接口，不持有密钥。

## 2. 技术选型

- Astro 7 + TypeScript strict：静态页面、共享布局与零框架客户端脚本。
- Zod 4：数据 schema 和构建时 fail-fast 校验。
- Vitest 5：验证 schema、筛选排序和成本计算纯函数。
- 原生 HTML/CSS/TypeScript：避免 UI 表格库和客户端框架水合。
- GitHub Pages 官方 Actions：`configure-pages`、`upload-pages-artifact`、`deploy-pages`。

依赖版本以 2026-10-31 实际 `npm view` 结果为依据，lockfile 由 npm 生成。

## 3. 模块与依赖方向

```text
src/data/*.ts                    静态原始数据
        ↓
src/lib/schema.ts               严格 schema 与集合校验
        ↓
src/lib/pricing.ts              计算、筛选、排序纯函数
        ↓
src/pages + src/components      静态渲染与渐进增强
        ↓
src/layouts/BaseLayout.astro    导航、SEO、页脚、全局样式
```

展示层不得自行实现价格公式或绕开校验读取原始数据。页面在构建时调用集合校验，非法数据使构建失败。客户端计算器使用构建时已校验数据的 JSON 投影及同一计价公式语义。

## 4. 数据模型与纪律

### API 价格

每条记录包含唯一 `id`、厂商、模型、币种、`per_1m_tokens` 单位、输入/输出/Cache read/Cache write 可空价格、上下文、官方来源、核验日期、状态和价格口径说明。数值必须有限且非负；`verified` 条目至少有输入和输出价格。

### Token Plan

每条记录包含唯一 id、厂商、套餐名、月费与币种、额度语义、周期、可用模型、用途限制、官方来源、核验日期与状态。未核实字段保持 `null`；`pending` 默认不可比较。

当前只录入在本次执行中可从官方页面直接核实的少量 API 价格。Token Plan 暂无可信数字时保持空集合，由页面展示产品化空状态，不放演示数据。

## 5. 计价与比较边界

- 公式：`Σ(token 数量 / 1,000,000 × 对应单价)`。
- 任一用量为负数、非有限值即拒绝。
- 某类用量大于 0 而该类价格为 `null` 时 fail closed，不给部分总价。
- 只有 `verified` 且目标排序字段非空的 API 条目参与数值排序；空值置后。
- API 与 Token Plan 使用独立路由、独立表格和独立比较口径。
- 不提供默认 CNY 换算，避免把固定配置冒充实时汇率。

## 6. 路由与 base 支持

- `/` 首页
- `/api-pricing/` API 比价
- `/plans/` Token Plan 比价
- `/calculator/` 成本计算器
- `/methodology/` 数据口径与免责声明

所有站内 URL 通过 Astro `BASE_URL` 前缀生成，兼容根路径与仓库子路径。输出使用目录式 URL，便于静态托管直接访问。

## 7. 质量与部署

- `astro check` 执行类型与模板检查。
- Vitest 覆盖计算、筛选排序、schema 负向用例和非法价格变异。
- `astro build` 生成 `dist/`。
- Pages workflow 从仓库变量 `PUBLIC_BASE_PATH` 读取可选 base，默认 `/`。
- 本地 HTTP 冒烟检查由构建后的 `dist/` 提供服务并验证五条路由。

## 8. 明确取舍

- 无服务端、数据库、用户系统、遥测、自动抓价。
- 无 SPA 路由；每个路由都是独立静态 HTML。
- 不追求条目数量。来源可访问但价格口径复杂或无法核实的条目不录入。
