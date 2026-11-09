# v0.7.0 编码结果

执行体：Codex（project-coder）。执行日期：2026-11-09。编码及专项验证已完成，提请编排层进入 code_review；本档不代表最终验收。未修改 task/status/gates。

优先依据：本次施工纪律 > RULINGS-A.md > implementation-plan.md / architecture.md；事实沿用 requirements.md F1–F16。没有修改设计文档。

## 1. 分批完成表

| 批 | 文件清单 | 步骤 | 实测命令与读数 | 与施工单的偏离 |
|---|---|---|---|---|
| B1 完成 | history CLI、history lib 及声明、历史 JSONL、workflow、history 测试及 4 份 fixture（逐文件见第 2 节） | official 提取及六字段比较 → 四类事件 → 全文件校验/重放/月初 baseline/同日替换/原子写 → CLI → workflow | `npx.cmd vitest run tests/history.test.ts`：初验 12/12；随后 `npx.cmd vitest run tests/`：30 文件、505/505。真实 `node.exe scripts/data/history.mjs snapshot` 两次：首次 written=true、第二次 false；两次均 29,315 字节。`node.exe scripts/data/history.mjs replay --id example --history-file tests/fixtures/history/three-points.jsonl`：三日期价格 1 → 2 → 3，exit 0。 | workflow 校验移到 diff 之前；总门禁交编排层。 |
| B2 完成（仓库候选生成交编排层） | pull-benchmarks CLI、benchmarks-pull / benchmarks-drift lib 及声明、cli、basis、2 个测试及 5 份 fixture；脚本生成忽略缓存和临时目录候选 | CRLF 探针 → 根级政策 → RSC 解码/数组配平 → 结构/降幅/slug/creator/语义检查 → 最高分档及稳定排序 → 两文件暂存及回滚 → 只读 drift | `npx.cmd vitest run tests/benchmarks-pull.test.ts tests/benchmarks-drift.test.ts`：初验 33/33；当批 `npx.cmd vitest run tests/`：32 文件、538/538。真实拉取 282 模型、23 候选；临时候选路径的 `--check` exit 0、written=false。`node.exe scripts/data/cli.mjs benchmarks-drift --json`：scoreChanges=1、tierChanges=0、missingSlugs=0，包含 Opus 5.5 +0.6960336079。`node.exe scripts/data/gen-benchmarks.mjs --check`：23/105，一致。 | 按 R1 政策放根级；按本次禁区将候选生成到临时目录，没有新增仓库 generated 文件；默认路径检查未通过，见第 4 节。 |
| B3 完成 | plans-structure-drift lib 及声明、cli、workflow、测试及 7 份 fixture | 复用归一化/价格 token → URL 去重 → provider/page 价格集合双向比较 → 额度数字/模型可用表/性质证据 → CLI 及 pull 周期摘要 | `npx.cmd vitest run tests/plans-structure-drift.test.ts tests/plans-drift.test.ts`：初验 31/31。最终真实 `node.exe scripts/data/cli.mjs plans-structure-drift --json`：exit 0，ok/readOnly=true；coverage={total:55,checked:30,unknown:25}；漏档 8 组、合并 1 组、下架 4 档、额度变化 13 档、unknown 25 档。 | 无新增设计偏离；保留既有 plans-drift 实现及其分发。 |

收口验证（所有修正之后）：

- `npx.cmd vitest run tests/history.test.ts tests/benchmarks-pull.test.ts tests/benchmarks-drift.test.ts tests/plans-structure-drift.test.ts tests/plans-drift.test.ts`：5 文件、82/82，exit 0。
- `npx.cmd vitest run tests/`：33 文件、561/561，exit 0；相比工作区原有 493 项新增 68 项。启动哈希快照实际包含 29 个既有测试文件，全部保留且字节未变；F14 的“30 文件”与本地文件数相差 1，未修改事实表。
- `node.exe node_modules/typescript/lib/tsc.js --ignoreConfig --noEmit --strict --skipLibCheck --module ESNext --moduleResolution Bundler --target ES2022 --esModuleInterop --types node tests/history.test.ts tests/benchmarks-pull.test.ts tests/benchmarks-drift.test.ts tests/plans-structure-drift.test.ts`：exit 0、无诊断。仅检查新增测试及其声明；不替代编排层的完整 vue-tsc。首次定向调用因 TS5112 需追加 --ignoreConfig，随后发现并修复测试中 .at(-1) 的可空访问；未放宽 strict。
- `node.exe scripts/data/cli.mjs verify --json`：ok=true、严重 0、提醒 28；official=133、aggregate=45、合并后 entries=178。
- `node.exe scripts/data/gen-benchmarks.mjs --check`：23 个模型有评分 / 105 个唯一模型，一致；`node.exe scripts/data/gen-token-estimates.mjs --check`：55 条，其中有数值 22 条，一致。两条均只读。

B1 体积实测：三时点 fixture 的两条完整 delta 各 398 UTF-8 字节；将 133 条真实 official 数据逐条在内存改一项输入价，单条完整事件为 400–450 字节，均 <500。首次种子有 133 条 new，后续真实同日重跑新增事件为 0。种子文件 SHA256：`a3ec58d380cf03d7f06be80590f41a5393db1f48575326bb10f2944b70c30c56`。

B2 真实执行方式（PowerShell；两次各单次 HTTP）：

```powershell
$candidateFile = Join-Path $env:TEMP 'token-price-v070-aa-live/benchmark-candidates.generated.json'
node.exe scripts/data/pull-benchmarks.mjs --candidates-file $candidateFile
node.exe scripts/data/pull-benchmarks.mjs --check --candidates-file $candidateFile
node.exe scripts/data/cli.mjs benchmarks-drift --json
```

读数：282 条 AA 记录，其中 99 条有 intelligenceIndex；23 个候选，均来自原有精确 mapping。Opus 实际值 58.41 → 59.1060336078904。官方页面评分覆盖率仍为 32/133（24.1%），没有修改 mapping 或提升评分覆盖率；本批提升的是自动取数与监控能力。

反例证据已进入测试：价格变化与 fetchedAt/verifiedAt 单独变化对照；坏 JSONL/坏状态/错误分类/不可写目标；月初 baseline+delta、当日价格还原、2000/2001 行仍单文件；AA 断网/403/坏页面/坏结构/降幅 30.1%/slug 消失/语义错配/creator 错配/坏政策/坏缓存/坏 API 输入；30% 边界通过；第二次 rename 失败恢复原字节；0.5 不报告、0.50000000001 和 0.51 报告；套餐 CSR/抓取失败不混为一致，数字与可用表变化分别报额度变化。所有拒绝型故障均有原文件保持或零 HTTP/零创建的断言。

## 2. 新增与修改的文件逐一列出

| 路径 | 一句话职责 |
|---|---|
| `scripts/data/history.mjs`（新增） | snapshot / replay 参数解析、JSON 输出与失败退出码。 |
| `scripts/data/lib/history.mjs`（新增） | 官方价格状态、事件校验/比较、月初基线、同日替换、重放与 JSONL 原子写。 |
| `scripts/data/lib/history.d.mts`（新增） | 为测试提供与历史事件契约一致的类型声明。 |
| `src/data/history/price-history.jsonl`（脚本新增） | 首次 133 条 official 价格种子，仅供仓库内历史管道使用。 |
| `.github/workflows/data-refresh.yml`（修改） | verify 后、diff 前执行非阻塞快照，并在 pull 周期将新套餐报告写摘要。 |
| `tests/history.test.ts`（新增） | 历史比较、幂等、回放、故障保护、阈值及 workflow 顺序守卫。 |
| `tests/fixtures/history/api-before.json`（新增） | 官方与聚合混合输入基线。 |
| `tests/fixtures/history/api-price-changed.json`（新增） | 单价格变化反例。 |
| `tests/fixtures/history/api-fetched-at-only.json`（新增） | 仅抓取时间变化的无事件对照。 |
| `tests/fixtures/history/three-points.jsonl`（新增） | 固定三个历史时点的重放输入。 |
| `scripts/data/pull-benchmarks.mjs`（新增） | AA 取数入口、--check 及可指定测试/审查输出路径。 |
| `scripts/data/lib/benchmarks-pull.mjs`（新增） | RSC 解析、模型及映射守卫、候选构造、两文件暂存与失败回滚。 |
| `scripts/data/lib/benchmarks-pull.d.mts`（新增） | AA 快照、候选文档及取数接口声明。 |
| `scripts/data/lib/benchmarks-drift.mjs`（新增） | 本地 AA 快照与人工依据的只读分数、档位、slug 比较。 |
| `scripts/data/lib/benchmarks-drift.d.mts`（新增） | 三类 benchmark 漂移报告的类型声明。 |
| `scripts/data/cli.mjs`（修改） | 增加两个漂移命令的帮助、文件参数与文本/JSON 分发。 |
| `src/data/estimates/benchmark-basis.json`（修改） | 仅增加根级 tierPolicy.mode=highest-score，中文说明及 CRLF 保留。 |
| `tests/benchmarks-pull.test.ts`（新增） | 解析、单 HTTP、精确匹配、缺分、降幅、幂等及故障零写入验证。 |
| `tests/benchmarks-drift.test.ts`（新增） | 分差边界、独立档位/缺失报告与 CLI 只读验证。 |
| `tests/fixtures/benchmarks/aa-rsc.html`（新增） | 分段转义、嵌套数组与同 slug 多档的成功页面。 |
| `tests/fixtures/benchmarks/aa-rsc-bad.html`（新增） | 缺少 initialModels 的解析失败页面。 |
| `tests/fixtures/benchmarks/aa-models-previous.json`（新增） | 模型数及取数基线。 |
| `tests/fixtures/benchmarks/basis.json`（新增） | 已收录、未收录、未评测 mapping 的人工依据夹具。 |
| `tests/fixtures/benchmarks/drift-current.json`（新增） | 固定包含 Opus +0.70 与档位切换的漂移快照。 |
| `scripts/data/lib/plans-structure-drift.mjs`（新增） | URL 去重、价格集合及额度高信息证据的只读比较。 |
| `scripts/data/lib/plans-structure-drift.d.mts`（新增） | 套餐输入、coverage、四类漂移与 unknown 类型声明。 |
| `tests/plans-structure-drift.test.ts`（新增） | 新旧价格集合、额度/可用表、unknown、覆盖率及 CLI 验证。 |
| `tests/fixtures/plans-structure/plans.json`（新增） | 共用来源页的免费与两个付费档。 |
| `tests/fixtures/plans-structure/unchanged.html`（新增） | 价格与额度证据一致的对照页。 |
| `tests/fixtures/plans-structure/missing-tier.html`（新增） | 页面新增价格的漏档反例。 |
| `tests/fixtures/plans-structure/merged-tier.html`（新增） | 多个录入价格只剩一个命中价格的合并反例。 |
| `tests/fixtures/plans-structure/removed-tier.html`（新增） | 已录非零价格全部消失的下架反例。 |
| `tests/fixtures/plans-structure/allowance-changed.html`（新增） | 额度减少、模型 No、Unlimited 消失的语义变化反例。 |
| `tests/fixtures/plans-structure/csr.html`（新增） | 只有 RSC 引用、不含真实价格 token 的 unknown 页。 |
| `docs/.hermes/tasks/20261109-v0.7.0-data-base/coding-result.md`（新增） | 本次唯一新增结果文档。 |

运行产物另列：`.cache/aa-models.json` 由 CLI 生成（.gitignore 已排除）；`%TEMP%/token-price-v070-aa-live/benchmark-candidates.generated.json` 是本次真实取数的审查候选，不属于仓库交付文件。仓库 `src/data/generated/benchmark-candidates.generated.json` 尚未生成。

## 3. 偏离施工单之处

1. 原文：在 methodology 增加对象 tierPolicy → 实际：basis 根级增加 tierPolicy，methodology 不变，既有生成器及 BenchmarkDoc 不变 → 依据：RULINGS-A R1。
2. 原文：各批执行总门禁并构建 → 实际：各批执行专项与全量 tests，收口执行新增测试定向类型检查、verify 和两个只读 --check；不执行 build/run-gates → 依据：本次施工纪律第 9 条明确由编排层代跑。
3. 原文：生成并入库仓库 benchmark-candidates → 实际：用同一 CLI 生成到临时目录并实测 --check，仓库 generated 原样 → 依据：本次施工纪律第 2 条“任何文件”禁区。默认目标生成及入库留给编排层。
4. 原文：workflow 只增加 verify 后的快照 → 实际：将原有条件化校验块移到 diff 之前并每次刷新都执行，然后 snapshot，再判 diff；校验命令保持原样 → 依据：R3 要求快照在 diff 前，且快照必须在 verify 成功后。保留“排除 fetchedAt 后仍有变化才提交”的判据。
5. 原文文件清单未列类型声明 → 实际：新增 4 份相邻 .d.mts → 依据：仓库既有 benchmark/plans-drift 的声明模式和严格 TypeScript 测试配置；没有增加运行时接口或依赖。

## 4. 未完成 / 待编排层验证项

1. **仓库 candidates 未生成**。最初运行 `node.exe scripts/data/pull-benchmarks.mjs --check` 实际 exit 1，OUT_STALE；此时缓存与仓库候选均缺失。随后默认 `benchmarks-drift --json` 因缓存缺失返回 ENOENT；真实 CLI 拉取生成缓存后默认 drift 已成功。编排层解锁 generated 写入后执行 `node scripts/data/pull-benchmarks.mjs`，再执行同脚本 `--check`，应得到 282/23 或当日真实数量、written=false；将生成候选纳入审查。临时路径 check 的成功不冒充默认路径成功。
2. **完整门禁、构建及页面回归未执行**。编排层运行 `node scripts/qa/run-gates.mjs`，核对 6/6；另核对构建 6 路由、禁 JS HTML 中分数/fetchedAt、未评测显示“—”及排序。完整 vue-tsc 由该门禁执行；本轮仅定向检查新增测试与声明。
3. **Actions 执行验证**。编排层运行一次 pull 周期，核对摘要包含新报告、快照变化进入实际 diff/提交；在隔离 CI 中令 snapshot 失败，确认 warning/摘要存在且刷新继续。本轮验证的是 workflow 文本顺序、失败捕获和 CLI 自身故障保护，没有触发远端工作流或 git 操作。
4. **“一年 <1MB”尚不能宣告通过**。已有数据只够实测首次全量 29,315 字节和单项变化 400–450 字节。按每天 5 个最大体积变化加 12 份同规模 baseline 外推为 1,173,030 字节，不能据此承诺小于 1MB；每日变化不超过 5 条也尚无长期样本。本轮保留已批准的月初全量 baseline 和 2000 行阈值，不为体积目标丢弃事件。编排层应按积累后的 JSONL 用 `Get-Item src/data/history/price-history.jsonl` 及逐行计数验证增长；若要硬性体积上限，需另行裁定压缩/格式方案。
5. **套餐报告是页面级证据提示**。真实覆盖率为 30/55，25 档 unknown 不可算覆盖。价格集合会受年付/促销/多币种页面影响；可用表支持“整行 No”的反例，但不推断混合 Yes/No 多列分别属于哪一个套餐。编排层用报告 sourceUrl 人工核实 8 组漏档、1 组合并、4 档下架和 13 档额度变化。历史合并/漏档用合成 fixture 回放，未获取 2026-11-01 前的真实官方页面归档；真实历史归档回放仍待补证。

## 5. 红线自查

所有文件未改判据均基于开工前 `%TEMP%/token-price-codex-v070-baseline.json` 的 SHA256 快照，不使用任何 git 命令。grep 用于内容/引用检查，字节未变由哈希补证。

- [x] **generated、官方价格及真源不改**：30 个保护文件哈希比较 `changed: []`；generated 新文件 `[]`。保护集含 generated、api/plans、src/lib、旧 plans-drift、gen-benchmarks、package/lock/gates。既有测试文件改动 `[]`。

```powershell
@'
from pathlib import Path
import hashlib,json,tempfile
r=Path.cwd()
b=json.loads((Path(tempfile.gettempdir())/'token-price-codex-v070-baseline.json').read_text(encoding='utf-8'))
fixed=['src/data/entries/api.json','src/data/entries/plans.json','scripts/data/lib/plans-drift.mjs','scripts/data/gen-benchmarks.mjs','package.json','package-lock.json','docs/.hermes/gates.json']
protected=[n for n in b if n.startswith(('src/data/generated/','src/lib/')) or n in fixed]
print('protected',len(protected),'changed',[n for n in protected if hashlib.sha256((r/n).read_bytes()).hexdigest()!=b[n]])
print('generated added',[p.as_posix() for p in Path('src/data/generated').rglob('*') if p.is_file() and p.as_posix() not in b])
'@ | python -
```

输出：`protected 30 changed []`、`generated added []`。api SHA256 `4631c817fe8b07b913839c2f72006c9e751fd7d57726c8226c0be5b419774783`；plans `b3f973f9615e4d8f21917b629d07e3ef06a47486f0195c1869df59c5eb029d91`，均等于开工快照。

- [x] **不加运行时依赖**：`rg -n '"dependencies"|"vue"|"vue-router"|"zod"' package.json` → 38:dependencies、39:vue ^3.5.44、40:vue-router ^5.4.0、41:zod 4.6.7。package/lock 哈希均不变。
- [x] **网络仅在 CLI 使用统一 HTTP 包装**：`rg -n 'fetch\(' scripts/data/history.mjs scripts/data/pull-benchmarks.mjs scripts/data/lib/history.mjs scripts/data/lib/benchmarks-pull.mjs scripts/data/lib/benchmarks-drift.mjs scripts/data/lib/plans-structure-drift.mjs` → 无匹配（exit 1）。`rg -n 'fetchWithTimeout|fetchJson' scripts/data/lib -g 'history.mjs' -g 'benchmarks-*.mjs' -g 'plans-structure-drift.mjs'` → benchmarks-pull:5,162 使用 fetchWithTimeout，plans-structure-drift:1,78 使用 fetchWithTimeout；无导入时请求。原 plans-drift 不改，其旧网络实现也未重写。
- [x] **失败不写**：专项中网络/解析/结构、降幅、slug、不可写目标、第二次 rename 故障均有反例和原字节断言；CLI 断网/坏页子进程均非 0。`rg -n 'BENCH_DANGLING|BENCH_COUNT_DROP' scripts/data/lib/benchmarks-pull.mjs` → 116 slug 消失抛错、173 降幅严格 >30% 抛错；所有校验先于两文件提交。
- [x] **未评测不补 0、不模糊匹配**：`rg -n 'intelligenceIndex === null|score: model.intelligenceIndex' scripts/data/lib/benchmarks-pull.mjs` → 100 最高分比较保留 null、122 缺分跳过候选、124 直接取实测分；有缺分/近名/creator/语义错配反例，旧基准生成器哈希未变。
- [x] **不执行 git、不改 gates**：本轮工具调用中 git 命令为 0，未调用 publish/部署。gates SHA256 `5ffd9fe6b83459d6311c86f2c6311fd1e9523112a86aab5c805d8fc64bc77e07` 等于开工快照。workflow 内既有提交步骤只是保留文本；grep 不能证明命令未执行，此项以调用记录和保护集哈希为证。
- [x] **UTF-8 / 行尾 / 无新增 emoji**：新代码、测试、fixture 和历史共 31 文件 UTF-8 解码成功，CR 字节总数 0；本结果档 UTF-8/LF。既有 cli=310 CRLF/0 bare LF，workflow=238/0，basis=251/0；basis 修改前为 248 CRLF/0 bare LF。内容检查无新增 emoji；workflow 原有符号未新增。
- [x] **裁定 R1/R2/R3/R4**：`rg -n 'tierPolicy|methodology|highest-score' src/data/estimates/benchmark-basis.json` → 9:methodology、14:tierPolicy、15:highest-score（根级）；methodology 值均为字符串。R2 两个相反判据均进测试。`rg -n 'snapshot|warning::快照|plans-structure-drift' .github/workflows/data-refresh.yml` → 101:snapshot || {、102:warning、160:新报告 || echo；103 行另写快照失败摘要。`rg -n 'price-history' src/` → 无匹配（exit 1），历史未被前端引用。
- [x] **按批专项、无本地构建/总门禁、唯一结果档**：B1/B2 初验后才进入下一批，最终 561/561；没有执行 npm run build 或 run-gates，也没有额外设计/方案文档。保护集之外仅修改 cli、workflow、basis；自动化宿主持续追加 coding.log，该日志不属于本执行体手工文档改动。

## 6. 建议索引项

建议索引: JSONL 同日重算与双产物失败回滚反例 → 墨典:memory/behavior-equivalence-testing.md#数据管道幂等与失败零写入
