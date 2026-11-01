#!/usr/bin/env bash
# 构建并把比价站发布到 GitHub Pages 站点仓（yzx4036.github.io）的**子路径**下。
#
# 站点仓布局（比价站只是其中一个子页面，根目录留给通用主页）：
#   /                     <- 通用主页（来自 site-root/，只覆盖同名文件，从不删除）
#   /token-price/         <- 本仓库构建产物（每次整体替换）
#   /CNAME                <- 自定义域名，域名级，必须在站点仓根目录
#   /.nojekyll            <- 必须存在，否则 Jekyll 吞掉 _astro
#
# 为什么不是「私有仓内 Actions 直接发布」：GitHub Pages 在**私有仓**上需要
# Pro/Team/Enterprise，免费账号会返回 422 "Your current plan does not support
# GitHub Pages for this repository"。所以采用「私有源码仓 + 公开站点仓」双仓。
#
# 用法：
#   bash scripts/deploy-site.sh                     # 构建 + 发布到 /token-price/
#   SITE_SUBPATH=sub bash scripts/deploy-site.sh    # 换子路径
#   SITE_DIR=/path/to/site bash scripts/deploy-site.sh
#   SKIP_PUSH=1 bash scripts/deploy-site.sh         # 只落盘不推
#   SKIP_DNS_CHECK=1 bash scripts/deploy-site.sh    # DNS 未生效时强行发布
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

SITE_REMOTE="${SITE_REMOTE:-https://github.com/yzx4036/yzx4036.github.io.git}"
SITE_DIR="${SITE_DIR:-$(cd "$REPO_ROOT/.." && pwd)/yzx4036.github.io}"
# 发布在站点仓子路径下，base 必须与子路径一致，否则资源与站内链接全 404
SITE_SUBPATH="${SITE_SUBPATH:-token-price}"
# 无 tty（后台/管道）时 `node` 是 winpty 包装层，会拒跑并打印 "stdin is not a tty"。
# 统一走 node.exe 真身，避免门禁假红。
NODE_BIN="$(command -v node.exe 2>/dev/null || command -v node)"
export PUBLIC_BASE_PATH="${PUBLIC_BASE_PATH:-/$SITE_SUBPATH}"

echo "==> 门禁：typecheck / test / build（base=$PUBLIC_BASE_PATH）"
npm run typecheck
npm test -- --run
npm run build

# 产物门禁：六条路由必须各自产出预渲染 HTML，且站内链接带 base 前缀
echo "==> 产物门禁：预渲染与 base 前缀"
"$NODE_BIN" scripts/verify-static-build.mjs --dist dist --base "/$SITE_SUBPATH/"

if [ ! -f "$REPO_ROOT/dist/index.html" ]; then
  echo "ERROR: dist/index.html 不存在，构建未产出" >&2
  exit 1
fi

# 配了自定义域名就必须先确认 DNS 已指向 GitHub Pages：
# 否则推上去的 CNAME 会让站点 404，而且 yzx4036.github.io 还会被 301 到那个打不开的域名。
# 注意：node 是原生 Windows 程序，不认 MSYS 风格的 /e/... 路径，
# 所以这里统一用相对路径（当前目录已经是仓库根），否则 require 会失败并静默放过检查。
if ! CUSTOM_DOMAIN="$("$NODE_BIN" -e "
  const fs = require('node:fs');
  if (!fs.existsSync('./site.config.json')) { console.log(''); process.exit(0); }
  const raw = fs.readFileSync('./site.config.json', 'utf8');
  const parsed = JSON.parse(raw);
  console.log(parsed.customDomain || '');
")"; then
  echo "ERROR: 读不出 site.config.json 里的域名配置，拒绝发布（不允许静默跳过 DNS 检查）" >&2
  exit 1
fi

if [ -n "$CUSTOM_DOMAIN" ]; then
  echo "==> 自定义域名：$CUSTOM_DOMAIN，检查 DNS"
  if ! "$NODE_BIN" scripts/site-domain.mjs --check; then
    if [ "${SKIP_DNS_CHECK:-0}" = "1" ]; then
      echo "WARN: DNS 未就绪，但 SKIP_DNS_CHECK=1，继续发布（站点可能 404）" >&2
    else
      echo "ERROR: DNS 尚未指向 GitHub Pages，发布会让站点 404。" >&2
      echo "       先把 A 记录/CNAME 配好并等待生效；确认要强行发布就加 SKIP_DNS_CHECK=1。" >&2
      exit 1
    fi
  fi
fi

# 版本号必须在 cd 到站点仓之前取（之后 cwd 变了就读不到本仓 package.json）
VERSION="$("$NODE_BIN" -p "require('./package.json').version" 2>/dev/null || echo unknown)"

if [ ! -d "$SITE_DIR/.git" ]; then
  echo "==> 站点仓不存在，克隆到 $SITE_DIR"
  git clone "$SITE_REMOTE" "$SITE_DIR"
fi

# 子站整体替换到 <site>/<subpath>，主页只覆盖不删除（site-publish.mjs 里保证）
echo "==> 发布到站点仓子路径：/$SITE_SUBPATH/"
# node 是原生 Windows 程序，不认 MSYS 的 /e/... 路径（会当成 E:\e\...），必须转成原生路径
SITE_DIR_NODE="$(cygpath -w "$SITE_DIR" 2>/dev/null || printf '%s' "$SITE_DIR")"
"$NODE_BIN" scripts/site-publish.mjs \
  --dist dist \
  --site "$SITE_DIR_NODE" \
  --subpath "$SITE_SUBPATH" \
  --home site-root \
  --domain "$CUSTOM_DOMAIN"

cd "$SITE_DIR"
git add -A
if git diff --cached --quiet; then
  # 注意：内容无变化不等于不用推送——上一次可能因为网络失败留下了未推送的提交。
  # 这里必须往下走到 push，否则会静默漏发。
  echo "==> 内容无变化，跳过提交"
else
  git commit -q -m "deploy: token-price v$VERSION -> /$SITE_SUBPATH/ ($(date +%Y-%m-%d\ %H:%M))"
  echo "==> 提交完成：$(git log --oneline -1)"
fi

if [ "${SKIP_PUSH:-0}" = "1" ]; then
  echo "==> SKIP_PUSH=1，未推送"
  exit 0
fi

git push origin HEAD
if [ -n "$CUSTOM_DOMAIN" ]; then
  echo "==> 已推送，等待 Pages 构建后访问 https://$CUSTOM_DOMAIN/$SITE_SUBPATH/"
else
  echo "==> 已推送，等待 Pages 构建后访问 https://yzx4036.github.io/$SITE_SUBPATH/"
fi

# ---------- IndexNow：主动通知搜索引擎重抓 ----------
# 放在 push 之后，且必须先等 key 文件真正可访问：IndexNow 收到提交后会立刻
# 去抓 key 文件验证所有权，Pages 还没构建完时抓到的就是 404，提交直接 403。
#
# ⚠️ 此处 cwd 已被上面的 `cd "$SITE_DIR"` 切到站点仓，脚本与配置都在源仓，
#    所以一律用 $REPO_ROOT 的绝对路径，不能写 ./scripts 或 ./site.config.json。
if [ "${SKIP_INDEXNOW:-0}" != "1" ] && [ -n "$CUSTOM_DOMAIN" ]; then
  echo "==> IndexNow：等待 key 文件上线"
  # node 是原生 Windows 程序，不认 MSYS 的 /e/... 路径（会当成 E:\e\...），
  # 直接传 $REPO_ROOT/site.config.json 会静默读不到、误报「未配置 key」。
  # 这里统一转成原生路径，与上面 SITE_DIR_NODE 同一处理方式。
  REPO_ROOT_NODE="$(cygpath -w "$REPO_ROOT" 2>/dev/null || printf '%s' "$REPO_ROOT")"
  KEY=$("$NODE_BIN" -e "
    const fs = require('node:fs');
    try { console.log(JSON.parse(fs.readFileSync(process.argv[1],'utf8')).indexNowKey || ''); }
    catch { console.log(''); }
  " "$REPO_ROOT_NODE/site.config.json")
  if [ -z "$KEY" ]; then
    echo "   未配置 indexNowKey，跳过（npm run indexnow:key 生成）"
  else
    KEY_URL="https://$CUSTOM_DOMAIN/$KEY.txt"
    READY=0
    for i in $(seq 1 20); do
      # ⚠️ 不能写 `|| echo 000`：Windows 下 curl -o /dev/null 可能带非零退出码，
      # 但 stdout 已经打出了 "200"，于是追加成 "200000"，判断永远不成立。
      # 只取 stdout，取不到才认为是失败。
      CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$KEY_URL" 2>/dev/null || true)
      [ -z "$CODE" ] && CODE=000
      if [ "$CODE" = "200" ]; then READY=1; break; fi
      sleep 6
    done
    if [ "$READY" = "1" ]; then
      echo "==> IndexNow：key 文件已可访问，提交 sitemap 全部页面"
      "$NODE_BIN" "$REPO_ROOT_NODE/scripts/indexnow.mjs" --submit --sitemap "$SITE_DIR_NODE/sitemap.xml" \
        || echo "WARN: IndexNow 提交失败（不影响站点发布）"
    else
      echo "WARN: 等待 $KEY_URL 超时，跳过 IndexNow（Pages 构建慢时可稍后手动跑 npm run indexnow）" >&2
    fi
  fi
fi
