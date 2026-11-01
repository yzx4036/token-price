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
      fetchPage: async () => ({ text: normalizePage('<p>¥<!-- -->200<!-- -->/月</p>') }),
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
      fetchPage: async () => ({ text: normalizePage('<p>$99</p>') }),
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
        return { text: '¥200' };
      },
    });
    expect(calls).toBe(1);
    expect(r.clean).toBe(2);
  });

  it('整数价格容忍页面上带小数点的写法（40 与 40.00 都算命中）', async () => {
    const r = await runPlansDriftCommand({
      plans: [plan({ monthlyPrice: 40 })],
      fetchPage: async () => ({ text: '¥40.00 /月' }),
    });
    expect(r.clean).toBe(1);
  });

  it('不写任何文件：结果里带 readOnly 标记', async () => {
    const r = await runPlansDriftCommand({ plans: [], fetchPage: async () => ({ text: '' }) });
    expect(r.readOnly).toBe(true);
  });
});
