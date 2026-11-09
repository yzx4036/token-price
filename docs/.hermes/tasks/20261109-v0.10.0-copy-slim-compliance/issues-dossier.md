# 本迭代 issue 全文（dossier）

## #12 审计全站文案合规：换掉「官方核验」这类越权措辞，补免责与商标口径

# 文案合规审计：换掉「官方核验」这类越权措辞，并统一免责与商标口径

## 来源（作者指令原文）

> 审计站点中的官方核验太绝对了（不是官方核验，是来源于爬虫爬到的官方信息），换一个措辞，对所有文案都需要合规不能侵权和不能强制代表厂商

## 一句话结论

「官方核验」在语义上等于「第三方核验认证」，而数据真实链路是**爬虫抓取厂商官方定价页**。本站既没有厂商授权，也没有厂商确认，这个措辞把「从官方页上抓到的数字」升格成了「经本站核验的官方数据」，需要全站换词，并配套商标、免责、绝对化用语三块口径一起改。

## 一、现状取证（2026-11-02 本仓 grep 全量实测）

| 措辞 | 出现次数 | 涉及文件 | 主要落点 |
|---|---|---|---|
| 官方核验 | 49 | 22 | `src/views/HomeView.vue` 6 / `SourcesView.vue` 6 / `ApiPricingView.vue` 5 / `scripts/gen-llms-txt.mjs` 5 / `src/lib/schema.ts` 3 / `MethodologyView.vue` 3 / `src/lib/format.ts` 2 / `src/lib/stats.ts` 2 |
| 官方原价 | 54 | 16 | `src/lib/format.ts` 9 / `MethodologyView.vue` 4 / `src/lib/cost-display.ts` 3 / `ApiPricingView.vue` 2 / `src/lib/site-meta.ts` / 测试断言 `tests/format.test.ts` 17、`tests/verify-static-build.test.ts` 5、`tests/client-scripts.test.ts` 3 |
| 未逐条核官方 | 14 | 8 | `src/lib/format.ts` 4 / `SourcesView.vue` 4 / `KeyFacts.vue` 1 / `HomeView.vue` 1 / `MethodologyView.vue` 1 / `gen-llms-txt.mjs` 1 / `src/data/lib/discover.mjs` 1 |
| 官方指定（厂商条款转述） | 3 | 1 | `src/data/entries/plans.json:161/180/199`（转述厂商用途限制，不是本站判断） |

### 与真实链路对不上的四处（必须同批改）

页面与文档现在都写「人工打开官方定价页逐项核对」，与「爬虫抓取」的真实链路矛盾：

| 位置 | 现有文案 |
|---|---|
| `src/views/SourcesView.vue:95` | 「官方核验」= 人工打开官方定价页逐项对照 |
| `src/views/SourcesView.vue:159` | 价格由人工逐条核对官方页后录入 |
| `src/views/MethodologyView.vue:30` | official（官方核验）：人工打开厂商官方定价页，逐项核对… |
| `scripts/gen-llms-txt.mjs:61`、`README.md` | 官方核验：N 条（人工打开官方定价页逐项核对） |

### 资产侧的好消息

`public/` 只有 `favicon.svg` 与本号二维码，**没有任何厂商 logo 或官方页面截图**；`src/data/providers.json` 只存 `nameZh / nameEn / website / pricingUrl`，无 logo 字段。⇒ 侵权风险目前集中在**文字表述**，不在视觉素材。

## 二、问题定性（三类，别混在一起改）

### A. 措辞越权（作者点名）

1. **「核验」= 本站主动核对并背书**。实际是爬虫把官方页的数字抓下来，站点能保证的只有「这条记录有官方页 URL + 抓取日期」，不能保证「厂商确认过这个数字」。
2. **「官方原价」把本站放到定价方的位置**。价格法语境里「原价」还带促销对比含义（划线原价 / 打折前价），容易被读成促销话术。
3. **最值类结论可保留但要带口径**：「国内最低付费输入价」「性价比最优」「智能指数」都属事实型或自建指标，前提是始终附口径限定（只覆盖官方页来源条目、排除免费档、口径见 `/methodology/`），不得在标题、meta、分享卡片里裸奔。

### B. 不代表厂商（作者点名）

- 凡是可能被读成「厂商授权 / 认可 / 合作 / 本站已获官方确认」的表述都要清：`官方核验`、`官方数据`、`已核官方`，以及任何「官方以此为准」的暗示。
- 厂商条款转述（`plans.json` 的「仅限官方指定工具」）要与本站计算结论在视觉与措辞上分开，标明是厂商条款原文或转述。
- 同一句话在 `src/lib/site-meta.ts`、`src/lib/structured-data.ts`、`scripts/gen-llms-txt.mjs`、`src/router/index.ts` 的 meta/og 里各写一遍，改词必须四处同步，否则分享卡片上还是旧口径。
- 现有免责已含「不代表任何厂商、不构成采购/财务/法律建议」（`site-meta.ts:46`、`MethodologyView.vue:114`、`AppFooter.vue`），**缺两句**：① 与各厂商无隶属、合作或授权关系；② 厂商名称与商标归各自权利人所有。

### C. 不侵权（作者点名）

- **名称边界**：厂商名与模型名只作指称性使用（nominative use），首屏、标题、og 图不得让人误以为本站是厂商官方站点；建议页脚或口径页补一句商标归属声明。
- **表达边界**：价格数字是事实，可以用；厂商定价页的说明文字、表格结构与排版属表达，不得整段搬运（当前无搬运，但要写进纪律，防止以后补文案时抄官方页）。
- **抓取边界**：遵守 robots、限频、带可识别 User-Agent、不绕过反爬、不抓登录后页面——这条同时决定文案只能写「抓取公开定价页」，不能写「已获授权」。
- **绝对化用语**：广告法第 9 类词（国家级 / 最高级 / 最佳）与价格类绝对表述（全网最低 / 最便宜）禁用；最值结论只允许带口径的事实陈述。

## 三、建议措辞（待拍板，推荐项在前）

| 现措辞 | 推荐替换 | 备选 | 说明 |
|---|---|---|---|
| 官方核验 | 官方页抓取 | 官方来源（抓取于 YYYY-MM-DD） | 描述动作，不是背书；日期字段 `verifiedAt` 已现成 |
| official（展示层） | 官方页 | 官方来源 | 内部枚举名 `official` 不动，只改展示文案 |
| 官方核验日期 | 抓取日期 | 数据抓取于 | 同上 |
| 官方原价 | 官方标价 | 厂商挂牌价 | 去掉「原价」的促销含义；后者更长，价格列宽会变 |
| 未逐条核官方 | 未核官方页，取自第三方聚合 | 聚合数据（未核官方页） | 差异要保留，既不夸大也不隐藏 |
| 已排除 N 个免费档 | 保留 | — | 这是口径限定，不能删 |

**配套工程要求**：术语收敛到**单一真源**（建议新增 `src/lib/copy.ts` 存术语常量），页面、脚本、llms.txt、structured-data 全部从它取词。现在同一语义散在 22 个文件 49 处，逐处改必漏。

## 四、改动面清单

- 视图层：`src/views/HomeView.vue`、`ApiPricingView.vue`、`PlansView.vue`、`CalculatorView.vue`、`SourcesView.vue`、`MethodologyView.vue`
- 组件层：`src/components/FilterBar.vue`、`KeyFacts.vue`、`AppFooter.vue`
- 库层：`src/lib/format.ts`、`cost-display.ts`、`stats.ts`、`site-meta.ts`、`structured-data.ts`、`price-row.ts`、`plan-vs-api.ts`、`schema.ts`
- 路由与元信息：`src/router/index.ts`
- 生成脚本：`scripts/gen-llms-txt.mjs`、`scripts/verify-static-build.mjs`、`scripts/data/lib/discover.mjs`
- 文档：`README.md`、`IMPLEMENT-NOTES.md`
- 测试断言：`tests/format.test.ts`（17 处）、`tests/verify-static-build.test.ts`（5 处）、`tests/client-scripts.test.ts`（3 处），以及 schema / plan-vs-api / ux-refactor 各 1–2 处

## 五、验收口径（可机器判）

1. `grep -rn "官方核验\|官方原价" src scripts public site-root README.md` 归零（术语表内作为「旧词对照」的除外，需带注释标记）。
2. 六个页面 + `llms.txt` + structured-data 里出现的溯源词全部来自 `src/lib/copy.ts`，并加一条测试拦截「直接硬编码中文溯源词」。
3. 免责四要素齐全且三处一致（页脚 / `/methodology/` / structured-data）：非官方、与厂商无授权关系、以厂商页面为准、不构成采购建议；另有商标归属一句。
4. 旧词测试断言全部更新后 `npm test -- --run` 通过。
5. 无厂商 logo / 官方页面截图资源（可加断言长期守住）。
6. `node scripts/data/cli.mjs verify`、`npm run typecheck`、`npm run build` + 产物门禁全绿。

## 六、待确认（交作者拍板，本单不自行定）

1. 新词最终选「官方页抓取」还是「官方来源」，两者混用还是只留一个？
2. 「官方原价」替成「官方标价」还是「厂商挂牌价」？
3. 合规声明放现有 `/methodology/` 页扩写，还是单开一页（商标归属 + 无权属声明）？
4. 是否需要法务向复核？本单只做工程与文案，不提供法律意见。

## 七、边界与风险

- 这是**全站文案口径改版**，不是首页一处小改：首屏、筛选器、徽标、llms.txt、结构化数据、分享卡片都会变，漏一处就等于没改。
- 换词后页面不得再出现任何「已核官方 / 官方确认 / 官方以此为准」的表述，否则新词形同虚设。
- 本单不动数据本身（133 条官方页来源 / 45 条聚合条目的金额与归属），只动描述这些数字的措辞。

## 关联

- 与 #10（数据漂移监控）相关但不重叠：改词后 drift 结论的对外表述需一并复核。
- 与 #3（用量-成本曲线）无依赖，可并行。

---

## #13 站点文本可适当简约：同一免责四处重复、单元格逐格重复汇率日期

## 现状（线上实测）

用户反馈：文字可以再简约一点。实测下来问题不在「文案写得差」，在「同一件事被反复说」。

| 位置 | 实测（1440×900，条目页 178 条） |
|---|---|
| 「按 X 估算（日期）」在条目里逐格重复 | 静态产物 **88 处** |
| 口径类声明（汇率 / 估算 / 以原币种为准） | 静态产物「重复合计」api-pricing **830** 次、plans 30 次、sources 44 次 |
| 页面总高 | API 页 **11326px**，套餐页 4168px |
| 首屏可见正文 | 375 = **205 字**、768 = **614 字**、1440 = **134 字** |

### 一个被实测推翻的假设

我最初判断是「首屏文字太多」，写了「首屏 ≤220 字」这种一刀切判据。实测发现 1440 下 API 页首屏只有 134 字，lede（85 字）与口径说明（78 字）**被排到了页面底部 y≈11104**，根本不在首屏。

所以真问题是两个：**同类声明全页重复** + **页面被条目内联说明撑长**。验收目标据此改为按视口分档、按数据页/说明页分档。

## 实测基线（可复现，不靠肉眼）

新增工具 `scripts/metrics/copy-density.mjs`：

- `static`：解析构建产物 HTML，离线可跑，出「非表格中文字数 / 声明重复计数 / 条目内估算日期重复数 / 体积」；
- `live`：起无头 Edge 走 CDP，三视口实测「首屏可见中文字数 / 页高 / 横向溢出」。

基线已入库：**`docs/metrics/copy-density-baseline.json`**（static 与 live 两段，采集于 2026-11-09，站点数据 2026-11-08）。

```bash
npm run metrics:copy            # static 现状
npm run metrics:copy:compare    # 与基线比，未达标退出码 1
node scripts/metrics/copy-density.mjs --dist dist --live https://whyzero.studio/token-price/ \
  --write-baseline docs/metrics/copy-density-baseline.json
node scripts/metrics/copy-density.mjs --compare docs/metrics/copy-density-baseline.json --live <url>
```

### 当前基线（live）

| 路由 | 375 首屏 | 768 首屏 | 1440 首屏 | 1440 页高 |
|---|---:|---:|---:|---:|
| `/` | 230 | 331 | 391 | 1881 |
| `/api-pricing/` | 205 | 614 | 134 | 11326 |
| `/plans/` | 349 | 918 | 148 | 4168 |
| `/calculator/` | 144 | 224 | 381 | 1928 |
| `/sources/` | 82 | 266 | 370 | 3802 |
| `/methodology/` | 237 | 544 | 520 | 2965 |

三视口 × 6 路由横向溢出均为 0，这是既有成果，不许破坏。

## 约束（不能为了简约做掉的东西）

1. **免责四要素必须完整可达**：非官方 / 与厂商无隶属或授权关系 / 以厂商页面与账单为准 / 不构成采购建议 + 商标归属。真源仍是 `src/lib/site-meta.ts` 的 `SITE_DISCLAIMER`，**不许各页各写一份**。
2. **数据纪律说明不能删**：official / aggregate 口径、缺价不猜、跨币种不排名。可以下沉到折叠或口径页，但不能消失。
3. **h1 关键词保留**：`AI API 按量价格对比` 这类命中搜索词的短语不动（SEO 目的，与简约不冲突）。
4. 上一轮 #1 已做过「主次分层」（长文本进行内 `<details>`），本轮不重复那个动作。

## 要做什么

1. **声明去重**：汇率 / 估算 / 以原币种为准这类口径全页只保留一处完整表述（页脚），首屏只留最短版。守卫测试断言这些句式在渲染文本中出现 ≤1 次（溯源标签「官方页抓取 / 聚合数据」本就逐条出现，不计入）。
2. **条目内估算日期上提**：条目不再逐格写「按 6.6908 估算（2026-11-08）」，改由表头或页脚统一标注一次，条目只留 `≈ ¥X`。目标：该模式整页出现 **0** 次。
3. **首屏瘦身（按视口）**：超标主要在移动端与平板（375=205、768=614），把结论卡说明、筛选说明、免责短句合并压缩，长说明移出首屏。
4. **页高压缩**：API 页 1440 高 11326px 主要来自条目内联说明，继续下沉口径 / 备注 / 来源（已折叠的内容不要在折叠标题里再重复一遍）。
5. **说明页同样去重**：`/sources/`（370）、`/methodology/`（520）删重复表述，不删事实。

## 验收判据

全部由 `scripts/metrics/copy-density.mjs --compare` 自动判定，人工只看结论：

- **数据页**（`/`、`/api-pricing/`、`/plans/`）首屏可见中文：375 ≤ **200**、768 ≤ **350**、1440 ≤ **220**
- **说明页**（`/calculator/`、`/sources/`、`/methodology/`）首屏中文不高于基线
- **页高**：数据页 1440 下降 ≥ **15%**，说明页 1440 下降 ≥ **10%**
- **声明重复**：非溯源类声明句式整页出现 ≤ **1** 次；条目内「估算（日期）」重复 = **0**
- **横向溢出**：三视口 × 6 路由仍为 0
- 禁用 JS 时静态 HTML 里免责四要素仍在（预渲染不退化）
- `tests/copy.test.ts` 旧词守卫不回归；不引入「官方核验」这类越权措辞（与 #12 口径一致）
- 内容一条不丢：删掉的只是重复表述，事实与数据纪律项须在折叠 / 口径页可达

---
