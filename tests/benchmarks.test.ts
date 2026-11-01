import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  baseModelName,
  computeValueScore,
  blendedPricePerMillion,
  rankByValue,
  buildBenchmarkDocument,
  findSemanticMismatches,
} from '../scripts/data/lib/benchmark.mjs';

/**
 * issue #5：模型智能性能比较。
 *
 * 守的是「映射不许猜错」与「跨币种不许混排」两件事，不是守当前分数值。
 * 分数会随评测更新，映射对错才是数据可信度的命门。
 */

interface ApiEntry {
  id: string;
  provider: string;
  model: string;
  inputPrice: number | null;
  outputPrice: number | null;
  billingCurrency: 'CNY' | 'USD';
}
interface BenchBasis {
  source: { name: string; url: string; fetchedAt: string };
  methodology: Record<string, string>;
  benchmarks: { aaSlug: string; aaName: string; creator: string; score: number; tierUsed: string }[];
  mapping: Record<string, string>;
}
interface BenchDoc {
  coverage: {
    uniqueModels: number;
    scoredModels: number;
    unscoredModels: number;
    apiEntries: number;
    apiEntriesScored: number;
    danglingMappings: string[];
  };
  models: Record<string, { score: number; aaSlug: string; tierUsed: string; creator: string } | null>;
  byEntryId: Record<string, { score: number; aaSlug: string; tierUsed: string } | null>;
}

function read<T>(p: string): T {
  return JSON.parse(readFileSync(join(process.cwd(), p), 'utf8')) as T;
}

const basis = read<BenchBasis>('src/data/estimates/benchmark-basis.json');
const api = read<ApiEntry[]>('src/data/entries/api.json');
const generated = read<BenchDoc>('src/data/generated/benchmarks.generated.json');
const doc = buildBenchmarkDocument(basis, api) as BenchDoc;

describe('#5 模型名归一口径', () => {
  it('去掉时段、上下文长度、prompt 长度等价格变体后缀', () => {
    expect(baseModelName('deepseek-flash（空闲时段）')).toBe('deepseek-flash');
    expect(baseModelName('GPT-6 Sol（长上下文 >272K）')).toBe('GPT-6 Sol');
    expect(baseModelName('grok-4.7（prompt<200K）')).toBe('grok-4.7');
    expect(baseModelName('GLM-5.1（≤32K）')).toBe('GLM-5.1');
    expect(baseModelName('GPT-5.5 (<272K Context Length)')).toBe('GPT-5.5');
  });

  it('不误伤本身带括号语义的模型名', () => {
    // MiniMax-M3 的两个变体是上下文长度，应归一到同一个模型
    expect(baseModelName('MiniMax-M3（≤512k 输入）')).toBe('MiniMax-M3');
    expect(baseModelName('MiniMax-M3（>512k 输入）')).toBe('MiniMax-M3');
  });

  it('同一模型的多个价格变体归到同一个基础名', () => {
    const variants = api.filter((e) => baseModelName(e.model) === 'deepseek-v4-pro');
    expect(variants.length).toBeGreaterThan(1);
    expect(new Set(variants.map((v) => v.model)).size).toBeGreaterThan(1);
  });
});

describe('#5 映射可信度', () => {
  it('每条映射指向的评分都真实存在（不许悬空）', () => {
    expect(doc.coverage.danglingMappings).toEqual([]);
  });

  it('映射两端语义一致 —— 挡住「A 的分数安到 B 头上」的笔误', () => {
    // 这是最危险的错误类型：slug 存在、分数在区间、结构全合法，
    // 但结论彻底错。实测手写成 "GPT-6 Luna": "claude-opus-5-5" 时，
    // 只有这条断言能抓住。
    expect(findSemanticMismatches(basis)).toEqual([]);
  });

  it('语义守卫本身有效（反例必须被拦）', () => {
    const broken = {
      ...basis,
      mapping: { ...basis.mapping, 'GPT-6 Luna': 'claude-opus-5-5' },
    };
    const bad = findSemanticMismatches(broken);
    expect(bad.length).toBe(1);
    expect(bad[0]).toContain('GPT-6 Luna');
    expect(bad[0]).toContain('claude-opus-5-5');
  });

  it('每条映射都必须能在 benchmarks 里找到同名 slug', () => {
    const slugs = new Set(basis.benchmarks.map((b) => b.aaSlug));
    for (const [ourModel, aaSlug] of Object.entries(basis.mapping)) {
      expect(slugs.has(aaSlug), `${ourModel} → ${aaSlug} 不存在`).toBe(true);
    }
  });

  it('每个评分都在合理区间且写明采信的推理档', () => {
    for (const b of basis.benchmarks) {
      expect(b.score).toBeGreaterThan(0);
      expect(b.score).toBeLessThanOrEqual(100);
      expect(b.tierUsed, `${b.aaSlug} 缺 tierUsed`).toBeTruthy();
    }
  });

  it('映射的键必须是我们真实存在的模型（防止手写表写错名）', () => {
    const ourModels = new Set(api.map((e) => baseModelName(e.model)));
    for (const ourModel of Object.keys(basis.mapping)) {
      expect(ourModels.has(ourModel), `映射里的 ${ourModel} 不在 api.json 里`).toBe(true);
    }
  });

  it('拿不到评分的模型必须显式写 null，不能缺字段', () => {
    for (const [model, v] of Object.entries(doc.models)) {
      if (v === null) continue; // 未评测：明确 null
      expect(v.score, `${model} 有对象却没分数`).toBeTypeOf('number');
    }
    // 未评测的也要有键（值为 null），否则前端无法区分「未评测」与「没这个模型」
    expect(Object.keys(doc.models).length).toBe(doc.coverage.uniqueModels);
  });
});

describe('#5 覆盖率口径', () => {
  it('覆盖率按唯一模型算，不按价格变体算', () => {
    // 129 条 API 里很多是同一模型的时段/上下文变体，按条目算会把覆盖率算虚高
    const unique = new Set(api.map((e) => baseModelName(e.model)));
    expect(doc.coverage.uniqueModels).toBe(unique.size);
    expect(doc.coverage.apiEntries).toBe(api.length);
    expect(doc.coverage.uniqueModels).toBeLessThan(api.length);
  });

  it('有评分 + 未评测 = 唯一模型总数', () => {
    const c = doc.coverage;
    expect(c.scoredModels + c.unscoredModels).toBe(c.uniqueModels);
  });

  it('主流国际厂商的核心模型都应有评分（抽样断言，不锁全部）', () => {
    for (const m of ['GPT-6 Astra', 'Claude Opus 5.5', 'Gemini 4 Argon', 'grok-4.7']) {
      expect(doc.models[m], `${m} 缺评分`).not.toBeNull();
    }
  });
});

describe('#5 产物一致性', () => {
  it('入库产物与重算结果一致（改依据必须重跑脚本）', () => {
    expect(JSON.stringify(generated.byEntryId)).toBe(JSON.stringify(doc.byEntryId));
  });
});

describe('#5 性价比', () => {
  const entry = (over: Partial<ApiEntry>): ApiEntry =>
    ({ id: 'x', provider: 'P', model: 'M', inputPrice: 2, outputPrice: 10, billingCurrency: 'USD', ...over }) as ApiEntry;

  it('按 3:1 混合算每百万 token 价：(3×输入+输出)/4', () => {
    // (3×2 + 10)/4 = 4
    expect(blendedPricePerMillion(entry({}))).toBe(4);
  });

  it('缺价格返回 null，不猜', () => {
    expect(blendedPricePerMillion(entry({ inputPrice: null }))).toBeNull();
    expect(computeValueScore(entry({ outputPrice: null }), 50)).toBeNull();
  });

  it('缺评分或分数为 0 返回 null', () => {
    expect(computeValueScore(entry({}), 0)).toBeNull();
    expect(computeValueScore(entry({}), null as unknown as number)).toBeNull();
  });

  it('便宜且强的模型每分智能成本更低', () => {
    const cheapStrong = computeValueScore(entry({ inputPrice: 0.1, outputPrice: 0.5 }), 40)!;
    const priceyWeak = computeValueScore(entry({ inputPrice: 10, outputPrice: 50 }), 20)!;
    expect(cheapStrong.costPerScorePoint).toBeLessThan(priceyWeak.costPerScorePoint);
  });

  it('同分时更便宜的性价比更高', () => {
    const a = computeValueScore(entry({ inputPrice: 1, outputPrice: 2 }), 30)!;
    const b = computeValueScore(entry({ inputPrice: 5, outputPrice: 5 }), 30)!;
    expect(a.costPerScorePoint).toBeLessThan(b.costPerScorePoint);
  });

  it('跨币种绝不合并排名（汇率波动不该伪装成性价比变化）', () => {
    const rows = [
      { entry: entry({ id: 'usd1', billingCurrency: 'USD', inputPrice: 2, outputPrice: 10 }), score: 40 },
      { entry: entry({ id: 'cny1', billingCurrency: 'CNY', inputPrice: 1, outputPrice: 4 }), score: 30 },
    ];
    const groups = rankByValue(rows) as Record<string, unknown[]>;
    expect(Object.keys(groups).sort()).toEqual(['CNY', 'USD']);
    expect(groups.USD).toHaveLength(1);
    expect(groups.CNY).toHaveLength(1);
  });

  it('组内按每分智能成本升序', () => {
    const rows = [
      { entry: entry({ id: 'a', inputPrice: 10, outputPrice: 50 }), score: 50 },
      { entry: entry({ id: 'b', inputPrice: 0.1, outputPrice: 0.5 }), score: 25 },
      { entry: entry({ id: 'c', inputPrice: 2, outputPrice: 10 }), score: 50 },
    ];
    const groups = rankByValue(rows) as Record<string, { entry: ApiEntry }[]>;
    expect(groups.USD.map((r) => r.entry.id)).toEqual(['b', 'c', 'a']);
  });
});
