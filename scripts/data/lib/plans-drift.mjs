import { CliError, PATHS, readJson } from './io.mjs';

/**
 * 订阅套餐价格漂移检测：只告警，绝不改数据。
 *
 * 为什么不做全自动改价：订阅价的变动往往是商务决策（改档位、改额度语义、
 * 换计量单位），不是改个数字。机器判定容易误伤，错了还看不出来。
 *
 * 判据故意做得极简：**当初录入的价格数字是否还作为价格出现在页面上**。
 * 不解析各家页面结构——那会因为任意一家改版就整套崩掉。
 *
 * 实测踩过的三个坑（都导致大量误报，逐条修掉）：
 * 1. 整段删 <script> → Kimi 这类把价格放在 JSON 里的页面全被判成「变了」。
 *    改为只删 <style>，脚本内容保留。
 * 2. React/Vue 的 `¥<!-- -->9.9` → 注释把符号和数字隔开，匹配不到。
 *    改为先抹掉 HTML 注释、再去标签。
 * 3. Next.js RSC 载荷里的 `"$1"` / `"$L2"` 被当成价格 token → 页面有假 token 就
 *    不再判为「纯 CSR」，进而误报。改为符号前紧跟引号或反斜杠的一律丢弃。
 */

// 订阅页/营销页见到 bot UA 会直接 403，所以用浏览器 UA；但**必须保留可识别身份**，
// 供站点方判断流量来源（与 api 抓取的 token-price-data-cli/0.2 保持同一个标识）。
/**
 * 「这一级拿到的是定价页」的最低价格 token 数。
 *
 * 实测教训：chatgpt.com/pricing 的 HTML 是 952KB 的 RSC 载荷，全页只有一处
 * `"ChatGPT Pricing > Consumer > Pro $100"`（埋点用的实验名），真实价格在客户端渲染。
 * 只找到 1 个价格 token 时按「有价」处理，会把 4 档套餐误报成「改价了」。
 * 官方定价页几乎不可能只列一个价位 —— 拿不到 2 个以上一律当**弱证据**：
 * 继续升级到下一级；最终仍是弱证据就判「无法判定」，绝不冒充漂移。
 */
const MIN_PRICE_TOKENS = 2;

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 '
  + 'token-price-data-cli/0.2 (+https://github.com/yzx4036/token-price)';

/**
 * 抓取候选链：静态 HTML → 官方 Markdown 变体 → 只读渲染代理（opt-in）。
 *
 * 为什么需要三级：
 * 1. 官方文档站几乎都提供 `.md` 原文（`/pricing` → `/pricing.md`），里面是干净的
 *    Markdown 管道表，表头「月付/季付/年付」直接决定列语义 —— 比反爬代理省一个量级。
 *    阿里云 Coding Plan 就是典型：HTML 里价格被组件吞掉，`.md` 里一张表全给。
 * 2. 营销页 / 控制台（kimi.com/coding、codebuddy.cn/pricing、bailian console）的
 *    价格只在客户端渲染，静态层无论如何拿不到，只能走渲染代理。
 * 3. 代理是外部依赖，因此默认关闭，由 `--reader` 显式开启：本地排查不依赖它，
 *    CI 的报告步骤开它，失败也只是退回「无法判定」而不是报假漂移。
 */
function markdownVariant(url) {
  try {
    const u = new URL(url);
    if (/\.md$/i.test(u.pathname)) return null;
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.origin}${path}.md${u.search}`;
  } catch {
    return null;
  }
}

export function planSourceCandidates(url, { reader = false } = {}) {
  const out = [{ url, via: 'html', accept: 'text/html,application/xhtml+xml' }];
  const md = markdownVariant(url);
  if (md) out.push({ url: md, via: 'md', accept: 'text/markdown,text/plain;q=0.9' });
  if (reader) out.push({ url: `https://r.jina.ai/${url}`, via: 'reader', accept: 'text/plain' });
  return out;
}

/**
 * 按候选链抓取，**第一个「解析得出价格」的来源胜出**；都不行就把每次尝试作为证据返回。
 * 返回 `{ raw, text, via, url, contentType, bytes, attempts }` 或 `{ error, attempts }`。
 * `raw` 给需要看标签/表格结构的调用方（tier-discovery 的 C1/C2），`text` 是归一化后的。
 */
export async function fetchPlanSource(url, { timeoutMs = 25_000, reader = false, fetchImpl = null } = {}) {
  const attempts = [];
  let fallback = null;
  const doFetch = fetchImpl ?? fetch;

  for (const candidate of planSourceCandidates(url, { reader })) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await doFetch(candidate.url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: { 'user-agent': BROWSER_UA, accept: candidate.accept },
      });
      if (!res.ok) {
        attempts.push({ via: candidate.via, url: candidate.url, status: res.status });
        continue;
      }
      const raw = await res.text();
      const text = normalizePage(raw);
      const tokens = extractPriceTokens(text).size;
      const priced = tokens >= MIN_PRICE_TOKENS;
      const contentType = res.headers?.get?.('content-type') ?? null;
      attempts.push({ via: candidate.via, url: candidate.url, status: res.status, bytes: text.length, priced, tokens });
      if (priced) {
        return { raw, text, via: candidate.via, url: candidate.url, contentType, bytes: text.length, tokens, attempts };
      }
      // 静态层没价（或只有 1 个 token 的弱证据）：先记下正文，继续试下一级
      if (fallback === null) fallback = { raw, text, via: candidate.via, url: candidate.url, contentType, bytes: text.length, tokens };
    } catch (error) {
      attempts.push({ via: candidate.via, url: candidate.url, error: error instanceof Error ? error.name : String(error) });
    } finally {
      clearTimeout(timer);
    }
  }

  if (fallback) return { ...fallback, attempts };
  return { error: attempts.map((a) => `${a.via}:${a.error ?? a.status}`).join(' / ') || 'FETCH_FAILED', attempts };
}


/** 页面归一化：保留脚本内的 JSON（价格常在里面），去掉样式与标签 */
export function normalizePage(html) {
  return String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#165;/g, '\u00a5')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

/**
 * 抽出页面上的「价格数字」集合。
 * 丢弃 JSON / RSC 里的引用型 `"$1"`、`"$L2"`：它们的字符前是引号或反斜杠。
 */
export function extractPriceTokens(text) {
  const tokens = new Set();
  const re = /([\u00a5$])\s*(\d[\d,]*(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const before = text[m.index - 1] ?? '';
    if (m[1] === '$' && (before === '"' || before === '\\')) continue;
    tokens.add(m[2].replace(/,/g, ''));
  }
  return tokens;
}

/**
 * 录入值在页面 token 里的等价写法。
 * 页面常把整数写成两位小数（¥40 / ¥40.00 都见得到），两种都要认。
 */
function candidatesFor(price) {
  const n = Number(price);
  const out = new Set([String(n), n.toFixed(2)]);
  if (Number.isInteger(n)) out.add(n.toFixed(0));
  else out.add(String(n).replace(/0+$/, '').replace(/\.$/, ''));
  return [...out];
}

/**
 * @param {object} options
 * @param {Array|null} [options.plans] 套餐数组（不传则读 plans.json）
 * @param {(url: string) => Promise<{text?: string, error?: string, attempts?: object[]}>} [options.fetchPage] 可注入
 * @param {number} [options.timeoutMs]
 * @param {boolean} [options.reader] 是否在静态层拿不到价格时回退到只读渲染代理（默认关）
 */
export async function runPlansDriftCommand({ plans = null, fetchPage = null, timeoutMs = 25_000, reader = false } = {}) {
  const list = plans ?? readJson(PATHS.planEntries);
  if (!Array.isArray(list)) throw new CliError('plans.json 不是数组', { code: 'PLANS_SHAPE' });

  const fetchImpl = fetchPage ?? ((url) => fetchPlanSource(url, { timeoutMs, reader }));

  // 同一条抓取链的尝试记录 → 一句话证据（报告里要能说清「为什么无法判定」）
  const describeAttempts = (attempts) => {
    if (!Array.isArray(attempts) || attempts.length === 0) return null;
    return attempts
      .map((a) => `${a.via} ${a.error ? a.error : a.status}${a.priced ? ' 有价格' : ''}${typeof a.tokens === 'number' && !a.priced ? ` ${a.tokens} 个价格不足` : ''}`)
      .join(' → ');
  };

  // 同一 URL 只抓一次：多家共用一个定价页很常见（StepFun 四档同页、xAI 五档同页）
  const pages = new Map();
  const drifted = [];
  const unknown = [];
  const clean = [];

  for (const plan of list) {
    const url = String(plan.sourceUrl ?? '');
    if (!url.startsWith('http')) {
      unknown.push({ id: plan.id, plan: plan.plan, reason: '缺少可抓取的 sourceUrl' });
      continue;
    }
    if (!pages.has(url)) pages.set(url, await fetchImpl(url));
    const page = pages.get(url);

    if (page.error) {
      unknown.push({ id: plan.id, plan: plan.plan, reason: `抓取失败：${page.error}`, url, attempts: page.attempts ?? null });
      continue;
    }

    const tokens = extractPriceTokens(page.text);
    // 免费档不判：页面上的「0」无判别力
    if (Number(plan.monthlyPrice) === 0) {
      clean.push({ id: plan.id, plan: plan.plan, note: '免费档不判价格' });
      continue;
    }
    // 价格证据不足 → 不判「未变」也不判「漂移」：
    //   0 个 token：纯前端渲染，静态层与 .md 都没有价
    //   < MIN_PRICE_TOKENS：只有零星价格（埋点串、单条额度数字），撑不起「这张表还是那个价」的结论
    if (tokens.size < MIN_PRICE_TOKENS) {
      const chain = describeAttempts(page.attempts);
      const reason = tokens.size === 0
        ? (chain ? `页面无可解析价格（已试：${chain}）` : '页面无可解析价格（纯前端渲染）')
        : `价格证据不足（只解析出 ${tokens.size} 个价格：${[...tokens].slice(0, 4).join(' / ')}；已试：${chain ?? `${page.via} 200`}）`;
      unknown.push({ id: plan.id, plan: plan.plan, reason, url, attempts: page.attempts ?? null });
      continue;
    }

    const hit = candidatesFor(plan.monthlyPrice).find((v) => tokens.has(v));
    if (hit) {
      clean.push({ id: plan.id, plan: plan.plan, matched: hit });
    } else {
      drifted.push({
        id: plan.id,
        plan: plan.plan,
        provider: plan.provider,
        recorded: `${plan.billingCurrency === 'CNY' ? '\u00a5' : '$'}${plan.monthlyPrice}`,
        pagePriceTokens: [...tokens].slice(0, 12),
        url,
      });
    }
  }

  return { ok: true, readOnly: true, checked: list.length, clean: clean.length, drifted, unknown };
}

export function formatPlansDriftReport(result) {
  const lines = [];
  lines.push('== 订阅套餐价格漂移检测（只告警，不改数据） ==');
  lines.push(`核对 ${result.checked} 档 · 未变 ${result.clean} · 待确认 ${result.drifted.length} · 无法判定 ${result.unknown.length}`);
  lines.push('');

  if (result.drifted.length === 0) {
    lines.push('没有发现价格漂移。');
  } else {
    lines.push('== 页面上找不到当初录入的价格（可能改价，也可能页面改版） ==');
    for (const item of result.drifted) {
      lines.push(`  ${item.provider} · ${item.plan}`);
      lines.push(`    记录值 ${item.recorded}；该页现有价格：${item.pagePriceTokens.join(' / ')}`);
      lines.push(`    ${item.url}`);
    }
    lines.push('');
    lines.push('  处置：人工打开链接确认。真改价就走 add 重新录入，页面改版则换该条的来源页。');
  }

  if (result.unknown.length > 0) {
    lines.push('');
    lines.push('== 无法判定（价格不在静态 HTML 里，需浏览器渲染） ==');
    for (const item of result.unknown) {
      lines.push(`  ${item.plan}：${item.reason}`);
    }
  }

  lines.push('');
  lines.push('本命令不写任何文件；确认改价后仍走人工录入。');
  return lines.join('\n');
}
