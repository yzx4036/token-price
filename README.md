# Token Price

面向中文开发者的 AI API 与 Token/Coding Plan 静态比价站。**主列按厂商账单币种**：国内厂商直接展示人民币官方原价，国际厂商以美元原价为主、人民币只作为「≈ 按某日汇率估算」的副列（汇率随时变化，不准确）。每条价格都标注溯源等级（官方核验 / 聚合数据），缺失价格不会被猜测补齐。

## 本地开发

要求 Node.js 22.23.4+ 与 npm 9.6.5+。

```bash
npm ci
npm run dev
```

质量门禁：

```bash
npm run typecheck
npm test -- --run
npm run build
node scripts/data/cli.mjs verify
```

`npm run build` 默认按根路径输出纯静态文件到 `dist/`。模拟 GitHub Pages 仓库子路径（bash）：

```bash
PUBLIC_BASE_PATH=/token-price npm run build
```

PowerShell：

```powershell
$env:PUBLIC_BASE_PATH='/token-price'; npm run build
```

## 如何更新数据（不需要懂前端）

所有数据维护只有一个入口：`node scripts/data/cli.mjs`。下面每条命令都可以直接复制到终端里跑，路径是仓库根目录。

### 0. 先记住三件事

1. **不要手改 `src/data/generated/` 里的文件**。它们由脚本生成，手改会被下次 `rate` / `pull` 覆盖。
2. **要改价格，改 `src/data/entries/api.json`**，或者用 `add` 命令（推荐，会帮你校验）。
3. **改完一定要跑 `verify`**，它不通过就不要提交。

### 1. 看一眼有哪些命令

```bash
node scripts/data/cli.mjs
node scripts/data/cli.mjs add --help
```

无参数或 `--help` 会打印中文命令表与示例，退出码 0。

### 2. 更新汇率（每周或发版前跑一次）

```bash
node scripts/data/cli.mjs rate
```

输出示例：

```text
== 汇率更新 ==
1 USD = 6.669566 CNY（汇率日期 2026-10-31，来源 open.er-api.com）
已写入 src/data/generated/fx.generated.json（抓取时间 2026-10-31T11:39:52.742Z）
```

- 主源 `open.er-api.com` 失败会自动换 `api.frankfurter.app`。
- 两个源都失败：命令退出码非 0，**文件不会被改**。
- 页面上所有「按 X 汇率估算」都读这份文件，代码里没有写死的汇率。

### 3. 更新聚合补位数据（每月跑一次）

```bash
node scripts/data/cli.mjs pull
```

它会下载 models.dev 快照到 `.cache/models-dev.json`，打印厂商/模型统计，然后重建 `src/data/generated/aggregate.generated.json`。

- 聚合条目一律标 `aggregate`，页面显示「聚合数据 · 未逐条核官方」。
- 聚合条目**永远不会**覆盖同 id 或同模型的 `official` 条目。
- 只给白名单里的厂商补位（OpenAI、xAI、Mistral、Cohere、Meta、Kimi、智谱、小米、阶跃），已官方核验的厂商不在白名单里。

### 4. 新增一条价格（最常用）

先把官方定价页打开，把数字抄下来，然后：

```bash
node scripts/data/cli.mjs add \
  --provider deepseek \
  --model deepseek-flash \
  --input 1 \
  --output 4 \
  --cache-read 0.02 \
  --billing-currency CNY \
  --source-url https://api-docs.deepseek.com/zh-cn/quick_start/pricing \
  --verified-at 2026-10-31
```

- `--provider` 取值见 `src/data/providers.json`（`deepseek`、`aliyun`、`volcengine`、`minimax`、`anthropic`、`google`、`openai`、`xai`、`mistral`、`cohere`、`meta`、`moonshot`、`zhipu`、`xiaomi`、`stepfun`）。
- id 会自动生成成 `厂商id-模型名`（例如 `deepseek-deepseek-chat`）。含中文的模型名请显式传 `--id`。
- 价格单位统一是**每 1M tokens**。
- `--billing-currency` 缺省按厂商地区推断（国内 CNY / 国际 USD），但建议显式写。它表示**厂商实际账单币种**。
- 价格数字本身的币种用 `--reported-currency`，缺省等于账单币种；`official` 条目两者必须一致（官方页标 USD 就都 USD，标 CNY 就都 CNY），不一致会被拒绝。
- 从第三方聚合抄来的数字必须加 `--provenance aggregate --aggregate-source models.dev`，不要冒充满官方。聚合源对国内厂商也以 USD 发布，这类条目应是 `--billing-currency CNY --reported-currency USD`。

同 id 已存在时会拒绝并提示；确认要覆盖就加 `--force`（会打印旧值和新值对比）。

### 5. 校验数据（每次改完必跑）

```bash
node scripts/data/cli.mjs verify
```

它会检查：schema、厂商是否存在、id 是否唯一、official 是否有 https 来源、aggregate 是否有聚合源与抓取日期、official 的 `reportedCurrency` 是否等于 `billingCurrency`、汇率与快照是否过期，并打印厂商/条目/溯源统计（账单币种与报价币种分开）。有严重问题时退出码 1。

#### 5.1 来源可达性抽查（可选，默认关闭）

```bash
node scripts/data/cli.mjs verify --check-sources
node scripts/data/cli.mjs verify --check-sources --json
```

对去重后的 official `sourceUrl` 串行探测：单条超时 8 秒、跟随重定向、最多 12 个唯一 URL。HTTP 403、正文不足 500 字符的 JS 空壳页都只算**提醒**，`--json` 里多一个 `reachability: { checked, ok, failed }` 字段。

- **这是抽查，不是发布门禁**：任何可达性失败都不会改变退出码，退出码仍只由 schema 与完整性决定。
- `publish` 不调用该开关，发布流程保持无网络、可复现。
- 调试时可用环境变量 `TOKEN_PRICE_REACHABILITY_URLS`（逗号分隔）覆盖探测清单，例如 `TOKEN_PRICE_REACHABILITY_URLS=http://127.0.0.1:9/x`。

### 6. 对拍官方值与聚合值（只报告，不改数据）

```bash
node scripts/data/cli.mjs drift
```

输出「本地 official 值 vs 聚合值」差异表（阈值 5%），以及聚合源里找不到对应模型的条目数。它**绝不改写任何文件**，用来发现「官方涨价了但站点还没更新」。

### 7. 一键校验 + 构建 + 发布

```bash
node scripts/data/cli.mjs publish
```

依次执行 `verify` → `npm run typecheck` → `npm test -- --run` → `npm run build` → `bash scripts/deploy-site.sh`。任一步失败立即中止，退出码非 0。

所有命令都支持 `--json` 输出机器可读结果：

```bash
node scripts/data/cli.mjs verify --json
```

### 7.5 怎么核对官方价格（遇到 JS 渲染页时）

很多厂商定价页是 JS 渲染的，`curl` 抓下来没有价格表。这类文档站通常还提供 **Markdown 原文**：页面 URL 后加 `.md`，或先读站点根目录的 `llms.txt` 索引。本期实测可直接拿到价格表的官方源：

| 厂商 | 官方源 | 币种 |
|---|---|---|
| 智谱 GLM | `https://docs.bigmodel.cn/cn/guide/start/pricing.md` | CNY |
| OpenAI | `https://platform.openai.com/docs/pricing.md` | USD |
| xAI | `https://docs.x.ai/docs/pricing.md` | USD |
| Mistral | `https://docs.mistral.ai/inference/pricing/` | USD |
| Anthropic | `https://platform.claude.com/docs/en/about-claude/pricing` | USD |
| DeepSeek | `https://api-docs.deepseek.com/zh-cn/quick_start/pricing` | CNY |
| MiniMax | `https://platform.minimax.cn/docs/pricing/overview` | CNY |
| Google | `https://ai.google.dev/gemini-api/docs/pricing` | USD |

抓到官方数字后用 `add` 写入并标 `--provenance official`。两条纪律：

- **官方页是 USD 就记 USD，是 CNY 就记 CNY**，不许用汇率反推「官方人民币价」再标 official；
- 官方页上由平台转售的第三方模型（如 Mistral 页上的 Z.ai GLM、DeepSeek）不是该厂商自有模型，不要记到该厂商名下。

核不到官方的厂商保持 `aggregate`，页面会显式标「未逐条核官方」，这比编一个 official 强。

### 常见错误对照表

| 报错 | 原因 | 怎么办 |
|---|---|---|
| `缺少参数 --input` | 少传必填参数 | 按 `add --help` 补齐 |
| `--input 不能为负数` | 价格填了负数 | 未知价格就别传该参数，不要填 -1 |
| `--source-url 必须使用 https://` | 用了 http 或不是 URL | 换成官方 https 定价页 |
| `--verified-at 必须是 YYYY-MM-DD` | 日期格式不对 | 写 `2026-10-31` 这种格式 |
| `--verified-at 不是真实存在的日期` | 写了 2026-02-30 | 检查月份天数 |
| `provenance=aggregate 时必须提供 --aggregate-source` | 标了聚合却没写聚合源 | 加 `--aggregate-source models.dev` |
| `条目 xxx 已存在` | id 撞了 | 加 `--force` 覆盖，或换个模型名 |
| `未知厂商 id：xxx` | provider 拼错 | 用 `src/data/providers.json` 里的 id |
| `写入前校验失败，文件未修改` | 新条目让整个文件不合法 | 按提示修参数，原文件没被动过 |
| `verify` 退出码 1 | 数据有严重问题 | 按打印的 `[严重]` 清单修，再跑一次 |

## 数据文件说明

| 路径 | 谁维护 | 说明 |
|---|---|---|
| `src/data/providers.json` | 人 | 厂商元数据：id、中英文名、地区、官网、定价页、聚合源 key |
| `src/data/entries/api.json` | 人 + CLI `add` | 价格真源（官方核验 + CLI 新增条目） |
| `src/data/entries/plans.json` | 人 | Token Plan 真源（当前为空集合，不用演示数据填充） |
| `src/data/generated/fx.generated.json` | CLI `rate` | 汇率生成物，**必须入库** |
| `src/data/generated/aggregate.generated.json` | CLI `pull` | 聚合补位生成物，**必须入库** |
| `src/lib/schema.ts` | 人 | 唯一 schema：页面和 CLI 共用同一份校验 |

数据纪律：

1. 只采用厂商官方定价或文档页面；拿不到官方页就标 `aggregate`，并写明聚合源与抓取日期。
2. official 条目必须能在官方页上找到对应数字，`sourceUrl` + `verifiedAt` 随条目记录。
3. 价格单位固定为「每 1M tokens」，不同条件（峰谷、批量、长上下文、优先服务）拆成独立条目或写进计价口径。
4. 无法确认的数字写 `null`；不填演示价格。
5. 聚合条目不得覆盖同 id 或同模型的 official 条目（`mergeApiPrices` 强制，`verify` 会列出被丢弃的条目）。
6. 币种分两个字段：`billingCurrency` 是厂商实际账单币种，`reportedCurrency` 是这条数字本身以什么币种表达。official 条目两者必须相同（schema 强制）；聚合条目由聚合源以 USD 发布，国内厂商即「账单 CNY + 报价 USD」，页面标「聚合数据 · 聚合源 USD 折算」，绝不标「官方原价」。

## 自定义域名（方案：华为云域名 + CNAME，不备案）

### 为什么不用备案

备案（ICP）绑定的对象是**境内接入服务商**：管局要看到接入商出具的核验单才受理。本站托管在
GitHub Pages，解析指向 GitHub 的 Fastly 海外节点（实测 `yzx4036.github.io` →
`185.199.108/109/110/111.153`），境内没有接入商，所以**既不需要备案，也备不了**。

但有一件必须做的事：**域名实名认证**。在国内注册商（华为云、阿里云等）买的域名，工信部要求实名，
不做会被置为 serverHold 暂停解析——这跟备案是两件事，别混。

> ⚠️ 同一个域名如果要给**微信小程序**当 request 合法域名，那**必须**已 ICP 备案。
> 本站是纯静态、无后端请求，所以不受影响；以后要做小程序后端，得另走备案 + 境内服务器。

### 配 DNS

华为云「云解析 DNS」按域名形态加记录，**四条 A 缺一不可**（只配一条 GitHub Pages 会判未配置）：

| 域名形态 | 记录类型 | 主机记录 | 记录值 |
|---|---|---|---|
| apex 裸域 `example.com` | A | `@` | `185.199.108.153` |
| | A | `@` | `185.199.109.153` |
| | A | `@` | `185.199.110.153` |
| | A | `@` | `185.199.111.153` |
| 子域 `www.example.com` | CNAME | `www` | `yzx4036.github.io.` |

### 启用

域名只有一个真源：`site.config.json`（**不要**去 `public/` 手放 CNAME，会和配置打架）。

```bash
npm run domain:set -- example.com   # 写入配置并打印该配的 DNS 记录
npm run domain:check                # 查解析是否已指向 GitHub Pages（未就绪退出码 1）
npm run publish                     # verify → typecheck → test → build → 部署
```

`astro build` 之后会自动把域名写成 `dist/CNAME`；换域名只需再跑一次 `domain:set`，**代码零改动**。

### 两个必须知道的坑

1. **顺序不能反**：GitHub Pages 一旦在仓库里看到 `CNAME`，就会把 `yzx4036.github.io`
   301 到新域名。DNS 还没生效就发布，站点会直接 404 且旧地址也被重定向走。
   `scripts/deploy-site.sh` 因此会先跑 `domain:check`，未就绪就**中止发布**；
   确认要强行发布才加 `SKIP_DNS_CHECK=1`。
2. **HTTPS 证书要等**：切域名后 GitHub 会重新签发 Let's Encrypt 证书，通常几分钟到几小时。
   期间访问可能报证书错误，等它签发完成再到 Settings → Pages 勾上 **Enforce HTTPS**。

回退到 github.io：`npm run domain` 传 `--clear`（即 `node scripts/site-domain.mjs --clear`）后再发布。

## 部署架构（私有源码仓 + 公开站点仓）

线上地址：**https://yzx4036.github.io/**

GitHub Pages 在**私有仓**上需要 Pro/Team/Enterprise；本账号免费计划下对私有仓调用 Pages API 会返回
`422 Your current plan does not support GitHub Pages for this repository`（已实测）。因此采用双仓：

| 仓 | 可见性 | 职责 |
|---|---|---|
| `yzx4036/token-price`（本仓） | 私有 | 源码、测试、数据、CI（`.github/workflows/ci.yml`，只跑门禁不发布） |
| `yzx4036/yzx4036.github.io` | 公开 | 仅存放 `dist/` 构建产物，Pages 从 `master` 根目录发布 |

发布：

```bash
bash scripts/deploy-site.sh
# 或
node scripts/data/cli.mjs publish
```

脚本会先跑 typecheck / test / build（任一红即中止），再把 `dist/` 同步到站点仓、提交并推送。
`SITE_DIR` 可指定站点仓本地路径，`SKIP_PUSH=1` 只落盘不推。

**为什么 base 是 `/`**：站点发布在用户站点仓（`<user>.github.io`）的域名根路径，所以 `PUBLIC_BASE_PATH=/`。
若将来改挂项目子路径（`/token-price/`），构建前设 `PUBLIC_BASE_PATH=/token-price` 并同步调整站点仓布局。

**自定义域名**：在站点仓 Settings → Pages 填域名并配 DNS；若要在每次发布中固定，把 `CNAME` 放进本仓
`public/`（会被 `astro build` 复制进 `dist/`）。本仓当前不预填未知域名。

所有站内链接均使用 Astro `BASE_URL`，支持根路径与非根路径构建。

## 范围与免责声明

本版没有服务端、数据库、账号、API Key、自动定时爬价与遥测。汇率随时变化，人民币数值为按某日汇率估算的参考值，不准确；最终账单以厂商原币种为准。计算结果不含税费、缓存存储费、工具调用等额外费用，不构成采购建议，最终价格与账单以厂商官方信息为准。
