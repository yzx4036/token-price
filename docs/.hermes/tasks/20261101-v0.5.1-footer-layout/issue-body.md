## 现象（用户报告）

页脚（`.site-footer`）**总是固定在最前**。

## 复现尝试：未能复现（如实记录）

对 **6 条路由 × 2 个视口**（1440×900 / 375×812）+ 站点根主页逐页实测，页脚均为正常静态流式布局：

| 路由 | 视口 | footer top | position | footer top == main 底部 |
|---|---|---|---|---|
| `/` | 1440 | 1562 | `static` | ✅ 相等 |
| `/` | 375 | 2514 | `static` | ✅ 相等 |
| `/api-pricing/` | 1440 | 11108 | `static` | ✅ 相等 |
| `/api-pricing/` | 375 | 51649 | `static` | ✅ 相等 |
| `/plans/` | 1440 | 3974 | `static` | ✅ 相等 |
| `/plans/` | 375 | 17812 | `static` | ✅ 相等 |
| `/calculator/` | 1440 | 920 | `static` | ✅ 相等 |
| `/sources/` | 1440 | 3380 | `static` | ✅ 相等 |
| `/methodology/` | 1440 | 2577 | `static` | ✅ 相等 |
| 根站 `/` | 1440 / 375 | 430 / 334 | `static` | — |

DOM 顺序也正常：`HEADER.site-header → MAIN.shell → FOOTER.site-footer`。

## 代码层证据

- 全站样式中**没有** `position: sticky` / `position: fixed` 作用在 footer 上；`src/components/`、`src/views/` 内也无 sticky/fixed。
- 仅有的三处 `z-index` 都不是 footer：
  - `.site-header` `z-index: 20`（`position: relative`）
  - `.nav-links.is-open` `z-index: 30`（移动端导航下拉，`position: absolute`）
  - `.fold-cell .detail-list` `z-index: 15`（表格行内详情浮层，`position: absolute`）
- footer 唯一的非流式行为在 `@media print` 里 `display: none`（打印时不显示），不影响屏幕。

## 可能的成因（待用户确认，不猜死）

1. **不是位置问题而是层级问题**：表格行内「详情」浮层（`z-index: 15`）在某些滚动位置覆盖到页脚，视觉上像页脚被压在最前 / 最底层。
2. **微信内置浏览器**下 `backdrop-filter` + 固定头部的合成层异常。
3. 用户看的是**改名/二维码上线前的旧构建**，或浏览器缩放 / 深色模式下 footer 背景与内容同色造成的错觉。
4. 极短页面（如 `/calculator/` 桌面 1038px 高）在高视口下页脚不贴底，被读成「位置不对」。

## 待补充信息（否则无法定位）

- [ ] 浏览器与版本、操作系统
- [ ] 出问题的具体路由 + 视口尺寸（或截图）
- [ ] 是否微信内置浏览器 / 手机型号
- [ ] 页面缩放比例、是否开深色模式
- [ ] 「最前」是指「跑到页面顶部」还是「浮在内容之上」——这两种是完全不同的成因

## 验收判据（定位后补）

- [ ] 在报告的环境下，footer 位于文档流末尾，不与任何内容重叠
- [ ] `document.querySelector('.site-footer')` 的 `position` 仍为 `static`，或若改为 sticky 需有明确设计理由
- [ ] 加一条守卫测试：footer 的 DOM 顺序必须是 header → main → footer
- [ ] 6 路由 × 2 视口复测，footer top 与 main 底部对齐
