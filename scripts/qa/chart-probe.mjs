#!/usr/bin/env node
/**
 * 图表可读性探针（编排层自写仪表，不委派给执行体）
 *
 * 为什么需要它：图表「存在」不等于「可读」。实测踩过两次——
 *   ① 纵轴线性把曲线压进 14px 带，DOM 里有 10 条 path，视觉等于空白；
 *   ② viewBox 固定 640 在 375 视口被缩到 325，标签互相重叠、长名被裁边，
 *      而「字号调大」救不了布局，因为重叠来自按桌面宽度排版后整体缩小。
 * 所以判据必须是几何的：文字框两两不相交、文字框不越出 svg、可见 svg 未被大幅缩小。
 *
 * 用法：
 *   node scripts/qa/chart-probe.mjs --url http://127.0.0.1:8815/api-pricing/
 *   node scripts/qa/chart-probe.mjs --url <url> --viewport 375,1440 --json
 *
 * 退出码：0 全部通过；1 有判据未过；2 无法判定（浏览器起不来）。
 */
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const url = arg('--url', null);
const viewports = arg('--viewport', '375,1440').split(',').map((v) => Number(v.trim()));
const asJson = process.argv.includes('--json');
const TOL = 2; // px 容差：抗锯齿与字距会造成 1~2px 的邻接

if (!url) {
  console.error('用法：node scripts/qa/chart-probe.mjs --url <页面地址> [--viewport 375,1440] [--json]');
  process.exit(2);
}

const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.error('[无法判定] 未找到 Edge / Chrome');
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  await new Promise((res, rej) => {
    ws.addEventListener('open', () => res());
    ws.addEventListener('error', () => rej(new Error('WS 连接失败')));
  });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      return;
    }
    listeners.get(msg.method)?.forEach((fn) => fn(msg.params));
  });
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
        const handler = (p) => { clearTimeout(timer); listeners.get(method)?.delete(handler); res(p); };
        if (!listeners.has(method)) listeners.set(method, new Set());
        listeners.get(method).add(handler);
      });
    },
    close() { try { ws.close(); } catch { /* ignore */ } },
  };
}

/** 页面内度量：只统计「正在显示」的 svg（display:none 的那层跳过） */
const MEASURE = `(() => {
  const figs = [...document.querySelectorAll('figure, .pricing-chart')];
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    figures: figs.map((fig) => {
      const svgs = [...fig.querySelectorAll('svg')].filter((s) => s.getBoundingClientRect().width > 1);
      return svgs.map((svg) => {
        const box = svg.getBoundingClientRect();
        const vb = (svg.getAttribute('viewBox') || '').split(/[ ,]+/).map(Number);
        const texts = [...svg.querySelectorAll('text')]
          .filter((t) => t.getBoundingClientRect().width > 0)
          .map((t) => {
            const r = t.getBoundingClientRect();
            return { s: (t.textContent || '').trim().slice(0, 24), l: r.left, r: r.right, t: r.top, b: r.bottom };
          });
        let overlaps = 0;
        for (let i = 0; i < texts.length; i++) {
          for (let j = i + 1; j < texts.length; j++) {
            const a = texts[i], b = texts[j];
            const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l);
            const oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
            if (ox > ${TOL} && oy > ${TOL}) overlaps += 1;
          }
        }
        const clipped = texts.filter((x) => x.l < box.left - ${TOL} || x.r > box.right + ${TOL}).length;
        // 有效字号 = 用户单位字号 × 实际缩放；比 "缩放比" 更贴近「读不读得清」。
        const firstText = svg.querySelector('text');
        const fontPx = firstText ? parseFloat(getComputedStyle(firstText).fontSize) : 0;
        const scale = Number.isFinite(vb[2]) && vb[2] > 0 ? box.width / vb[2] : null;
        return {
          svgWidth: Math.round(box.width), svgHeight: Math.round(box.height),
          viewBoxWidth: Number.isFinite(vb[2]) ? vb[2] : null,
          scale: scale === null ? null : Number(scale.toFixed(3)),
          fontPx: Number(fontPx.toFixed(1)),
          effFontPx: scale === null ? null : Number((fontPx * scale).toFixed(1)),
          textCount: texts.length, overlaps, clipped,
          sampleOverlap: overlaps ? texts.slice(0, 3).map((x) => x.s) : [],
        };
      });
    }),
  };
})()`;

const proc = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run',
  `--user-data-dir=${join(tmpdir(), `chart-probe-${Date.now()}`)}`,
  `--remote-debugging-port=${9350 + Math.floor(Math.random() * 100)}`, 'about:blank'], { stdio: 'ignore' });
const port = Number(proc.spawnargs.find((a) => a.startsWith('--remote-debugging-port=')).split('=')[1]);

let version = null;
for (const deadline = Date.now() + 25000; Date.now() < deadline && !version;) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (r.ok) version = await r.json();
  } catch { /* 未就绪 */ }
  if (!version) await sleep(250);
}
if (!version) { proc.kill(); console.error('[无法判定] 无头浏览器未就绪'); process.exit(2); }

const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = await connect(list.find((t) => t.type === 'page').webSocketDebuggerUrl);

const results = [];
try {
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  for (const width of viewports) {
    await page.send('Emulation.setDeviceMetricsOverride', {
      width, height: width < 600 ? 900 : 1000, deviceScaleFactor: 1, mobile: width < 600,
    });
    const loaded = page.once('Page.loadEventFired', 30000);
    await page.send('Page.navigate', { url });
    await loaded;
    await sleep(1200);
    const res = await page.send('Runtime.evaluate', { expression: MEASURE, returnByValue: true });
    const value = res.result.value;
    const figs = value.figures.flat();
    const badOverlap = figs.filter((f) => f.overlaps > 0);
    const badClip = figs.filter((f) => f.clipped > 0);
    // 判据换成「有效字号 ≥ 11px」：320 宽下缩放 0.75 是物理必然（270px 宽），
    // 用缩放比当判据会误杀，用实际可读字号才诚实。
    const tiny = figs.filter((f) => f.effFontPx !== null && f.effFontPx < 11);
    const noSvg = figs.length === 0;
    results.push({
      width, url, ...value, visibleSvgs: figs.length,
      pass: !noSvg && value.overflowX <= 0 && badOverlap.length === 0 && badClip.length === 0 && tiny.length === 0,
      issues: {
        noSvg, overflowX: value.overflowX,
        overlaps: badOverlap.map((f) => ({ scale: f.scale, overlaps: f.overlaps, sample: f.sampleOverlap })),
        clipped: badClip.map((f) => ({ scale: f.scale, clipped: f.clipped })),
        scaledDown: tiny.map((f) => ({ svgWidth: f.svgWidth, viewBoxWidth: f.viewBoxWidth, scale: f.scale, effFontPx: f.effFontPx })),
      },
    });
  }
} finally {
  page.close();
  proc.kill();
}

if (asJson) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log(`== 图表可读性探针（${url}）==`);
  for (const r of results) {
    console.log(`\n[${r.width}px] 可见 SVG ${r.visibleSvgs} 个 · 横向溢出 ${r.overflowX}px · ${r.pass ? 'PASS' : 'FAIL'}`);
    for (const f of r.figures.flat()) {
      console.log(`  svg ${f.svgWidth}px / viewBox ${f.viewBoxWidth} (scale ${f.scale}) · 字号 ${f.fontPx}→${f.effFontPx}px · text ${f.textCount} · 重叠 ${f.overlaps} · 裁切 ${f.clipped}`);
    }
    if (!r.pass) console.log(`  问题：${JSON.stringify(r.issues)}`);
  }
  console.log(`\n结论：${results.every((r) => r.pass) ? '全部通过' : '有判据未过'}`);
}
process.exit(results.every((r) => r.pass) ? 0 : 1);
