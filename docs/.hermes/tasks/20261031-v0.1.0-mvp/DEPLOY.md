# v0.1.0 部署记录（2026-10-31）

## 结论

线上地址：**https://yzx4036.github.io/**（Pages `status=built`，`https_enforced=true`）

## 私有仓 + Pages 的硬阻塞（实测，非推测）

要求「私有仓 + 部署到 github.io」时，第一步就撞上计划限制：

```
POST /repos/yzx4036/token-price/pages  {"build_type":"workflow"}
→ 422 {"message":"Your current plan does not support GitHub Pages for this repository."}
```

依据：GitHub Pages 在**私有仓**上需要 GitHub Pro / Team / Enterprise；免费计划只允许公开仓发布。
账号通过 API 拿不到 `plan` 字段（OAuth token 无 `user` scope），但 422 的报错文本已是直接证据。

## 采用的方案（双仓拆分）

| 仓 | 可见性 | 内容 |
|---|---|---|
| `yzx4036/token-price` | 私有 | 源码 / 测试 / 数据 / CI 门禁 |
| `yzx4036/yzx4036.github.io` | 公开 | 仅 `dist/` 产物，Pages 从 `master` 根目录发布 |

- 发布命令：`bash scripts/deploy-site.sh`（脚本内置 typecheck + test + build，任一红即中止）。
- `base` 取 `/`：站点位于用户站点仓的域名根路径。
- 站点仓首次发布提交：`172f6dd`。

### 与需求任务书的偏差（如实登记）

`requirements.md` §4 要求「提供 `.github/workflows/deploy.yml`，使用官方 Pages Actions 构建发布」。
该条在「私有仓」前提下**不可实现**（计划限制），故：

- 删除 `deploy.yml`（留着会让每次 push 都跑一次注定失败的发布）；
- 新增 `.github/workflows/ci.yml`，只跑 typecheck / test / build 门禁；
- 发布改由 `scripts/deploy-site.sh` 承担（用本地 gh 凭据，无需新增 PAT 密钥）。

若将来升级到 GitHub Pro，可直接回到单仓 Actions 发布（把 `ci.yml` 的 build 步骤接
`upload-pages-artifact` + `deploy-pages` 即可）。

## 线上验收读数（编排层亲跑）

| 项 | 读数 |
|---|---|
| `GET /` | 200，`<title>AI API 与 Token Plan 比价 | Token Price</title>`，3103 bytes |
| `/api-pricing/` `/plans/` `/calculator/` `/methodology/` | 全部 200 |
| `/favicon.svg`、`/_astro/data.DtbCJiMZ.css` | 200 |
| 桌面 1440×900 × 5 路由 | 横向溢出 0，运行期 error 0，失败资源 0 |
| 移动 375×812 × 5 路由 | 横向溢出 0，运行期 error 0，失败资源 0 |
| 站点仓是否泄露源码 | 首页不含 `api-prices.ts` 等源文件字样（0 命中） |
