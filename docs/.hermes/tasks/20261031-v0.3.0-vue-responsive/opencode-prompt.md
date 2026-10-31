你是本仓库的编码执行体。任务：把现有的 Astro 静态站**全量重写为 Vite + Vue 3**，并重建全站响应式布局。

## 必读（按顺序，全部在仓库内，禁止读仓库外目录）

1. `docs/.hermes/tasks/20261031-v0.3.0-vue-responsive/requirements.md` —— **本轮权威任务书**。§1 已定决策、§2 事实表、§4 响应式规格、§6 不变式、§7 禁止事项，全部是硬约束。
2. `README.md` —— 数据口径与业务规则真源（价格口径以它和 `src/lib/**` 为准）。
3. `src/lib/*.ts` —— **必须复用的业务逻辑**，不要重写。
4. `src/pages/*.astro`、`src/styles/global.css` —— 现有页面内容与视觉风格，重写时作为内容与样式基线。

## 【已定决策，不要重问、不要给方案等批准】

- 技术栈：Vite 8 + Vue 3.5 + TypeScript + Vue Router 5。删除 Astro 全部痕迹。
- 必须**构建期预渲染**：6 条路由各产出 `dist/<route>/index.html`，禁用 JS 也有真实价格文本。禁止用 `404.html` 重定向 hack。
- base 来自 `process.env.PUBLIC_BASE_PATH`（默认 `/`，发布用 `/token-price/`）。
- 数据层 `src/data/**` **一个字节都不许改**；`src/lib/**` 保持既有导出签名与行为。
- 不引入任何 UI 组件库 / CSS 框架 / cross-env。样式手写。
- `<1024px` 用卡片列表（不横拖），`≥1024px` 用表格但零横向滚动。

## 【已验证的预渲染配方，照抄不要自己发明】

编排层已在本机跑通这条链路（req §2 F16–F18）：

1. `index.html`（仓库根）里写占位：`<div id="app"><!--app-html--></div>`。
2. `vite.config.ts` 按 `process.env.BUILD_TARGET === 'ssr'` 分支：
   - client：`build.outDir = 'dist'`（或 `dist/client`，二者择一并全链路统一）
   - ssr：`build.ssr = 'src/entry-server.ts'`、`build.outDir = 'dist-server'`、`rollupOptions.output.format = 'es'`
3. `src/entry-server.ts` 导出 `async function render(url: string): Promise<string>`，内部：
   `createSSRApp(App)` → `createRouter({ history: createMemoryHistory(import.meta.env.BASE_URL), routes })` → `await router.push(url)` → `await router.isReady()` → `renderToString(app)`。
   ⚠️ **`createMemoryHistory` 必须带 `import.meta.env.BASE_URL` 参数**，否则 SSR 出来的 `RouterLink` href 不带 base 前缀（实测会 404）。
4. `scripts/prerender.mjs`：读 client 产物里的模板 → 逐路由 `render` → 把 `<!--app-html-->` 替换成渲染结果 → 写 `dist/<route>/index.html`。
   ⚠️ **必须断言模板里存在 `<!--app-html-->`**，找不到就 `console.error` + `process.exit(1)`。否则第二次运行占位符已被吃掉，脚本会静默产出上一版的陈旧页面（实测踩过，日志全绿但内容是旧的）。
5. `package.json`：`"build": "npm run build:client && npm run build:ssr && node scripts/prerender.mjs && node scripts/site-domain.mjs --write"`。
   ⚠️ **不要写 `npx vite`**（本机工具链会误判为长驻进程拒跑）。用 `scripts/build-ssr.mjs` 这类 Node 包装器设 `process.env.BUILD_TARGET='ssr'` 后 spawn `node_modules/vite/bin/vite.js build`，或者直接在 npm script 里 `node node_modules/vite/bin/vite.js build`。

## 【响应式要求——这是用户投诉的核心，务必逐条落实】

现状实测（req §0 F10–F15）：表格 2198px vs 手机 351px，必须横拖 6.26 个屏宽看价格；168 行总高 41856px（约 249px/行），被「溯源」列长文本撑高；导航在 375 下换行成两排；标题折三行还把「估算」拆开。

必须做到（req §4 R1–R12，逐条可机械判定）：

- **R2/R3**：`<1024px` 不渲染表格，改卡片列表。每张卡：厂商 + 模型名 → 主价（原币种）→ `≈ ¥` 估算副行 → 溯源徽章 → 上下文/来源折叠进「详情」。375 下页面内不得有横向可滚动容器。
- **R4/R5**：`≥1024px` 表格必须零横向滚动（`table.scrollWidth <= 容器宽`）。做法：把「溯源」列的长文本改成**徽章（官方核验 / 聚合数据）**，「来源」「计价口径」收进行内 `<details>` 或 `title`；只保留必要列。桌面行高单行 < 90px、168 行总高 < 12000px。
- **R6**：导航 `≥768` 横排；`<768` 折叠为汉堡按钮（`aria-expanded` 随状态切换），展开后是下拉/抽屉。375 下 nav 高度 ≤ 64px，不换行。
- **R7**：`h1` 用 `clamp()`，`word-break: keep-all`，375 下行数 ≤ 3。
- **R8**：移动端把长说明文案折叠进 `<details>`，让筛选条和第一条数据进首屏（`scrollY===0` 时 filter 顶部 < 600px）。
- **R9**：所有可点元素 375 下宽或高 ≥ 44px。
- **R10**：支持 `prefers-color-scheme: dark` 与 `prefers-reduced-motion: reduce`。
- **R11**：搜索、厂商筛选、溯源筛选、排序、计算器必须真能用（375 下也要能操作）。
- **R12**：6 条路由全部适配。

保持视觉风格：深色 header、`.shell` 容器、callout 卡片、按钮圆角等，别做成另一套风格。

## 【不变式——破坏即失败】

- `src/data/**` 零改动（`git diff --stat src/data` 必须为空）。
- 价格数值零改动；`node scripts/data/cli.mjs verify` 必须 RC=0（168 条 / 15 厂商）。
- 既有 **174 项测试**必须继续全绿，**不许删断言、不许 skip、不许放宽判据**。实现要对齐测试，不是测试迁就实现。
- 展示口径不变：USD 主价 + `≈ ¥x（按 … 估算 · 日期）`；CNY 主价 + `官方原价`；API 与 Plan 分栏；聚合数据标「聚合数据」。
- `null`/`pending` 显示「待核验」，绝不编数字。
- 每路由保留独立 `<title>` 与 meta description。

## 【执行要求】（违反即失败）

1. **直接写文件，不要停留在计划/等待批准**——非交互模式无人批准。
2. 按 req §3 的文件清单落盘，文件名不可自创。
3. **禁止任何 git 操作**（不 commit / push / branch / switch / stash）。
4. **禁止改**：`src/data/**`、`scripts/data/**`、`scripts/deploy-site.sh`、`scripts/site-publish.mjs`、`scripts/site-domain.mjs`、`scripts/verify-static-build.mjs`、`tests/**` 里既有测试的断言。
5. 自检必须真跑，把真实输出贴出来（不要写"应该通过"）：
   - `npm run typecheck`
   - `npm test -- --run`
   - `node scripts/data/cli.mjs verify`
   - `npm run build`
   - `node scripts/verify-static-build.mjs --dist dist --base /token-price/`
   五项都要 RC=0。构建产物门禁已由编排层写好，直接用它判自己。
6. 更新 `docs/.hermes/tasks/20261031-v0.3.0-vue-responsive/status.json` → `{"status":"ready_for_review"}`。
7. 完成后输出：① 新增/删除的文件清单；② 五项自检的真实读数（typecheck 错误数、测试通过数与文件数、verify 条目数与厂商数、构建路由数、产物门禁结论）；③ 响应式怎么做的一句话总结（移动断点用什么组件、桌面表格省了哪些列）；④ 遗留问题（若有）。

## 【遇到不确定时】

- 价格口径、数据字段：看 `README.md` 和 `src/lib/**`，**不要自己推断**。
- 响应式细节判据：看 req §4，按判据做，别凭感觉。
- 宁可写「此处沿用现有 lib 的 X 函数」也不许编造新 API。
