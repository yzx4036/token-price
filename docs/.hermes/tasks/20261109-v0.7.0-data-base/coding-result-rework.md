# v0.7.0 定点返工结果

执行体：Codex（project-coder）。日期：2026-11-09。任务状态读取为 rework；仅处理 REVIEW-CODEX.md 的 B1～B5 及 B5-b。本报告交编排层复审，不代表最终验收。未修改 task/status、原审查、裁定或上一轮结果。

## 逐项交付与反例证据

| 项目 | 改了什么 | 实现落点 file:line | 新增反例测试名与落点 | 实测读数 |
|---|---|---|---|---|
| B1 | 用 existsSync 区分不存在与已有内容；文件存在即 readJson 并无条件 validateSnapshot。仅包装缓存 JSON 语法错误为结构类 CliError；降幅基线也按存在性判断。 | scripts/data/lib/benchmarks-pull.mjs:172、:177、:186 | `B1 已有坏缓存 %s 必须结构错误、CLI 非 0、两文件 SHA256/mtime 不变且零写入`，tests/benchmarks-pull.test.ts:86；写操作观察器在 :29。 | null / false / 0 / 空字符串 JSON / `{broken`，5/5 拒绝。每个 CLI exit=1、code=BENCHMARKS_INVALID、FS_MUTATIONS=0；缓存和候选 SHA256、mtime 均不变，无临时文件。函数路径同时验证 CliError，HTTP 调用=0。旧实现前四例 exit=0；坏 JSON 报 UNEXPECTED，五例测试均红。 |
| B2 | 扫描全部 initialModels 候选，逐一校验并规范化后比较。0 份拒绝；重复相同内容接受；内容冲突报歧义。明确采用保守规则：任一 marker 非合法数组即拒绝，null 在首处也不跳过，注释已写入实现。 | scripts/data/lib/benchmarks-pull.mjs:48、:50、:72 | `B2 两份合法但冲突的 initialModels 必须报歧义，CLI 非 0 且零写入`，tests/benchmarks-pull.test.ts:72；合法/重复对照在 :64，首处 null 在 :81。 | 单份、重复两份、数组顺序不同但规范化相同均成功；59.11 与 60 冲突时 exit=1、code=BENCH_RSC_AMBIGUOUS、FS_MUTATIONS=0，两文件 SHA256/mtime 不变。null 后接合法数组仍拒绝。旧实现冲突反例未抛错，测试红。 |
| B3 | 保留表格/行/单元格及表头关系，多套餐列只使用唯一匹配本套餐名称的列；表头缺失、目标列缺失/重复、跨列或单元格缺失均归 unknown，并给出具体 reason。 | scripts/data/lib/plans-structure-drift.mjs:57、:70、:75、:77、:141 | `B3 多列可用表按本套餐列判断，Pro 的 Yes 不能掩盖 Plus/Free 的 No`，tests/plans-structure-drift.test.ts:62；`B3 可用表多列无法可靠定位：%s，必须 unknown`，:74。 | Model / Plus / Pro / Free 配 No / Yes / No 时，变化 id 恰为 openai-plus、openai-free；Pro 无变化，checked=3、unknown=0。五类无法定位输入均 checked=0、unknown=1、allowanceChanges=[]，reason 含“可用表多列无法定位本套餐列”。旧实现漏报混合多列，前四种不可靠输入静默通过；缺单元格反例也先实测红，再收紧单列回退条件。 |
| B4 | 价格集合比较保留，语义可判单独设门槛：至少有额度数量 token、额度性质 token 或记录模型证据。缺证据归 unknown，不进入额度比较，不计 checked。 | scripts/data/lib/plans-structure-drift.mjs:128、:133、:137、:142 | `B4 价格 SSR、额度 CSR 归 unknown，不能把未渲染证据报成额度变化`，tests/plans-structure-drift.test.ts:84；`B4 已渲染真实额度 10000→20000 必须报变化，不能永远 unknown`，:92。 | `$20/month` 加 root 空壳及 pricing.js：checked=0、unknown=1、allowanceChanges=[]，reason 为“价格可解析但额度语义未渲染”。真实 20000 credits 页面：checked=1、unknown=0，报缺 10000:credits 恰一项。旧实现 CSR 反例 checked=1、unknown=0，测试红。 |
| B5 | 原 workflow 断言抽成接受字符串的同一函数；先确认 verify/snapshot/diff 位置全部 >=0，再断言顺序；原吞码、warning、摘要与历史引用断言全部保留。未修改 workflow。 | tests/history.test.ts:24、:28、:165 | `B5 删除 verify 行必须让同一个 workflow 守卫失败`，tests/history.test.ts:169；`B5 将 snapshot 完整步骤移到 diff 之后必须让同一个 workflow 守卫失败`，:176。 | 真实 workflow 通过；删除 verify、把完整 snapshot 步骤移到 diff 后，两种内存变体均让同一守卫抛断言错误。旧守卫删除 verify 不抛错，对应反例测试红。 |
| B5-b | 保留无裸 LF 断言，并在同一行尾守卫增加 CRLF 数 >0；真实文件与内存反例共用守卫。未修改 basis。 | tests/benchmarks-pull.test.ts:25、:214 | `B5-b 单行 JSON 虽无裸 LF，CRLF=0 也必须让行尾守卫失败`，tests/benchmarks-pull.test.ts:219。 | 真实 basis=251 CRLF / 0 裸 LF；压成单行后 CRLF=0，即使无裸 LF也抛断言错误。旧守卫不抛错，反例测试红。 |

## 红测与最终验证

先只加测试（B5/B5-b 抽取守卫时仍保留旧判据），未修实现即执行：

`npx.cmd vitest run tests/benchmarks-pull.test.ts tests/plans-structure-drift.test.ts tests/history.test.ts`

读数：exit=1，14 failed / 63 passed，共 77 项；每个返工项均有旧行为不能通过的新反例。修复后同一专项 77/77 通过。随后增加 B3 缺单元格反例，单跑 `npx.cmd vitest run tests/plans-structure-drift.test.ts` 实测 1 failed / 25 passed，修正多列表不能退回单列解释的条件。全程没有删断言或放宽判据。

最终执行 `npx.cmd vitest run tests/`：exit=0，33 文件、580/580 通过；这三个返工测试文件共 78 项。较开工 561 项新增 19 项。没有执行额外类型检查、build 或总闸；完整门禁由编排层代跑。

只读 CLI 自检汇总：

| 命令 | 实测结果 |
|---|---|
| `node.exe scripts/data/pull-benchmarks.mjs --check` | 最终 exit=0、ok=true、check=true、written=false、modelCount=282、candidateCount=23。 |
| `node.exe scripts/data/cli.mjs benchmarks-drift` | exit=0；分数变化 1、档位切换 0、slug 消失 0。 |
| `node.exe scripts/data/cli.mjs plans-structure-drift` | exit=0；可判 23/55、unknown 32；疑似漏档 8、合并 1、下架 4、额度变化 7。以上为本次抓取读数。 |

AA 检查首次为 OUT_STALE，未将它记录成通过。只读比较确认线上仍为 282 模型，但缓存模型的速度、延迟等共有 595 个字段差异；23 条候选的规范化内容一致。对同一页面调用开工前实现的 check 也得到 OUT_STALE，证明并非本轮解析修复产生差异。随后运行原取数脚本，将 candidates 指向临时目录，仅刷新仓库内被忽略的 `.cache/aa-models.json`；再执行默认路径 --check 得到上表成功读数。仓库 generated 未被写入。

## 本轮是否触碰了 B1～B5 之外的文件

**本轮没有修改 B1~B5 之外的任何交付源码或测试文件**（B5-b 属同批守卫缺口）。相对于开工字节快照，已有文件仅以下五个发生变化：

- scripts/data/lib/benchmarks-pull.mjs：B1、B2。
- scripts/data/lib/plans-structure-drift.mjs：B3、B4。
- tests/benchmarks-pull.test.ts：B1、B2、B5-b 反例。
- tests/plans-structure-drift.test.ts：B3、B4 反例。
- tests/history.test.ts：B5 守卫与反例。

范围外的必要文件操作如实列出，不将“无范围外交付改动”扩大为“未写过任何运行文件”：

1. 按本指令新增本报告 coding-result-rework.md，UTF-8/LF；其余任务材料不改。
2. `.cache/aa-models.json` 是取数脚本刷新的忽略运行缓存，用于满足默认 --check 与线上一致的自检；没有修改缓存格式、候选、基准或 mapping。候选仅生成至临时目录并清理，仓库 generated 哈希不变。
3. 测试输入、故障写计数 preload、开工哈希快照及只读比对所用原文件副本均在系统临时目录，不是仓库交付文件。

## 红线与遗留事项

- 不执行任何 git 命令；不执行 npm run build 或 node scripts/qa/run-gates.mjs。保留未提交交付。
- 对开工 234 个交付相关文件作 SHA256 对比，已有文件变化恰为上述五个；新增交付文件仅本报告。自动化宿主 logs 不在此快照中，本执行体未手工编辑日志。
- package.json/package-lock.json 字节不变，依赖不变；src/data/generated/ 全部字节不变，没有新增 generated 文件；src/ 其它文件、workflow、原 plans-drift、历史实现及事件文件均不变。
- src/ 搜索 fetch 调用、XMLHttpRequest、WebSocket、EventSource、http(s).request 和 price-history，均无匹配。
- basis SHA256 仍为 b2807083db86acf8015dc393867b806400d764827a232ed69e41a4a1f4cadabe；251 CRLF / 0 裸 LF。五个改动源码/测试保持原 UTF-8/LF，新增本报告 UTF-8/LF，无新增 emoji。
- 快照分类、R1、映射精确匹配与 R3 控制流未修改。未扩展处理 N1/N2/N3/N4 或 P1～P4 的其它建议；B1 的坏 JSON 包装仅限本次点名的缓存读取。
- 本批专项与全量测试通过；完整类型检查、构建、总闸和最终验收仍由编排层执行。无法可靠定位的多列表保守报 unknown，未猜测套餐列。

建议索引: 假值缓存存在性、重复载荷消歧与守卫反例 → 墨典:memory/behavior-equivalence-testing.md#数据管道幂等与失败零写入
