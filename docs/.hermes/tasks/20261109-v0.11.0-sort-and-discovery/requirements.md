# v0.11.0 排序口径与数据发现增强 · 任务书

> 本文件是**任务书**（需求真源 = GitHub #18 / #17，全文见 `issues-dossier.md`）。
> 迭代由原 v0.11.0（数据发现）与原 v0.12.0（排序体验）合并而成，两票同一里程碑。

## 一、批次与顺序

| 批 | 票 | 内容 | 顺序理由 |
|---|---|---|---|
| A | #18 | 智能指数 / 性价比在「全部厂商」下全量排序，不再被币种分组切断 | 唯一碰 `src/lib/pricing.ts` 与表格排序断言，先做完先锁 |
| B1 | #17 P0 | `discover` 同厂商多 key 归一，消掉重复键噪音 | 只碰 `scripts/data/**`，与 A 零重叠 |
| B2 | #17 P1 | 国内厂商（deepseek / aliyun / volcengine）官方价格页 diff 告警 | 依赖 B1 的厂商归一判断，且要新增抓取面 |
| — | #17 P2 | 套餐新档位发现 | **本迭代不做**，理由见第六节偏差登记 |

A → B1 → B2 串行；A 与 B1 之间无文件交集，可交叉验证互不影响。

## 二、已核实事实表（编排层亲验，设计轮直接引用，不必重查）

| 编号 | 事实 | 实证 |
|---|---|---|
| F1 | 排序比较器把**账单币种**放在排序字段之前，导致任何字段都被切成 USD 组 / CNY 组两段 | `src/lib/pricing.ts:172-176` |
| F2 | 函数头注释明写「按账单币种分组（USD 组 → CNY 组），跨币种不直接比较」 | `src/lib/pricing.ts:138-143` |
| F3 | 智能指数取值 `scores[id].score`，无量纲，跨币种可比 | `src/lib/pricing.ts:114-117` |
| F4 | 性价比取值 `costPerPoint = blendPerMillion / score`，**单位是条目自己的账单币种** | `src/lib/benchmark-view.ts:66` |
| F5 | 现有汇率 `1 USD = 6.6908 CNY`，由 `fx` 参数传入排序链路 | `filterAndSortApiPrices(..., fx, ...)` `src/lib/pricing.ts:144-149` |
| F6 | 空值不参与方向反转，`desc` 时仍排组末 | `src/lib/pricing.ts:181-183` |
| F7 | 实测 `/api-pricing/?sort=intelligence&order=desc` + 全部厂商：178 行，索引 **88** 处从 USD 切到 CNY；断点前是**无分（—）**的聚合条目，断点后第一条是 **Kimi K3.1 Pro 46.00 分**，即 46 分排在无分条目之后 | 本机 1440 视口 DOM 实测（2026-11-09） |
| F8 | 聚合源快照含 235 个 provider；`providers.json` 19 家，16 家有 `aggregateProvider`，`baidu` / `opencode` / `github` 为 `null` | `src/data/providers.json`；`cli.mjs discover` 输出 |
| F9 | 国内站映射为 `zhipu → zhipuai`、`minimax → minimax-cn`、`moonshot → moonshotai-cn`，但 `discover` 把国际站 key `zai` / `minimax` / `moonshotai` 当成「未收录厂商」报出 | `providers.json` + `scripts/data/lib/discover.mjs:96` 起 |
| F10 | `discover` 当前输出「174 家未收录（33 家非转售）」，数字含上述噪音 | 本机实跑 |
| F11 | 聚合快照每家条数：openai 12 / mistral 12 / zhipu 12 / cohere 8 / xai 7 / moonshot 6 / meta 6 / xiaomi 6 / stepfun 4 / tencent 1；**deepseek 0 / aliyun 0 / volcengine 0 / minimax 0 / anthropic 0 / google 0** | `src/data/generated/aggregate.generated.json` |
| F12 | `discover` 与两个 plans 漂移步骤已在 workflow 里 report-only 运行 | `.github/workflows/data-refresh.yml:130-165` |
| F13 | 官方价格条目不自动抓取，由 `cli.mjs add` 人工录入（`--source-url` `--verified-at` 必填），入库前过校验；站点已对外承诺此链路 | `scripts/data/lib/add.mjs:19-30`；`src/views/SourcesView.vue`（v0.10.0 定稿） |

## 三、A 批（#18）细则

1. 智能指数：全量排序，直接比 `score`。
2. 性价比：先把 `costPerPoint` **折算到统一币种**（统一用 CNY，费率取 `fx`）再比，界面标注口径；`fx` 为 null 时**退回按币种分段**并提示，禁止 1:1 兜底。
3. 价格类字段（input/output/contextTokens）**保持按币种分段**，行为与改动前逐行一致。
4. 空值（无分/无价）一律置末；`pending` 仍排在有价条目之后。
5. 注释与实现同步：不许留「跨币种不直接比较」这种与代码相反的说明。
6. 排序状态继续进 URL。

## 四、B1 批（#17 P0）细则

1. 归一表至少覆盖：`zai→zhipuai`、`minimax→minimax-cn`、`moonshotai→moonshotai-cn`；设计轮负责把快照里**其余**同厂商多 key 也找出来（按 creator/name 相似度列出候选，人工确认后落表）。
2. 归一后「未收录厂商」数必须**逐条可解释**：报告里输出「已归一 → 主 key」对照表与前后数量差。
3. 只读：不写任何数据文件；失败不阻塞数据刷新。
4. 判据：归一前后数量差 = 归一表命中数；有对照表；对已知三家不重复计数。

## 五、B2 批（#17 P1）细则

1. 目标厂商：至少 deepseek / aliyun / volcengine（聚合源产出为 0 的三家，见 F11）。
2. 抓取面：设计轮必须先**实测可达性**（HTTP 200 / 是否提供 Markdown 版或可解析表格），把结果写进设计稿；抓不到的厂商**不得假装做了**，要列进「已验证不可用」清单。
3. 只告警：解析出价格段落指纹（或结构化价位集合），与仓库现值比对，差异写进 run summary；**不改数据、不提交、不触发部署**。
4. 失败处理：超时/解析失败一律「告警但不阻塞」，退出码不影响 workflow 主流程。
5. 判据：三种输入（改价 fixture / 未改价 / 抓取失败）分别表现为 报 / 不报 / 告警不阻塞。

## 六、红线

1. 不改任何价格、套餐、分数、汇率**数据值**；`src/data/**` 只允许新增（若确需）不得改既有值。
2. 不引运行时依赖（新增抓取逻辑只能用 Node 内置 + 现有脚本依赖）。
3. 网络只出现在 CLI 脚本，不得进 `src/`。
4. 不改图表几何（`chart-geometry.ts`、坐标、层切换路由）；散点入图口径不被 A 批排序改动带偏。
5. UTF-8；改既有文件保持原行尾；不写 emoji。
6. 不做 git 操作（编排层执行）。

## 七、验收口径

| 项 | 判据 |
|---|---|
| 门禁 | `node scripts/qa/run-gates.mjs` 全绿（测试不少于当前 644 项） |
| A 排序 | `?sort=intelligence&order=desc` + 全厂商：178 行分数整体单调不增、无分全在末尾、CNY/USD 可相邻 |
| A 性价比 | `?sort=value&order=asc`：折算 CNY 后 `costPerPoint` 单调不减；界面上有折算口径说明 |
| A 回归 | 价格列排序与改动前逐行一致；`fx` 缺失时退回分段并提示 |
| B1 | `discover` 输出对照表，前后数量差可解释；不再把 `zai`/`minimax`/`moonshotai` 记为未收录 |
| B2 | 三厂商可达性实测有结论；改价 fixture 能报、不改不报、失败不阻塞 |
| 探针 | `chart-probe` 五档全 PASS；`copy-guard` 通过（新增界面文案不得破坏声明去重） |
| 文案 | 若新增界面提示，文案走 `copy.ts` 常量；`--compare` 仍通过 |

## 八、偏差登记（本迭代已知不做）

- **#17 P2 套餐新档位发现不做**：先要有 B2 的抓取面与解析骨架，套餐档位结构（月费/额度/模型名单）与 API 价格页差异极大，混在本迭代会让验收边界糊掉。留待下一迭代，已在 #17 里保留描述。
- **#17 中「deepseek/aliyun/volcengine 聚合无产出」的根因若属上游缺 key，则无法靠本站修复**：设计轮若发现属于该情形，如实记录，不伪造产出。
