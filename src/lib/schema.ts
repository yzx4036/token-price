import { z } from 'zod';

const nullablePrice = z.number().nonnegative().nullable();
const isoDate = z.iso.date();

export const apiPriceSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  model: z.string().min(1),
  currency: z.literal('USD'),
  unit: z.literal('per_1m_tokens'),
  inputPrice: nullablePrice,
  outputPrice: nullablePrice,
  cacheReadPrice: nullablePrice,
  cacheWritePrice: nullablePrice,
  contextTokens: z.number().int().positive().nullable(),
  sourceUrl: z.url().refine((url) => url.startsWith('https://'), '来源必须使用 HTTPS'),
  verifiedAt: isoDate,
  status: z.enum(['verified', 'pending']),
  pricingCondition: z.string().min(1),
  notes: z.string().min(1),
}).strict().superRefine((value, ctx) => {
  if (value.status === 'verified' && (value.inputPrice === null || value.outputPrice === null)) {
    ctx.addIssue({ code: 'custom', message: '已核验 API 条目必须包含输入和输出价格' });
  }
});

export const tokenPlanSchema = z.object({
  id: z.string().min(1),
  provider: z.string().min(1),
  plan: z.string().min(1),
  monthlyPrice: nullablePrice,
  currency: z.literal('USD'),
  allowance: z.string().min(1).nullable(),
  billingCycle: z.string().min(1).nullable(),
  availableModels: z.array(z.string().min(1)),
  usageRestrictions: z.string().min(1).nullable(),
  sourceUrl: z.url().refine((url) => url.startsWith('https://'), '来源必须使用 HTTPS'),
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

export type ApiPrice = z.infer<typeof apiPriceSchema>;
export type TokenPlan = z.infer<typeof tokenPlanSchema>;

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
