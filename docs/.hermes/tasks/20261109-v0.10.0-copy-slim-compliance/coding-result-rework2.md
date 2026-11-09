# v0.10.0 第二轮返工结果档（H1 / H2 / B3）

> 本轮只做三件事：H1 流程事实改对、H2 四要素补齐且守卫可证伪、B3 厂商名与模型名去重。
> 未执行任何 git 操作；`npm.cmd run build`、`npx.cmd vitest run`、`npm.cmd run typecheck`、
> `copy-guard`、`copy-density`（static + live）均由我实跑，读数见 ⑦。
> 未改：`src/data/**`、`chart-geometry.ts`、任何坐标 / 层切换、任何价格 / 汇率 / 日期 / 计数、`copy-density.mjs` 的 `TARGETS` 与基线文件、`package.json`。
> 本轮落点：`src/views/SourcesView.vue`、`src/views/HomeView.vue`、`src/views/MethodologyView.vue`、
> `src/lib/site-meta.ts`、`src/lib/format.ts`、`src/lib/copy.ts`（仅注释）、`src/lib/plan-vs-api.ts`、
> `src/lib/cost-display.ts`、`src/lib/pricing-chart-data.ts`、`src/components/KeyFacts.vue`、
> `src/views/{ApiPricingView,CalculatorView,PlansView}.vue`、`scripts/gen-llms-txt.mjs`、
> `scripts/qa/copy-guard.mjs`、`tests/copy-guard.test.ts`、`tests/format.test.ts`、`tests/fixtures/copy-guard/**`。

---

## ① 三件事逐条

### H1 流程事实被改错 → 已按仓库真实链路重写

**事实来源（本轮重新读过，不靠推断）**

| 文件 | 读到的事实 |
|---|---|
| `.github/workflows/data-refresh.yml:3` | 定时任务「只做抓取 → 校验 → 提交，不碰官方价格（那部分必须人工核对）」 |
| 同文件 steps | 自动跑的是：`cli.mjs rate`、`cli.mjs pull`（每周）、`gen-token-estimates` / `gen-benchmarks`（派生重建）、`cli.mjs verify` + 两次 `--check`、`history.mjs snapshot`（官方价格历史快照）、`drift` / `discover` / `plans-drift` / `plans-structure-drift`（只报告） |
| `scripts/data/lib/add.mjs:18-45`（`ADD_USAGE`） | 官方价由人跑 `cli.mjs add` 录入，`--source-url`（https 必填）与 `--verified-at`（YYYY-MM-DD 必填）是必填项 |
| `scripts/data/cli.mjs:28` | `drift`「把本地 official 值与聚合源对拍，只报告差异，不改写任何文件」 |
| `README.md:102`、`:214` | 「把数字抄下来，然后 `cli.mjs add`」「api.json 的维护方式是人 + CLI add」 |

**改动**（`src/views/SourcesView.vue:152`，整段重写）

> 脚本每天自动抓一次汇率、每周重抓一次聚合快照，另外自动重建派生数据、跑数据校验并记录官方价格历史快照，都由 GitHub Actions 定时触发；任何一条校验不过就放弃这次更新，不会把坏数据写进站点。**官方页价格不在自动抓取之列**——各家定价页改版频繁，机器判定容易误伤，**这部分由维护者逐条人工录入，每条都带来源 URL 与抓取日期，入库前同样过数据校验；对这条链路，脚本只做差异比对**，把官方值与聚合值偏差大的厂商挑出来复核。

三个必含事实逐项对位：

| 要求 | 句中落点 |
|---|---|
| 官方页价格不自动抓取（改版频繁、机器误伤） | 「官方页价格不在自动抓取之列——各家定价页改版频繁，机器判定容易误伤」 |
| 人工逐条录入、带来源 URL 与抓取日期、入库前过校验 | 「由维护者逐条人工录入，每条都带来源 URL 与抓取日期，入库前同样过数据校验」 |
| 脚本只做差异比对、挑偏差大的复核 | 「对这条链路，脚本只做差异比对，把官方值与聚合值偏差大的厂商挑出来复核」 |

原句的两处硬伤都消失：不再同时出现「不走自动抓取」与「改为脚本抓取」；「脚本抓取」这个不存在的链路已删除。

**判据读数**

```
grep -c "脚本抓取"   dist/sources/index.html → 0
grep -c "抓取后入库" dist/sources/index.html → 0
grep -c "人工核对"   dist/sources/index.html → 0
grep -c "爬虫"       dist/{index,sources,api-pricing,plans,calculator,methodology}/index.html dist/llms.txt → 全 0
渲染文本（dist/sources/index.html）→ 与上面新句逐字一致（见 ② 复扫清单）
```

### H2 免责四要素缺第 3 项 + 守卫结构性失效 → 已补 + 已改逐要素断言

**(a) `SITE_DISCLAIMER` 补第 3 要素**（`src/lib/site-meta.ts:56-57`）

```ts
export const SITE_DISCLAIMER =
  '本站是非官方个人项目，与所收录厂商无隶属或授权关系，价格与账单以厂商官方页面和最终账单为准，不构成采购、财务或法律建议。厂商名称与商标归各自权利人所有。';
```

旧句 67 个汉字 / 新句 70 个汉字（+3）。为了不撞首屏预算，压缩掉的是「静态信息与估算工具」这个站点性质描述（同义事实仍在 `SITE_TAGLINE`、`llms.txt`「静态站，无登录、无追踪脚本」与口径页），**合规措辞一条没删**：新增「非官方」+ 第 3 要素，既有「无隶属或授权」「不构成采购、财务或法律建议」「商标归各自权利人」全部保留。

**(b) 页脚常驻**：`src/components/AppFooter.vue:18` 仍是 `{{ SITE_DISCLAIMER }}` 的预渲染静态 `<p>`（无折叠、无 JS 依赖），6 个路由都在 `<footer>` 内渲染。页脚链接保持「完整口径与免责」原文未动。

**(c) 守卫改成四条独立 needle 组（另加商标组），硬编码在守卫里**

`scripts/qa/copy-guard.mjs:76-82`：

```js
const DISCLAIMER_ELEMENTS = [
  { id: 'non-official',        label: '非官方',                 needles: ['非官方'] },
  { id: 'no-affiliation',      label: '无隶属或授权关系',        needles: ['无隶属', '授权'] },
  { id: 'vendor-authoritative',label: '以厂商官方页面与账单为准', needles: ['官方页面', '账单'] },
  { id: 'not-advice',          label: '不构成采购/财务/法律建议', needles: ['不构成', '建议'] },
  { id: 'trademark',           label: '商标归各自权利人',        needles: ['商标', '权利人'] },
];
```

- `loadSources()` 不再读 `SITE_DISCLAIMER`（只读 `FX_TABLE_NOTE_TEMPLATE`），从结构上断掉「拿被测常量当 needle」。
- 判定两遍：全页文本 ≥1（`:233`）**且** `<footer>` 子树文本 ≥1（`:240`，新函数 `footerText()` 在 `:140`）。缺任一 needle 即 failure，stderr 逐条指名要素 id 与缺的关键词。
- 为什么多一层页脚断言：单看全页时，`/plans/` 的正文恰好也有「官方页面 / 账单」二词，删掉页脚那句后全页判据仍是 5/5（实测见下方反例）。页脚断言把「常驻、禁 JS 可读」这件事真正锁住。

### B3 厂商名与模型名重复拼接 → 已统一走 `modelLabel`

见 ④。结果：`grep -o "GLM GLM" dist/*/index.html dist/index.html | wc -l` = **0**（改前 76）。

---

## ② 全站表述复扫清单（旧 → 新）

| # | 落点 | 旧 | 新 |
|---|---|---|---|
| 1 | `src/views/SourcesView.vue:103` | 「官方页抓取」= **爬虫从厂商官方定价页抓取，逐项落库** | 「官方页抓取」= **维护者按厂商官方定价页逐条录入，每条带来源 URL 与抓取日期** |
| 2 | `src/views/SourcesView.vue:133` | 价格**怎么抓到的** | 官方页价格**怎么取到的** |
| 3 | `src/views/SourcesView.vue:135` | 直接**抓** HTML 拿不到价格表 | 直接**读** HTML 拿不到价格表 |
| 4 | `src/views/SourcesView.vue:152` | 官方页价格不走自动抓取……这部分**改为脚本抓取、人工复核后入库** | 官方页价格**不在自动抓取之列**……由**维护者逐条人工录入**（带来源 URL 与抓取日期、入库前校验）；**脚本只做差异比对** |
| 5 | `src/views/SourcesView.vue:164` | 价格由**爬虫从厂商官方定价页抓取后入库** | 价格由**维护者从厂商官方定价页逐条录入、校验后入库** |
| 6 | `src/views/HomeView.vue:57` | 官方页抓取 是**爬虫抓公开定价页** | 官方页抓取 是**维护者从厂商公开定价页逐条录入** |
| 7 | `src/views/MethodologyView.vue:38` | **爬虫抓自**厂商官方定价页的输入价、输出价与缓存价 | **维护者从**厂商官方定价页**逐条录入**的输入价、输出价与缓存价 |
| 8 | `scripts/gen-llms-txt.mjs:69` | （**爬虫从**厂商官方定价页**抓取**） | （**维护者从**厂商官方定价页**逐条录入，入库前校验**） |
| 9 | `src/lib/copy.ts:15`（注释） | （**爬虫抓**公开定价页…） | （**维护者按**公开定价页**逐条录入并校验**…） |

复扫后仍保留的两处「自动抓取」都经核对为真，不改：

- `SourcesView.vue:111`「汇率由脚本每天自动抓取」→ 对应 `data-refresh.yml` 每日 `cli.mjs rate`；
- `SourcesView.vue:152`「官方页价格不在自动抓取之列」→ 就是本轮要写的那句。

术语常量本身（`PROVENANCE_OFFICIAL = '官方页抓取'` 等）一字未动——审查意见里明确「是否换术语属编排层决策」，本轮不越界，只把**对它的解释句**改对。

---

## ③ 四要素逐项对照 + 守卫反例两次读数

### 3.1 `SITE_DISCLAIMER` 逐项对照

| 要素（`docs/compliance/data-fetching.md:38`） | 句中原话 | 是否具备 |
|---|---|---|
| ① 非官方 | 「本站是**非官方**个人项目」 | ✓（旧句只有「个人维护」，本轮把「非官方」写明） |
| ② 与厂商无隶属或授权关系 | 「与所收录厂商**无隶属或授权**关系」 | ✓（旧句是「无隶属、合作或授权关系」，同义保留） |
| ③ 以厂商官方页面与最终账单为准 | 「价格与账单**以厂商官方页面和最终账单为准**」 | ✓ **本轮新增**（旧句完全没有） |
| ④ 不构成采购 / 财务 / 法律建议 | 「**不构成**采购、财务或法律**建议**」 | ✓ |
| ⑤ 商标归各自权利人（附条款） | 「厂商名称与**商标**归各自**权利人**所有」 | ✓ |

### 3.2 逐路由读数（最终产物，正文 / 页脚各一遍）

| 路由 | E1 非官方 | E2 无隶属·授权 | E3 官方页面·账单 | E4 不构成·建议 | E5 商标·权利人 |
|---|---|---|---|---|---|
| `/` | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ |
| `/api-pricing/` | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ |
| `/plans/` | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ |
| `/calculator/` | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ |
| `/sources/` | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ |
| `/methodology/` | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ | ✓ / 页脚 ✓ |

（独立探针：剥 script/style 后取文本，分别在全页与 `<footer>…</footer>` 内查 5 组 needle；与 `copy-guard` 的 `免责要素 5/5 页脚要素 5/5` 逐格一致。）

### 3.3 造反例（真实构建，不是夹具）

**做法**：把 `site-meta.ts` 的 `SITE_DISCLAIMER` 里 `价格与账单以厂商官方页面和最终账单为准，` 整段删掉 → `npm.cmd run build` → 跑守卫 → 还原 → 再 build → 再跑。

**读数一（删掉第 3 要素后）**

```
/               免责要素 4/5 页脚要素 4/5（缺 vendor-authoritative）
/api-pricing/   免责要素 4/5 页脚要素 4/5（缺 vendor-authoritative）
/plans/         免责要素 5/5 页脚要素 4/5（缺 vendor-authoritative）
/calculator/    免责要素 4/5 页脚要素 4/5（缺 vendor-authoritative）
/sources/       免责要素 4/5 页脚要素 4/5（缺 vendor-authoritative）
/methodology/   免责要素 4/5 页脚要素 4/5（缺 vendor-authoritative）

[违规] 11 条：
  - / 免责要素缺失 1 项：vendor-authoritative「以厂商官方页面与账单为准」缺 官方页面
  - / 页脚免责要素缺失 1 项：… 缺 官方页面、账单
  - （/api-pricing/、/plans/、/calculator/、/sources/、/methodology/ 同上）
EXIT=1
```

注意 `/plans/` 那一行：**全页仍是 5/5**（正文里恰好也有「官方页面」「账单」两个词），只有页脚断言抓住它。这就是 3.2 里多加一层页脚断言的原因；如果只按「逐路由全页 grep」，`/plans/` 会漏。

**读数二（还原后）**

```
/ 到 /methodology/ 六路由：免责要素 5/5 页脚要素 5/5，声明各 ≤1，估算日期 0
结论：通过（声明各 ≤1、估算日期 0、表级声明 1、免责要素齐全）
EXIT=0
```

**配套的自动化反例**（`tests/copy-guard.test.ts`，共 6 例）

- 原 4 例保留（good 绿 / bad 红 / 四类判据都有反例 / 目录缺失返回 2），断言文案随新错误信息更新为「免责要素缺失」；
- 新增「删掉第 3 要素 → 必须红」：把 good 夹具复制到临时目录，只改渲染产物（不动源码常量），断言 `EXIT=1` 且 stderr 含 `vendor-authoritative` 与「页脚免责要素缺失」；
- 新增「删掉『不构成…建议』→ 必须红」：断言 stderr 含 `not-advice`。
- 夹具同步更新：`good/{index,api-pricing,methodology}` 都补上 `<footer>` 与新版免责全文（原来只有 methodology 有页脚）。`bad/index.html` 保持「完全没有免责」以便触发缺失反例。

---

## ④ `modelLabel`：定义、引用点、76 → 0 实测

### 4.1 定义（`src/lib/format.ts:223`）

```ts
export function modelLabel(provider: string, model: string): string {
  const p = provider.trim();
  const m = model.trim();
  if (!p || !m) return p || m;
  const lastWord = p.split(/\s+/).pop() ?? '';
  const rest = m.slice(lastWord.length);
  const sameHead = lastWord.length > 0 && m.slice(0, lastWord.length).toLowerCase() === lastWord.toLowerCase();
  const atBoundary = rest === '' || /^[\s\-_/（(]/.test(rest);
  return sameHead && atBoundary ? `${p}${rest}` : `${p} ${m}`;
}
```

判据就一条：**provider 最后一个词（空白分隔，不区分大小写）等于 model 词首，且词后是分隔符或结束** → 只保留 provider 那一次，并保留 model 原有分隔符。所以：

| provider | model | 输出 |
|---|---|---|
| 智谱 GLM | GLM-5.3 | 智谱 GLM-5.3（不是「智谱 GLM -5.3」） |
| xAI Grok | grok-4.7（prompt<200K） | xAI Grok-4.7（prompt<200K） |
| MiniMax | MiniMax-M3.1-Flash | MiniMax-M3.1-Flash |
| 月之暗面 Kimi | Kimi K3.1 Pro | 月之暗面 Kimi K3.1 Pro（保留 model 的前导空格） |
| Anthropic | Claude Fable 5.1 | Anthropic Claude Fable 5.1（不动） |
| 智谱 GLM | GLM Coding Plan Lite（套餐） | 智谱 GLM Coding Plan Lite |

边界：**只改人看的标签**。`src/data/**`、筛选/排序键（`pricing.ts:169` 的搜索 haystack、`schema.ts:239` 的归一键）与 JSON-LD（`structured-data.ts`、`entry-server` 注入的 name）都不经过它；JSON-LD 仍是完整厂商名 + 完整模型名（本轮实测 14 块全部 `JSON.parse` 成功，未改一字）。

### 4.2 引用点清单（18 处）

| 文件:行 | 场景 |
|---|---|
| `src/components/KeyFacts.vue:44-45` | 首页摘要「国内 / 国际最低输入价」括号里的模型标签（**审查点名的「智谱 GLM GLM-Z1-FlashX」就在这里**） |
| `src/views/ApiPricingView.vue:69` | 结论卡 note（国内 / 国际最低价） |
| `src/views/ApiPricingView.vue:105` | 结论卡「性价比最优」note |
| `src/lib/plan-vs-api.ts:198` | 反推失败原因「…没有可用的官方单价」 |
| `src/lib/plan-vs-api.ts:326` | 保本点整句「按 X 的 API 单价反推…」 |
| `src/lib/cost-display.ts:59` | 计算器结算明细 |
| `src/lib/pricing-chart-data.ts:181` | 散点图点 name |
| `src/lib/pricing-chart-data.ts:185` | 散点图点 title（tooltip） |
| `src/lib/pricing-chart-data.ts:268` | 构成图行 title |
| `src/lib/pricing-chart-data.ts:326` | 价格历史 series 名 |
| `src/lib/pricing-chart-data.ts:447` | 用量成本图套餐名（`plan.provider + plan.plan`） |
| `src/lib/pricing-chart-data.ts:453` | 用量成本图「API 基准：…」 |
| `src/views/CalculatorView.vue:82` | 模型下拉 `option`（原来是 `provider · model`） |
| `src/views/CalculatorView.vue:167` | 套餐比对行标题（原来是 `provider · plan`） |
| `src/views/PlansView.vue:126` | 套餐结论卡 who 句 |
| `src/lib/format.ts:223` | 函数本体 |
| `tests/format.test.ts` | 单测（4 例，含全量数据对拍） |
| `scripts/qa/copy-guard.mjs` | 不涉及（留此行为说明未误改） |

**刻意不改的两类**（避免把「分列」当成「拼接」）：

1. `PriceTable.vue:72-73` / `PriceCard.vue:13-14` / `PlansView.vue:296,367`：厂商与模型/套餐是**两个独立元素**（provider 小字一行、model 大字一行），源码里不存在拼接字符串。实测：把 6 个产物按「单个文本节点 / 单个属性值」切分后查相邻重复词，命中 0（`GLM GLM`、`Grok grok`、`MiniMax MiniMax`、`Kimi Kimi`、`DeepSeek deepseek` 全 0）。
2. 搜索/排序键与结构化数据：必须保留完整名，见 4.1 边界。

**关于 `scripts/gen-llms-txt.mjs`**：题面点名它，但 grep 过全文——该脚本只输出厂商数、条数、汇率与口径句，**没有任何 `provider + model` 拼接点**（被它写入的模型名一个都没有），所以本轮只改了其中那句与流程事实不符的溯源说明（见 ②#8），不需要引入 `modelLabel`。实测 `dist/llms.txt` 的 `GLM GLM` 计数 = 0。

**已知残留（如实交代）**：`Mistral AI` + `Mistral Small 4` 仍渲染为「Mistral AI Mistral Small 4」——provider 末词是「AI」，不等于 model 首词「Mistral」，按题面判据（末词 vs 首词）不会去重。要消掉它得改厂商显示名或引入品牌别名表，属数据/展示决策，本轮不动。

### 4.3 76 → 0 实测

改前（上一轮产物）：

```
$ grep -o "GLM GLM" dist/*/index.html dist/index.html | sort | uniq -c
     72 dist/api-pricing/index.html
      1 dist/index.html
      3 dist/plans/index.html
→ 合计 76
```

第一次改完（只改 model 拼接、未改套餐名）仍有 30 处，全部来自套餐名：

```
<title>智谱 GLM GLM Coding Plan Lite · API 基准：…</title>
```

把 `plan.provider + plan.plan` 也接进同一个函数后（`pricing-chart-data.ts:447`、`PlansView.vue:126`、`CalculatorView.vue:167`）：

```
$ grep -o "GLM GLM" dist/*/index.html dist/index.html | wc -l
0
$ grep -c "GLM GLM" dist/llms.txt
0
$ grep -o "GLM · GLM\|Grok · grok\|MiniMax · MiniMax\|Kimi · Kimi\|DeepSeek · deepseek" dist/*/index.html dist/index.html | wc -l
0
```

单测守护（`tests/format.test.ts`）：期望值在测试里用独立实现重算，不复用 `modelLabel`（否则等于自证），断言「命中去重条数 == 独立判据条数」且「全部 178 条标签无相邻重复词」。

---

## ⑤ 首屏字数未反弹（live 实测，同一脚本同一视口）

量法：`npm run build` → `dist` 起本地静态服务 `python -m http.server 8899` → `node scripts/metrics/copy-density.mjs --compare docs/metrics/copy-density-baseline.json --live http://127.0.0.1:8899/`。

| 路由 | 视口 | 本轮返工前 | **本轮改后** | 上限 | 判定 |
|---|---|---:|---:|---:|---|
| `/` | 1440×900 | 208 | **211** | ≤ 220 | ✓（+3，全部来自免责补第 3 要素） |
| `/` | 375×667 | 93 | **93** | ≤ 200 | ✓ |
| `/` | 768×900 | 107 | **107** | ≤ 350 | ✓ |
| `/sources/` | 768×900 | 235 | **235** | ≤ 266 | ✓ |
| `/sources/` | 1440×900 | 321 | **324** | ≤ 370 | ✓ |
| `/methodology/` | 1440×900 | 497 | **504** | ≤ 520 | ✓ |

附带读数（同脚本实跑，均未反弹）：`/api-pricing/` 1440 207 → **210**（≤220）；`/plans/` 1440 200 → **203**；`/calculator/` 1440 343 → **346**（不增判据 ≤381）；`/methodology/` 768 396 → 400（≤544）、375 187 → 191（≤237）。横向溢出全路由 **0**。

`--compare` 结论：**通过（无超标项）**（static 与 live 均通过）。

---

## ⑥ 红线自查

| 红线 | 结论 | 证据 |
|---|---|---|
| 不改数值 / 不改 `src/data/**` | 未改 | `git status --short src/data` 空；本轮无任何价格、汇率、日期、计数被改写；`KeyFacts` 仍 `computeStats/computeApiConclusions` 现算 |
| 不改图表几何 / 坐标 / 层切换 | 未改 | `chart-geometry.ts`、`*Plot.vue`、`SvgChartFrame.vue` 零改动；`pricing-chart-data.ts` 只替换 6 处**字符串**（name / title），未碰 `x/y/mx/my`、domain、frame、label 排序 |
| 术语与免责走真源 | 是 | 免责：`site-meta.ts` 单点；术语：`copy.ts` 常量值一字未动，新文案全部 `{{ PROVENANCE_* }}` / `{{ AGGREGATE_NOTE }}` 拼接；`tests/copy.test.ts` 绿 |
| 删重复不删事实；合规措辞只换位置/说法 | 是 | 五要素逐项在（③）；删掉的只有重复表述与「脚本抓取」这个假断言；免责压缩掉的「静态信息与估算工具」同义事实仍在 `SITE_TAGLINE` / `llms.txt` / 口径页 |
| 首屏字数不反弹 | 是 | ⑤ 六条目标线全过，`--compare` 通过 |
| 不做 git | 是 | 全程未 add / commit / push |
| 不新增依赖 / 不改阈值 | 是 | `package.json`、`copy-density.mjs` 的 `TARGETS`、基线文件均未动 |
| 无 emoji / 编码 / 行尾 | 是 | 改动文件均为 UTF-8、纯 LF（与上一轮同约定），无混合行尾 |

---

## ⑦ 自检实跑（命令与读数）

```
npm.cmd run build
  → 6 路由 prerender 成功；llms.txt 生成（178 条 / 16 家，抓取日期 2026-11-01）

node scripts/qa/copy-guard.mjs --dist dist
  /               声明 {"fx-disclaimer":0,"cny-estimate":0,"billing-currency":1} 估算日期 0 表级声明 0 免责要素 5/5 页脚要素 5/5
  /api-pricing/   声明 {"fx-disclaimer":1,"cny-estimate":1,"billing-currency":1} 估算日期 0 表级声明 1 免责要素 5/5 页脚要素 5/5
  /plans/         声明 {"fx-disclaimer":1,"cny-estimate":1,"billing-currency":1} 估算日期 0 表级声明 1 免责要素 5/5 页脚要素 5/5
  /calculator/    声明 {"fx-disclaimer":1,"cny-estimate":1,"billing-currency":1} 估算日期 0 表级声明 0 免责要素 5/5 页脚要素 5/5
  /sources/       声明 {"fx-disclaimer":1,"cny-estimate":1,"billing-currency":1} 估算日期 0 表级声明 0 免责要素 5/5 页脚要素 5/5
  /methodology/   声明 {"fx-disclaimer":1,"cny-estimate":1,"billing-currency":1} 估算日期 0 表级声明 0 免责要素 5/5 页脚要素 5/5
  → 结论：通过（声明各 ≤1、估算日期 0、表级声明 1、免责要素齐全）  EXIT=0

node scripts/metrics/copy-density.mjs --dist dist
  index       非表格中文 540    重复合计 14   估算日期 0   10KB
  api-pricing               29298          570           0   446KB
  plans                     13152            3           0   127KB
  calculator                  995            3           0    24KB
  sources                    1547           42           0    19KB
  methodology                1824            9           0    12KB

node scripts/metrics/copy-density.mjs --compare docs/metrics/copy-density-baseline.json --dist dist
  → 结论：通过（无超标项）

node scripts/metrics/copy-density.mjs --compare docs/metrics/copy-density-baseline.json --live http://127.0.0.1:8899/
  → 结论：通过（无超标项），逐格读数见 ⑤

npx.cmd vitest run
  → 37 files / 650 tests passed（上一轮 644；+6 = modelLabel 4 例 + 守卫 2 例）

npm.cmd run typecheck
  → vue-tsc --noEmit，0 error

grep -o "GLM GLM" dist/*/index.html dist/index.html | wc -l
  → 0
```

附加探针（一次性，不算门禁）：

- JSON-LD：6 路由共 14 块，全部 `JSON.parse` 成功（结构化数据的 name 未改）。
- 全产物相邻重复词扫描（按单个文本节点 / 单个属性值）：6 个路由命中 0。
- `dist/` 内「爬虫」「脚本抓取」「抓取后入库」「人工核对」计数：全 0。

---

## ⑧ 需要编排层知道的两点（不自行改判据）

1. **守卫的「全页 + 页脚」双断言是本轮加的**。题面只要求逐路由缺一即红；反例实测发现 `/plans/` 会被正文里的同名词兜住，所以补了页脚断言。若认为这超出要求，可只保留全页断言，但 `/plans/` 的漏检会回来。
2. **免责压缩换来的 3 个汉字预算**：`SITE_DISCLAIMER` 由 67 → 70 字，`/` @1440 由 208 → 211。若后续还要往页脚加字，`/` 与 `/api-pricing/`（210）都只剩个位数余量，必须先在其他元素上等量减。
