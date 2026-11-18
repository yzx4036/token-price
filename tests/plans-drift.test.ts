import { describe, expect, it } from 'vitest';
import {
  extractPriceTokens,
  normalizePage,
  runPlansDriftCommand,
  type DriftPlanLike,
} from '../scripts/data/lib/plans-drift.mjs';

/**
 * 漂移检测的判据必须比「字符串相等」聪明，否则整套误报。
 * 这里每个用例都对应一次实测踩到的坑。
 */

const plan = (over: Partial<DriftPlanLike> = {}): DriftPlanLike => ({
  id: 'p1',
  plan: 'Test Plan',
  provider: '测试厂商',
  monthlyPrice: 200,
  billingCurrency: 'CNY',
  sourceUrl: 'https://example.com/pricing',
  ...over,
});

describe('页面归一化', () => {
  it('React 的 ¥<!-- -->9.9 能被还原成 ¥9.9（注释隔断）', () => {
    const t = normalizePage('<div>¥<!-- -->9.9<!-- -->/月</div>');
    expect(extractPriceTokens(t).has('9.9')).toBe(true);
  });

  it('价格在 <script> 的 JSON 里也要保留（Kimi 类页面）', () => {
    const t = normalizePage('<script>window.x={"price":"39"}</script>');
    expect(t).toContain('39');
  });

  it('样式表内容被丢弃，不参与匹配', () => {
    const t = normalizePage('<style>.a{content:"$999"}</style><p>$20</p>');
    const tokens = extractPriceTokens(t);
    expect(tokens.has('20')).toBe(true);
    expect(tokens.has('999')).toBe(false);
  });

  it('实体编码的货币符号被还原', () => {
    expect(extractPriceTokens(normalizePage('<p>&#165;49</p>')).has('49')).toBe(true);
  });
});

describe('价格 token 抽取', () => {
  it('Next.js RSC 里的 "$1" / "$L2" 不算价格', () => {
    const tokens = extractPriceTokens('self.__next_f.push(["$1","$L2","$undefined"])');
    expect(tokens.size).toBe(0);
  });

  it('正常价格能抽出来，含千分位与小数', () => {
    const tokens = extractPriceTokens('¥1,078/月 和 $19.99/月');
    expect(tokens.has('1078')).toBe(true);
    expect(tokens.has('19.99')).toBe(true);
  });
});

describe('漂移判定', () => {
  it('价格还在页面上 → 判为未变', async () => {
    const r = await runPlansDriftCommand({
      plans: [plan()],
      fetchPage: async () => ({ text: normalizePage('<p>¥99/月</p><p>¥<!-- -->200<!-- -->/月</p>') }),
    });
    expect(r.drifted).toHaveLength(0);
    expect(r.clean).toBe(1);
  });

  it('页面价格变了 → 报待确认，并附带该页现有价格供人判断', async () => {
    const r = await runPlansDriftCommand({
      plans: [plan()],
      fetchPage: async () => ({ text: normalizePage('<p>¥250/月</p><p>¥400/月</p>') }),
    });
    expect(r.drifted).toHaveLength(1);
    expect(r.drifted[0].recorded).toBe('¥200');
    expect(r.drifted[0].pagePriceTokens).toEqual(expect.arrayContaining(['250', '400']));
  });

  it('整页没有可解析价格 → 如实标「无法判定」，不冒充漂移', async () => {
    const r = await runPlansDriftCommand({
      plans: [plan()],
      fetchPage: async () => ({ text: normalizePage('<div id="app"></div>') }),
    });
    expect(r.drifted).toHaveLength(0);
    expect(r.unknown).toHaveLength(1);
    expect(r.unknown[0].reason).toContain('纯前端渲染');
  });

  it('抓取失败（403 / 超时）→ 无法判定，并写明原因', async () => {
    const r = await runPlansDriftCommand({
      plans: [plan()],
      fetchPage: async () => ({ error: 'HTTP 403' }),
    });
    expect(r.drifted).toHaveLength(0);
    expect(r.unknown[0].reason).toContain('HTTP 403');
  });

  it('免费档不参与价格判定（页面上的 0 无判别力）', async () => {
    const r = await runPlansDriftCommand({
      plans: [plan({ monthlyPrice: 0, plan: 'Free' })],
      fetchPage: async () => ({ text: normalizePage('<p>$9</p><p>$99</p>') }),
    });
    expect(r.drifted).toHaveLength(0);
    expect(r.unknown).toHaveLength(0);
  });

  it('同一 URL 只抓一次（多档共用一页）', async () => {
    let calls = 0;
    const r = await runPlansDriftCommand({
      plans: [plan({ id: 'a', plan: 'A' }), plan({ id: 'b', plan: 'B' })],
      fetchPage: async () => {
        calls += 1;
        return { text: '¥99 · ¥200' };
      },
    });
    expect(calls).toBe(1);
    expect(r.clean).toBe(2);
  });

  it('整数价格容忍页面上带小数点的写法（40 与 40.00 都算命中）', async () => {
    const r = await runPlansDriftCommand({
      plans: [plan({ monthlyPrice: 40 })],
      fetchPage: async () => ({ text: '¥20 /月 · ¥40.00 /月' }),
    });
    expect(r.clean).toBe(1);
  });

  it('不写任何文件：结果里带 readOnly 标记', async () => {
    const r = await runPlansDriftCommand({ plans: [], fetchPage: async () => ({ text: '' }) });
    expect(r.readOnly).toBe(true);
  });
});

/**
 * 抓取候选链：HTML → 官方 .md 变体 → 只读渲染代理（opt-in）。
 *
 * 背景：38/55 档被判「纯前端渲染无法判定」，其中 15 档只是因为这些站点的价格
 * 在客户端渲染层（chatgpt / x.ai / gemini），另有 1 档（阿里云 Coding Plan）
 * 的完整价格表其实就在官方 `.md` 原文里。加链后这两类都能判。
 *
 * 三条纪律（对应下面每组用例）：
 *   1. 只在静态层拿不到价格时才升级到下一级，能省的请求必须省。
 *   2. 代理默认关：没开 --reader 时绝不外联代理。
 *   3. 全链路失败要给出**分级证据**，不许只说「无法判定」。
 */
const fakeResponse = (body: string, { status = 200, contentType = 'text/html' } = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
  text: async () => body,
});

describe('抓取候选链', () => {
  it('候选顺序是 html → md → reader，且已带 .md 的地址不重复追加', async () => {
    const { planSourceCandidates } = await import('../scripts/data/lib/plans-drift.mjs');
    const chain = planSourceCandidates('https://help.aliyun.com/zh/model-studio/coding-plan', { reader: true });
    expect(chain.map((c: { via: string }) => c.via)).toEqual(['html', 'md', 'reader']);
    expect(chain[1].url).toBe('https://help.aliyun.com/zh/model-studio/coding-plan.md');
    expect(chain[2].url).toBe('https://r.jina.ai/https://help.aliyun.com/zh/model-studio/coding-plan');

    const alreadyMd = planSourceCandidates('https://platform.stepfun.com/docs/zh/step-plan/pricing.md', { reader: false });
    expect(alreadyMd.map((c: { via: string }) => c.via)).toEqual(['html']);
  });

  it('静态层就有价格时只请求一次，不白跑 .md', async () => {
    const { fetchPlanSource } = await import('../scripts/data/lib/plans-drift.mjs');
    const seen: string[] = [];
    const page = await fetchPlanSource('https://example.com/pricing', {
      fetchImpl: async (url: string) => {
        seen.push(url);
        return fakeResponse('<p>¥99 /月</p><p>¥200 /月</p>');
      },
    });
    expect(seen).toEqual(['https://example.com/pricing']);
    expect(page.via).toBe('html');
    expect(extractPriceTokens(page.text!).has('200')).toBe(true);
  });

  it('HTML 无价但官方 .md 有管道表 → 用 md 判，via 记为 md', async () => {
    const { fetchPlanSource } = await import('../scripts/data/lib/plans-drift.mjs');
    const md = '| 档位 | 月付 | 季付 |\n| - | - | - |\n| Pro | ¥200 | ¥539 |\n';
    const page = await fetchPlanSource('https://help.aliyun.com/zh/model-studio/coding-plan', {
      fetchImpl: async (url: string) => (url.endsWith('.md')
        ? fakeResponse(md, { contentType: 'text/markdown' })
        : fakeResponse('<div id="app"></div>')),
    });
    expect(page.via).toBe('md');
    expect(page.attempts.map((a: { priced?: boolean }) => a.priced)).toEqual([false, true]);
    expect(extractPriceTokens(page.text!).has('200')).toBe(true);
  });

  it('两级都没价且没开 --reader → 绝不外联代理，仍返回正文供人排查', async () => {
    const { fetchPlanSource } = await import('../scripts/data/lib/plans-drift.mjs');
    const seen: string[] = [];
    const page = await fetchPlanSource('https://www.kimi.com/coding', {
      fetchImpl: async (url: string) => {
        seen.push(url);
        return fakeResponse('<div id="app">AI coding agent</div>');
      },
    });
    expect(seen.some((u) => u.includes('r.jina.ai'))).toBe(false);
    expect(seen).toHaveLength(2);
    expect(page.error).toBeUndefined();
    expect(page.attempts).toHaveLength(2);
  });

  it('开了 --reader 才走第三级，且能拿到渲染后的价格', async () => {
    const { fetchPlanSource } = await import('../scripts/data/lib/plans-drift.mjs');
    const seen: string[] = [];
    const page = await fetchPlanSource('https://chatgpt.com/pricing', {
      reader: true,
      fetchImpl: async (url: string) => {
        seen.push(url);
        if (url.startsWith('https://r.jina.ai/')) return fakeResponse('Go $8 per month · Pro $20 per month', { contentType: 'text/plain' });
        return fakeResponse('<div id="app"></div>');
      },
    });
    expect(seen.at(-1)).toBe('https://r.jina.ai/https://chatgpt.com/pricing');
    expect(page.via).toBe('reader');
    expect(extractPriceTokens(page.text!).has('20')).toBe(true);
  });

  it('三级全失败时给分级证据（不是一句「无法判定」）', async () => {
    const { fetchPlanSource } = await import('../scripts/data/lib/plans-drift.mjs');
    const page = await fetchPlanSource('https://z.ai/subscribe', {
      reader: true,
      fetchImpl: async (url: string) => {
        if (url.includes('z.ai')) throw new TypeError('fetch failed');
        return fakeResponse('', { status: 403 });
      },
    });
    expect(page.error).toContain('html:');
    expect(page.error).toContain('reader:');
  });

  it('弱证据守卫：整页只有 1 个价格 token 时判「无法判定」，不许冒充漂移', async () => {
    // 实测形态：chatgpt.com/pricing 的 952KB RSC 载荷里只有埋点串
    // `"ChatGPT Pricing > Consumer > Pro $100"`，真实价格在客户端渲染。
    // 一个 token 就判「有价」，会把 4 档套餐误报成整体改价。
    const embedding = '<script>window.__x={"label":"ChatGPT Pricing &gt; Consumer &gt; Pro $100"}</script>';
    const weak = await runPlansDriftCommand({
      plans: [plan({ monthlyPrice: 20 })],
      fetchPage: async () => ({ text: normalizePage(embedding) }),
    });
    expect(weak.drifted).toHaveLength(0);
    expect(weak.clean).toBe(0);
    expect(weak.unknown[0].reason).toContain('价格证据不足');

    // 两个以上价格 token 才算定价页：不含录入价 → 该报漂移就报，别被守卫藏起来
    const priced = await runPlansDriftCommand({
      plans: [plan({ monthlyPrice: 20 })],
      fetchPage: async () => ({ text: normalizePage('<p>$0</p><p>$8</p><p>$100</p>') }),
    });
    expect(priced.unknown).toHaveLength(0);
    expect(priced.drifted).toHaveLength(1);
  });

  it('端到端：md 表命中录入价 → 判未变；页面只有 token 单价 → 判待确认（不许假绿）', async () => {
    const { fetchPlanSource } = await import('../scripts/data/lib/plans-drift.mjs');
    const okHtml = '<div id="app"></div>';
    const mdHit = '| 档位 | 月付 |\n| - | - |\n| Lite | ¥99 |\n| Pro | ¥200 |\n';
    const mdUnitOnly = '| 模型 | 输入 | 输出 |\n| - | - | - |\n| GLM-5.3 | ¥8 | ¥28 |\n';
    const run = (md: string) =>
      runPlansDriftCommand({
        plans: [plan({ monthlyPrice: 200 })],
        fetchPage: (url: string) =>
          fetchPlanSource(url, {
            fetchImpl: async (u: string) => (u.endsWith('.md') ? fakeResponse(md) : fakeResponse(okHtml)),
          }),
      });

    const hit = await run(mdHit);
    expect(hit.clean).toBe(1);
    const unitOnly = await run(mdUnitOnly);
    expect(unitOnly.clean).toBe(0);
    expect(unitOnly.drifted).toHaveLength(1);
  });
});
