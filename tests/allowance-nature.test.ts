import { describe, expect, it } from 'vitest';
import plansJson from '../src/data/entries/plans.json';
import { parseTokenPlans } from '../src/lib/schema';
import { NATURE_LABEL, countMixed, natureBadge, natureHint } from '../src/lib/allowance';

const plans = parseTokenPlans(plansJson);
const byId = new Map(plans.map((p) => [p.id, p]));

/**
 * 这些断言记录的是 2026-11-01 逐家核官方页得到的结论。
 * 官方改口径时应当**先重核、再改断言**，不许为了让测试变绿而放宽判据。
 */
describe('额度性质：48 档必须全部有值', () => {
  it('每条都有 allowanceNature', () => {
    const missing = plans.filter((p) => !p.allowanceNature).map((p) => p.id);
    expect(missing).toEqual([]);
  });

  it('枚举值只有三种', () => {
    const allowed = new Set(['mixed', 'quota', 'undisclosed']);
    for (const p of plans) expect(allowed.has(p.allowanceNature)).toBe(true);
  });

  it('三种形态都有实际条目（不是摆设）', () => {
    expect(countMixed(plans)).toBeGreaterThan(0);
    expect(plans.filter((p) => p.allowanceNature === 'quota').length).toBeGreaterThan(0);
    expect(plans.filter((p) => p.allowanceNature === 'undisclosed').length).toBeGreaterThan(0);
  });
});

describe('「部分不限量」只属于这三家（2026-11-01 核验）', () => {
  it('mixed 恰好是 openai / github / tencent', () => {
    const mixedProviders = new Set(
      plans.filter((p) => p.allowanceNature === 'mixed').map((p) => p.providerId),
    );
    expect([...mixedProviders].sort()).toEqual(['github', 'openai', 'tencent']);
  });

  it('Claude 全系不得标 mixed —— 官方原话是 Every plan has usage limits', () => {
    const claude = plans.filter((p) => p.providerId === 'anthropic');
    expect(claude.length).toBe(4);
    for (const p of claude) expect(p.allowanceNature, `${p.id} 不该标 mixed`).toBe('quota');
  });

  it('Google / xAI 都是倍率制，不得标 mixed', () => {
    for (const pid of ['google', 'xai']) {
      for (const p of plans.filter((x) => x.providerId === pid)) {
        expect(p.allowanceNature, `${p.id}`).toBe('quota');
      }
    }
  });

  it('Kimi 官方未公开数值 → undisclosed', () => {
    for (const p of plans.filter((x) => x.providerId === 'moonshot')) {
      expect(p.allowanceNature).toBe('undisclosed');
    }
  });
});

describe('ChatGPT Pro：不限量的是上一代，不是最新旗舰', () => {
  const pro = byId.get('openai-chatgpt-pro')!;

  it('Pro 标 mixed（有真·不限量项）', () => {
    expect(pro.allowanceNature).toBe('mixed');
  });

  it('额度说明必须点名「GPT-6 全系是扩展额度」', () => {
    // 这是本轮核出来的关键事实：最新旗舰在 Pro 上反而受限
    expect(pro.allowance).toContain('GPT-6 全系');
    expect(pro.allowance).toContain('扩展额度');
  });

  it('必须点名上一代（GPT-5.6）才是不限量', () => {
    expect(pro.allowance).toMatch(/GPT-5\.6\s*Sol\s*\/\s*Terra\s*\/\s*Luna[^。]*不限量/);
    expect(pro.allowance).toContain('GPT-5 Thinking Mini 为不限量');
  });

  it('必须点出 GPT-5.6 Sol Pro 是有限额（唯一例外）', () => {
    // 官方表：Sol Pro 在 Pro 档是 Yes 而非 Unlimited*
    expect(pro.allowance).toContain('GPT-5.6 Sol Pro 与 Legacy 模型可用但有限额');
  });

  it('不许只写一句笼统的「不限量」而不说是哪部分', () => {
    // 反例：allowance === '不限量'
    const bare = /^[^。]*不限量[^。]*。?$/;
    for (const p of plans) {
      const a = p.allowance ?? '';
      if (/不限量/.test(a)) {
        // 提到不限量就必须同时交代限制侧（受滥用防护 / 扩展额度 / 走 credits 之类）
        const hasCaveat = /滥用防护|扩展额度|有限|credits|积分|次数/.test(a);
        expect(hasCaveat, `${p.id} 写了不限量却没交代限制在哪`).toBe(true);
        expect(bare.test(a) && a.length < 20, `${p.id} 的额度说明过于笼统`).toBe(false);
      }
    }
  });
});

describe('ChatGPT Plus / Free / Go 的口径', () => {
  it('Plus 必须写明「GPT-6 全系可用但均为有限额度」', () => {
    const plus = byId.get('openai-chatgpt-plus')!;
    expect(plus.allowance).toContain('GPT-6');
    expect(plus.allowance).toContain('有限额度');
    expect(plus.allowanceNature).toBe('mixed');
  });

  it('Free / Go 必须写明可用模型只有两个', () => {
    for (const id of ['openai-chatgpt-free', 'openai-chatgpt-go']) {
      const p = byId.get(id)!;
      expect(p.allowance, id).toContain('GPT-6 Luna');
      expect(p.allowance, id).toContain('GPT-5 Thinking Mini');
      expect(p.allowanceNature, id).toBe('mixed');
    }
  });

  it('四档都不许出现「全部模型不限量」这类失实表述', () => {
    for (const p of plans.filter((x) => x.providerId === 'openai')) {
      expect(p.allowance ?? '', p.id).not.toMatch(/全部模型.{0,4}不限量|所有模型.{0,4}不限量/);
    }
  });
});

describe('Copilot / CodeBuddy：不限量的是补全，不是对话', () => {
  it('Copilot 付费档必须写明补全不限量且不消耗 credits', () => {
    for (const id of ['github-copilot-pro', 'github-copilot-pro-plus', 'github-copilot-max']) {
      const p = byId.get(id)!;
      expect(p.allowance, id).toMatch(/内联补全[^。]*不限量/);
      expect(p.allowance, id).toContain('不消耗 credits');
    }
  });

  it('Copilot Free 补全是有次数上限的（2000 次/月）—— 不能跟着标成不限量', () => {
    const free = byId.get('github-copilot-free')!;
    expect(free.allowance).toContain('2,000 次');
    expect(free.allowance ?? '').not.toMatch(/内联补全[^。]*不限量/);
    // 但 Free 整体仍算 mixed：它的 chat 侧有额度形态，而「补全次数上限」本身是额度
    expect(free.allowanceNature).toBe('quota');
  });

  it('CodeBuddy 必须说明补全不限量、对话走积分', () => {
    for (const p of plans.filter((x) => x.providerId === 'tencent')) {
      expect(p.allowance, p.id).toMatch(/补全不限量/);
      expect(p.allowance, p.id).toContain('积分');
    }
  });
});

describe('展示层', () => {
  it('只有 mixed 出徽标，其余返回 null', () => {
    expect(natureBadge('mixed')).toBe('部分不限量');
    expect(natureBadge('quota')).toBeNull();
    expect(natureBadge('undisclosed')).toBeNull();
  });

  it('三种形态各有独立中文label与提示', () => {
    for (const k of ['mixed', 'quota', 'undisclosed'] as const) {
      expect(NATURE_LABEL[k].length).toBeGreaterThan(0);
      expect(natureHint(k).length).toBeGreaterThan(10);
    }
    // 三个 label 不许重样
    expect(new Set(Object.values(NATURE_LABEL)).size).toBe(3);
  });
});
