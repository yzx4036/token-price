# v0.7.0 定点返工窄复核

## ① 出口判定

**approved-with-conditions**。

B1～B5 及 B5-b 六项均判为**真修**；指定五文件的返工差异中，未发现新引入的 Critical/High 阻断；相对上轮审查字节，交付源码及测试恰好只变化指定五文件，未越界。条件仅沿用上轮非阻断遗留，收口方式和归属批次见第⑤节，不要求扩大本次返工。

权威清单为 `REVIEW-CODEX.md`；已读 `coding-result-rework.md`，未将其自述、测试数字或编排层亲验作为本报告证据。读取了指定 task/status，未改动任务状态。本报告只给窄复核出口，不宣告迭代最终验收。

独立执行：

```text
npx.cmd vitest run tests/benchmarks-pull.test.ts tests/plans-structure-drift.test.ts tests/history.test.ts
exit=0；3 files passed；78 tests passed
```

另外运行 Node stdin 单文件脚本，重建原报告反例并打印读数。B1/B2 通过独立子进程执行真实 `pull-benchmarks.mjs` 入口，fs 目标文件由内存文件系统提供，所有 mkdir/write/rename/rm 均被计数并拦截；B3/B4 注入页面调用生产函数；B5/B5-b 从当前测试源码提取实际守卫，仅去掉参数的 TypeScript 标注，以同语义 Node assert 适配执行。未修改源码、测试、工作流或数据，未执行构建、门禁、git 写操作、线上抓取。Vitest 自身的临时测试文件按现有测试流程创建并清理；主动交付写入仅本报告。

## ② B1～B5 及 B5-b 逐项复核

下列位置均指当前修订后文件；引号中的代码为当前原文。

| 项目 | 判定 | 修订后原文与 file:line | 独立反例读数 |
|---|---|---|---|
| B1 坏缓存 | 真修 | `scripts/data/lib/benchmarks-pull.mjs:172`：`const hasPrevious = existsSync(cacheFile);`；`:177`：`validateSnapshot(previous);`，位于存在性分支内、不再依赖内容真值；`:176` 把缓存 SyntaxError 转为 `BENCHMARKS_INVALID`。对应测试 `tests/benchmarks-pull.test.ts:86`。 | 对已有缓存 `null`、`false`、`0`、`""`、`{broken` 分别运行真实 CLI：**5/5 exit=1、code=BENCHMARKS_INVALID、写操作=0、HTTP=0、缓存和 candidates 两份原字节均不变**。另独立跑过的 Vitest 对这五例实际临时磁盘文件的 SHA256、mtime、文件集合均断言不变且通过。 |
| B2 冲突 initialModels | 真修 | `scripts/data/lib/benchmarks-pull.mjs:49`：`while (marker.exec(payload))`；`:71` 取规范化首份，`:72` 对任一不同候选执行 `invalid('initialModels 多份载荷内容冲突，无法消除歧义', 'BENCH_RSC_AMBIGUOUS')`。对应测试 `tests/benchmarks-pull.test.ts:64`、`:72`、`:81`。 | 使用原 fixture 四条模型，在**同一 RSC payload**放两份数组，第二份只将 `models[1].intelligenceIndex` 从 59.11 改为 60：真实 CLI **exit=1、BENCH_RSC_AMBIGUOUS、HTTP=1、写操作=0、两份原字节不变**。单份、相同双份、第二份逆序三例均接受且返回 4 条；首份 null 后接合法数组受控拒绝，code=BENCHMARKS_INVALID。 |
| B3 多列可用表 | 真修 | `scripts/data/lib/plans-structure-drift.mjs:75` 按 `cell.text === normalizeText(plan.plan)` 定位唯一列；`:76` 检查列歧义、列数及跨行跨列，`:79`：`const value = row[columns[0]].text;`；`:141`：`if (reason) { result.unknown.push({ id: plan.id, plan: plan.plan, reason, url }); continue; }`。对应测试 `tests/plans-structure-drift.test.ts:62`、`:74`。 | 原混合表 `Model / Plus / Pro / Free` 配 `GPT-6 Luna / No / Yes / No`：**coverage=3/3/0，allowanceChanges 的 id 恰为 openai-plus、openai-free**，各仅缺 `availableModels: gpt-6 luna`，Pro 不报。再把列改成 `Model / Free / Pro / Plus`，同样正确。无表头、无目标列、重复目标列、跨列、缺单元格及目标值 Pending 共 **6/6** 输入均为 **total=1、checked=0、unknown=1、allowanceChanges=[]**，带无法定位列或可用性值的原因。 |
| B4 价格 SSR／额度 CSR | 真修 | `scripts/data/lib/plans-structure-drift.mjs:133` 起单独检查 `hasSemantics`；`:136` 起无证据则 push unknown 并 continue；`:140` 后才比较额度，`:142` 才增加 checked。对应测试 `tests/plans-structure-drift.test.ts:84`、`:92`。 | 原反例 `<p>$20/month</p><div id="root"></div><script src="/pricing.js"></script>`，只用 Plus：**total=1、checked=0、unknown=1、allowanceChanges=[]**，reason=价格可解析但额度语义未渲染。真实变化对照 `<p>$20/month Unlimited 20,000 credits GPT-6 Luna</p>`：**checked=1、unknown=0，恰报一项 allowance 缺 10000:credits**；没有用永远 unknown 掩盖真实变化。 |
| B5 workflow 守卫 | 真修 | `tests/history.test.ts:24` 为同一实际守卫；`:28`：`for (const position of [verify, snapshot, diff]) expect(position).toBeGreaterThanOrEqual(0);`；`:29`、`:30` 再比顺序。真实 workflow 在 `:165` 调用它；负例在 `:169`、`:176`。 | 原 workflow 的 verify/snapshot/diff 字符位置为 **2542/2795/2995**，守卫通过。内存删掉 verify 整行后为 **-1/2751/2951**，守卫在 **-1 >= 0** 处失败。完整 snapshot 步骤移到 diff 后，snapshot/diff 为 **8148/2773**，守卫在 **8148 < 2773** 处失败。两种坏输入均真实触发断言，未改磁盘 workflow。 |
| B5-b 行尾守卫 | 真修 | `tests/benchmarks-pull.test.ts:26`：`expect((text.match(/\r\n/g) ?? []).length).toBeGreaterThan(0);`；`:27` 保留无裸 LF 断言；真实 basis 在 `:214` 调同一守卫，单行负例在 `:219`。 | 真实 basis：**251 CRLF / 0 裸 LF，通过**。同一 JSON 在内存 `JSON.stringify(JSON.parse(text))` 压成单行：**0 CRLF / 0 裸 LF，失败**。另以 LF 替换 CRLF：**0 CRLF / 251 裸 LF，失败**。 |

B3 的独立注入页面如下；重排表头和相应单元格时保持 No/Yes/No 对应其套餐：

```html
<p>$20 $50 Unlimited 10,000 credits</p>
<table>
  <tr><th>Model</th><th>Plus</th><th>Pro</th><th>Free</th></tr>
  <tr><td>GPT-6 Luna</td><td>No</td><td>Yes</td><td>No</td></tr>
</table>
```

## ③ 新引入阻断

**无。**

核查限定在指定五文件的返工增量。为区分既有问题和新问题，从上轮 `logs/review.log` 的逐行源码输出恢复五份旧文本，在内存计算 SHA256，五份均与上轮哈希清单相符，再以 unified diff 对照当前文件逐段检查。

- `benchmarks-pull.mjs` 的增量限于重复载荷检查和已有缓存校验；校验仍先于 `writeBenchmarkDocuments`，两文件暂存、提交及回滚逻辑未变。独立 B1/B2 CLI 反例证实拒绝路径零写入；专项测试的写入故障、check、降幅边界等现有验证也通过。
- `plans-structure-drift.mjs` 的新 `{ changes, reason }` 返回形式与唯一调用点同步，歧义和无额度语义均进入 unknown；已通过混合列、不可定位列、CSR 负例及真实额度变化正例确认，不是恒定空数组或恒定 unknown。价格分组仍在额度 unknown 分支之前建立，既有价格比较测试通过。
- 三个测试文件原有断言未删减或放宽；被抽出的 workflow、行尾守卫仍由真实文件测试和负例共同调用。新增 CLI 写计数在生产模块加载之前同步到 ESM，且同时核对目标字节／mtime；未发现以恒真断言代替原约束。

本节不重新裁决上轮已列出的通用语义提取边界，不扩大为全量重审。

## ④ 越界核对

**未越界。** 核对依据为上轮审查日志中的原始哈希输出，不依赖返工方自述或其临时快照：

1. 从 `docs/.hermes/tasks/20261109-v0.7.0-data-base/logs/review.log:6626` 读取上轮完整 SHA256 清单，共 231 项；按本次要求排除 `docs/.hermes/tasks/**`、`.cache/**` 后为 **157 项**。
2. 对这 157 项重新读取实际字节并计算 SHA256：**恰有以下五项变化，其余 152 项一致，删除 0 项**。同时重新枚举清单覆盖的 `scripts/`、`src/`、`tests/`、`docs/.hermes/`、`.github/` 及两个 package 文件，范围内**新增 0 项**。新报告属允许的任务材料。
3. 读取 `git status --short --untracked-files=all` 交叉核对交付路径，未发现基线目录之外的额外交付改动。`git diff --stat` 为 **21 files changed, 1739 insertions(+), 15 deletions(-)**；这是整个迭代相对 HEAD 的差异，包含上轮已经审过的改动，不能把 21 文件误算为本次返工越界。字节清单才用于判定本次返工边界。

| 文件 | 上轮 SHA256 | 本轮 SHA256 |
|---|---|---|
| scripts/data/lib/benchmarks-pull.mjs | cefa8123731ce765fe5eaf499de37349aedc8bc347af6bf172c97ad155908f06 | 4ff52ea71ac2de2bd035a2203d7a26a44ea7e2d8a2d6e36a3e74d4e2464bb61b |
| scripts/data/lib/plans-structure-drift.mjs | 6a5cc8692caa33d2b4ead0d96aebd90bb24905cd0bf0bfd99d8837c39f97e447 | f00a6c22f8485516fa4d0818854ef07b960e1040622f4ba2ab54f7f0fe83221a |
| tests/benchmarks-pull.test.ts | 0ffd593e833caee13031b13f5dbed1719db3a5004c7fc66df356f84a4b04a072 | c40178376499f7e4ab93eef7e2c2ff76418171002ffe4de10ab5b6d3e8418d58 |
| tests/plans-structure-drift.test.ts | ea19af7852bee742c7509d69d8d0f4f9744d6a1f4cd1e6f5bec80536ec7044bd | cca05c9bae07cd3110ad90dedec072959b7e8454a6e78219579fbc820f6e77c5 |
| tests/history.test.ts | d72d41448b58da0e7dac683ac32cba70bc0723dedc5ff0b6952d692ceb4767ce | d9fdbabf4448d30334edcdeb08a39d52ba818956e613fd6e8810caf0764d1522 |

因此 workflow、原 history 实现、basis、mapping、generated、package、原 plans-drift 等交付字节均与上轮相同。任务材料和运行缓存不参与上述边界判定。

## ⑤ 遗留条件清单

以下沿用上轮权威报告的非阻断结论，未在本次窄复核中声称已修。它们不改变本次六项真修及无新增阻断的结论。

| 遗留项 | 级别 | 收口方式 | 归属批次 |
|---|---|---|---|
| N1／P1 覆盖率与未映射发现边界 | Medium | 编排层保留“本轮未提升前端评分覆盖率”的验收结论，登记设计与覆盖率目标之间的缺口；后续发现层能力另行裁定，保持人工核验和精确映射。 | 本迭代归档登记；能力改进归下一批 #15。 |
| N2／P3 阈值内变化的展示 | Low | 保持既定严格 >0.5 判据；下一批确定并验证变化总数、超阈值数等展示口径，避免把告警条数称为全部变化条数。 | 下一批 #15 监控展示。 |
| N3 JSON／fs 错误类型一致性 | Low | 统一剩余错误的 CliError／错误码表达，保持非 0 退出及原文件保护；B1 仅修了本次点名的缓存 JSON 分支。 | 下一批数据 CLI 错误契约维护。 |
| N4 归档材料中的转录符号 | Low | 编排归档时明确源文转录的扫描口径或清理交付材料；不得把代码无符号扩大为全部材料无符号。 | 本迭代材料归档。 |
| P2 既有 Copilot 额度提示待人工确认 | Medium | 沿用“证据文本不匹配、待人工核对”的性质；由编排层核对前后额度口径后再作真实变化结论，不以 SVG 坐标命中证明额度变化或假阳。 | 本迭代结果归档中的人工核对；提取精度改进归下一批 #10。 |

P4 沿用上轮“不需改实现”的结论，价格变化验收使用跨 UTC 自然日基线；不新增返工项。本次没有新增 Critical/High 最小修复清单。
