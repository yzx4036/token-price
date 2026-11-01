import { z } from 'zod';

export const billingCurrencySchema = z.enum(['CNY', 'USD']);
export const provenanceSchema = z.enum(['official', 'aggregate']);
export const providerRegionSchema = z.enum(['cn', 'intl']);

export type BillingCurrency = z.infer<typeof billingCurrencySchema>;
/** 报价币种：这条数字本身以什么币种表达（与账单币种分开记录） */
export type ReportedCurrency = BillingCurrency;
export type Provenance = z.infer<typeof provenanceSchema>;
export type ProviderRegion = z.infer<typeof providerRegionSchema>;

const nullablePrice = z.number().nonnegative().nullable();
const isoDate = z.iso.date();
const httpsUrl = z.url().refine((url) => url.startsWith('https://'), '来源必须使用 HTTPS');

export const providerSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, '厂商 id 只能包含小写字母、数字与连字符'),
  nameZh: z.string().min(1),
  nameEn: z.string().min(1),
  region: providerRegionSchema,
  website: httpsUrl,
  pricingUrl: httpsUrl,
  // 对应 models.dev 的 provider key；没有聚合源时为 null
  aggregateProvider: z.string().min(1).nullable(),
}).strict();

export const apiPriceSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  // 厂商实际计价币种（账单真相），不是展示币种
  billingCurrency: billingCurrencySchema,
  // 这条数字本身以什么币种表达；聚合源对国内厂商也以 USD 发布，此处与 billingCurrency 不同
  reportedCurrency: billingCurrencySchema,
  unit: z.literal('per_1m_tokens'),
  inputPrice: nullablePrice,
  outputPrice: nullablePrice,
  cacheReadPrice: nullablePrice,
  cacheWritePrice: nullablePrice,
  contextTokens: z.number().int().positive().nullable(),
  sourceUrl: httpsUrl,
  provenance: provenanceSchema,
  aggregateSource: z.string().min(1).nullable(),
  aggregateFetchedAt: isoDate.nullable(),
  verifiedAt: isoDate,
  status: z.enum(['verified', 'pending']),
  pricingCondition: z.string().min(1),
  notes: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'verified' && (value.inputPrice === null || value.outputPrice === null)) {
    ctx.addIssue({ code: 'custom', message: '已核验 API 条目必须包含输入和输出价格' });
  }
  if (value.provenance === 'official') {
    if (value.aggregateSource !== null) {
      ctx.addIssue({ code: 'custom', message: '官方核验条目不得填写 aggregateSource' });
    }
    if (value.aggregateFetchedAt !== null) {
      ctx.addIssue({ code: 'custom', message: '官方核验条目不得填写 aggregateFetchedAt' });
    }
    // 官方页标什么币种，数字就是什么币种，账单也按同一币种，不允许两处不一致
    if (value.reportedCurrency !== value.billingCurrency) {
      ctx.addIssue({
        code: 'custom',
        path: ['reportedCurrency'],
        message: `official 条目的报价币种（${value.reportedCurrency}）必须与账单币种（${value.billingCurrency}）一致`,
      });
    }
  }
  if (value.provenance === 'aggregate') {
    if (value.aggregateSource === null) {
      ctx.addIssue({ code: 'custom', message: '聚合条目必须填写 aggregateSource' });
    }
    if (value.aggregateFetchedAt === null) {
      ctx.addIssue({ code: 'custom', message: '聚合条目必须填写 aggregateFetchedAt' });
    }
  }
});

export const tokenPlanSchema = z.object({
  id: z.string().min(1),
  providerId: z.string().min(1),
  provider: z.string().min(1),
  plan: z.string().min(1),
  monthlyPrice: nullablePrice,
  billingCurrency: billingCurrencySchema,
  allowance: z.string().min(1).nullable(),
  billingCycle: z.string().min(1).nullable(),
  availableModels: z.array(z.string().min(1)),
  usageRestrictions: z.string().min(1).nullable(),
  /**
   * 额度性质。用户只能看到「多少额度」，但真正决定能不能长期用下去的是
   * 「这额度有没有天花板」——所以把口径结构化，不让它埋在自由文本里。
   *
   * - mixed：有真·不限量项，但模型/功能层另有天花板。
   *          ChatGPT 的日常文本对话四档都不限量，可 GPT-6 全系在 Pro 上也只给
   *          「扩展额度」；Copilot 的补全不限量，可 chat 走 credits —— 都是这一类。
   * - quota：纯额度。积分 / 请求次数 / 相对倍率，一律有上限。
   * - undisclosed：官方只给定性描述，不披露数值。
   *
   * 缺省没有值：新条目必须显式想一遍自己是哪一类，不许默认成「不限量」。
   */
  allowanceNature: z.enum(['mixed', 'quota', 'undisclosed']),
  /**
   * 补充说明。主要用于「同厂商同价但权益不同」的档位
   * （如腾讯旗舰版与 Buddy One VIP 都是 ¥999）——没有这个字段就说不清区别。
   */
  notes: z.string().min(1).optional(),
  /**
   * 面向哪个市场卖。
   * 国内厂商（region=cn）在国内站卖的一律 domestic、以人民币挂牌；
   * 同一厂商的国际品牌（如智谱的 Z.AI、月之暗面的 kimi.ai）单列时标 international。
   * 缺省视为 domestic —— 已有条目不必逐条补。
   */
  market: z.enum(['domestic', 'international']).optional(),
  sourceUrl: httpsUrl,
  verifiedAt: isoDate,
  status: z.enum(['verified', 'pending']),
}).strict().superRefine((value, ctx) => {
  if (value.status !== 'verified') return;
  const missingCoreField = value.monthlyPrice === null
    || value.allowance === null
    || value.billingCycle === null
    || value.usageRestrictions === null
    || value.availableModels.length === 0;
  if (missingCoreField) {
    ctx.addIssue({ code: 'custom', message: '已核验 Token Plan 必须包含月费、额度、周期、模型与用途限制' });
  }
});

// 汇率生成物必须入库，缺失即构建失败：不允许把汇率写成代码常量当唯一来源
export const fxSchema = z.object({
  base: z.literal('USD'),
  quote: z.literal('CNY'),
  rate: z.number().positive(),
  source: z.string().min(1),
  sourceUrl: httpsUrl,
  fetchedAt: z.iso.datetime(),
  date: isoDate,
}).strict();

// 聚合导入生成物：整份文件与每条 provenance 一并入库
export const aggregateFileSchema = z.object({
  source: z.string().min(1),
  sourceUrl: httpsUrl,
  fetchedAt: z.iso.datetime(),
  providerStats: z.object({
    providers: z.number().int().nonnegative(),
    models: z.number().int().nonnegative(),
  }).strict(),
  entries: z.array(apiPriceSchema),
}).strict();

export type Provider = z.infer<typeof providerSchema>;
export type ApiPrice = z.infer<typeof apiPriceSchema>;
export type TokenPlan = z.infer<typeof tokenPlanSchema>;
export type FxRate = z.infer<typeof fxSchema>;
export type AggregateFile = z.infer<typeof aggregateFileSchema>;

function parseUniqueCollection<T>(schema: z.ZodType<T>, input: unknown, label: string): T[] {
  const values = z.array(schema).parse(input);
  const ids = new Set<string>();
  for (const value of values) {
    const id = (value as { id: string }).id;
    if (ids.has(id)) throw new Error(`${label} 存在重复 id: ${id}`);
    ids.add(id);
  }
  return values;
}

export const parseApiPrices = (input: unknown): ApiPrice[] =>
  parseUniqueCollection(apiPriceSchema, input, 'API 价格');

export const parseTokenPlans = (input: unknown): TokenPlan[] =>
  parseUniqueCollection(tokenPlanSchema, input, 'Token Plan');

export const parseProviders = (input: unknown): Provider[] =>
  parseUniqueCollection(providerSchema, input, '厂商');

export const parseFxRate = (input: unknown): FxRate => fxSchema.parse(input);

export function parseAggregateFile(input: unknown): AggregateFile {
  const file = aggregateFileSchema.parse(input);
  const entries = parseUniqueCollection(apiPriceSchema, file.entries, '聚合 API 价格');
  const notAggregate = entries.filter((entry) => entry.provenance !== 'aggregate');
  if (notAggregate.length > 0) {
    throw new Error(`聚合生成物只允许 aggregate 条目，发现: ${notAggregate.map((entry) => entry.id).join(', ')}`);
  }
  return { ...file, entries };
}

/** 只保留 ASCII 字母数字，用于生成稳定 id 片段 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** 「deepseek-flash（空闲时段）」-> deepseekflash，用于跨来源同模型判定 */
export function normalizeModelName(model: string): string {
  return model
    .split(/[（(]/)[0]
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** 同模型判定键：厂商 + 去掉时段括号后的模型名 */
export function modelKey(entry: Pick<ApiPrice, 'providerId' | 'model'>): string {
  return `${entry.providerId}::${normalizeModelName(entry.model)}`;
}

/**
 * 溯源优先级合并：手写条目（含官方核验）永远优先，聚合条目只补空缺。
 * 1) id 相同 -> 丢弃聚合条目；
 * 2) 同厂商同模型已有 official -> 丢弃聚合条目（官方胜出）；
 * 3) 聚合内部同模型只保留排序在前的一条。
 */
export function mergeApiPrices(primary: readonly ApiPrice[], aggregate: readonly ApiPrice[]): ApiPrice[] {
  const result = [...primary];
  const ids = new Set(primary.map((entry) => entry.id));
  const officialKeys = new Set(primary.filter((entry) => entry.provenance === 'official').map(modelKey));
  const seenKeys = new Set(primary.map(modelKey));
  for (const entry of aggregate) {
    if (ids.has(entry.id)) continue;
    const key = modelKey(entry);
    if (officialKeys.has(key)) continue;
    if (seenKeys.has(key)) continue;
    ids.add(entry.id);
    seenKeys.add(key);
    result.push(entry);
  }
  return result;
}
