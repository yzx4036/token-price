# Codex 对抗审查报告（v0.3.0 Vue 重写）

## 0. 效力声明

实际阅读了 `requirements.md`、`opencode-prompt.md`、`task.json`、`status.json`、`logs/opencode.log`、全部 Vue 组件/视图、`src/router/**`、`src/composables/**`、`src/lib/**`、`src/scripts/**`、`src/styles/global.css`、Vite/SSR/prerender 脚本、`package.json`、测试改动 diff 和 `dist/**` 六个路由产物。

实际执行了：

- `git status --short`、`git diff --stat`、`git diff -- tests scripts/deploy-site.sh README.md .gitignore`、`git diff --stat -- src/data`。
- `npm run typecheck`：RC=0。
- `node scripts/data/cli.mjs verify`：RC=0，15 家厂商 / 168 条。
- `node scripts/verify-static-build.mjs --dist dist --base /token-price/`：RC=0，`$445` / `¥495`，扫描 58 条站内链接。
- `node scripts/prerender.mjs`：按 F18 正确报“找不到 `<!--app-html-->`”并 RC=1。
- `npm test -- --run`：在当前审查沙箱内因 Vite/rolldown `spawn EPERM` 无法启动；绕过该 realpath 子进程后以 threads pool 跑到 `160 passed / 14 failed`，14 项均为测试自身调用子进程时 `spawn EPERM`，不是产品断言失败。因此 174 项全绿仍标“未证”。
- 用 Python/Pillow 对现有静态 HTML、CSS 字号和 375/1440 列宽做排版估算；结果明确标为“静态计算”，不冒充浏览器实测。
- 尝试启动 Edge/Chromium + CDP，但当前沙箱在浏览器启动时触发 `mojo platform_channel ... 拒绝访问`，Playwright 启动也报 `spawn EPERM`。因此 R1–R12 没有本轮独立浏览器读数。

结论中“通过”分为两种：源码/产物可直接证明的通过，以及明确标注的静态推断通过；没有声称跑过浏览器。

## 1. 阻断级问题（必须修，否则不算完成）

| # | 问题 | 依据（file:line 或实测读数） | 判据违反（R#/P#/I#） | 建议改法 |
|---|---|---|---|---|
| B1 | 375×667 首屏仍然看不到任何价格。长说明确实收进 details，但四个单列筛选控件和一段三行说明把第一张价格卡推到约 759.5px；这会把用户原投诉从“长说明挡数据”变成“筛选条挡数据”。 | `FilterBar.vue:18-62` 固定渲染搜索、厂商、溯源、排序四个字段；`global.css:282-308` 在移动端保持单列，每个控件 44px；`ApiPricingView.vue:58-61` 在结果前又放三行 filter summary。按 375px shell 宽、现有字号/行高静态计算：filter 顶部约 **366.6px**（机械子阈值 <600 通过），第一张卡顶部约 **759.5px**，超过 375×667 首屏 **92.5px**。 | R8 的实际目标、F14；执行 prompt 明写“筛选条和第一条数据进首屏” | 移动端改成“搜索 + 筛选/排序”折叠面板，或两列紧凑布局；把 `filter-summary` 移到列表后方/桌面端显示。验收不只测 filter top，还要测首张 `.price-card` 顶部小于 667px。 |
| B2 | 禁止修改的部署脚本被改了，且执行体交付清单没有申报这项改动。无论该改动是否善意，当前工作区都不满足 N4。 | `git status --short` 显示 `M scripts/deploy-site.sh`；diff 包含 `NODE_BIN` 与静态门禁调用，见 `scripts/deploy-site.sh:31-41`、`:52-88`。`requirements.md` 的 N4/D9 明确禁止改此文件。 | N4、D9；“禁改”属于硬约束 | 恢复到 baseline `scripts/deploy-site.sh`；若 Windows Node 包装问题确实必须修，应由编排层另立授权/批次，不在本轮夹带。 |
| B3 | 目前没有 R1–R12 的独立浏览器验收，不能签发“响应式完成”。已有的静态门禁只覆盖 HTML/链接，不覆盖 `scrollWidth`、列宽、首屏位置、触控目标、菜单状态和交互。 | `logs/opencode.log` 的最终遗留明确写“R4/R5/R8 的像素级读数需要浏览器确认”；本审查的 Edge/Playwright 尝试也被沙箱阻断。`verify-static-build.mjs:45-141` 只检查 P1–P5 与资源引用，完全不含 R1–R12。 | R1–R12、§8 G5 | 在无沙箱限制的编排层对 320/375/414/768/1024/1440 × 6 路由跑 CDP；至少断言 `documentElement.scrollWidth <= innerWidth`、桌面表宽、每卡/每行位置、触控目标、菜单按钮状态与四项交互。B1 修完后必须重跑。 |

## 2. 非阻断问题（可登记后续批次）

| # | 问题 | 依据 | 建议 |
|---|---|---|---|
| N1 | 预渲染 HTML 没有被 hydrate，客户端用 `createApp(...).mount('#app')` 直接重建整棵树。桌面用户可能先看到 SSR 卡片，再在 JS 到达后切换成表格；执行体“有 JS 时桌面首帧即表格，无闪烁”的说法没有依据。 | SSR 使用 `createSSRApp`：`src/entry-server.ts:14-19`；客户端使用 `createApp` 和 media-query 分支：`src/main.ts:18-24`、`src/composables/useMediaQuery.ts:8-15`、`ApiPricingView.vue:18-20,65-68`。这不是 hydration mismatch，而是根本未 hydration。 | 若要保留预渲染价值，应让 SSR/client 产生同一 DOM，再用 CSS 在表格/卡片间切换；或采用可安全 hydrate 的视口方案。当前可先登记为性能/视觉稳定 debt。 |
| N2 | 移动端默认一次性铺开全部 168 张卡片。按当前 CSS、价格副行和徽章行静态估算，列表总高约 **45,985px**（均值约 273.7px/卡），虽然不再横拖，但仍是一个超长页面。 | `PriceCardList.vue:8-12` 对全部 rows `v-for`；`PriceCard.vue:8-69` 每卡含价格、徽章和详情；`global.css:312-374`。该数字是静态排版估算，不是浏览器实测。 | 增加“加载更多/分页”、按厂商分组折叠，或移动端默认只显示前 N 条；至少把这条列为用户可感知的性能/浏览成本。 |
| N3 | `npm run build` 默认 base 是 `/`，而指定的验收命令固定传 `--base /token-price/`；只有额外设置 `PUBLIC_BASE_PATH=/token-price` 时二者才匹配。执行体在报告中说明了这一点，但构建入口本身没有把这个组合做成一条可复现命令。 | `vite.config.ts:9-17`、`package.json:11-13`；执行体自检日志显示其第 4 步实际导出了 `PUBLIC_BASE_PATH=/token-price`。 | 增加 `build:site`/验收脚本显式设置 base，或让门禁参数从同一次构建环境读取，避免“裸 build + 非根 base”假红。 |
| N4 | 两项既有测试的文件读取目标被改动。断言和 expectation 没有放宽，且 `requirements.md` §9 已登记此裁定；但它仍是需要审查轮明确接受的风险点。 | `tests/format.test.ts:212-222` 把扫描目录从 `src/pages` 换成 `views+components`；`tests/stats.test.ts:35-39` 把目标换成 `SourcesView.vue`。`git diff --numstat -- tests` 为 `9/5`、`2/1`，没有 `.skip/.only`。 | 保留该裁定可以，但最终验收必须真实跑满 174 项；不要把“日志里曾跑过”替代当前工作区复跑。 |

## 3. R1–R12 / P1–P5 / I1–I8 逐条判定

### 3.1 响应式

| 编号 | 判定（通过/不通过/未证） | 依据 |
|---|---|---|
| R1 | 未证 | 源码没有明显 `overflow-x:auto` 的可见容器，`pre` 可换行、卡片和价格文本有 `overflow-wrap`；但没有 320–1440 的 CDP `scrollWidth` 读数。 |
| R2 | 通过（静态） | `ApiPricingView.vue:65-68` 以 `isDesktop` 在表格/卡片间二选一；`dist/api-pricing/index.html` 的 SSR 产物含 168 张 `.price-card`、零 `table`。 |
| R3 | 通过（静态） | `global.css:547-558` 明确 `pre-wrap + overflow-wrap:anywhere`；全 CSS 未发现 `overflow-x:auto/scroll` 或移动端表格残留。仍需浏览器确认实际 `scrollWidth`。 |
| R4 | 通过（静态） | `PriceTable.vue:15-23` 七列；`global.css:401-420` 使用 `table-layout:fixed` 和 `20+8+17+17+15+15+8=100%`，表格宽度 100%；1440 下 shell 内容宽约 1158px，无固定 `min-width` 撑宽。 |
| R5 | 通过（静态） | 列宽同上；把 168 张卡的实际 model/provider/context/价格文本代入 1440 列宽和当前字号估算，总行高约 **10,199px**，最坏单行约 **76.1px**，加表头仍低于 12000px。数字是静态估算，不是浏览器 `getBoundingClientRect`。 |
| R6 | 通过（源码） | `AppHeader.vue:17-22` 在路由变化后关闭菜单；`:30-45` 的 `aria-expanded` 绑定 `open`，`aria-controls` 指向 `nav-links`；`global.css:104-176` 下 375 导航高度 56px、菜单绝对定位覆盖式展开。 |
| R7 | 通过（静态） | `global.css:67-73` 有 `clamp()`、`keep-all`；按 375px shell=343px 与 25.6px 字号估算，六个 h1 最多 2 行，实际文案“估算”不会被拆开。 |
| R8 | **不通过** | filter top 约 366.6px，满足 <600px 的子阈值；但 `ApiPricingView.vue:58-61` + `FilterBar.vue:18-62` 让第一张价格卡顶部约 **759.5px**，375×667 首屏无价格。见 B1。 |
| R9 | 通过（静态） | `global.css:122-138` 品牌/汉堡 44px；`:166-175` 导航链接最小高 44px；`:249-267` details summary 最小高 44px；`:294-303` input/select 最小高 44px；`:579-588` 移动端正文链接最小高 44px。 |
| R10 | 通过（源码） | `global.css:632-668` 是实际变量覆盖的 dark palette；`:671-676` 对全部元素禁止 transition/animation。不是空壳 `@media`。 |
| R11 | 未证 | `FilterBar.vue:8-62` 的 model patch 与计算属性链路看起来正确，`CalculatorView.vue:24-32` 也复用纯函数；但没有浏览器实际输入、选择、排序、计算读数，不能把“接线存在”当成“真能用”。 |
| R12 | 不通过 | API 路由的 R8 已通过静态排版计算判定失败；另外五路由缺少 R1/R9 的浏览器矩阵读数，不能整体签通过。 |

### 3.2 预渲染与静态产物

| 编号 | 判定 | 依据 |
|---|---|---|
| P1 | 通过 | `dist/index.html`、`dist/api-pricing/index.html`、`dist/plans/index.html`、`dist/calculator/index.html`、`dist/sources/index.html`、`dist/methodology/index.html` 均存在；门禁实测六路由全过。 |
| P2 | 通过 | 门禁实测 API 页 `$445`、`¥495`；HTML 中价格卡是真实文本，不是空 SPA 壳。 |
| P3 | 通过 | 门禁实测 58 条站内 `href/src` 全部以 `/token-price/` 开头；`entry-server.ts:15` 使用 `createMemoryHistory(import.meta.env.BASE_URL)`，`main.ts:7` 使用 `createWebHistory(import.meta.env.BASE_URL)`。 |
| P4 | 通过 | `scripts/prerender.mjs:40-44` 缺 `<!--app-html-->` 明确报错并 `process.exit(1)`；我单独复跑该脚本得到 RC=1 和明确错误文案。 |
| P5 | 通过 | 门禁无 `localhost`、`127.0.0.1`、`/src/`、`_astro/` 失败项；`rg -i astro src index.html vite.config.ts package.json` 也无输出。 |

### 3.3 不变式

| 编号 | 判定 | 依据 |
|---|---|---|
| I1 | 通过 | `git diff --stat -- src/data` 输出为空，`git status --short` 无 `src/data/**` 改动。 |
| I2 | 通过 | `node scripts/data/cli.mjs verify` RC=0，明确输出 15 家厂商 / 168 条，严重问题 0。 |
| I3 | 未证 | 独立测试被当前沙箱的 `spawn EPERM` 阻断；绕过 Vite realpath 后达到 160/174，剩余 14 项均卡在测试启动子进程；没有 `.skip/.only`，测试文件未被删除，两个文件只改了扫描目标。日志有 174 passed，但不能冒充本轮独立复跑。 |
| I4 | 通过（源码） | `format.ts:96-145` 仍由 `priceCells` 统一生成 USD/CNY 主副行、聚合标记和官方原价；`PriceCard.vue:14-31`、`PriceTable.vue:47-62` 直接使用 `row.cells`；API/Plan 仍为独立路由与视图。 |
| I5 | 通过（源码与产物） | `format.ts:105-106` 对 null/非法价格统一 `待核验`；产物检查无 `$null`/`¥null`/`>null<`，静态 HTML 中缺缓存价格显示“待核验”。 |
| I6 | 未证 | 部署脚本未实际运行，且当前脚本本身违反 N4；只能确认 `PUBLIC_BASE_PATH` 逻辑仍在，不能确认完整发布链在当前臂环境可跑通。 |
| I7 | 通过 | `router/index.ts:16-44` 有六个独立 title/description；现有六个 dist HTML 均解析出不同 `<title>` 和 meta description。 |
| I8 | 通过（源码） | 运行时代码未发现 `fetch`、axios、WebSocket、遥测或第三方接口调用；数据由静态 import 打包，汇率仍是构建期快照。 |

## 4. 对执行体自检读数的核实

| 它的声称 | 你的核实 | 结论 |
|---|---|---|
| `npm run typecheck` RC=0、0 errors | 独立复跑成功，RC=0，无报错 | 通过 |
| `npm test -- --run` 10 文件 / 174 项通过 | 日志确有该读数；独立复跑被沙箱 `spawn EPERM` 阻断，shim 后仅跑到 160/174，余项仍因子进程被拦 | **未证**；不把日志历史读数当本轮通过，也不把沙箱失败当产品断言失败 |
| 数据 verify 15 家 / 168 条 / official 122 / aggregate 46 | 独立复跑结果一致，RC=0 | 通过 |
| 构建写出 6 条路由 | 现有 `dist` 确有六路由，且 SSR 产物含真实价格文本；未能在当前沙箱重新完整执行 `npm run build` | 产物六路由通过；新鲜构建未证 |
| 产物门禁 RC=0、`$445` / `¥495`、58 条链接 | 独立复跑完全一致，另显示 12 个资源引用均存在 | 通过 |
| `git diff --stat src/data` 为空 | 独立复跑一致 | 通过 |
| `rg astro` 无输出 | 独立复跑无输出 | 通过 |
| 单跑 prerender 会 exit 1 | 独立复跑得到明确缺占位符错误、RC=1 | 通过 |
| 产物无 undefined/NaN/null 泄漏 | 独立解析六 HTML，四类计数均为 0 | 通过 |
| 375 下零 table、零横向溢出、筛选条/首卡进首屏 | 日志没有浏览器读数；源码可证明 375 分支无 table，但静态计算显示首卡顶部约 759.5px | **未证且已有反例** |
| 桌面“首帧即表格，无闪烁” | 执行体没有给出首帧/网络节流实测；客户端是 `createApp` 重建而非 hydrate | **未证**，且架构上存在 SSR 卡片→客户端表格切换风险 |

## 5. 总体裁决

**Adjust。**

不是推翻 Vue 重写：六路由预渲染、base 前缀、静态价格文本、价格口径、暗色/减动效和基本卡片/表格结构都成立。但现在不能 Go，原因是一个仍可直接触发用户投诉的首屏问题、一个明确违反禁改文件的交付问题，以及 R1–R12 没有独立浏览器证据。

Top 5 修复清单：

1. 先修 375×667 的 API 首屏：把四项筛选收进移动端折叠面板/紧凑两列，移动端移除或后置三行 `filter-summary`，以第一张 `.price-card` 顶部小于 667px 作为硬门槛。
2. 在无沙箱限制的编排层跑 320/375/414/768/1024/1440 × 六路由 CDP 矩阵，直接断言 R1–R12；不要再拿 CSS 估算代替浏览器读数。
3. 恢复 `scripts/deploy-site.sh` 到 baseline，或由编排层明确授权该改动并单列验收。
4. 在当前工作区真实复跑 `npm test -- --run`，确认 174/174 且无 skip；当前审查环境只能证明 160 项和其余 14 项被沙箱阻断。
5. 决定是否接受“预渲染但不 hydrate”的架构；若不接受，改成 SSR/client 同树 + CSS 响应式切换，并解决 168 卡全量铺开造成的约 46,000px 移动页长。
