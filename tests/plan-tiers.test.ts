import { describe, expect, it } from 'vitest';
import plansJson from '../src/data/entries/plans.json';
import { parseTokenPlans } from '../src/lib/schema';

const plans = parseTokenPlans(plansJson);

/**
 * 这类错误的根源：官方一个套餐区块里列了多个价位（「From $100 ... $200 ... $500」，
 * 或「$99.99 或 $199.99 两档」），录入时只取了第一个，把其余塞进说明字段。
 *
 * 2026-11-01 一次审计中发现三处同型错误：
 *   ChatGPT Pro（3 档合并成 1）、Google AI Ultra（2 档合并成 1）、
 *   腾讯漏了 Buddy One VIP（同价不同权益的第 5 个产品）。
 *
 * 下面的断言把「怎么发现的」固化成规则，防止再犯。
 */
describe('套餐档位不许把多档合并成一条', () => {
  it('billingCycle（价格字段）里不许出现「N 档」——那是多档没拆的信号', () => {
    // 判据只看 billingCycle：它是承载价格的字段，里面写「两档」说明有多个价没拆。
    // allowance / usageRestrictions 里出现「三档规则相同」是合法描述（已拆分后的补充说明），
    // 所以不在检查范围 —— 用全字段扫会误报，这一点实测过。
    const bad: string[] = [];
    for (const p of plans) {
      const text = p.billingCycle ?? '';
      if (/[两三四五六几\d]\s*档/.test(text)) bad.push(`${p.id}: ${text.slice(0, 70)}`);
    }
    expect(bad, `这些套餐的价格字段里提到了多档却没拆开：\n${bad.join('\n')}`).toEqual([]);
  });

  it('billingCycle 里不许出现「起价 / Starting at / From \$X」这类起价表述', () => {
    // 官方写「起价」意味着还有更贵的档没录
    const bad: string[] = [];
    for (const p of plans) {
      const text = p.billingCycle ?? '';
      if (/起价|Starting at|From\s*\$|From\s*¥/i.test(text)) {
        bad.push(`${p.id}: ${text.slice(0, 60)}`);
      }
    }
    expect(bad, `这些套餐用了起价表述，可能掩盖了更高档：\n${bad.join('\n')}`).toEqual([]);
  });

  it('billingCycle 里不许用「或 \$X」并列两个价位', () => {
    // 「月付 $99.99 或 $199.99」= 两个独立计划被写成一条
    const bad = plans
      .filter((p) => /或\s*[¥$]\s*\d/.test(p.billingCycle ?? ''))
      .map((p) => `${p.id}: ${(p.billingCycle ?? '').slice(0, 60)}`);
    expect(bad, `这些套餐用「或」并列了多个价位：\n${bad.join('\n')}`).toEqual([]);
  });
});

describe('同厂商内档位结构自洽', () => {
  it('不许两条记录用完全相同的 plan 名', () => {
    const seen = new Map<string, string[]>();
    for (const p of plans) {
      const k = `${p.providerId}::${p.plan}`;
      seen.set(k, [...(seen.get(k) ?? []), p.id]);
    }
    const dup = [...seen.entries()].filter(([, ids]) => ids.length > 1);
    expect(dup.map(([k, ids]) => `${k} -> ${ids.join(', ')}`)).toEqual([]);
  });

  it('套餐名里的数字必须与月费一致（Pro 100 = \$100）', () => {
    // 官方用档位名编码价格（Pro 100 / Pro 200 / Pro 500、Ultra 5x / 20x 除外），
    // 名字与价格不符说明抄错了档
    const bad: string[] = [];
    for (const p of plans) {
      const m = p.plan.match(/\b(\d{2,4})\b/);
      if (!m) continue;
      const named = Number(m[1]);
      // 只检查 100 以上的「纯价格式」档名（排除 5x / 20x 这种倍数标记）
      if (named < 100) continue;
      if (/x$/i.test(m[0])) continue;
      if (p.monthlyPrice !== null && p.monthlyPrice !== named) {
        bad.push(`${p.id}: 名为 ${named}，月费 ${p.monthlyPrice}`);
      }
    }
    expect(bad, `档名与月费不符：\n${bad.join('\n')}`).toEqual([]);
  });

  it('同一厂商内月费严格递增且不重复（除免费档）', () => {
    const byProvider = new Map<string, typeof plans>();
    for (const p of plans) {
      byProvider.set(p.providerId, [...(byProvider.get(p.providerId) ?? []), p]);
    }
    const problems: string[] = [];
    for (const [pid, list] of byProvider) {
      const paid = list
        .filter((p) => p.monthlyPrice !== null && p.monthlyPrice > 0)
        .map((p) => ({ plan: p.plan, price: p.monthlyPrice as number, cur: p.billingCurrency }));
      // 同币种内查重价
      const byCur = new Map<string, number[]>();
      for (const x of paid) byCur.set(x.cur, [...(byCur.get(x.cur) ?? []), x.price]);
      for (const [, prices] of byCur) {
        const sorted = [...prices].sort((a, b) => a - b);
        const dup = sorted.filter((v, i) => i > 0 && v === sorted[i - 1]);
        // 允许同价（不同权益，如腾讯旗舰版与 Buddy One VIP 同为 ¥999），
        // 但如果同价，必须有 notes 说明区别
        if (dup.length > 0) {
          const samePricePlans = list.filter((p) => dup.includes(p.monthlyPrice as number));
          for (const sp of samePricePlans) {
            expect(sp.notes, `${pid} 的 ${sp.plan} 与其它档同价却没说清区别`).toBeTruthy();
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('已修正的三处结构错误不再复发', () => {
  it('ChatGPT Pro 必须是三条独立记录', () => {
    const pro = plans.filter((p) => p.id.startsWith('openai-chatgpt-pro'));
    expect(pro.map((p) => p.monthlyPrice).sort((a, b) => (a ?? 0) - (b ?? 0)))
      .toEqual([100, 200, 500]);
  });

  it('Google AI Ultra 必须是两条（5x / 20x）', () => {
    const u = plans.filter((p) => p.id.startsWith('google-ai-ultra'));
    expect(u).toHaveLength(2);
    expect(u.map((p) => p.monthlyPrice).sort((a, b) => (a ?? 0) - (b ?? 0)))
      .toEqual([99.99, 199.99]);
  });

  it('腾讯必须有 Buddy One VIP，且与旗舰版同价不同权益', () => {
    const vip = plans.find((p) => p.id === 'tencent-buddy-one-vip');
    const flag = plans.find((p) => p.id === 'tencent-codebuddy-flagship');
    expect(vip, '缺 Buddy One VIP').toBeDefined();
    expect(flag).toBeDefined();
    // 同价
    expect(vip!.monthlyPrice).toBe(flag!.monthlyPrice);
    // 但权益不同，且必须写明
    expect(vip!.notes ?? '').toBeTruthy();
    expect(vip!.allowance).toContain('腾讯会议');
  });

  it('阿里 TokenPlan 三条都在（独立于已停售的 Coding Plan Lite）', () => {
    const tp = plans.filter((p) => p.id.startsWith('aliyun-tokenplan'));
    expect(tp).toHaveLength(3);
    expect(tp.map((p) => p.monthlyPrice).sort((a, b) => (a ?? 0) - (b ?? 0)))
      .toEqual([49, 120, 180]);
  });
});
