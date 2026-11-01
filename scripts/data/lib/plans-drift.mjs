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

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

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
 * @param {(url: string) => Promise<{text?: string, error?: string}>} [options.fetchPage] 可注入
 * @param {number} [options.timeoutMs]
 */
export async function runPlansDriftCommand({ plans = null, fetchPage = null, timeoutMs = 25_000 } = {}) {
  const list = plans ?? readJson(PATHS.planEntries);
  if (!Array.isArray(list)) throw new CliError('plans.json 不是数组', { code: 'PLANS_SHAPE' });

  const fetchImpl =
    fetchPage ??
    (async (url) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          redirect: 'follow',
          headers: { 'user-agent': BROWSER_UA, accept: 'text/html,application/xhtml+xml' },
        });
        if (!res.ok) return { error: `HTTP ${res.status}` };
        return { text: normalizePage(await res.text()) };
      } catch (error) {
        return { error: error instanceof Error ? error.name : 'FETCH_FAILED' };
      } finally {
        clearTimeout(timer);
      }
    });

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
      unknown.push({ id: plan.id, plan: plan.plan, reason: `抓取失败：${page.error}`, url });
      continue;
    }

    const tokens = extractPriceTokens(page.text);
    // 免费档不判：页面上的「0」无判别力
    if (Number(plan.monthlyPrice) === 0) {
      clean.push({ id: plan.id, plan: plan.plan, note: '免费档不判价格' });
      continue;
    }
    // 整页解析不出任何价格 → 纯前端渲染，静态 HTML 里根本没有价
    if (tokens.size === 0) {
      unknown.push({ id: plan.id, plan: plan.plan, reason: '页面无可解析价格（纯前端渲染）', url });
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
