#!/usr/bin/env node
/**
 * 文案密度体检（issue #13「站点文本可适当简约」的前后对比基线）
 *
 * 回答一个问题：这一版页面上的字，到底有没有变少、重复有没有被去掉。
 * 只用两个口径，避免自说自话：
 *   1) 正文中文字数：排除 <table> 子树与 script/style，只看说明性文本；
 *   2) 重复声明计数：同一句免责/估算口径在整页出现几次。
 *
 * 两种取数模式：
 *   static  解析构建产物 HTML，离线可跑，适合进 CI 与前后对比；
 *   live    起无头 Edge，用 CDP 实测首屏可见字数、页高、横向溢出，需网络与浏览器。
 *
 * 用法：
 *   node scripts/metrics/copy-density.mjs --dist dist
 *   node scripts/metrics/copy-density.mjs --dist dist --json
 *   node scripts/metrics/copy-density.mjs --live https://whyzero.studio/token-price/
 *   node scripts/metrics/copy-density.mjs --dist dist --live <url> --write-baseline docs/metrics/copy-density-baseline.json
 *   node scripts/metrics/copy-density.mjs --compare docs/metrics/copy-density-baseline.json
 *   node scripts/metrics/copy-density.mjs --compare <file> --live <url>
 *
 * 退出码：0 无回归；1 目标未达标（仅在 --compare 时判定）；2 无法判定（产物缺失/浏览器起不来）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const ROUTES = [
  'index.html',
  'api-pricing/index.html',
  'plans/index.html',
  'calculator/index.html',
  'sources/index.html',
  'methodology/index.html',
];

/** issue #13 的目标线。改这里等于改验收口径，别在别处再写一份。 */
const TARGETS = {
  // 首屏可见中文字数上限：实测基线 375=205 / 768=614 / 1440=134，
  // 1440 本来就不超标，所以目标是按视口分别定，不是一刀切。
  firstScreenProseZhMax: { '375×667': 200, '768×900': 350, '1440×900': 220 },
  docHeightDropPctMin: 15,
  docHeightDropPctMinProse: 10,
  phraseRepeatMax: 1,
};

function firstScreenLimit(vp) {
  return TARGETS.firstScreenProseZhMax[vp] ?? 260;
}

/**
 * 被判「重复」的声明。id 只做机器对比用，pattern 写宽一点：
 * 文案改写时口径还在，只是换了词，不该因为改词就漏判。
 */
const PHRASES = [
  { id: 'fx-disclaimer', label: '汇率随时变化 / 不准确', pattern: /汇率随时变化|不准确/g },
  { id: 'cny-estimate', label: '人民币是估算参考值', pattern: /估算的参考值|按汇率估算|按\s*[\d.]+\s*估算/g },
  { id: 'billing-currency', label: '以厂商原币种为准', pattern: /以厂商原币种为准|以厂商账单为准/g },
  { id: 'excluded-free', label: '已排除 N 个免费档', pattern: /已排除\s*\d+\s*个免费档/g },
  { id: 'provenance-official', label: '官方页抓取', pattern: /官方页抓取/g },
  { id: 'provenance-aggregate', label: '聚合数据', pattern: /聚合数据/g },
  { id: 'cross-currency', label: '跨币种不排名', pattern: /跨币种不排名/g },
];

const VIEWPORTS = [
  { name: '375×667', width: 375, height: 667 },
  { name: '768×900', width: 768, height: 900 },
  { name: '1440×900', width: 1440, height: 900 },
];

/** 数据页用严格目标；口径页/来源页/计算器是说明性内容，只要求「不变胖」 */
const STRICT_ROUTES = new Set(['index.html', 'api-pricing/index.html', 'plans/index.html']);

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
}
const has = (name) => process.argv.includes(name);

const distDir = resolve(arg('--dist', 'dist'));
const liveUrl = arg('--live', null);
const comparePath = arg('--compare', null);
const baselineOut = arg('--write-baseline', null);
const asJson = has('--json');

// ---------------------------------------------------------------- 静态口径

function stripTagsForProse(html) {
  let out = html.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  out = out.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  return out;
}

function zhCount(text) {
  const m = text.match(/[\u4e00-\u9fa5]/g);
  return m ? m.length : 0;
}

/** 把 table 子树整体摘掉，剩下的才算「正文」 */
function removeTables(html) {
  let out = html;
  // 不依赖精确嵌套：Prerender 出来的表格是完整闭合的 <table>…</table>
  let guard = 0;
  while (/<table[\s>]/i.test(out) && guard < 200) {
    const start = out.search(/<table[\s>]/i);
    const end = out.toLowerCase().indexOf('</table>', start);
    if (end === -1) break;
    out = out.slice(0, start) + ' ' + out.slice(end + '</table>'.length);
    guard += 1;
  }
  return out;
}

function tableText(html) {
  const parts = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  return parts.join(' ').replace(/<[^>]+>/g, ' ');
}

function visibleText(html) {
  return removeTables(stripTagsForProse(html)).replace(/<[^>]+>/g, ' ');
}

function countPhrases(text) {
  const res = {};
  for (const p of PHRASES) {
    const m = text.match(new RegExp(p.pattern.source, 'g'));
    res[p.id] = m ? m.length : 0;
  }
  return res;
}

function staticCapture() {
  if (!existsSync(distDir)) {
    console.error(`[无法判定] 产物目录不存在：${distDir}（先跑构建）`);
    process.exit(2);
  }
  const routes = {};
  for (const rel of ROUTES) {
    const fp = join(distDir, rel);
    if (!existsSync(fp)) {
      console.error(`[无法判定] 缺少产物：${rel}`);
      process.exit(2);
    }
    const html = readFileSync(fp, 'utf8');
    const prose = visibleText(html);
    const table = tableText(html);
    const phrases = countPhrases(prose);
    // 单元格里逐格重复「估算（日期）」是本轮重点，单独数
    const cellEstimate = (html.match(/估算（\d{4}-\d{2}-\d{2}）/g) || []).length;
    routes[rel] = {
      proseZh: zhCount(prose),
      tableZh: zhCount(table),
      totalZh: zhCount(prose) + zhCount(table),
      phrases,
      phrasesTotal: Object.values(phrases).reduce((a, b) => a + b, 0),
      cellEstimateRepeats: cellEstimate,
      htmlBytes: Buffer.byteLength(html, 'utf8'),
    };
  }
  return {
    capturedAt: new Date().toISOString(),
    source: { mode: 'static', dist: distDir },
    routeCount: ROUTES.length,
    routes,
  };
}

// ---------------------------------------------------------------- 浏览器口径

const BROWSER_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
];

function findBrowser() {
  for (const p of BROWSER_CANDIDATES) if (existsSync(p)) return p;
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 极简 CDP 客户端：只用 WebSocket + JSON-RPC，不引 puppeteer 这类重依赖 */
async function connectPage(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', (e) => rej(new Error(`WS 连接失败：${e?.message || 'unknown'}`)));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      if (msg.error) p.reject(new Error(msg.error.message));
      else p.resolve(msg.result);
      return;
    }
    const ls = listeners.get(msg.method);
    if (ls) ls.forEach((fn) => fn(msg.params));
  });
  await ready;
  return {
    send(method, params = {}) {
      const mid = ++id;
      return new Promise((resolveP, rejectP) => {
        pending.set(mid, { resolve: resolveP, reject: rejectP });
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    },
    once(method, timeoutMs = 20000) {
      return new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error(`等待 ${method} 超时`)), timeoutMs);
        const handler = (params) => {
          clearTimeout(timer);
          listeners.get(method)?.delete(handler);
          res(params);
        };
        if (!listeners.has(method)) listeners.set(method, new Set());
        listeners.get(method).add(handler);
      });
    },
    close() {
      try { ws.close(); } catch { /* ignore */ }
    },
  };
}

async function launchBrowser() {
  const bin = findBrowser();
  if (!bin) throw new Error('未找到 Edge / Chrome，无法做 live 实测（static 模式仍可用）');
  const port = 9333 + Math.floor(Math.random() * 200);
  const profile = join(tmpdir(), `copy-density-${Date.now()}`);
  mkdirSync(profile, { recursive: true });
  const proc = spawn(bin, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    'about:blank',
  ], { stdio: 'ignore' });

  const deadline = Date.now() + 25000;
  let version = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  if (!version) {
    proc.kill();
    throw new Error(`无头浏览器 25s 内未就绪（port ${port}）`);
  }
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find((t) => t.type === 'page');
  if (!page) {
    proc.kill();
    throw new Error('没有可用的 page target');
  }
  return { proc, wsUrl: page.webSocketDebuggerUrl, browser: version.Browser };
}

/** 页面内执行的度量表达式：全部按「当前视口」计算，切视口后重跑 */
const MEASURE_EXPR = `(() => {
  const zh = (s) => { const m = (s || '').match(/[\\u4e00-\\u9fa5]/g); return m ? m.length : 0; };
  const proseEls = [...document.querySelectorAll('p, li, h1, h2, h3, .lede, .meta, figcaption, dd, dt')]
    .filter((el) => !el.closest('table'))
    .filter((el) => el.offsetParent !== null || el.getBoundingClientRect().height > 0);
  const inView = proseEls.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.height > 0;
  });
  const sum = (els) => els.reduce((a, el) => a + zh(el.textContent), 0);
  const body = document.body.innerText || '';
  const phrases = {};
  const PATTERNS = ${JSON.stringify(PHRASES.map((p) => ({ id: p.id, src: p.pattern.source })))};
  for (const p of PATTERNS) {
    const m = body.match(new RegExp(p.src, 'g'));
    phrases[p.id] = m ? m.length : 0;
  }
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    firstScreenProseZh: sum(inView),
    fullPageProseZh: sum(proseEls),
    proseBlocks: proseEls.length,
    inViewBlocks: inView.length,
    docHeight: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    phrases,
    cellEstimateRepeats: (body.match(/估算（\\d{4}-\\d{2}-\\d{2}）/g) || []).length,
  };
})()`;

async function liveCapture(baseUrl) {
  const { proc, wsUrl, browser } = await launchBrowser();
  const page = await connectPage(wsUrl);
  const routes = {};
  try {
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    for (const rel of ROUTES) {
      const url = rel === 'index.html'
        ? baseUrl
        : new URL(rel.replace(/index\.html$/, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
      const loaded = page.once('Page.loadEventFired', 30000);
      await page.send('Page.navigate', { url });
      await loaded;
      await sleep(300); // 等预渲染页 hydrate 稳定
      routes[rel] = { url, viewports: {} };
      for (const vp of VIEWPORTS) {
        await page.send('Emulation.setDeviceMetricsOverride', {
          width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.width < 600,
        });
        await sleep(150);
        const res = await page.send('Runtime.evaluate', {
          expression: MEASURE_EXPR, returnByValue: true, awaitPromise: false,
        });
        if (res.exceptionDetails) throw new Error(`执行度量失败：${JSON.stringify(res.exceptionDetails.text)}`);
        routes[rel].viewports[vp.name] = res.result.value;
      }
      await page.send('Emulation.clearDeviceMetricsOverride');
    }
  } finally {
    page.close();
    proc.kill();
  }
  return {
    capturedAt: new Date().toISOString(),
    source: { mode: 'live', url: baseUrl, browser },
    targets: TARGETS,
    routes,
  };
}

// ---------------------------------------------------------------- 对比与输出

function baselineSection(baseline, mode) {
  if (!baseline.static && !baseline.live) return baseline; // 兼容「直接把 capture 存成基线」
  return baseline[mode] || null;
}

function compareStatic(baseline, current) {
  const rows = [];
  let failed = 0;
  for (const rel of ROUTES) {
    const b = baseline.routes?.[rel];
    const c = current.routes?.[rel];
    if (!b || !c) continue;
    const dZh = c.proseZh - b.proseZh;
    // 溯源标签本来就该逐条出现，不算重复声明；其余口径类句式超标即红
    const phraseOver = Object.keys(c.phrases).filter((k) => c.phrases[k] > TARGETS.phraseRepeatMax
      && k !== 'provenance-official' && k !== 'provenance-aggregate');
    const cellWorse = c.cellEstimateRepeats > b.cellEstimateRepeats;
    const ok = phraseOver.length === 0 && !cellWorse;
    if (!ok) failed += 1;
    rows.push({
      route: rel,
      正文中文字数: `${b.proseZh} → ${c.proseZh}（${dZh > 0 ? '+' : ''}${dZh}，仅参考）`,
      单元格估算重复: `${b.cellEstimateRepeats} → ${c.cellEstimateRepeats}${cellWorse ? '（变多 ✗）' : ''}`,
      页体积KB: `${(b.htmlBytes / 1024).toFixed(0)} → ${(c.htmlBytes / 1024).toFixed(0)}`,
      超标重复项: phraseOver.length ? phraseOver.join(',') : '无',
      判定: ok ? '通过' : '未达标',
    });
  }
  return { rows, failed };
}

function compareLive(baseline, current) {
  const rows = [];
  let failed = 0;
  for (const rel of ROUTES) {
    const strict = STRICT_ROUTES.has(rel);
    for (const vp of VIEWPORTS.map((v) => v.name)) {
      const b = baseline.routes?.[rel]?.viewports?.[vp];
      const c = current.routes?.[rel]?.viewports?.[vp];
      if (!b || !c) continue;
      const limit = strict ? firstScreenLimit(vp) : b.firstScreenProseZh;
      const needDrop = strict ? TARGETS.docHeightDropPctMin : TARGETS.docHeightDropPctMinProse;
      const dropPct = b.docHeight > 0 ? Number((((b.docHeight - c.docHeight) / b.docHeight) * 100).toFixed(1)) : 0;
      const firstOk = c.firstScreenProseZh <= limit;
      // 页高只对 1440 定下降目标：移动端是卡片展开，页高本来就会随文案变
      const heightOk = vp !== '1440×900' || dropPct >= needDrop;
      const overflowOk = c.overflowX <= 0;
      const ok = firstOk && heightOk && overflowOk;
      if (!ok) failed += 1;
      rows.push({
        route: `${rel} @ ${vp}`,
        首屏中文: `${b.firstScreenProseZh} → ${c.firstScreenProseZh}（≤${limit} ${strict ? '' : '不增 '}${firstOk ? '✓' : '✗'}）`,
        页高: `${b.docHeight} → ${c.docHeight}（降 ${dropPct}%${vp === '1440×900' ? `，需 ≥${needDrop}%` : '，仅记录'} ${heightOk ? '✓' : '✗'}）`,
        横向溢出: c.overflowX,
        判定: ok ? '通过' : '未达标',
      });
    }
  }
  return { rows, failed };
}

function printStatic(cap) {
  console.log(`\n== 文案密度（static · ${cap.source.dist}）==`);
  console.log('说明：预渲染产物是移动优先结构，条目详情占大头，故「非表格中文」只作参考；判定看重复度。');
  const head = ['路由', '非表格中文', '重复合计', '估算日期重复', '体积KB'];
  const lines = [head.join('\t')];
  for (const rel of ROUTES) {
    const r = cap.routes[rel];
    lines.push([rel, r.proseZh, r.phrasesTotal, r.cellEstimateRepeats, (r.htmlBytes / 1024).toFixed(0)].join('\t'));
  }
  console.log(lines.join('\n'));
}

function printLive(cap) {
  console.log(`\n== 文案密度（live · ${cap.source.url}）==`);
  const head = ['路由', '视口', '首屏中文', '全页中文', '页高', '溢出'];
  const lines = [head.join('\t')];
  for (const rel of ROUTES) {
    for (const vp of Object.keys(cap.routes[rel].viewports)) {
      const m = cap.routes[rel].viewports[vp];
      lines.push([rel, vp, m.firstScreenProseZh, m.fullPageProseZh, m.docHeight, m.overflowX].join('\t'));
    }
  }
  console.log(lines.join('\n'));
}

function printCompare(title, res) {
  console.log(`\n== 前后对比（${title}）==`);
  for (const row of res.rows) {
    console.log(`\n[${row.route}]`);
    for (const [k, v] of Object.entries(row)) if (k !== 'route') console.log(`  ${k}: ${v}`);
  }
  console.log(`\n结论：${res.failed === 0 ? '通过（无超标项）' : `${res.failed} 条路由未达标`}`);
}

// ---------------------------------------------------------------- main

const main = async () => {
  const out = {};

  if (comparePath) {
    if (!existsSync(comparePath)) {
      console.error(`[无法判定] 基线不存在：${comparePath}`);
      process.exit(2);
    }
    const baseline = JSON.parse(readFileSync(comparePath, 'utf8'));
    // 有 --live 就比 live，否则比 static
    if (liveUrl) {
      const cur = await liveCapture(liveUrl);
      const base = baselineSection(baseline, 'live');
      if (!base) { console.error('[无法判定] 基线里没有 live 段'); process.exit(2); }
      printLive(cur);
      const res = compareLive(base, cur);
      printCompare(`live · ${liveUrl}`, res);
      if (asJson) console.log(JSON.stringify({ live: cur, compare: res }, null, 2));
      process.exit(res.failed === 0 ? 0 : 1);
    }
    const cur = staticCapture();
    const base = baselineSection(baseline, 'static');
    if (!base) { console.error('[无法判定] 基线里没有 static 段'); process.exit(2); }
    printStatic(cur);
    const res = compareStatic(base, cur);
    printCompare('static', res);
    if (asJson) console.log(JSON.stringify({ static: cur, compare: res }, null, 2));
    process.exit(res.failed === 0 ? 0 : 1);
  }

  out.static = staticCapture();
  if (!asJson) printStatic(out.static);

  if (liveUrl) {
    out.live = await liveCapture(liveUrl);
    if (!asJson) printLive(out.live);
  }

  if (baselineOut) {
    mkdirSync(dirname(resolve(baselineOut)), { recursive: true });
    if (!out.live) {
      // 没有 live 段时保留旧文件的 live 段，避免一次 static-only 采集把实测基线冲掉
      const old = existsSync(baselineOut) ? JSON.parse(readFileSync(baselineOut, 'utf8')) : null;
      if (old?.live) out.live = old.live;
    }
    writeFileSync(resolve(baselineOut), `${JSON.stringify({ issue: '#13', targets: TARGETS, ...out }, null, 2)}\n`, 'utf8');
    console.log(`\n已写入基线：${baselineOut}`);
  }

  if (asJson) console.log(JSON.stringify(out, null, 2));
};

main().catch((err) => {
  console.error(`[失败] ${err.message}`);
  process.exit(2);
});
