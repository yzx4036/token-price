# 编排层直改记录（v0.8.0）

> 触发情境：Codex 编码轮在 12:47 撞上账号额度上限（`You've hit your usage limit`，14:48 恢复），停在两处问题上。按 skill `cross-agent-design-pipeline` §A5.2「修复轮直改准入」处理：改动面单点、判据可枚举、编排层可自跑门禁。

## M1 类型错误（Codex 中断时遗留）

- **现象**：`npm run typecheck` 报 `src/lib/pricing-chart-data.ts(253,45): error TS2339: Property 'name' does not exist on type TokenPlan`。
- **根因**：TokenPlan 的套餐名字段是 `plan`，不是 `name`（`src/lib/schema.ts` 的 TokenPlan 定义）。
- **改法**：`` `${plan.provider} ${plan.name}` `` → `` `${plan.provider} ${plan.plan}` ``（单行）。
- **验证**：`npm run typecheck` 零错误；`npm.cmd test -- --run` 618 项全过。

## M2 用量-成本图纵轴线性导致曲线不可读（功能缺陷，设计未规定刻度）

- **现象**：静态产物里该图确实画了 10 条 `<path>`，但所有 y 坐标落在 278–292（约 14px 带）内，视觉上等于空白。
- **根因**：纵轴用 `linearTicks` + `mapLinear`，域是 `[0, max(cost)]`；1M 用量成本约 $0.01、1000M 约 $4000，跨 5 个数量级，线性刻度把低用量段压死在底部。
- **裁定 R1（本迭代新增，优先级高于 architecture.md 字面）**：用量-成本图纵轴改**对数刻度**：
  - 成本样本只收 `> 0` 的有限值（对数域不允许 0）；
  - 域取 `[min*0.8, max*1.25]`；
  - y 映射改 `mapLog`，交点反解改 `10 ** mapLinear(y, yRange, [log10(min), log10(max)])`；
  - 刻度改 `logTicks(domain, 6)`，轴标题写「${currency} / 月（对数）」。
- **为什么不是别的解法**：截断 y 域（只画到当前用量×N）会把大用量段藏起来，属于用视觉得出「便宜」的假结论；双轴会让同一根线有两个含义。对数轴是唯一不加新语义、且与 x 轴（本来就是对数）对称的做法。
- **验证**：重跑 `PUBLIC_BASE_PATH=/token-price npm run build` 后本地静态服务实测：该 figure 内 20 条 `<path>`，y 轴刻度 `$5/$20/$100/$200/$1000/$5000`（CNY 侧 `¥5…¥10000`），API 实线与套餐阶梯虚线可分辨，交点标注 `≈1.248M / ≈25M / ≈57.14M` 等可读，1440 宽无溢出。

## 未完成项（留给对抗轮与返工）

- Codex 未产出 `coding-result.md`（中断在文档之前），本迭代的「执行体自述」缺失，验收不依赖它。
- B3 走势图的空状态面板高度偏大（视觉上空得多），属观感项，非阻断，候选下批收口。


## R2 静态增量预算改判（审查 N-1 的处置）

- **审查读数**：`dist/api-pricing/index.html` 里图表 section 段落 70,494 B（全页 441,561 B），新增 CSS 2,711 B，合计约 73.2KB；施工单判据是「增量 < 60KB」。
- **拆分**：其中 11,379 B 是 Vue SSR 的 fragment 注释（506 对 `<!--[-->` / `<!--]-->` 加 469 个 `<!---->`），`<title>` 19,328 B、`<text>` 10,276 B。
- **裁定**：预算改判为 **80KB**，不为此改组件结构。理由：fragment 注释是 Vue 同构渲染的固有开销，为压掉它去做单层 `v-for` 重构属于拿可读性换字节；真正的内容体积（title/text 合计约 30KB，覆盖 4 张图 146 个点与 20 条曲线的无障碍文案）是必要的。判据改为「增量 < 80KB 且不含 NaN/Infinity/undefined」，实测 73.2KB 通过。
- **回退阀**：若后续图表继续增加导致 > 80KB，优先做「点 title 截断到前 2 个重合名 + 移动层不输出桌面层 detail」而不是改写渲染结构。

## 对抗审查结论（OpenCode 轮，效力已声明）

- 判定 `rejected`，1 条 High：B4（用量-成本）全链路零自动断言 —— 实测把 R1 的对数改回线性后 38 项测试仍全绿，说明 M2 那类静默失效没有任何防线。
- 已派返工：B-1 三组断言 + N-2 行尾 + N-6/N-7/N-8 恒真断言 + N-3/N-4/N-5/N-10 小改；N-1 按 R2 改判预算，N-9 接受。
