# Token Price v0.1.0 实施计划

## P1 工程骨架

1. 建立 npm package、Astro/TypeScript/Vitest 配置与 `.gitignore`。
2. 配置静态输出、尾斜杠和环境驱动的 Pages base。
3. 建立全局布局、样式和站内 URL 工具。

## P2 数据与领域逻辑

1. 用 Zod 定义 API 与 Token Plan 严格 schema、唯一 id 集合校验。
2. 仅录入 2026-10-31 从官方页面核实的数据，记录来源和口径。
3. 实现成本计算、搜索筛选和空值安全排序纯函数。
4. 先完成负向测试，再接入页面。

## P3 页面与交互

1. 首页提供双入口、更新时间、代表模型和数据纪律。
2. API 页面提供厂商/模型筛选、字段齐全的响应式表格及可比较排序。
3. Plan 页面提供独立比较区域；无核实数据时显示明确空状态。
4. 计算器提供模型选择与四类月用量，缺价时 fail closed。
5. 方法页说明来源、核验、计价、汇率和免责声明。

## P4 工程交付

1. 编写 README、GitHub Pages workflow。
2. 运行 `npm install` 生成 lockfile，再运行 typecheck、一次性测试、build。
3. 以本地静态 HTTP 服务验证五条路由状态码。
4. 执行非法价格变异测试并确认先红后绿。
5. 写 `coding-result.md`，更新 `status.json` 到对抗验收阶段。

## 完成判据

- 所有要求文件真实落盘；不进行任何 git 操作。
- 门禁读数来自实际命令，不以计划或推测替代。
- 真红测试只修失败项，不删断言、不放宽 schema。
