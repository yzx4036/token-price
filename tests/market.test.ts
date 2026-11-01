import { describe, expect, it } from 'vitest';
import plansJson from '../src/data/entries/plans.json';
import apiJson from '../src/data/entries/api.json';
import providersJson from '../src/data/providers.json';
import { parseProviders, parseTokenPlans, parseApiPrices } from '../src/lib/schema';
import { findCurrencyViolations, isInternational, marketBadge } from '../src/lib/market';
import { filterPlansByRegion } from '../src/lib/plans';

const plans = parseTokenPlans(plansJson);
const providers = parseProviders(providersJson);
const api = parseApiPrices(apiJson);
const cnProviders = new Set(providers.filter((p) => p.region === 'cn').map((p) => p.id));

describe('国内厂商的计价币种纪律', () => {
  it('国内厂商在 API 单价表里不允许出现非人民币条目', () => {
    const offenders = api
      .filter((entry) => cnProviders.has(entry.providerId) && entry.billingCurrency !== 'CNY')
      .map((entry) => `${entry.id}(${entry.billingCurrency})`);
    expect(offenders).toEqual([]);
  });

  it('国内厂商的国内版套餐必须是人民币', () => {
    const offenders = findCurrencyViolations(plans, providers)
      .map((plan) => `${plan.id}(${plan.billingCurrency})`);
    expect(offenders).toEqual([]);
  });

  it('国内厂商用美元挂牌的套餐必须显式标为国际版', () => {
    // 反过来卡住：只要出现 USD，就必须有 market: international，
    // 否则就是「国内价偷换成美元」，读者会误以为是国内套餐
    const offenders = plans
      .filter((plan) => cnProviders.has(plan.providerId)
        && plan.billingCurrency !== 'CNY'
        && !isInternational(plan))
      .map((plan) => plan.id);
    expect(offenders).toEqual([]);
  });

  it('每个国内厂商都至少有一条人民币套餐或人民币 API 价', () => {
    // 防止「整个厂商被美元记录顶替」这种静默错误
    for (const providerId of cnProviders) {
      const hasCnyPlan = plans.some((p) => p.providerId === providerId && p.billingCurrency === 'CNY');
      const hasCnyApi = api.some((e) => e.providerId === providerId && e.billingCurrency === 'CNY');
      const hasIntel = plans.some((p) => p.providerId === providerId);
      if (!hasIntel) continue; // 该厂商在本站没有收录任何套餐，跳过
      expect(
        hasCnyPlan || hasCnyApi,
        `${providerId}（国内厂商）没有任何人民币定价记录`,
      ).toBe(true);
    }
  });
});

describe('国际版标记', () => {
  it('国内版条目不显示徽章', () => {
    const domestic = plans.filter((plan) => !isInternational(plan));
    expect(domestic.length).toBeGreaterThan(0);
    for (const plan of domestic) expect(marketBadge(plan)).toBeNull();
  });

  it('国际版条目必须显示徽章', () => {
    const intl = plans.filter(isInternational);
    expect(intl.length).toBeGreaterThan(0);
    for (const plan of intl) expect(marketBadge(plan)).toBe('国际版');
  });

  it('国际版条目必须写明「它和国内版是两套定价」的依据', () => {
    // 只打个徽章不解释等于没标。要求来源或限制说明里出现能追溯的文字
    for (const plan of plans.filter(isInternational)) {
      const text = `${plan.usageRestrictions ?? ''}${plan.sourceUrl}`;
      expect(
        /国际版|海外|z\.ai|kimi\.ai|bigmodel\.cn|国内站/i.test(text),
        `${plan.id} 标了国际版但没有说明它对应哪个国内产品/站点`,
      ).toBe(true);
    }
  });

  it('智谱的国际版（Z.AI）与国内版（GLM Coding Plan）同时存在，档位可对照', () => {
    const zai = plans.filter((p) => p.providerId === 'zhipu' && isInternational(p));
    const glm = plans.filter((p) => p.providerId === 'zhipu' && !isInternational(p));
    expect(zai.length).toBe(3);
    expect(glm.length).toBe(3);
    // 国际版美元、国内版人民币 —— 币种不同才是标国际版的意义
    for (const plan of zai) expect(plan.billingCurrency).toBe('USD');
    for (const plan of glm) expect(plan.billingCurrency).toBe('CNY');
  });
});

describe('Kimi Code 用国内站人民币价', () => {
  it('四档都以人民币挂牌', () => {
    const kimi = plans.filter((p) => p.providerId === 'moonshot');
    expect(kimi).toHaveLength(4);
    for (const plan of kimi) {
      expect(plan.billingCurrency).toBe('CNY');
      expect(plan.sourceUrl).toContain('kimi.com');
    }
  });

  it('月费对上官方四档刊例价', () => {
    const byId = new Map(plans.map((p) => [p.id, p]));
    expect(byId.get('moonshot-kimi-code-plus')?.monthlyPrice).toBe(99);
    expect(byId.get('moonshot-kimi-code-pro')?.monthlyPrice).toBe(199);
    expect(byId.get('moonshot-kimi-code-max')?.monthlyPrice).toBe(699);
    expect(byId.get('moonshot-kimi-code-ultra')?.monthlyPrice).toBe(1399);
  });

  it('年付折合月价与「按年计费」总额自洽（12 倍关系）', () => {
    const byId = new Map(plans.map((p) => [p.id, p]));
    const cases: Array<[string, number, number]> = [
      ['moonshot-kimi-code-plus', 79, 948],
      ['moonshot-kimi-code-pro', 159, 1908],
      ['moonshot-kimi-code-max', 559, 6708],
      ['moonshot-kimi-code-ultra', 1119, 13428],
    ];
    for (const [id, perMonth, annual] of cases) {
      const cycle = byId.get(id)?.billingCycle ?? '';
      expect(cycle, `${id} 周期说明缺少年付额`).toContain(String(annual).replace(/\B(?=(\d{3})+(?!\d))/g, ','));
      expect(perMonth * 12).toBe(annual);
    }
  });

  it('不保留无法核验的美元报价', () => {
    // kimi.ai 的价格由页面 JS 渲染，探测不到就如实说不知道，不许把旧数字留着
    for (const plan of plans.filter((p) => p.providerId === 'moonshot')) {
      expect(/\$\s*\d/.test(plan.usageRestrictions ?? '')).toBe(false);
    }
  });
});

describe('同一模型不因币种重复收录', () => {
  it('不存在「同厂商 + 同模型 + 同价格」的跨币种重复行', () => {
    // DeepSeek 的 deepseek-flash 曾是重灾区：人民币价与美元价各录一遍，
    // 读者看到同一模型两个数字。这里按「厂商+归一化模型名」查重。
    const norm = (s: string) => s
      .replace(/[（(].*?[)）]/g, '')
      .replace(/[\s\-_.]/g, '')
      .toLowerCase();
    const seen = new Map<string, string[]>();
    for (const entry of api) {
      const key = `${entry.providerId}::${norm(entry.model)}`;
      seen.set(key, [...(seen.get(key) ?? []), entry.id]);
    }
    const dups = [...seen.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([key, ids]) => `${key} -> ${ids.join(', ')}`);
    // 允许同模型的「空闲时段 / 高峰时段」两条（价格不同才留），但不允许币种不同
    for (const dup of dups) {
      const ids = dup.split(' -> ')[1].split(', ');
      const currencies = new Set(ids.map((id) => api.find((e) => e.id === id)?.billingCurrency));
      expect(currencies.size, `${dup} 同一模型出现多种币种`).toBe(1);
    }
  });
});

describe('地区筛选按「卖给谁」判定', () => {
  const regionByProviderId = Object.fromEntries(providers.map((p) => [p.id, p.region]));

  it('国际版套餐不出现在「国内」筛选结果里', () => {
    const cn = filterPlansByRegion(plans, 'cn', regionByProviderId);
    expect(cn.filter(isInternational)).toEqual([]);
    // 也不能反过来把国内版漏掉
    expect(cn.length).toBeGreaterThan(0);
    for (const plan of cn) expect(plan.billingCurrency).toBe('CNY');
  });

  it('国际版套餐出现在「国外」筛选结果里', () => {
    const intl = filterPlansByRegion(plans, 'intl', regionByProviderId);
    const intlPlans = intl.filter((p) => p.providerId === 'zhipu' && isInternational(p));
    expect(intlPlans).toHaveLength(3);
  });

  it('国内 + 国外 = 全部（不重不漏）', () => {
    const cn = filterPlansByRegion(plans, 'cn', regionByProviderId);
    const intl = filterPlansByRegion(plans, 'intl', regionByProviderId);
    expect(cn.length + intl.length).toBe(plans.length);
    const ids = new Set([...cn, ...intl].map((p) => p.id));
    expect(ids.size).toBe(plans.length);
  });
});
