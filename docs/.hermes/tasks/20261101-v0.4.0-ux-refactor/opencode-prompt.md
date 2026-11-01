你在仓库 `<repo>`（Vite 8 + Vue 3.5 + TS，构建期预渲染六路由）。

先完整读 `docs/.hermes/tasks/20261101-v0.4.0-ux-refactor/requirements.md`，那是本次任务的唯一真源，含：
- §0 目标、§1 七条铁律、§2 改造前实测基线、§3–§5 三项需求规格（#4 国内外筛选 / #2 表头排序 / #1 信息密度重构）、§6 验收判据（含量化指标）、§7 交付物。

按 §8 交付纪律：逐条自查 §6，把**实测数字**写进根目录 `IMPLEMENT-NOTES.md`，做不到的如实写原因。

重点提醒（这些是最容易出错的）：
1. **禁改 `src/data/**`**，禁改部署脚本（`synced: deploy-site.sh / site-publish.mjs / verify-static-build.mjs / site.config.json`），禁任何 git 操作。
2. **预渲染不得退化**：六路由仍要产出带真实价格的静态 HTML，`scripts/verify-static-build.mjs` 的 P1–P5 必须继续通过。新增的筛选/排序状态**只能在 `onMounted` 后从 URL 读**，禁止在 setup 顶层读 `location`（会 hydration mismatch）。
3. **跨币种不排名**这条产品口径必须保留：排序时先按 USD/CNY 分组，组内再排。
4. §2 的基线数字是实测的，改完必须对照 §6.1 的目标值，用浏览器真实测量再填 `IMPLEMENT-NOTES.md`，不要估。
5. 现有 234 项测试一条不许删或 skip，只许新增。

完成后报告：实际通过了 §6 的哪几条、哪几条没做到及原因、typecheck / test / build / 产物门禁 四条命令的真实输出。
