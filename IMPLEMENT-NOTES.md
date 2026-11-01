# v0.4.0 实施记录

> 任务书：`docs/.hermes/tasks/20261101-v0.4.0-ux-refactor/requirements.md`
> 实测环境：Chromium `151.0.7922.34`（Playwright 驱动，headless，真实布局/渲染引擎，非 jsdom）
> 构建环境：Node `25.8.2` · Vite `8.3.5` · Vue `3.5` · TypeScript `6.0.3`

## 一、改了什么

### #4 国内 / 国外筛选

- `src/lib/filters.ts`：`FilterState` 增加 `region: 'all' | 'cn' | 'intl'`，默认 `all`。
- `src/lib/pricing.ts`：`filterAndSortApiPrices` 增加 `regionByProviderId` 参数，按 `providerId` 查地区；未知厂商在显式地区筛选下 **fail closed**，保证 `cn + intl = all` 是严格互斥子集。
- `src/components/FilterBar.vue`：新增三段式「全部 / 国内 / 国外」控件，带 `aria-pressed`，桌面与移动端控件高度均 44px；与搜索、厂商、溯源、排序叠加。
- `src/views/PlansView.vue` + `src/lib/plans.ts`：套餐页同样支持地区筛选（按 `providerId` 查 providers 表）。

### #2 点击表头排序

- API 主表 6 个排序键：输入价、输出价、Cache 读、Cache 写、上下文、厂商名；表头可点的列显示 `▲ / ▼` 与 `aria-sort`，同列再点反转、换列重置升序。
- Cache / 上下文因主表收列，仍可从筛选区排序下拉选择，能力未丢。
- **跨币种不排名**：排序第一优先级是账单币种分组（USD 组 → CNY 组），`desc` 只反转组内，不会把 CNY 组翻到 USD 组前面；空值 / 未核验永远排所属币种组末尾。
- 套餐排序同样先分 USD/CNY 组，组内按「月费 / 厂商」升降序；缺月费档位恒在所属组末尾（厂商排序时也一样）。

### #1 信息密度重构

- 桌面免责 `details` 默认折叠；hero 压缩；口径说明移到表尾，不再压首屏。
- API 主表 7 列 → **5 列**：厂商/模型、溯源、输入价、输出价、详情；Cache 读写、上下文、计价口径、备注、来源全部进入行内 `<details>`。
- 套餐主表 7 列 → **4 列**：厂商/套餐、月费、额度核心、详情；完整额度、周期、可用模型、用途限制进入 `<details>`。
- 顶部结论卡每页 3 张，全部从真实数据计算；桌面与标题同排，移动端 **竖排**。
- 移动卡片同样主次分层：卡面只留主价格与溯源徽章，长说明进 `<details>`，没有删内容。

### 预渲染 / hydration

- `src/main.ts` 改用 `createSSRApp` + 既有预渲染 HTML 做 hydration，不再清空静态 DOM 重绘。
- `useMediaQuery` 首次渲染固定为 `false`（与 SSR 的移动优先输出一致），真实断点在 `onMounted` 后读取，避免 hydration mismatch。
- 新增筛选/排序状态只在 `onMounted` 后读 `window.location.search`；写 URL 用 `history.replaceState(window.history.state, ...)`，保留 router 的 history state 与 hash。

## 二、§6.1 量化指标（1440×900，实测）

测量口径：

- API 第一个价格：`.pricing-table tbody tr:first-child .price-main` 的 `getBoundingClientRect().top`
- 首屏完整可见行：所有 `tr` 中 `top >= 0 && bottom <= innerHeight` 的行数
- 套餐单行最高：`.plan-table tbody tr` 的 `getBoundingClientRect().height` 最大值
- 横向溢出：`document.documentElement.scrollWidth - innerWidth`，在每个视口单独新建上下文测量

| 指标 | 目标 | 改造前基线 | 改造后实测 | 结论 |
|---|---:|---:|---:|---|
| API 页首屏完整可见行 | ≥8 | 1 | **9** | 通过 |
| API 页第一个价格 top | ≤400px | 826 | **351.78px** | 通过 |
| 套餐页单行最高 | ≤60px | 140 | **51.22px** | 通过 |
| API 页列数 | 5 | 7 | **5** | 通过 |
| 套餐页主表列数 | ≤5 | 7 | **4** | 通过 |
| 横向溢出（7 视口 × 全部路由） | 全部 ≤0 | 0 | **0**（42 组全 0） | 通过 |
| 结论卡数量 | API 3 / 套餐 3 | 0 | **API 3 / 套餐 3** | 通过 |

补充实测：

| 指标 | 基线 | 改造后 |
|---|---:|---:|
| API 行数 | 169 | 169 |
| API 单行最高 | 77px | 56.84px |
| API 单行均值 | 61px | 56.84px |
| API 结论卡最高 | — | 67.16px（≤80） |
| 套餐行数 | 44 | 44 |
| 套餐单行均值 | 86px | 51.20px |
| 套餐首屏完整可见行 | 6 | 9 |

关于「7 路由」：仓库 `ROUTE_DOCUMENT_META` 实际只有 6 条路由（`/`、`/api-pricing/`、`/plans/`、`/calculator/`、`/sources/`、`/methodology/`）。因此横向溢出测量矩阵是 **7 视口 × 6 路由 = 42 组**，不是 49 组；42 组全部 `overflow = 0`。

移动端补充实测（API 页，竖排结论卡后）：

| 视口 | 第一个价格 top | 首屏可见 | 结论卡高度 | 横向溢出 |
|---|---:|---|---:|---:|
| 320×640 | 631.58px | 是 | 38 / 38 / 38px | 0 |
| 375×667 | 651.58px | 是 | 40 / 40 / 40px | 0 |
| 375×900 | 651.58px | 是 | 40 / 40 / 40px | 0 |

## 三、§6.2 功能判据（真实浏览器操作）

| 判据 | 实测 |
|---|---|
| 国内 + 国外 == 全部（API） | 全部 169 = 国内 88 + 国外 81 |
| 国内 + 国外 == 全部（套餐） | 全部 44 = 国内 25 + 国外 19 |
| 点表头排序顺序变化 + 箭头正确 | 输入价：`▲ ascending` → 点击 → `▼ descending`，首行变化；再点回到 `▲ ascending`，首行恢复 |
| 再点同一列反转 | 通过（上一行） |
| 排序后 USD 组仍在前 | 输出价降序：前 162 行为 USD，后 7 行为 CNY；套餐月费降序：前 26 行 USD，后 18 行 CNY |
| 排序后不出现跨币种混排 | 通过（USD 段与 CNY 段均连续） |
| 溯源 / 详情不可排序 | 两列表头无 `<button>`、无点击态 |
| URL 带参数刷新后状态保持 | `?region=cn&sort=outputPrice&order=desc` 刷新后：国内 + outputPrice + 降序，行数 88 |
| URL 更新不刷爆后退栈 | `history.length` 点击前后保持 2；`replaceState` 保留 `history.state.position/current` |
| 移动端 375 能筛选、能排序 | 全部 169 → 国内 88；排序下拉可切 `outputPrice`，方向按钮可切「↓ 降序」 |
| 折叠长文本点开完整 | API Cache read / Cache write 可见；套餐「完整额度 / 周期 / 可用模型 / 用途限制」均可见 |
| 禁用 JS 静态 HTML 有价格与套餐名 | API 169 行、338 个 `.price-main`、含 `Cache read / 1M`；套餐 44 行、含「完整额度」，静态样例「Claude Free」 |
| 静态 HTML 实际 grep | `dist/api-pricing/index.html` 命中 `¥0`、`¥0.2501`、`¥1.00`；`dist/plans/index.html` 命中 `Claude Free`、`CodeBuddy 体验版` |

## 四、§6.3 门禁真实输出

### 1. `npm run typecheck`

```text
> token-price@0.3.0 typecheck
> vue-tsc --noEmit

（0 error，无输出）
```

### 2. `npm test -- --run`

```text
Test Files  17 passed (17)
     Tests  272 passed (272)
  Duration  5.45s
```

既有 234 项一条未删、未 skip；本轮新增 38 项（`tests/ux-refactor.test.ts`、`tests/v040-features.test.ts`），覆盖地区互斥、未知厂商 fail-closed、六类 API 排序升降序、套餐币种分组与缺价置后、URL 解析/序列化、结论卡口径、5/4 列表格结构。

### 3. `PUBLIC_BASE_PATH=/token-price npm run build`

```text
[prerender] 已写出 6 条路由：
  · / -> dist/index.html (4703 字节)
  · /api-pricing/ -> dist/api-pricing/index.html (249972 字节)
  · /plans/ -> dist/plans/index.html (47013 字节)
  · /calculator/ -> dist/calculator/index.html (16930 字节)
  · /sources/ -> dist/sources/index.html (13566 字节)
  · /methodology/ -> dist/methodology/index.html (5462 字节)
==> 未配置域名，dist 无 CNAME
```

### 4. `node scripts/verify-static-build.mjs --dist dist --base /token-price/`

```text
==> 静态产物门禁
产物目录：<repo>\dist
  · API 页：$446 处 / ¥499 处
  · P3 扫描站内链接 58 条，base=/token-price/
  · assets 文件数 2
  · 资源引用完整性：12 个引用全部存在
结论：通过（6 条路由全过 P1–P5）
```

### 5. `git status --short src/data/`

**未执行。** 任务书 §1.3 明令「禁任何 git 操作」，本会话全程未运行 git。实现期间没有写入 `src/data/**`；本次改动仅涉及 `src/lib`、`src/components`、`src/views`、`src/composables`、`src/main.ts`、`src/styles/global.css`、`tests/**` 与本文档。补充证据：`find src/data -type f -newermt '2026-11-01 10:30:00'` 输出为空（任务开始后无数据文件被写入）；部署链 `deploy-site.sh` / `site-publish.mjs` / `verify-static-build.mjs` / `site.config.json` 的 mtime 均停在 2026-10-31，未被本次改动触碰。

## 五、取舍与已知边界

1. **移动端结论卡竖排 vs 首屏价格**：任务书明确要求移动端竖排。竖排三张会多占约 100px；通过压缩页面留白、hero 间距、卡内 padding 把 320×640 的第一个价格压到 631.58px、375×667 压到 651.58px，两个视口首屏仍能看到第一个价格。
2. **hydration 的移动优先**：SSR 输出的是移动卡片（不依赖 JS 也能看到价格），客户端 hydration 首帧必须与之一致，所以桌面用户理论上会先看到一眼卡片再切成表格。这是「预渲染 HTML 与客户端首帧严格一致」的代价；如果让 SSR 直接输出桌面表格，移动端会先闪表格，更差。
3. **结论卡口径按任务书字面执行**：API 最低输入价包含 official 与 aggregate，套餐最低月费包含 0 元免费档，来源/免费语义写在 note。实测 API 国内最低为「智谱 GLM-4.7-Flash ¥0」，国际最低为「Cohere Command R7B Arabic $0.0375（聚合数据）」；套餐为「CodeBuddy 体验版 ¥0（免费档）」「Claude Free $0（免费档）」。没有为了好看而排除免费档或聚合源，但这与首页「排名结论优先官方核验」的旧口径存在张力，若编排层要统一，需要另开口径任务。
4. **Cache / 上下文不再有表头**：§5.1 要求把 Cache 收进详情，§4.1 又要求它们可排序。折中方案是保留筛选区排序下拉中的六个键；桌面表头只对仍存在的列可点。
5. **URL 只恢复初始状态**：`onMounted` 读取一次，之后浏览器前进/后退不会重新应用筛选（避免和 router 的 scroll state 打架）；刷新、分享链接正常。这是本轮已知边界。
6. **`filter-summary` 移到表尾**：口径说明属于「读完表再核对」的信息，放表头会把价格推下首屏；内容一字未删。
7. **结论卡 note 不再截断**：移动端改为整行换行，宁可多一两行，也不把「哪家厂商、什么来源」截掉。

## 六、结论

§6.1 的 7 项量化指标全部达标；§6.2 的功能判据全部通过；四条命令门禁全部通过；预渲染 6 路由仍带真实价格且 P1–P5 通过。唯一未执行的是 §6.3 的 `git status --short src/data/`，原因是 §1.3 禁止任何 git 操作，需由编排层在验收时执行。
