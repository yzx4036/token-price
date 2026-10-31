# v0.1.0 对抗测试 + 架构回审（Codex Mode A）

## 工作目录
<repo>

## 必读输入
1. docs/.hermes/tasks/20261031-v0.1.0-mvp/requirements.md —— 需求真源与验收标准
2. docs/.hermes/tasks/20261031-v0.1.0-mvp/architecture.md —— 架构权威
3. docs/.hermes/tasks/20261031-v0.1.0-mvp/coding-result.md —— 编码轮自述（不可采信，须自行复现）
4. `git status --short` 与工作区源码 —— 本轮改动是全部未跟踪文件，这是新仓首轮

## 编排层已实测基线（不要重复跑、不要与之矛盾；不符则作为发现登记）
- `npm.cmd run typecheck` → 19 files，0 errors / 0 warnings / 0 hints，RC=0
- `npm.cmd test -- --run` → 2 files / 16 tests passed，RC=0
- `npm.cmd run build` → 5 pages built，RC=0
- 官方来源人工核验（2026-10-31，编排层亲自抓页面核对）：
  - Gemini 3.5 Flash-Lite Standard：input $0.30 / output $2.50 / context caching $0.03 per 1M tokens，与 `src/data/api-prices.ts` 一致
  - DeepSeek deepseek-flash：OFF-PEAK cache hit $0.003 / cache miss $0.15 / output $0.6；PEAK $0.006 / $0.3 / $1.2，与数据一致

## 三段式任务

### Phase 1 对抗测试
针对 `src/lib/pricing.ts`、`src/lib/schema.ts`、`src/lib/data.ts`、`src/scripts/calculator.ts`、`src/scripts/api-table.ts` 补边界与负向测试。至少覆盖：
- 计算器：空字符串、纯空格、负值、小数、超安全整数、`Infinity`、`1e30`、科学计数法、全 0、只填部分字段、pending 条目、cache 价格 null 但用量 > 0
- 数据校验：重复 id、负价格、非 https 来源、pending 条目缺字段、verified 条目缺 input/output、非法日期
- 筛选排序：空查询、大小写、中文、none 匹配、按带 null 的字段排序、pending 是否被排除或排后
- 浮点精度：`0.3 * 3` 类结果是否需要展示层四舍五入而不是断言精确相等

发现 bug 直接修（限轻量 bugfix）。

### Phase 2 架构回审
对照 architecture.md 检查：模块边界、公共契约、依赖声明、数据模型一致性、安全与持久化风险。只标不修，写入 coding-result 的 `## 架构回审` 表，漂移标 `⚠️ needs_architecture`。

### Phase 3 轻量 bugfix
只修 bug 与遗漏断言，不改架构、不换设计、不改公共接口签名。

## 硬约束
- 不做任何 git 操作：不 commit、不 branch、不 push、不 stash。
- 不启动子代理，直接完成任务。
- 不删已有断言、不放宽 schema、不把失败项移出范围。真红必须修实现或修断言口径（并说明理由）。
- 若沙箱无法 spawn 子进程或联网，登记 `fault` 并继续实现；受限门由 Hermes 代跑。
- 只改必要文件；不得重写页面视觉设计。

## 产物
1. 新增/修改测试文件（放在 `tests/`）
2. 必要的源码修复
3. `docs/.hermes/tasks/20261031-v0.1.0-mvp/coding-result.md` 追加或新建 `## 对抗测试`、`## 架构回审`、`## 修复记录` 三段
4. 更新 `status.json`：status=`ready_for_acceptance`，stage=`codex_complete`，actual_executors.codex 记录实际模型，并写 failed_items 数组

三锻收口纪律：implementing→acceptance；失败只返工失败项；全部验收通过后才由 Hermes 统一做一个迭代提交；终验报告落盘后才 completed。
