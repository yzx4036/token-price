# v0.2.0 终验报告（编排层亲跑）

迭代：人民币基准 → 调整为「原币种原价 + 人民币估算副列」· 多厂商扩充 · 数据更新 CLI
日期：2026-10-31

## 一、本轮交付

| 项 | 结果 |
|---|---|
| 厂商覆盖 | **15 家**（国内 8 / 国际 7） |
| 计价口径 | **168 条**（v0.1.0 为 3 条） |
| 溯源 | official **122** · aggregate **46** |
| 账单币种 | CNY 87 · USD 81 |
| 报价币种 | CNY 70 · USD 98（需汇率换算 58.3%） |
| 汇率 | 1 USD = 6.669566 CNY（2026-10-31，open.er-api.com） |
| 聚合快照 | models.dev 235 厂商 / 8938 模型，抓取 2026-10-31T12:14Z |
| 路由 | 6 条（新增 `/sources/`） |

## 二、门禁（Hermes 亲跑，非自述）

```
npm run typecheck   → Result (27 files): 0 errors / 0 warnings / 0 hints   RC=0
npm test -- --run   → Test Files 8 passed (8) · Tests 120 passed (120)     RC=0
npm run build       → 6 page(s) built                                      RC=0
cli.mjs verify      → 严重 0 / 提醒 23 · 结论：通过（退出码 0）            RC=0
cli.mjs verify --check-sources → 探测 10 URL · 可达 5 · 提醒 5 · RC=0
cli.mjs drift       → 对拍 122 条 official · 匹配 92 · 未匹配 30 · RC=0（只报告）
```

## 三、变异验证（证明门禁会翻红，不是摆设）

| 变异 | 结果 |
|---|---|
| 删除 `src/data/generated/fx.generated.json` → build | **RC=1**，`Could not resolve '../data/generated/fx.generated.json'`；恢复后 SHA-256 一致、build 回绿 |
| 把聚合首条 `provenance` 改成 `official` → verify | **RC=1**，报 3 条严重：`官方核验条目不得填写 aggregateSource` / `aggregateFetchedAt` / `报价币种必须与账单币种一致`；恢复后 RC=0 |
| Codex 侧补充验证（其报告中记录） | 负价格变异 → 3 failed / verify 严重；official 伪装 aggregate 变异 → schema 测试翻红；均恢复 |

## 四、展示规则实测（构建产物逐行核对）

对 `dist/api-pricing/index.html` 全部 **168 行**逐行用数据文件比对：

| 检查项 | 结果 |
|---|---|
| `billingCurrency=USD` 的行，主价格以 `$` 开头 | 81 / 81 通过，0 例外 |
| 上述行必须同时含 `≈` 与「估算」 | 0 例外 |
| `billingCurrency=CNY` 的行，主价格以 `¥` 开头 | 87 / 87 通过 |
| 上述行不得出现汇率估算字样 | 0 例外 |
| official + CNY 行必须有「官方原价」 | 0 缺失 |
| aggregate 行不得出现「官方原价」 | **0 命中** |
| 全站 `官方原价 ¥`（把 USD 估算写成官方人民币价） | **0 次** |
| 免责文案「汇率随时变化 / 不准确」 | 各 3 处（api-pricing / calculator / methodology / sources 同源常量） |

计算器实测（浏览器真跑）：

- 选 `claude-fable-5-1`（USD）→ 主值 `$15.00`，副行 `≈ ¥100.04（按 6.6696 估算 · 2026-10-31）`，附「账单以美元为准」
- 选 `deepseek-deepseek-flash-idle`（CNY）→ 主值 `¥1.40`，标注「官方原价 · 人民币挂牌，无需换汇」，无估算字样
- 运行期错误捕获数组为空

## 五、浏览器实测

本地 `dist/` + `python -m http.server 4331`：

| 项 | 结果 |
|---|---|
| 6 路由 × 1440×900 / 375×812 | 全部 200，横向溢出 **0**，h1 全非空 |
| 移动端表格 | 容器 `overflow-x:auto`（2198 vs 366），页面级溢出 0，标准横滑 |
| 筛选：provenance=aggregate | 可见行 46（对得上 aggregate 计数） |
| 筛选：provider=zhipu | 可见行 43（对得上 verify 的 zhipu 43） |
| 搜索：`glm-5.3` | 6 行 |
| 排序：inputPrice | 前 6 行全部为 `$` 段（USD 组在前），组内升序；跨币种不排名 |
| 运行期 JS 错误 | 0 |

注：筛选需要 `input` 事件（第一次只用 `change` 事件时行数不变，是测试脚本的问题，不是页面缺陷；补发 `input` 后立即生效）。

## 六、对手方审计

Codex（`gpt-5.6-sol`，reasoning high）做了独立对抗审计，产出 `review-result.md`：

- 修掉 4 个真实缺陷：MiniMax 用已划线标准价当实付价（高报 2 倍）、aggregate 测试假覆盖、`publish --json` 输出非法 JSON、Windows 下 `publish` 无法启动 npm。
- 提出 2 项架构级问题并交由编排层裁定：
  - **R-02** `billingCurrency` 语义漂移 → 裁定「拆分 `reportedCurrency`」，已返工。
  - **R-06** `verify` 缺来源可达性 → 裁定「默认关闭的独立开关，永不进发布门禁」，已返工。
- 用户追加需求 **R-03**（国际厂商美元为主 + 人民币估算）→ 已返工。

## 七、仍未闭合 / 已知限制

1. **Kimi / 小米 / 阶跃 / Cohere / Meta 仍是 aggregate**：官方定价页为 JS 渲染或无可直取的价格表；Cohere 的 Standard Vault 按实例小时计费，与 per-token 不同量纲，不强行折算。
2. **可达性抽查结果受本机网络影响**：同日两次运行分别 5 / 3 条超时，所以它被刻意排除在发布门禁之外。
3. **汇率不是实时行情**：单点快照（open.er-api.com），页面全程标「估算 · 不准确」。
4. **Token Plan 仍为空集合**：没有找到可逐条核实的套餐页，不做演示数据。
5. 表格信息密度偏高（价格副行较长、`Cache read` 列头仍是英文），属可读性打磨项，不影响数据正确性。

## 八、结论

**通过。** 需求（人民币比较 → 原币种原价 + 人民币估算、15 家厂商、数据更新脚本、whyzero 改名暂缓）全部落地；门禁、变异、浏览器三层实测均为真实运行结果；两项架构问题由 Codex 提出、编排层裁定、编码体返工后闭合。
