# v0.3.0 任务书：Vue 3 重写 + 全站响应式适配

> 本文件是**本轮任务书**，不是数据口径真源。数据口径真源 = 仓库 `README.md` + `src/lib/**` 既有实现 + `src/data/**` 数据文件。
> 本文件只规定「UI 层怎么重写、适配到什么程度」，**不重新定义任何价格口径、不修改任何价格数值**。

## §0 背景（用户原话与实测证据）

用户：**「网页没有做适配，使用vue重写。跑三锻实现。」**

编排层实测（不是推测，以下数字均为本机真跑读数）：

| 编号 | 实测事实 | 读数 |
|---|---|---|
| F10 | API 比价表格总宽 vs 手机可视宽 | `table.scrollWidth = 2198px`，`parent.clientWidth = 351px`（375 视口）⇒ **6.26 倍**，必须横向拖动才能看价格 |
| F10b | 桌面同样溢出 | 1440 视口下 `tableW 2198 / parentW 1158` ⇒ 桌面也要横拖 |
| F11 | 168 行总高 | `41856px` ⇒ **约 249px/行**，被「溯源」列的长文本撑高，一屏看不几行 |
| F12 | 375 下导航 | `nav` 高 `123px`，「数据口径」被挤到**第二行** |
| F13 | 375 下 h1 | 字号过大折成 3 行，且「估算」被拆成「估 / 算」 |
| F14 | 首屏顺序 | 标题 → 两段长说明 → callout，**核心数据被推到很下面** |
| F15 | 横拖后失忆 | 拖到价格列时「厂商 / 模型」列已离开屏幕，无法对应行 |

结论：现状是「桌面宽表直接搬到手机」，不是细节瑕疵，是结构性不适配。因此采用 Vue 3 重写并重建响应式布局。

## §1 已定决策（禁止重问、禁止改方向）

| 编号 | 决策 | 说明 |
|---|---|---|
| D1 | **Vite 8 + Vue 3.5 + TypeScript + Vue Router 5** | 移除 Astro（`astro` / `@astrojs/check` / `astro.config.mjs` / `src/pages/*.astro` / `src/layouts/*.astro` 全部删除） |
| D2 | **保留静态产出，禁止 SPA-only** | 6 条路由每条必须产出 `dist/<route>/index.html`，**禁用 JS 也能看到真实价格文本**（构建期预渲染） |
| D3 | 预渲染实现方式 = **双构建 + 自写 prerender**（已由编排层跑通，见 §3 F16–F18） | 不用 `vite-ssg`，不用 `404.html` 重定向 hack（那样深链会返回 404 状态码，SEO 归零） |
| D4 | **base 由 `PUBLIC_BASE_PATH` 环境变量驱动** | `vite.config.ts` 的 `base = process.env.PUBLIC_BASE_PATH || '/'`，默认发布路径 `/token-price/`；路由用 `createWebHistory(import.meta.env.BASE_URL)` |
| D5 | **数据层与业务逻辑零重写** | `src/data/**` 一个字节都不许改；`src/lib/{schema,pricing,format,fx,stats,data}.ts` 保持导出签名，可新增文件但不得改既有行为 |
| D6 | **零 UI 组件库** | 不引入 Element Plus / Naive UI / Vuetify / Tailwind 等。样式手写 CSS（保留现有视觉风格：深色 header、`.shell` 容器、卡片式 callout） |
| D7 | **移动端不用横拖表格** | `<1024px` 改卡片列表；`≥1024px` 用表格但**必须零横向滚动** |
| D8 | 6 条路由全部保留 | `/`、`/api-pricing/`、`/plans/`、`/calculator/`、`/sources/`、`/methodology/` |
| D9 | 部署链不动 | `dist/` → `scripts/site-publish.mjs` → 站点仓 `/token-price/`；`scripts/deploy-site.sh`、`scripts/site-domain.mjs`、`scripts/data/**` 不改 |
| D10 | 交互能力不降级 | 搜索、厂商筛选、溯源筛选、排序、计算器、Plans 页全部保留，且必须真的能用（见 §5 R11） |

## §2 事实表（编排层已亲验，可直接引用，**不得改写成别的名字**）

| 编号 | 事实 | 实证 |
|---|---|---|
| F1 | `src/data/entries/api.json` = 168 条口径真源；`src/data/providers.json` = 15 家厂商 | `node scripts/data/cli.mjs verify` 输出：168 条 / 15 厂商 |
| F2 | `src/data/generated/fx.generated.json` 是汇率快照，缺失则构建必须失败 | 实测删除后 build 失败 |
| F3 | `src/lib/format.ts` 导出 `priceCells`、`priceBasisLabel`、`provenanceLabel`、`formatContextTokens`、`PRICE_PLACEHOLDER_TEXT` | `grep -n '^export' src/lib/format.ts` |
| F4 | `src/lib/pricing.ts` 导出 `filterAndSortApiPrices(prices, filters, fxRate)`、`calculateMonthlyCost`、`parseUsageInput`、`PRICE_FIELDS` | 同上 |
| F5 | `src/lib/stats.ts` 导出 `computeStats`、`computeProviderCoverage` | 同上 |
| F6 | `src/lib/fx.ts` 导出 `RATE_DISCLAIMER`、`fxNote`、`formatRate`、`toCny`、`formatCny` | 同上 |
| F7 | `src/lib/data.ts` 导出 `apiPrices`、`providers`、`fxRate`、`DATA_VERIFIED_AT`、`AGGREGATE_FETCHED_AT`、`AGGREGATE_SOURCE_URL`、`tokenPlans` | 同上 |
| F8 | `src/lib/schema.ts` = Zod schema + `mergeApiPrices`，价格 `null`/`pending` 一律 fail-closed | 同上 |
| F9 | 现有测试 **174 项 / 10 文件**，全部基于 lib 层（不含 DOM），必须继续全绿 | `npm test -- --run` |
| F16 | Vue SSR 预渲染配方已验证可用：client build → SSR build（`rollupOptions.output.format='es'`）→ prerender 逐路由 `renderToString` | 编排层在本机 spike 跑通，产物 `dist/client/api-pricing/index.html` 含完整渲染内容 |
| F17 | `createMemoryHistory(import.meta.env.BASE_URL)` 能让 SSR 阶段 `RouterLink` 生成**带 base 前缀**的 href，实测 `href="/token-price/api-pricing/"` | spike 实测；若用 `createMemoryHistory()` 无参则生成 `href="/api-pricing/"`（**错误**，会 404） |
| F18 | prerender 必须**断言模板里存在 `<!--app-html-->` 占位符**，否则第二次运行时占位符已被上一次吃掉，脚本会静默产出陈旧页面（实测踩过：输出仍是上一版内容，日志却全绿） | spike 实测 |
| F19 | Vite 8.3.5 / vue 3.5.44 / vue-router 5.4.0 / @vitejs/plugin-vue 6.0.10 / vue-tsc 3.3.14 已安装 | `package.json` |
| F20 | ⚠️ `npx vite build` 在本机含 `vite` 关键字的命令会被编排层工具误判为长驻进程并拒跑；改用 `node node_modules/vite/bin/vite.js build` 或写进 npm script 后 `npm run build` | 实测 |

## §3 交付物结构（必须按此落盘，文件名不可自创）

```
index.html                       Vite 入口，必须含 <div id="app"><!--app-html--></div>
vite.config.ts                   base 来自 PUBLIC_BASE_PATH；支持 client / ssr 双模式
tsconfig.json                    改造成 Vue 用（含 vue-tsc 需要的配置）
src/main.ts                      客户端入口：createApp + router + mount('#app')
src/entry-server.ts              SSR 入口：export async function render(url: string): Promise<string>
src/router/index.ts              路由表 + createRouter 工厂（client / ssr 共用）
src/App.vue                      根组件：AppHeader + RouterView + AppFooter
src/components/AppHeader.vue     响应式导航
src/components/AppFooter.vue
src/components/FilterBar.vue     搜索 / 厂商 / 溯源 / 排序
src/components/PriceTable.vue    桌面表格（≥1024）
src/components/PriceCardList.vue 移动卡片列表（<1024）
src/components/PriceCard.vue     单张价格卡
src/components/EmptyState.vue    空结果 / 待核验占位
src/views/HomeView.vue
src/views/ApiPricingView.vue
src/views/PlansView.vue
src/views/CalculatorView.vue
src/views/SourcesView.vue
src/views/MethodologyView.vue
src/styles/global.css            响应式基础样式（可拆 token/vars，但入口必须是这个文件）
scripts/prerender.mjs            静态预渲染（含 F18 的占位符断言）
```

删除：`src/pages/*.astro`、`src/layouts/BaseLayout.astro`、`src/scripts/*.ts`（逻辑迁进组件/composable）、`astro.config.mjs`、`src/env.d.ts` 里的 Astro 声明。

`src/lib/url.ts` 可以删除（Vue 用 router 导航），但**如果删了要确认没有别处 import**。

`package.json` 脚本改为：

```json
"dev": "vite",
"build": "npm run build:client && npm run build:ssr && node scripts/prerender.mjs && node scripts/site-domain.mjs --write",
"build:client": "vite build",
"build:ssr": "cross-env-less 方式：用 BUILD_TARGET=ssr 环境变量",
"preview": "vite preview",
"typecheck": "vue-tsc --noEmit"
```

> `build:ssr` 不要引入 `cross-env` 依赖，用 `node -e` 或直接写 `scripts/build-ssr.mjs` 包一层（内部 `process.env.BUILD_TARGET='ssr'` 后 spawn vite）。**注意 F20：不要写 `npx vite`**。

## §4 响应式规格（可机械判定；每条都是验收项）

| 编号 | 要求 | 机械判据（验收用） |
|---|---|---|
| R1 | 全站无横向溢出 | 视口 320 / 375 / 414 / 768 / 1024 / 1440 下 `document.documentElement.scrollWidth <= window.innerWidth` |
| R2 | 移动端（<1024）价格用卡片，不用表格 | 375 下 `document.querySelectorAll('table').length === 0` 或所有 table 宽 ≤ 容器宽 |
| R3 | 移动端无横向可滚动容器 | 375 下不存在 `scrollWidth > clientWidth + 1` 且 `overflow-x: auto/scroll` 的可见容器（h1 前的横向 tab 条若存在需在判据白名单里说明） |
| R4 | 桌面表格零横向滚动 | 1440 下 `table.scrollWidth <= table.parentElement.clientWidth` |
| R5 | 桌面行高不再被长文本撑爆 | 1440 下 168 行总高 < 12000px（现状 41856px），且单行 < 90px |
| R6 | 导航不换行 | 375 下 `nav` 高度 ≤ 64px；菜单项默认隐藏，点击汉堡后展开；`aria-expanded` 随状态变 |
| R7 | 标题不断词 | 375 下 `h1` 使用 `clamp()`，`word-break: keep-all`，行数 ≤ 3 |
| R8 | 移动端首屏优先数据 | 375 下长说明文案折叠进 `<details>`，筛选条在首屏（`window.scrollY===0` 时 filter 顶部 < 600px） |
| R9 | 触控目标 | 所有可点元素（a/button/select/input）在 375 下 `width>=44 || height>=44` |
| R10 | 暗色与动效偏好 | `prefers-color-scheme: dark` 有对应样式；`prefers-reduced-motion: reduce` 时无 transition/animation |
| R11 | 交互真能用 | 375 下：输入搜索词 → 可见条目数减少；选厂商 → 只剩该厂商；切换排序 → 首行变化；计算器输入用量 → 出现金额 |
| R12 | 六条路由都适配 | 6 条路由逐条跑 R1 / R9 |

## §5 静态预渲染契约

| 编号 | 要求 | 判据 |
|---|---|---|
| P1 | 每条路由产出静态 HTML | `dist/{index.html, api-pricing/index.html, plans/index.html, calculator/index.html, sources/index.html, methodology/index.html}` 全部存在 |
| P2 | 无需 JS 即有真实内容 | `dist/api-pricing/index.html` 里 `¥` 与 `$` 各至少出现 50 次；含「官方原价」；无 `id="app"></div>` 空壳 |
| P3 | base 前缀一致 | 产物内**所有** `href="/..."` 与 `src="/..."` 都以 `/token-price/` 开头（根 `/` 与外部 http(s) 链接除外） |
| P4 | 占位符断言 | `scripts/prerender.mjs` 读模板后若找不到 `<!--app-html-->` 必须 `process.exit(1)` 并打印明确错误（F18） |
| P5 | 无 dev 泄漏 | 产物内不含 `localhost`、`127.0.0.1`、`/src/`、`_astro/` |

## §6 不变式（破坏即失败）

| 编号 | 不变式 |
|---|---|
| I1 | **`src/data/**` 零改动**（`git diff --stat src/data` 必须为空） |
| I2 | 价格数值零改动：`node scripts/data/cli.mjs verify` 仍 RC=0，仍是 168 条 / 15 厂商 |
| I3 | 既有 174 项测试**全部继续通过**，不得删断言、不得跳过、不得放宽判据 |
| I4 | 展示口径不变：USD 主价 + `≈ ¥x（按 … 估算 · 日期）` 副行；CNY 主价 + `官方原价`；API 与 Plan 分栏；聚合数据标「聚合数据」不标「官方原价」 |
| I5 | `null` / `pending` 价格显示「待核验」占位，绝不编造数字 |
| I6 | 部署脚本可继续用：`SITE_SUBPATH=token-price bash scripts/deploy-site.sh` 能跑通（`PUBLIC_BASE_PATH` 仍生效） |
| I7 | 页面标题与描述保留（每路由有独立 `<title>` 与 meta description） |
| I8 | 无新增运行时依赖以外的后端/服务/遥测；不请求任何第三方接口（汇率是构建期快照） |

## §7 禁止事项

| 编号 | 禁止 |
|---|---|
| N1 | 不做 git 操作（不 commit / 不 push / 不 branch / 不 switch / 不 stash） |
| N2 | 不引入 UI 组件库、CSS 框架（D6） |
| N3 | 不用 `404.html` 重定向 hack 代替预渲染（D3） |
| N4 | 不改 `src/data/**`、`scripts/data/**`、`scripts/deploy-site.sh`、`scripts/site-publish.mjs`、`scripts/site-domain.mjs` |
| N5 | 不删测试、不改测试断言去迁就实现（实现要对齐既有断言，不是反过来） |
| N6 | 不留 Astro 残留（`grep -r astro src/ index.html vite.config.ts` 必须为空） |
| N7 | 不新增 `cross-env` 等仅为设环境变量的依赖 |
| N8 | 不写「为了通过校验器而改产物」的迁移说明；产物不符合判据就改实现 |

## §8 验收门（编排层跑，执行体不要尝试跑浏览器/发布）

| 门 | 内容 |
|---|---|
| G1 | `npm run typecheck`（vue-tsc）0 errors |
| G2 | `npm test -- --run` 174+ 项全绿 |
| G3 | `node scripts/data/cli.mjs verify` RC=0，168 条 / 15 厂商 |
| G4 | `npm run build` 产出 6 个路由 HTML；`node scripts/verify-static-build.mjs` 通过（编排层提供） |
| G5 | 浏览器实测：R1–R12 逐条（编排层用 CDP 跑） |
| G6 | `git diff --stat src/data` 为空（I1） |

## §9 裁定表（预置空表，执行轮与审查轮追加）

| # | 冲突项 | 各方原值 | 裁定 | 依据 |
|---|---|---|---|---|
| R1 | 是否保留 Astro | 现状 Astro 7；用户要求 Vue 重写 | **移除 Astro，全量 Vue 3** | 用户原话「使用vue重写」 |
| R2 | 静态化 vs SPA | SPA 实现简单；静态 HTML 保 SEO 与深链 | **必须预渲染出静态 HTML** | 现状就是静态站，降级为 SPA 属功能倒退 |
| R3 | §3「删除 `src/pages/*.astro`、`src/scripts/*.ts`」与 §6 I3「174 项测试不得删断言」不可同时满足 | `tests/format.test.ts` 扫 `src/pages/*.astro`；`tests/stats.test.ts` 读 `src/pages/sources.astro`；`tests/client-scripts.test.ts` 直接 `import src/scripts/{api-table,calculator}` | **页面文件按 D1 全删**；两处测试只把**扫描目标**换成 `src/views` + `src/components` 与 `SourcesView.vue`，**断言语义一条未改**（禁裸插值、禁裸 `$` 拼接、四页共用 `RATE_DISCLAIMER`、sources 页取 `reportedUsdShare`）；`src/scripts/*.ts` **保留**为纯模块（展示口径抽到 `src/lib/cost-display.ts`，脚本只剩 DOM 绑定 + `document` 守卫），既有测试继续直接 import 它 | 两害取轻：删测试/放宽判据属 I3 硬伤，删页面属 §3 手段；把守卫迁移到新 UI 层，判据强度不降反升（扫描文件数从 6 增到 13）。执行轮已在本表登记，审查轮可复核 |
