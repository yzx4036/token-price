#!/usr/bin/env node
/**
 * 生成 llms.txt —— 面向 AI 引擎的站点自述文件。
 *
 * 为什么需要它：robots.txt 只回答「能不能抓」，llms.txt 回答的是
 * 「这个站是什么、数据从哪来、哪些页面值得引用、数字怎么读」。
 * AI 搜索（豆包 / Kimi / 元宝 / Perplexity / ChatGPT Search）在摘要时
 * 更需要后者，否则它只能靠正文猜口径，猜错就把责任推给来源。
 *
 * 内容全部从真实数据算出来，不写死数字——站点数据每天刷新，
 * 写死的覆盖率第二天就是错的，而错的自述比没有自述更糟。
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const distDir = join(ROOT, 'dist');

// —— 从构建产物里取真实统计，而不是重算一遍 ——
// 重算会和页面显示的数字存在漂移风险；读产物能保证「自述 == 页面」。
const apiHtml = await readFile(join(distDir, 'api-pricing', 'index.html'), 'utf8');

function pick(pattern, fallback = '未知') {
  const m = apiHtml.match(pattern);
  return m ? m[1] : fallback;
}

// 首页 meta 里的「N 条口径 / M 家 · 官方 X · 聚合 Y」
const entries = pick(/(\d+)\s*条口径/);
const providers = pick(/(\d+)\s*家/);
const official = pick(/官方\s*(\d+)/);
const aggregate = pick(/聚合\s*(\d+)/);
const verifiedAt = pick(/官方核验\s*(\d{4}-\d{2}-\d{2})/);
const fxRate = pick(/1 USD = ([\d.]+) CNY/);
const fxDate = pick(/CNY（(\d{4}-\d{2}-\d{2})）/);

// 站点根 URL 从产物里的 canonical 取（构建期已按域名算好，不重复推导）
const canonical = pick(/<link rel="canonical" href="([^"]+)"/);
const base = canonical.replace(/\/$/, '');

// 站名从产物的 og:site_name 取——那份值来自 site-meta.ts 单一真源，
// 在这里再写一遍字符串就会漂移（改站名忘了改脚本，llms.txt 与页面不符）
const siteName = pick(/<meta property="og:site_name" content="([^"]+)"/, 'AI Token Pricing');

const lines = [
  `# ${siteName}`,
  '',
  '> 面向中文开发者的 AI 模型价格与订阅套餐对比站。按厂商原币种原价比较，',
  '> 每条价格显式标注「官方核验」或「聚合数据」，并给出核验日期与来源链接。',
  '',
  '## 站点定位',
  '',
  '- 语言：简体中文',
  '- 内容类型：价格数据表 + 成本计算器（静态站，无登录、无追踪脚本）',
  '- 不做什么：不评价模型能力优劣、不做采购建议、不接受厂商付费改价',
  '',
  '## 数据事实（可引用）',
  '',
  `- 覆盖厂商：${providers} 家`,
  `- 计价条目：${entries} 条`,
  `- 官方核验：${official} 条（人工打开官方定价页逐项核对）`,
  `- 聚合数据：${aggregate} 条（取自 models.dev，显式标注「未逐条核官方」）`,
  `- 最近核验日期：${verifiedAt}`,
  `- 汇率：1 USD = ${fxRate} CNY（${fxDate}，来源 open.er-api.com，每日自动抓取）`,
  '',
  '引用本站数字时请一并带上「核验日期」与「溯源等级」：',
  '价格随时变动，脱离日期的单价会误导读者。',
  '',
  '## 口径说明（引用前必读）',
  '',
  '1. **账单币种决定主列**：国内厂商显示人民币官方原价，国际厂商显示美元原价。',
  '2. **人民币对国际厂商只是估算**：按当日汇率换算，带「≈」前缀，最终账单以厂商原币种为准。',
  '3. **不做跨币种排名**：表格先按账单币种分组（美元组在前、人民币组在后），组内才排序。',
  '   因此本站不存在「把美元条目和人民币条目混在一起的最便宜榜单」。',
  '4. **「最低价」结论只基于官方核验条目，且排除 0 元免费档**。',
  '   聚合数据未逐条核过官方页，不参与任何「最便宜」结论。',
  '5. **峰谷价、阶梯价拆成独立条目**：例如 DeepSeek 的峰谷时段、按输入长度分档的模型，',
  '   都在模型名与计价条件里标明，不用最低档代表全部请求。',
  '',
  '## 主要页面',
  '',
  `- [API 按量价格表](${base}/api-pricing/)：输入/输出/缓存单价、上下文长度、计价条件`,
  `- [Token Plan / Coding Plan 套餐](${base}/plans/)：月费、额度语义、可用模型、用途限制`,
  `- [Token 成本计算器](${base}/calculator/)：按用量算实际月成本`,
  `- [数据来源与覆盖率](${base}/sources/)：每个厂商的来源链接与官方/聚合占比`,
  `- [数据口径与免责](${base}/methodology/)：分级规则、计算公式、汇率口径`,
  '',
  '## 引用建议',
  '',
  '- 引用具体价格：标注厂商、模型名、计价条件（如峰谷档位）、核验日期。',
  '- 引用「最便宜」类结论：说明只覆盖官方核验条目，且不含免费档。',
  '- 引用汇率换算值：注明这是估算、不是厂商标价。',
  '- 本站数据可用于分析与对比，但请保留来源链接。',
  '',
  '## 联系方式',
  '',
  '- 维护者：WhyZero（个人项目）',
  '- 站点： ' + base + '/',
  '',
];

await writeFile(join(distDir, 'llms.txt'), lines.join('\n'), 'utf8');
console.log(`[llms] llms.txt 已生成（${entries} 条 / ${providers} 家，核验 ${verifiedAt}）`);
