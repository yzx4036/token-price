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

describe('ChatGPT Pro：三档独立计划（官方「three monthly Pro plans」）', () => {
  const PRO_IDS = ['openai-chatgpt-pro-100', 'openai-chatgpt-pro-200', 'openai-chatgpt-pro-500'];
  const pros = PRO_IDS.map((id) => byId.get(id)!);

  it('三档都存在且月费对上官方表', () => {
    // 官方帮助页 Pro plans 表：$100 / $200 / $500
    for (const p of pros) expect(p, `${p?.id}`).toBeDefined();
    expect(pros.map((p) => p.monthlyPrice)).toEqual([100, 200, 500]);
    expect(new Set(pros.map((p) => p.billingCurrency))).toEqual(new Set(['USD']));
  });

  it('不许再留一条「From $100」的合并记录', () => {
    // 官方给了三个明确标价，合并成一条等于丢掉两档
    expect(byId.has('openai-chatgpt-pro')).toBe(false);
    // 也不许写「$200 与 $500 未单独标价」这类过时表述
    for (const p of pros) {
      expect(p.billingCycle ?? '', p.id).not.toMatch(/未单独标价/);
      expect(p.billingCycle ?? '', p.id).toContain(String(p.monthlyPrice));
    }
  });

  it('Ultrafast 只在 Pro 500 —— 这是能力差异不是用量差异', () => {
    const p500 = byId.get('openai-chatgpt-pro-500')!;
    expect(p500.usageRestrictions).toContain('含 Ultrafast');
    // 另两档必须显式写「不含」，不能沉默（读者默认会以为都一样）
    for (const id of ['openai-chatgpt-pro-100', 'openai-chatgpt-pro-200']) {
      const p = byId.get(id)!;
      expect(p.usageRestrictions, p.id).toContain('不含 Ultrafast');
      expect(p.usageRestrictions ?? '', p.id).not.toContain('含 Ultrafast ——');
    }
  });

  it('API 额度随档位递增：$100 / $200 / $500', () => {
    // 官方 pricing 页脚注：$100 with Pro 100, $200 with Pro 200, or $500 with Pro 500
    const credits = pros.map((p) => {
      const m = (p.usageRestrictions ?? '').match(/\$(\d+)\/月 API 额度/);
      return m ? Number(m[1]) : null;
    });
    expect(credits).toEqual([100, 200, 500]);
  });

  it('Pro 全系不提供年付（官方：annual plans 只给 Business / Enterprise）', () => {
    for (const p of pros) {
      expect(p.billingCycle ?? '', p.id).toContain('不提供年付');
    }
  });

  it('三档都标 mixed，且「不计量」只给 Instant 对话、不给 GPT-6 Pro', () => {
    for (const p of pros) {
      expect(p.allowanceNature, p.id).toBe('mixed');
      // 关键事实：最新旗舰在 Pro 上反而受限，三档都一样
      expect(p.allowance, p.id).toContain('GPT-6 全系');
      expect(p.allowance, p.id).toContain('按额度计量');
      // 2026-11 口径统一：不再用「不限量」裸词，改由结构化 unlimited 说明范围
      expect(p.unlimited, p.id).toBeTruthy();
      expect(p.unlimited!.feature, p.id).toContain('Instant 日常文本对话');
      expect(p.unlimited!.note, p.id).toContain('GPT-6 全系');
    }
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
  it('Plus 必须写明 GPT-6 全系按额度计量，且「不计量」只覆盖 Instant 对话', () => {
    const plus = byId.get('openai-chatgpt-plus')!;
    expect(plus.allowance).toContain('GPT-6');
    expect(plus.allowance).toContain('按额度计量');
    expect(plus.allowanceNature).toBe('mixed');
    expect(plus.unlimited, 'plus').toBeTruthy();
    expect(plus.unlimited!.feature).toContain('Instant 日常文本对话');
    expect(plus.unlimited!.surface).toBe('official-and-third-party');
  });

  it('Free / Go 必须写明可用模型只有两个（GPT-5.6 Luna 与 GPT-5 Thinking Mini）', () => {
    for (const id of ['openai-chatgpt-free', 'openai-chatgpt-go']) {
      const p = byId.get(id)!;
      expect(p.allowance, id).toContain('GPT-5.6 Luna');
      expect(p.allowance, id).toContain('GPT-5 Thinking Mini');
      expect(p.unlimited!.models.join(), id).toContain('GPT-5.6 Luna');
      expect(p.allowanceNature, id).toBe('mixed');
    }
    // 旧文案把 Instant 对话的默认模型写成 GPT-6 Luna，属事实错误
    expect(byId.get('openai-chatgpt-free')!.allowance).not.toContain('GPT-6 Luna');
  });

  it('四档都不许出现「全部模型不限量」这类失实表述', () => {
    for (const p of plans.filter((x) => x.providerId === 'openai')) {
      expect(p.allowance ?? '', p.id).not.toMatch(/全部模型.{0,4}不限量|所有模型.{0,4}不限量/);
    }
  });
});

describe('Copilot / CodeBuddy：不限量的是补全，不是对话', () => {
  it('Copilot 付费档：只有补全不计量，chat/agent 走 credits', () => {
    for (const id of ['github-copilot-pro', 'github-copilot-pro-plus', 'github-copilot-max']) {
      const p = byId.get(id)!;
      expect(p.allowance, id).toContain('不消耗 credits');
      expect(p.unlimited!.feature, id).toContain('内联补全');
      expect(p.unlimited!.surface, id).toBe('official-only');
      expect(p.unlimited!.note, id).toContain('AI Credits');
    }
  });

  it('Copilot Free 补全是有次数上限的（2000 次/月）—— 不能跟着标成不限量', () => {
    const free = byId.get('github-copilot-free')!;
    expect(free.allowance).toContain('2,000 次');
    expect(free.allowance ?? '').not.toMatch(/内联补全[^。]*不限量/);
    // 但 Free 整体仍算 mixed：它的 chat 侧有额度形态，而「补全次数上限」本身是额度
    expect(free.allowanceNature).toBe('quota');
  });

  it('CodeBuddy：付费档补全不限次，免费档是 5,000 次（限免无限次）', () => {
    // 免费档不写「不限量」—— 官方原文是「5,000 次（限免无限次）」，
    // 限免结束就回到 5,000 次，说成不限量是夸大
    const free = byId.get('tencent-codebuddy-free')!;
    expect(free.allowance).toContain('5,000 次');
    expect(free.allowance).not.toContain('补全不限次');

    for (const id of ['tencent-codebuddy-standard', 'tencent-codebuddy-advanced',
                      'tencent-codebuddy-flagship', 'tencent-buddy-one-vip']) {
      const p = byId.get(id)!;
      expect(p.allowance, id).toContain('代码实时补全不限次');
      expect(p.allowance, id).toContain('积分');
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
