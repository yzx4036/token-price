# v0.7.0 对抗代码审查

## 1. 总体裁决

**Kill**：冲突 AA 载荷会被静默采信、损坏缓存可被当成首次拉取覆盖、OpenAI 多列可用表会漏掉目标套餐失去模型权限，已达到本轮钉死的“静默失效级”裁决条件。

审查基准为工作区相对 `HEAD` 的全部变更，包含编排层新增的门禁执行器、候选生成物及未跟踪 fixture/任务材料。执行了明确要求的只读 `git status --short`、`git diff`、`git diff HEAD`；未执行 git 写操作、构建、门禁或 Vitest。没有沿用执行体“561 项通过”作为本审查结论。

验证方式：读取代码与新增数据；通过 Node stdin 调用纯函数、注入页面、执行两个只读 CLI；故障写入路径以拦截 Node fs 的**内存文件系统**验证，所有 mkdir/write/rename/rm 均被拦截，没有创建测试文件或临时目录；测试变异也只在内存模块中进行。主动写入仅本报告。审查前后对 230 个源码、测试、数据、配置及任务材料做 SHA256 复核，既有文件只有宿主审查记录 `logs/review.log` 出现追加，未对该日志执行写操作。以下“成立”指所述缺陷成立，“不成立”指相应怀疑已被代码或反例证伪。

## 2. 阻断项（必须修）

### B1 · A4 / A9：存在但内容为假值的坏缓存绕过校验并被覆盖

- **级别**：静默失效；违反结构异常时非 0、零写入的硬约束。
- **构造输入**：将 `--cache-file` 指向内容恰为 `null` 的已有文件，保留一份已有 candidates；提供合法 AA HTML。`false`、`0`、`""` 三种文件内容也能复现。审查使用 `tests/fixtures/benchmarks/basis.json`、`aa-rsc.html`，fs 全部写操作仅作用于内存。
- **证据**：`scripts/data/lib/benchmarks-pull.mjs:164` 读缓存；`:165` 使用 `if (previous)`；`:173` 再以真值判断是否检查降幅；`:179` 写两份产物。`scripts/data/lib/io.mjs:37` 把不存在与 JSON `null` 都返回成 null。
- **期望**：文件存在即按快照结构校验；上述内容均不是 AASnapshot，应抛 CliError，保留两份原文件，非 0 退出。只有文件确实不存在才可跳过降幅基线。
- **实际**：四种内容均返回 `{ok:true,written:true,modelCount:4,candidateCount:2}`，内存 fs 各记录两次写入，原缓存被覆盖。合法 JSON 的结构错误被静默当成“首次无缓存”。入口 `scripts/data/pull-benchmarks.mjs:9` 成功返回后不会设置失败退出码。
- **最小修复**：分开判断文件存在性与解析结果；已存在缓存无条件 `validateSnapshot`。添加已有文件内容为上述四种假值的拒绝断言，并断言零 HTTP 或至少零写入及两份原字节不变。

### B2 · A5：多个冲突 `initialModels` 只采信第一份，未报歧义

- **级别**：静默失效；可写入错误分数并返回成功。
- **构造输入**：用现有四条模型构造两个合法 RSC 记录，第二份只把 Opus Max 分数改为 60：

```js
const first = JSON.parse(readFileSync('tests/fixtures/benchmarks/aa-models-previous.json', 'utf8')).models;
const second = structuredClone(first);
second[1].intelligenceIndex = 60;
const payload = '1:' + JSON.stringify({ initialModels: first })
  + '\n2:' + JSON.stringify({ initialModels: second });
const html = '<script>self.__next_f.push([1,' + JSON.stringify(payload) + ']);</script>';
selectHighestTiers(parseRscModels(html)).get('claude-opus-5-5').intelligenceIndex;
// 实测 59.11；未报歧义，第二份 60 被忽略。
```

- **证据**：`scripts/data/lib/benchmarks-pull.mjs:47` 定位 marker，`:48` 只执行一次 `exec`，`:61` 直接 return。两份模型数、slug、creator 均合法，后续 `:173` 降幅检查和 `:174` 候选校验不能发现冲突。
- **期望**：找到全部候选载荷，按有依据的上下文选取唯一权威数组；无法消歧时抛 CliError、非 0、零写入。不能凭“第一份”或“最后一份”猜权威。
- **实际**：返回第一份，合法但冲突的数据被当作正常快照。若第一处是 `"initialModels":null`、第二处才是合法数组，则会受控抛 CliError；这一路没有未捕获异常，却也不会寻找后面的合法数组。
- **最小修复**：对 marker 多次出现建立明确消歧/拒绝规则；测试同时包含相同重复、冲突重复、前一个为 null 三例。冲突例必须证明进入写阶段之前失败。

### B3 · A8 / A11，#10 核心验收：可用表其他套餐的 Yes 掩盖目标套餐的 No

- **级别**：静默失效；报告会把明确失去权限判为无变化。
- **构造输入**：直接使用 `tests/fixtures/plans-structure/plans.json` 的三个套餐；它们都登记 GPT-6 Luna 可用。注入以下页面：

```html
<p>$20 $50 Unlimited 10,000 credits</p>
<table>
  <tr><th>Model</th><th>Plus</th><th>Pro</th><th>Free</th></tr>
  <tr><td>GPT-6 Luna</td><td>No</td><td>Yes</td><td>No</td></tr>
</table>
```

- **复现调用**：`await runPlansStructureDriftCommand({plans,fetchPage:async()=>({text:html})})`；实测 `coverage={total:3,checked:3,unknown:0}`，`allowanceChanges=[]`，其余四个数组也全空。
- **证据**：`scripts/data/lib/plans-structure-drift.mjs:57` 只抽整行；`:62`、`:63` 只有整行存在 No 且没有任何 Yes/Unlimited/Expanded 才算不可用，没有把表头与目标套餐列关联。`tests/plans-structure-drift.test.ts:51` 的 fixture 只有一个可用性单元格，覆盖不到此例。
- **期望**：Plus、Free 的 availableModels 变化入列；Pro 不报。若无法可靠关联套餐列，相关语义应归无法判定，不能宣称已经检查且无变化。票面至少覆盖 OpenAI 逐模型可用表：`issues-dossier.md:225`。
- **实际**：Pro 的 Yes 把 Plus、Free 的 No 一并抵消。执行体自述已承认不处理混合多列，但该限制没有体现在机器报告的 unknown/coverage 中。
- **最小修复**：对可判的 OpenAI 表建立套餐列关联；无法关联时输出带具体原因的无法判定，避免给出干净结论；固定上面的混合 Yes/No 反例。

### B4 · A8 / A11 / P2：仅价格可抓取的 CSR 页面被报为额度变化

- **级别**：Blocking；与 #10 的“抓不到语义证据不得冒充漂移”相冲突。
- **构造输入**：取套餐 fixture 的 `plans[0]`，页面只有价格和待加载根节点：

```html
<p>$20/month</p><div id="root"></div><script src="/pricing.js"></script>
```

- **证据**：`scripts/data/lib/plans-structure-drift.mjs:101` 只以“存在价格 token”作为整页可判门槛；`:105` 随即增加 checked；`:109` 调用额度比较。`:55`、`:59`、`:68` 把没有抓到的数字、模型及性质都直接解释为消失。票面失败姿态见 `issues-dossier.md:215`。
- **期望**：可以记录价格命中，但额度部分应为无法判定；不能把语义未加载认成语义变化。当前结果契约若不能表达两种覆盖度，至少保守归 unknown 并说明原因。
- **实际**：`coverage={total:1,checked:1,unknown:0}`，报缺 `10000:credits`、`gpt-6 luna`、`quota`、`unlimited` 四项证据；`unknown=[]`。现有 CSR 测试 `tests/plans-structure-drift.test.ts:72` 只覆盖完全没有价格 token 的空壳。
- **最小修复**：将价格可判与语义可判分开；不充分的额度载荷进入无法判定，保留有明确可比较表格/额度证据的真实变更报告。添加上述“价格 SSR、额度 CSR”fixture。

### B5 · A11 / A12：verify 顺序守卫在 verify 命令不存在时仍绿

- **级别**：Blocking；本轮要求每条守卫有反例自证，这条不能阻止前置校验被删。
- **构造输入**：仅在内存中把 workflow 的 `node scripts/data/cli.mjs verify` 替换为 `echo skipped`，运行该测试原有的五条 workflow 判断。
- **证据**：`tests/history.test.ts:154` 直接比较两个 `indexOf`；删除后 verify 位置为 `-1`，`-1 < snapshot位置` 仍为 true。`:155` 至 `:158` 的其余四条判断也全为 true。
- **期望**：删除 verify 必须使测试红；不仅要比较顺序，也要确认各命令确实存在及实际步骤关系。
- **实际**：五条判断原版、变异版均全 true。当前 workflow 确实有 verify，所以这是守卫失效，不能据此说当前 R3 已坏。
- **最小修复**：先断言 verify/snapshot/diff 位置均非负，再校验顺序；以删除 verify、将 snapshot 放到 diff 后两个内存反例自证。

最小返工集合为 B1～B5，保留已经证伪的快照分类、R1、映射精确匹配及 R3 实现。无需借返工自动新增 mapping、改官方价格或重做前端。

## 3. 非阻断问题与 P1～P4 判定

### N1 · A7 / P1：未映射发现层缺失属于已定设计的边界，可下批收口

- **判定**：**成立（23 条候选全已入 basis、覆盖率未提升）；不成立（把它归为执行体漏做 D8）**。
- **构造输入**：在 AA 数组增加一个有分、creator 合法的新 slug，但不改 mapping。`buildBenchmarkCandidates` 输出中不会出现它；在现有 fixture 中 GPT-6 Astra 已有 mapping、没有 benchmark，因此可以产出 `inBasis:false`。
- **证据**：`scripts/data/lib/benchmarks-pull.mjs:114` 只遍历 mapping；`:125` 的 inBasis 仅表示是否已有 benchmark，不能表示“此前没有 mapping”。`architecture.md:34`、`:57` 明确限定只产已精确映射部分；`prompt-design.txt` 的 D8 也有同样限制。
- **期望 vs 实际**：按已定设计，实际正确；若期望发现“AA 有分但我方未映射”，当前产物没有这层能力。D8 禁止自动写 mapping，并不禁止另外只读列出待人工核验的 AA 原始候选，两者不能混为一谈。
- **实测**：工作区候选 23 条、`inBasis` 全 true；重算前端评分覆盖仍是 **32/133 → 32/133，提升 0**。候选没有被前端生成器消费：`scripts/data/lib/benchmark.mjs:34` 仍只读 basis。
- **建议**：编排层登记 #15 验收第 4 条与已定 D8 的设计/验收缺口（`issues-dossier.md:119`）；不能宣告本轮已经提升覆盖率。后续可新增只读未映射清单及人工审核流程，并分别报告“新增 mapping / AA 新增有分模型”的贡献。无需为了验收擅自自动匹配或写真源。

### N2 · A8 / P3：0.5 按规格实现，但只展示超阈值清单丢失变化面貌，可下批收口

- **判定**：**不成立（实现偏离阈值）；成立（监控信息失敏）**。
- **构造输入**：basis=58.41，今日=58.91，差值 0.5 不报告；今日=58.91000000001 或 58.92 则报告。`scripts/data/lib/benchmarks-drift.mjs:15` 用原分数加减 0.5 比较，避免展示舍入干扰阈值；测试在 `tests/benchmarks-drift.test.ts:26`。
- **期望 vs 实际**：票面/架构明定严格 `>0.5`，实现符合。当前缓存只报 Opus +0.6960336079，不能据此让读者误以为只有一个模型变过。
- **独立复算**：当前 23 条在原始精度上都与两位小数 basis 不同，其中多条只是取整差；先统一为两位小数再比较，实际变化为 **16/23**，其中原始分差绝对值 `>0.1` 的有 **12** 条、`>0.5` 的有 **1** 条。与编排层提供的 15 条不完全相同，本报告以当前缓存重算结果为准，避免把取数时间或精度差异当成缺陷。
- **建议**：保留 0.5 作为明显变化阈值，同时输出 `changedCount`（统一到 basis 的两位小数）、`aboveThresholdCount`、最大分差；如需低强度提醒，可另设 **0.1 分**观察档，当前样本可覆盖 12 条，且明显大于两位小数的舍入误差。不要未经裁定直接改掉硬规格。

### N3 · A9：JSON/文件系统错误没有统一转换为 CliError，可下批收口

- **构造命令**：`node scripts/data/cli.mjs benchmarks-drift --json --basis-file tests/fixtures/benchmarks/basis.json --cache-file tests/fixtures/benchmarks/aa-rsc-bad.html`。
- **证据**：`scripts/data/lib/io.mjs:34` 的 JSON.parse 原样抛 SyntaxError；`scripts/data/lib/benchmarks-drift.mjs:23` 未包装；入口 `scripts/data/cli.mjs:301` 兜底。snapshot 的 read/rename、AA 两文件写入也保留原生 fs 异常：`scripts/data/lib/history.mjs:107`、`:118`，`scripts/data/lib/benchmarks-pull.mjs:157`。
- **期望 vs 实际**：按“错误路径用 CliError”的严格类型要求应有结构化 CLI 错误。实测命令退出 **1**，stdout 为 `{ok:false,code:"UNEXPECTED",message:...}`，没有写文件；fs EACCES 也为原生 Error。它没有破坏失败退出/原文件保护，故单列为非阻断的一致性问题。新业务校验本身使用 CliError，未发现生产代码新增 `throw new Error`。

### N4 · A10：代码无新增 emoji，不等于全部附入材料无 emoji，可下批收口

- **构造核查**：对 `git diff HEAD` 的所有新增行及新增 fixture 做 Unicode Extended_Pictographic 扫描；再对未跟踪任务材料全文扫描。
- **证据**：代码/已跟踪新增行/fixture 未命中；`docs/.hermes/tasks/20261109-v0.7.0-data-base/issues-dossier.md:205` 有 `U+26A0 U+FE0F`，编码日志有 77 个包含图形符号的行，来源包括转录的既有内容。
- **期望 vs 实际**：实现新增内容满足无 emoji，但按“全部未提交材料一个也不能有”的字面口径，交付并非全无。编排归档时应明确源文转录是否例外或清理交付材料；不能把代码扫描结论扩大成全部文件扫描结论。本报告不复制这些符号。

### P2 单独判定：给出的 `13.306.788` 不是额度文本；CSR 错分另有独立反例

**不成立：用 `13.306.788` 证明 Copilot 假阳的推断。** 审查对 [GitHub Copilot 官方套餐页](https://github.com/features/copilot/plans) 重新进行一次只读 HTTP GET，HTTP 200。该片段出现在 SVG path 的绘图坐标中，邻近内容为 `...2.148.558 2.913.306.788.717 1.459...`，不是相邻额度文本。`scripts/data/lib/plans-drift.mjs:29` 会去掉整个标签及其属性，因此这串坐标不会成为 quantityEvidence 的文本输入。不能把原始 HTML 搜索命中当作语义证据。

**成立：通用 token 提取有粘连风险，CSR 语义错分也确实存在。** 独立构造 `<span>13.3</span><span>06.7</span><span>88</span>x`，`scripts/data/lib/plans-structure-drift.mjs:7` 未给 span 边界补分隔，归一化后粘成 `13.306.788x`；`:44` 的非锚定正则会提取 `306.788:x`，最终报缺 `13.3:x`。这是合成反例，不能反推本次 Copilot 命中就是这个原因。价格可见、语义 CSR 的错误分类已在 B4 实测。

**需实测：Copilot 这条是否发生真实额度语义变化。** 当前单页重放仍报缺 `13.3:x`，但记录中的“约 Pro 的 13.3 倍”是转述，官方缺少同一字面 token 并不证明比率或额度变了。现有比较只证明证据文本不匹配；应结合前后额度口径人工核对，不能据此直接宣称假阳，也不能直接确认真实变化。P2 不作为 B4 的唯一证据。

### P4 单独判定：同日覆盖符合原意，price 验收应使用跨日基线

**成立：首日新增后同日改价仍是 new；不成立：这是幂等缺陷。** `scripts/data/lib/history.mjs:98` 丢弃当日旧事件，用此前日期的状态重新生成当日 delta。首日此前无此 id，所以同日 1→2 后仍为 `{change:"new",before:null,after.inputPrice:2}`，只有一条当日事件。若此前一日已有此 id，当日重跑同样可以是 price；并非所有同日重跑都必然 new。

独立输入验证：11-09 首次 1，同日改为 2，11-10 再改为 3；11-10 记录为 `change:"price",before.inputPrice:2,after.inputPrice:3`。应把“改一条价格得到 price”的验收明确为“前一自然日已有基线/事件，再于次日只改一条价格”。自然日按 `scripts/data/lib/io.mjs:62` 的 **UTC 日期**，避免香港时区午夜造成误读。此项无需改实现。

## 4. 被证伪的怀疑

1. **“同日快照只是长度一样，字节可能不同”——不成立。** 读取当前 29,315 字节历史，完整重建首次事件与原文件逐字节相等；用现有 133 个 official 条目再次调用 buildSnapshot，返回原 events 对象。同日改价只有一条替换事件。现有落盘测试还比较 SHA256 与 mtime：`tests/history.test.ts:27`。
2. **“verifiedAt/fetchedAt 会制造历史事件”——不成立。** 仅改时间戳的内存输入返回原事件；只有价格变化才新增次日 price。`history.mjs:8` 不提取 fetchedAt；`:41`、`:42` 比较项不含 verifiedAt；`:109` 只读 apiEntries，根本不读 aggregate.generated.json，所以单改后者的 fetchedAt 不可能影响快照。这是有效隔离，不应因“不读取”而判测试无效。
3. **“四个价格随 USD→CNY 一起改会误判 price”——不成立。** 实测 `1/4/0.02/0.1 USD → 7/28/0.14/0.7 CNY`，输出 currency 并保留完整 before/after。`history.mjs:41` 币种优先，replay 在 `:130` 原样输出该分类，不会把它改成 price。
4. **“档位是按 Max 名称选的”——不成立。** 同 slug 构造 Max=50、Xhigh=51、High=75、Medium=60、Low=null，候选选择 **High=75、tierUsed=High**。`:100` 比较实际数值；全缺分时 `:122` 跳过候选，没有用 0 顶替。现有 fixture 中 Max 恰好最高，不能单靠原测试证明这点，本次补了相反排序的内存反例。
5. **“包含/去后缀参与了 AA 近名匹配”——不成立。** 新实现以 Map.get 精确查 slug：`benchmarks-pull.mjs:115`。`baseModelName` 去的是既有价格变体后缀，用于 provider 守卫；旧 `findSemanticMismatches` 的 includes/去档位后缀是拒绝错配的校验，未用于产生候选匹配。两者不能误判为新增模糊匹配。
6. **“第二份文件失败时，第一份已提前覆盖”——常规单次故障下不成立。** `benchmarks-pull.mjs:144` 先暂存两份，`:151` 才提交；`:153` 回滚已提交项。内存 fs 注入第二份暂存 EACCES，原两文件不变，临时文件清除；原测试 `tests/benchmarks-pull.test.ts:123` 也覆盖第二次 rename 失败回滚。B1 是另一条独立的校验遗漏，不能拿这些通过项替它背书。严格到目录节点时，`:146` 创建的新空目录没有回滚，此处不声称故障前后整个目录树逐节点一致。
7. **“tierPolicy 污染 methodology / generated 是手改”——不成立。** 根级 tierPolicy 正确，methodology 值全为字符串；既有 benchmarks 整个重算对象及格式化字节均相等，且没有 tierPolicy。新增 candidates 用缓存、basis、api 与缓存日期重算，字节完全一致，双方 SHA256 均为 `ba32635579b565d44c615c68d5d1458c2c8115c551bb7444385aada872ff2a73`。这是生成一致证据，不能证明人的操作历史，但未发现手改造成的偏离。
8. **“快照失败会让 R3 停在提交前”——代码路径上不成立。** workflow `:101` 的 OR 组最后为成功的 echo，`:102`、`:103` 同时报 warning/摘要；快照不控制后续 changed 判定。成功快照位于 `:112` 的 src/data diff 前，提交范围 `:171` 为整个 src/data。此处只核查控制流，未实际执行 git 提交或触发远端 Actions。

三条新断言的有效性抽查如下；变异均只发生在内存，未改项目文件：

| 新断言 | 反例/变异 | 实测结果与结论 |
|---|---|---|
| `tests/history.test.ts:47`：仅 fetchedAt 不写 | 内存模块把 fetchedAt 加入提取及比较字段，再用原 fetched-at-only fixture | 原实现通过，变异后失败。**能红**；配合实际不读取 aggregate 文件的边界，不能称为恒真断言。 |
| `tests/history.test.ts:55`：单价格变化为完整 price | 内存模块把 classifyChange 的 price 分支禁用，输入原 price-changed fixture | 原实现通过，变异后没有所期望的 price。**能红**，能拦截“不记录价格变化”的错误。 |
| `tests/history.test.ts:154`：verify 在 snapshot 前 | 内存删除 verify 命令，保留其余 workflow | 原版、变异版五条 workflow 判断全 true。**对命令缺失这一攻击输入恒绿**，见 B5。不是断言数学上对所有字符串恒真，而是其应拦截的坏输入没有让它红。 |

另查出行尾守卫的覆盖缺口：`tests/benchmarks-pull.test.ts:151` 只断言没有裸 LF，没断言 CRLF 数大于 0。将同一 basis 仅在内存压成单行 JSON，CRLF=0、裸 LF=0，该断言仍绿，而用户规定的字节探针应失败。当前真实文件是 **251 CRLF / 0 裸 LF**，产品文件未坏；建议随 B5 一并补正计数断言。

## 5. A1～A12 逐条结论表

| 攻击面 | 成立 / 不成立 | 构造输入、结果与证据 |
|---|---|---|
| **A1 快照幂等** | **不成立** | 当前 133 条 official 的首次重建与 29,315 字节原文件完全相同；同日相同输入返回原对象。同日 1→2 替换当日 delta、不追加；次日 2→3 的 before 为前一日期最后状态，若中间数日无记录则继承最近状态。`history.mjs:97`、`:98`、`:99`。月初顺序固定 baseline→delta：`:101`、`:102`；parseHistory 的 date:kind 递增校验在 `:55`，反序会拒绝，replayStates 按文件顺序处理 `:74`。输入 10-31=1、11-01=2 实测两种同日事件共存且最终状态=2。 |
| **A2 时间戳排除** | **不成立** | 单改 aggregate.generated.json fetchedAt：快照根本不读此文件；单改 api 中 official verifiedAt：不产生事件。提取字段 `history.mjs:8`，比较 `:41`、`:42`，读取边界 `:109`。原 fetched/verified 测试 `tests/history.test.ts:43` 有价格变化对照，内存 fetchedAt 比较变异能击红。月初即使价格不变仍应新增 baseline，与时间戳事件无关。 |
| **A3 币种切换** | **不成立** | USD 四价 `1/4/0.02/0.1` 改为 CNY `7/28/0.14/0.7`，实测 currency；`history.mjs:41` 先于价格比较。`runReplayCommand` 在 `:130`、`:132` 输出完整 before/after 与 currency，不把四项换算写成涨价分类。 |
| **A4 失败零写入** | **成立** | 断网→HTTP_FAILED、坏 HTML→BENCHMARKS_INVALID，均在写阶段前失败；合法结构缓存后的不可写目标注入 EACCES，两份原文件不变，入口非 0。语法坏 JSON `{broken` 抛 SyntaxError、零写。**结构坏但为 null/false/0/空字符串则成功覆盖**，见 B1。所有写前业务校验均在 `benchmarks-pull.mjs:163` 至 `:178`，没有先写第一份再校验第二份的倒挂；两份暂存/回滚在 `:140`。新建空目录不回滚的严格目录树边界见第 4 节第 6 条。 |
| **A5 AA 解析与降幅** | **成立** | 原 aa-rsc.html 的跨段转义引号、嵌套数组、字符串内 `]` 实测完整解析，`benchmarks-pull.mjs:39`、`:43`、`:53` 至 `:62` 处理转义及引号。**多个冲突 initialModels 静默取首份**，见 B2。坏 JSON/RSC 受控转 CliError，没有由这四类字符串输入触发未捕获解析异常。另以内存 fs 独立跑：首次无缓存 4 条成功；1000→700（恰 30%）成功；1000→699（30.1%）抛 BENCH_COUNT_DROP、零写，比较在 `:173`；原测试见 `tests/benchmarks-pull.test.ts:89`。 |
| **A6 档位政策** | **不成立** | 同 slug Max50/Xhigh51/High75/Medium60/Low缺分，实测取 High75、tierUsed=High；缺分归 null，所有档都缺分则不产候选。`benchmarks-pull.mjs:72`、`:100`、`:106`、`:122`。tierUsed 保留所选 AA 名称末尾括号，或“唯一档”，与现有 basis 的文本口径一致；未据档名推分。注意政策是**同 slug**范围，不会跨不同 slug 猜同一模型的档位。 |
| **A7 映射纪律** | **不成立** | 加近名 slug 不能代替 mapping 精确键；mapping slug 缺失在 pull 中抛 BENCH_DANGLING（`:115`、`:116`），无写回 basis/mapping 路径。benchmarks-drift 则按监控契约将失踪 slug 放 missingSlugs，仍退出 0（`benchmarks-drift.mjs:11`）。仅存在于 benchmarks、完全没有 mapping 的孤立记录不被 pull 遍历，但 drift 仍遍历它；不是静默忽略 mapping 缺失。包含/去后缀仅用于既有拒绝守卫或价格变体归一，详见第 4 节第 5 条；P1 是已定发现范围的限制。 |
| **A8 漂移只读及 JSON 契约** | **不成立（只读/结构）；成立（语义准确性）** | 两个 CLI 实跑：benchmarks 用 basis/current fixture，plans 用注入 missing-tier 页面；均退出 0。7 个相关源/fixture/产物执行前后 SHA256 全相同。bench JSON 键恰为 ok/readOnly/threshold/scoreChanges/tierChanges/missingSlugs；plans 键恰为 ok/readOnly/coverage/missingTiers/mergedTiers/removedTiers/allowanceChanges/unknown，数组均存在，无漂移时也保留空数组。初始化见 `benchmarks-drift.mjs:7`、`:19`、`plans-structure-drift.mjs:82`。输出结构符合架构 §4.3，但 B3/B4 证明结构正确不等于语义正确。 |
| **A9 CLI 契约** | **不成立（透传）；成立（异常类型/坏缓存失败语义）** | `cli.mjs:172` 剥离 --json，`:251`、`:258` 输出 JSON，两个命令实测均为纯 JSON。已发现漂移退出 0；坏 HTML 当 JSON 输入的只读命令退出 1、ok=false、code=UNEXPECTED，见 N3；语法及 fs 错误不全是 CliError。生产新业务错误使用 CliError。AA standalone 只约定 --check、自身始终 JSON，不应拿通用 CLI 的 --json 去要求它新增参数。B1 的已有坏缓存返回成功违反失败语义，须修。 |
| **A10 红线** | **不成立（实现/产物）；成立（附入材料符号）** | candidates 与缓存重算逐字节一致；既有 benchmarks 全文对象和字节与生成器计算一致，history 种子也与首次计算字节一致。dependencies 恰为 vue/vue-router/zod（`package.json:38`）。`rg -n 'price-history|\bfetch\s*\(|XMLHttpRequest|axios|https?\.request|WebSocket|EventSource' src/` 无匹配；无前端引用历史或新增网络调用。basis=251 CRLF、0 裸 LF；根级 tierPolicy、methodology 全字符串，R1/R4 满足。新增代码/fixture 无 emoji；dossier:205 与转录日志有符号，见 N4，不能称全部材料无 emoji。 |
| **A11 测试有效性** | **成立** | 三条抽查中，fetchedAt 排除、价格变化在内存变异下确实红；verify 缺失的坏 workflow 却仍绿（B5）。额外发现单行 basis 能绕过仅“无裸 LF”的断言（`tests/benchmarks-pull.test.ts:151`）；真实文件未坏。原最高分 fixture 的 Max 恰好最高，缺少“High 比 Max 高”的反排序反例，本次已用纯函数独立验证实现。B3/B4 的混合多列、部分 CSR 输入也不在原断言覆盖中。 |
| **A12 R3 工作流** | **不成立** | `data-refresh.yml:94` verify 成功后，`:101` snapshot 用 OR 组吞掉失败并在 `:102`、`:103` 可见告警；失败本身不阻断已有汇率/聚合差异进入 `:112` 判断，再按 `:167`、`:171` 提交整个 src/data。成功快照先于 diff，其 JSONL 不含 fetchedAt，不会被排除时间戳的过滤误删。结论以汇率/聚合确有实质变化且无其他步骤失败为前提；没有实际运行提交/发布。B5 是测试守卫缺陷，不是这条当前控制流缺陷。 |

建议索引: RSC 多载荷歧义、假值缓存绕过、套餐多列与部分 CSR 漂移反例 → 墨典:memory/behavior-equivalence-testing.md#数据管道幂等与失败零写入
