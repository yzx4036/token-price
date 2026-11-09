#!/usr/bin/env node
/**
 * 文案守卫（v0.10.0 / #12 #13）——只看构建产物，不看源码。
 *
 * 为什么另起一个脚本而不是并进 tests/copy.test.ts：
 *   旧词与「真源引用」都是**源码**层面的事，字符串包含就能判；
 *   而「同一句声明在页面上出现了几次」「估算日期有没有退回单元格」「免责四要素
 *   在禁 JS 时还在不在」只有**渲染后的文本**才答得准。用源码判断会被 {常量}、
 *   条件渲染、两层 DOM（表格 / 卡片）各骗一次。
 *
 * 四条判据（全部对着 dist 里的 6 个 HTML）：
 *   1. 声明重复：汇率免责 / 人民币估算 / 以原币种为准 三类句式，每页各 ≤1 次；
 *   2. 估算日期：`估算（YYYY-MM-DD）` 全产物 0 次（日期已上提到表级一处）；
 *   3. 表级汇率声明：FX_TABLE_NOTE 骨架在数据页各 1 次、其余页 0 次；
 *   4. 免责要素逐条可达：非官方 / 无隶属或授权 / 以厂商官方页面与账单为准 /
 *      不构成采购财务法律建议 / 商标归各自权利人，五组关键词**硬编码在本文件**
 *      （见 DISCLAIMER_ELEMENTS），逐路由断言，缺一条即失败。
 *
 * ⚠️ 判据 4 刻意不拿 SITE_DISCLAIMER 当 needle：被测对象与基准是同一个常量时，
 * 改常量 + 重新构建永远一起变，守卫会对「四要素少一条」结构性失明（v0.10.0
 * 首轮审查实测：删掉「不构成…建议」后守卫仍 exit 0）。要素关键词必须是外部标准。
 *
 * 用法：
 *   node scripts/qa/copy-guard.mjs --dist dist
 *   node scripts/qa/copy-guard.mjs --dist dist --json
 *   node scripts/qa/copy-guard.mjs --dist tests/fixtures/copy-guard/bad --partial
 *
 * 退出码：0 全部通过；1 有违规（stderr 逐条指名）；2 无法判定（产物缺失）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i === -1 ? fallback : process.argv[i + 1];
};
const distDir = resolve(arg('--dist', 'dist'));
const asJson = process.argv.includes('--json');
const partial = process.argv.includes('--partial');

/** 需要全部存在的路由（与 scripts/metrics/copy-density.mjs 的 ROUTES 同源） */
const ROUTES = [
  { file: 'index.html', name: '/' },
  { file: 'api-pricing/index.html', name: '/api-pricing/' },
  { file: 'plans/index.html', name: '/plans/' },
  { file: 'calculator/index.html', name: '/calculator/' },
  { file: 'sources/index.html', name: '/sources/' },
  { file: 'methodology/index.html', name: '/methodology/' },
];

/** 判据里点名统计的三类句式；pattern 必须与 copy-density.mjs 的 PHRASES 一致 */
const DECLARATIONS = [
  { id: 'fx-disclaimer', pattern: /汇率随时变化|不准确/g },
  { id: 'cny-estimate', pattern: /估算的参考值|按汇率估算|按\s*[\d.]+\s*估算/g },
  { id: 'billing-currency', pattern: /以厂商原币种为准|以厂商账单为准/g },
];

/** 这些页必须各出现一次表级汇率声明（副行只有 ≈ ¥，日期在这里） */
const FX_NOTE_ROUTES = new Set(['/api-pricing/', '/plans/']);

/**
 * 免责四要素 + 商标条款的独立判据。
 *
 * needle 写死在这里，不从 site-meta.ts 取——取被测常量当基准等于自证。
 * 改免责措辞时，若换掉了这些关键词，本守卫应当先红一次，逼人确认
 * 「是换说法还是丢了要素」，而不是跟着常量一起变绿。
 *   ① 非官方                            → ['非官方']
 *   ② 与厂商无隶属或授权关系            → ['无隶属', '授权']
 *   ③ 以厂商官方页面与最终账单为准      → ['官方页面', '账单']
 *   ④ 不构成采购 / 财务 / 法律建议      → ['不构成', '建议']
 *   ⑤ 商标归各自权利人（附在④后的条款）→ ['商标', '权利人']
 */
const DISCLAIMER_ELEMENTS = [
  { id: 'non-official', label: '非官方', needles: ['非官方'] },
  { id: 'no-affiliation', label: '无隶属或授权关系', needles: ['无隶属', '授权'] },
  { id: 'vendor-authoritative', label: '以厂商官方页面与账单为准', needles: ['官方页面', '账单'] },
  { id: 'not-advice', label: '不构成采购/财务/法律建议', needles: ['不构成', '建议'] },
  { id: 'trademark', label: '商标归各自权利人', needles: ['商标', '权利人'] },
];

// ---------------------------------------------------------------- 取真源

/**
 * 表级声明骨架从 copy.ts 取（文案改了守卫跟着改，不会假绿）。
 * site-meta.ts 里有 `__HAS_WECHAT_QR__` 这类构建期常量，先在全局喂一个 false。
 */
async function loadSources() {
  globalThis.__HAS_WECHAT_QR__ = false;
  globalThis.__WECHAT_QR_FILE__ = '';
  const copyUrl = pathToFileURL(join(ROOT, 'src/lib/copy.ts')).href;
  let template = null;
  try {
    const mod = await import(copyUrl);
    template = mod.FX_TABLE_NOTE_TEMPLATE ?? null;
  } catch {
    template = null;
  }
  if (!template) {
    const src = readFileSync(join(ROOT, 'src/lib/copy.ts'), 'utf8');
    template = /FX_TABLE_NOTE_TEMPLATE\s*=\s*\n?\s*'([^']+)'/.exec(src)?.[1] ?? null;
  }
  if (!template) {
    console.error('[无法判定] 取不到 copy.ts 里的表级声明骨架');
    process.exit(2);
  }
  return { template };
}

// ---------------------------------------------------------------- 文本口径

function stripNoise(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
}

/** 摘掉 <table> 子树：与 copy-density.mjs 同口径，表格内容不算「正文声明」 */
function removeTables(html) {
  let out = html;
  let guard = 0;
  while (/<table[\s>]/i.test(out) && guard < 500) {
    const start = out.search(/<table[\s>]/i);
    const end = out.toLowerCase().indexOf('</table>', start);
    if (end === -1) break;
    out = out.slice(0, start) + ' ' + out.slice(end + '</table>'.length);
    guard += 1;
  }
  return out;
}

/** 渲染后的可见文本（标签剥掉，但保留文字之间的空格） */
function textOf(html) {
  return removeTables(stripNoise(html)).replace(/<[^>]+>/g, ' ');
}

/** 页脚文本（预渲染就是无 JS 视图；页脚常驻是四要素「必读得到」的落点） */
function footerText(html) {
  const parts = html.match(/<footer[\s\S]*?<\/footer>/gi) ?? [];
  return textOf(parts.join(' '));
}

/** 返回某要素在给定文本里缺的 needle（空数组 = 该文本里要素齐全） */
function missingNeedles(element, text) {
  return element.needles.filter((needle) => !text.includes(needle));
}

/**
 * 把文案抹成「只剩骨架」：去掉数字、小数点、连字符与所有空白。
 * 这样 `按 1 USD = 6.6908 CNY（2026-11-08）` 与骨架 `按 1 USD = {rate} CNY（{date}）`
 * 抹完是同一个串，汇率改了也不会假红。
 */
function skeleton(text) {
  return text
    .replace(/\{[a-z]+\}/gi, '')
    .replace(/[0-9.\-\u2013\u2014]/g, '')
    .replace(/[\s\u00a0]+/g, '');
}

function countOccurrences(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count += 1;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

// ---------------------------------------------------------------- 主流程

const main = async () => {
  const { template } = await loadSources();
  const noteNeedle = skeleton(template);

  if (!existsSync(distDir)) {
    console.error(`[无法判定] 产物目录不存在：${distDir}（先跑构建）`);
    process.exit(2);
  }

  const present = ROUTES.filter((route) => existsSync(join(distDir, route.file)));
  const missing = ROUTES.filter((route) => !present.includes(route));
  if (!partial && missing.length > 0) {
    console.error(`[无法判定] 缺少产物：${missing.map((r) => r.file).join(', ')}（--partial 可只查已有路由）`);
    process.exit(2);
  }
  if (present.length === 0) {
    console.error(`[无法判定] ${distDir} 里没有任何路由产物`);
    process.exit(2);
  }

  const violations = [];
  const reports = [];

  for (const route of present) {
    const html = readFileSync(join(distDir, route.file), 'utf8');
    const prose = textOf(html);
    const proseSkeleton = skeleton(prose);

    // 1) 声明重复
    const counts = {};
    for (const decl of DECLARATIONS) {
      const m = prose.match(new RegExp(decl.pattern.source, 'g'));
      counts[decl.id] = m ? m.length : 0;
      if (counts[decl.id] > 1) {
        violations.push(`${route.name} 声明重复：${decl.id} 出现 ${counts[decl.id]} 次（上限 1）`);
      }
    }

    // 2) 估算日期必须为 0（全文件数，含表格单元）
    const estimateDates = (html.match(/估算（\d{4}-\d{2}-\d{2}）/g) || []).length;
    if (estimateDates > 0) {
      violations.push(`${route.name} 估算日期重复：估算（YYYY-MM-DD）出现 ${estimateDates} 次（要求 0）`);
    }

    // 3) 表级汇率声明次数
    const noteCount = countOccurrences(proseSkeleton, noteNeedle);
    const noteExpect = FX_NOTE_ROUTES.has(route.name) ? 1 : 0;
    if (noteCount !== noteExpect) {
      violations.push(`${route.name} 表级汇率声明出现 ${noteCount} 次（要求 ${noteExpect}）`);
    }

    // 4) 免责要素逐条可达：全页 ≥1 + 页脚常驻 ≥1（禁 JS：dist 就是无 JS 视图）
    const footerProse = footerText(html);
    const elementGaps = DISCLAIMER_ELEMENTS
      .map((el) => ({ id: el.id, label: el.label, missing: missingNeedles(el, prose) }))
      .filter((el) => el.missing.length > 0);
    if (elementGaps.length > 0) {
      const detail = elementGaps.map((el) => `${el.id}「${el.label}」缺 ${el.missing.join('、')}`).join('；');
      violations.push(`${route.name} 免责要素缺失 ${elementGaps.length} 项：${detail}`);
    }
    const footerGaps = DISCLAIMER_ELEMENTS
      .map((el) => ({ id: el.id, label: el.label, missing: missingNeedles(el, footerProse) }))
      .filter((el) => el.missing.length > 0);
    if (footerGaps.length > 0) {
      const detail = footerGaps.map((el) => `${el.id}「${el.label}」缺 ${el.missing.join('、')}`).join('；');
      violations.push(`${route.name} 页脚免责要素缺失 ${footerGaps.length} 项：${detail}`);
    }

    reports.push({
      route: route.name,
      declarations: counts,
      estimateDates,
      fxNote: noteCount,
      disclaimerElements: `${DISCLAIMER_ELEMENTS.length - elementGaps.length}/${DISCLAIMER_ELEMENTS.length}`,
      footerElements: `${DISCLAIMER_ELEMENTS.length - footerGaps.length}/${DISCLAIMER_ELEMENTS.length}`,
      disclaimerMissing: elementGaps.map((el) => el.id),
      footerMissing: footerGaps.map((el) => el.id),
    });
  }

  if (asJson) {
    console.log(JSON.stringify({ dist: distDir, routes: reports, violations }, null, 2));
  } else {
    console.log(`\n== 文案守卫（${distDir}）==`);
    for (const r of reports) {
      console.log(
        `${r.route.padEnd(15)} 声明 ${JSON.stringify(r.declarations)} 估算日期 ${r.estimateDates} 表级声明 ${r.fxNote} 免责要素 ${r.disclaimerElements} 页脚要素 ${r.footerElements}${[...r.disclaimerMissing, ...r.footerMissing].length ? `（缺 ${[...new Set([...r.disclaimerMissing, ...r.footerMissing])].join(',')}）` : ''}`,
      );
    }
  }

  if (violations.length > 0) {
    console.error(`\n[违规] ${violations.length} 条：`);
    for (const line of violations) console.error(`  - ${line}`);
    process.exit(1);
  }
  console.log('\n结论：通过（声明各 ≤1、估算日期 0、表级声明 1、免责要素齐全）');
};

main().catch((error) => {
  console.error(`[失败] ${error.message}`);
  process.exit(2);
});
