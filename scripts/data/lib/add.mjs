import { resolve } from 'node:path';
import { parseApiPrices } from '../../../src/lib/schema.ts';
import {
  CliError,
  PATHS,
  fail,
  numberArg,
  parseArgs,
  readJson,
  relative,
  slugify,
  writeJsonAtomic,
} from './io.mjs';

const CURRENCIES = new Set(['CNY', 'USD']);
const PROVENANCES = new Set(['official', 'aggregate']);

export const ADD_USAGE = `用法：
  node scripts/data/cli.mjs add --provider <厂商id> --model <模型名> --input <价> --output <价> \\
    --source-url <https 来源> --verified-at <YYYY-MM-DD> [选项]

必填：
  --provider <id>        厂商 id，取值见 src/data/providers.json（如 deepseek、openai）
  --model <名称>         模型名，按官网写法填写（如 qwen3.8-flash）
  --input <数字>         输入价（每 1M tokens）
  --output <数字>        输出价（每 1M tokens）
  --source-url <https>   官方定价页或聚合条目 URL，必须 https
  --verified-at <日期>   核验日期，YYYY-MM-DD

可选：
  --billing-currency <CNY|USD>  厂商实际账单币种，缺省按厂商地区推断（国内 CNY / 国际 USD）
  --reported-currency <CNY|USD> 价格数字本身的币种，缺省等于账单币种；official 条目两者必须相同
  --cache-read <数字>    Cache 命中输入价
  --cache-write <数字>   Cache 写入价
  --context <整数>       上下文窗口（tokens）
  --provenance <official|aggregate>   溯源等级，缺省 official
  --aggregate-source <名称>           provenance=aggregate 时必填（如 models.dev）
  --id <条目id>          自定义 id；缺省按「厂商id-模型名」生成
  --force                同 id 已存在时覆盖（会打印旧值与新值）
  --entries-file <路径>  写入指定条目文件（演练/测试用，默认 src/data/entries/api.json）

示例：
  node scripts/data/cli.mjs add --provider deepseek --model deepseek-flash \\
    --input 1 --output 4 --cache-read 0.02 --billing-currency CNY \\
    --source-url https://api-docs.deepseek.com/zh-cn/quick_start/pricing --verified-at 2026-10-31
`;

function assertIsoDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) fail(`${label} 必须是 YYYY-MM-DD，收到：${value}`);
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail(`${label} 不是真实存在的日期：${value}`);
  }
  return String(value);
}

function assertPrice(value, key) {
  if (value === null) fail(`缺少参数 --${key}`);
  if (!Number.isFinite(value)) fail(`--${key} 必须是有限数字`);
  if (value < 0) fail(`--${key} 不能为负数（收到 ${value}）；价格未知时不要传该参数，而不是填负数`);
  return value;
}

function assertHttps(url, key) {
  if (!url) fail(`缺少参数 --${key}`);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail(`--${key} 不是合法 URL：${url}`);
  }
  if (parsed.protocol !== 'https:') fail(`--${key} 必须使用 https://，收到：${url}`);
  return url;
}

/** 纯校验 + 构造条目：不触碰磁盘，保证失败时文件字节不变 */
export function buildEntry(values, providers) {
  const providerId = values.provider;
  if (!providerId) fail('缺少参数 --provider');
  const provider = providers.find((item) => item.id === providerId);
  if (!provider) fail(`未知厂商 id：${providerId}；可选值：${providers.map((item) => item.id).join('、')}`);

  const model = String(values.model ?? '').trim();
  if (!model) fail('缺少参数 --model');

  const provenance = values.provenance ?? 'official';
  if (!PROVENANCES.has(provenance)) fail(`--provenance 只能是 official 或 aggregate，收到：${provenance}`);

  const billingCurrency = values['billing-currency'] ?? (provider.region === 'cn' ? 'CNY' : 'USD');
  if (!CURRENCIES.has(billingCurrency)) fail(`--billing-currency 只能是 CNY 或 USD，收到：${billingCurrency}`);
  const reportedCurrency = values['reported-currency'] ?? billingCurrency;
  if (!CURRENCIES.has(reportedCurrency)) fail(`--reported-currency 只能是 CNY 或 USD，收到：${reportedCurrency}`);
  if (provenance === 'official' && reportedCurrency !== billingCurrency) {
    fail(`official 条目的报价币种（${reportedCurrency}）必须与账单币种（${billingCurrency}）一致；官方页标什么币种就记什么币种`);
  }

  const inputPrice = assertPrice(numberArg(values, 'input'), 'input');
  const outputPrice = assertPrice(numberArg(values, 'output'), 'output');
  const cacheReadPrice = numberArg(values, 'cache-read');
  if (cacheReadPrice !== null && cacheReadPrice < 0) fail('--cache-read 不能为负数');
  const cacheWritePrice = numberArg(values, 'cache-write');
  if (cacheWritePrice !== null && cacheWritePrice < 0) fail('--cache-write 不能为负数');
  const context = numberArg(values, 'context');
  if (context !== null && (!Number.isInteger(context) || context <= 0)) fail('--context 必须是正整数（tokens）');

  const sourceUrl = assertHttps(values['source-url'], 'source-url');
  const verifiedAt = assertIsoDate(values['verified-at'], '--verified-at');

  let aggregateSource = null;
  let aggregateFetchedAt = null;
  if (provenance === 'aggregate') {
    aggregateSource = String(values['aggregate-source'] ?? '').trim();
    if (!aggregateSource) fail('provenance=aggregate 时必须提供 --aggregate-source（例如 models.dev）');
    aggregateFetchedAt = verifiedAt;
  } else if (values['aggregate-source']) {
    fail('official 条目不允许填写 --aggregate-source');
  }

  const id = values.id ? String(values.id).trim() : `${providerId}-${slugify(model)}`;
  if (!id) fail('无法从模型名生成 id（含非 ASCII 字符时请显式传 --id）');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) fail(`id 只能包含小写字母、数字与连字符：${id}`);

  return {
    id,
    providerId,
    provider: provider.nameZh,
    model,
    billingCurrency,
    reportedCurrency,
    unit: 'per_1m_tokens',
    inputPrice,
    outputPrice,
    cacheReadPrice,
    cacheWritePrice,
    contextTokens: context,
    sourceUrl,
    provenance,
    aggregateSource,
    aggregateFetchedAt,
    verifiedAt,
    status: 'verified',
    pricingCondition: values.condition ?? '按量计费标准价（未区分峰谷、批量与长上下文档）',
    notes: values.notes ?? `${provenance === 'official' ? '人工核对官方定价页' : '取自聚合源'}；由 scripts/data/cli.mjs add 写入。`,
  };
}

export function describeEntry(entry) {
  const currency = entry.reportedCurrency && entry.reportedCurrency !== entry.billingCurrency
    ? `${entry.reportedCurrency} 报价 / ${entry.billingCurrency} 账单`
    : entry.billingCurrency;
  return `${entry.provider} · ${entry.model} · 输入 ${entry.inputPrice} ${currency}/1M · 输出 ${entry.outputPrice} ${currency}/1M · ${entry.provenance}`;
}

export function addEntry(argv) {
  const { values, flags } = parseArgs(argv);
  if (flags.has('help')) return { help: ADD_USAGE };
  const providers = readJson(PATHS.providers);
  const file = values['entries-file'] ? resolve(process.cwd(), values['entries-file']) : PATHS.apiEntries;
  const existing = readJson(file);
  if (!Array.isArray(existing)) fail(`${relative(file)} 必须是条目数组`);

  const entry = buildEntry(values, providers);
  const index = existing.findIndex((item) => item.id === entry.id);

  if (index >= 0 && !flags.has('force')) {
    fail(
      `条目 ${entry.id} 已存在：${describeEntry(existing[index])}\n如需覆盖请加 --force（会打印新旧值对比）。`,
      { code: 'DUPLICATE_ID' },
    );
  }

  const next = existing.map((item) => ({ ...item }));
  const action = index >= 0 ? 'updated' : 'created';
  const previous = index >= 0 ? existing[index] : null;
  if (index >= 0) next[index] = entry;
  else next.push(entry);

  // 落盘前用页面同款 schema 全量校验；任何一条不合法都不写文件
  let validated;
  try {
    validated = parseApiPrices(next);
  } catch (error) {
    throw new CliError(`写入前校验失败，文件未修改：${error instanceof Error ? error.message : String(error)}`, {
      code: 'SCHEMA_REJECTED',
    });
  }

  writeJsonAtomic(file, next);
  return { action, entry, previous, count: validated.length, path: relative(file) };
}
