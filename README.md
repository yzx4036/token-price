# Token Price

面向中文开发者的 AI API 与 Token/Coding Plan 静态比价站。项目强调“少而真”：每条价格必须有官方来源、核验日期和明确计价口径，缺失价格不会被猜测补齐。

## 本地开发

要求 Node.js 22.23.4+ 与 npm 9.6.5+。

```bash
npm ci
npm run dev
```

质量门禁：

```bash
npm run typecheck
npm test -- --run
npm run build
```

`npm run build` 默认按根路径输出纯静态文件到 `dist/`。模拟 GitHub Pages 仓库子路径（bash）：

```bash
PUBLIC_BASE_PATH=/token-price npm run build
```

PowerShell：

```powershell
$env:PUBLIC_BASE_PATH='/token-price'; npm run build
```

## 数据维护

- API 原始数据：`src/data/api-prices.ts`
- Token Plan 原始数据：`src/data/token-plans.ts`
- 严格 schema：`src/lib/schema.ts`
- 计算与排序：`src/lib/pricing.ts`

修改价格时必须：

1. 直接打开厂商官方定价或文档页面，不使用搜索摘要、博客、中转商或模型记忆。
2. 填写官方 HTTPS 来源、实际核验日期、币种、单位和计价条件。
3. 无法确认的数字写 `null`，条目整体未核实时使用 `pending`；不得填演示价格。
4. 峰谷价、批处理价、长上下文价等不同条件应拆成明确口径，不用最低条件代表全部请求。
5. 运行全部质量门禁。`tests/schema.test.ts` 包含非法负价格变异，确保 schema 会 fail fast。

当前 API 数据于 **2026-10-31** 核验：

- [Google Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)

Token Plan 暂为空集合，页面提供产品化空状态；只有月费、额度语义和用途限制都能从官方来源确认时才录入。

## GitHub Pages 部署

仓库包含 `.github/workflows/deploy.yml`，使用 GitHub 官方 Pages Actions。仓库设置中：

1. 在 **Settings → Pages → Build and deployment** 将 Source 设为 **GitHub Actions**。
2. 若发布在 `https://<user>.github.io/<repo>/`，创建 Actions/Repository variable `PUBLIC_BASE_PATH`，值设为 `/<repo>`。
3. 若使用用户站点或根路径自定义域名，可不创建变量，默认 base 为 `/`。
4. 自定义域名在 Pages 设置中配置，并按 GitHub 文档设置 DNS。若需要在每次部署中固定域名，可在 `public/CNAME` 放置域名；本仓库不预填未知域名。

所有站内链接均使用 Astro `BASE_URL`，支持根路径与非根路径构建。

## 范围与免责声明

本版没有服务端、数据库、账号、API Key、自动爬价、遥测或汇率换算。计算结果不含税费、缓存存储费、工具调用等额外费用，不构成采购建议，最终价格与账单以厂商官方信息为准。
