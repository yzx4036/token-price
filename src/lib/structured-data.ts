/**
 * 结构化数据（JSON-LD）生成。
 *
 * 为什么必须做：这是「生成式引擎优化（GEO）」最有效的一层——AI 搜索
 * （豆包 / Kimi / 元宝 / Perplexity / ChatGPT Search）在判断「这个数字能不能引用」时，
 * 最先看的就是页面上有没有机器可读的结构化声明：谁做的、什么时候更新的、
 * 数据覆盖什么范围、依据是什么。纯自然语言页面它们只能靠猜。
 *
 * 本文件只产出纯数据对象，序列化与注入 head 由 prerender 负责，
 * 便于在测试里直接断言字段而不必解析 HTML。
 */
import { AUTHOR, SITE_NAME, SITE_TAGLINE } from './site-meta';

export type JsonLd = Record<string, unknown>;

export type StructuredDataInput = {
  /** 站点根 URL，如 https://whyzero.studio/token-price/ */
  origin: string;
  /** 当前页面绝对 URL */
  url: string;
  /** 页面标题 */
  title: string;
  /** 页面描述 */
  description: string;
  /** 路由路径，用于生成面包屑 */
  route: string;
  /** 数据最近核验日期（YYYY-MM-DD） */
  dateModified: string;
};

/** 路由 → 面包屑名称。与 ROUTE_DOCUMENT_META 的页面名保持一致 */
const BREADCRUMB_LABELS: Record<string, string> = {
  '/': '首页',
  '/api-pricing/': 'API 按量价格',
  '/plans/': 'Token Plan / Coding Plan',
  '/calculator/': '成本计算器',
  '/sources/': '数据来源',
  '/methodology/': '数据口径',
};

/**
 * 站点级实体。
 *
 * 用 `WebSite` 而不是 `Organization`：本站没有工商主体，硬套 Organization
 * 会给出一个查不到的实体，反而降低可信度分数。作者身份放在 `creator` 里。
 */
export function websiteSchema(input: StructuredDataInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${input.origin}#website`,
    name: SITE_NAME,
    alternateName: 'AI API 价格对比',
    description: SITE_TAGLINE,
    url: input.origin,
    inLanguage: 'zh-CN',
    creator: {
      '@type': 'Person',
      name: AUTHOR.name,
    },
  };
}

/**
 * 数据集实体——本站最核心的语义。
 *
 * 声明成 `Dataset` 而非普通网页，是给 AI 引擎一个明确信号：
 * 「这里是一份可引用的数据，有覆盖范围、有更新日期、有许可」。
 * `temporalCoverage` 与 `dateModified` 是 AI 判断「是否过期」的主要依据，
 * 缺了它们，引擎宁可不用也不愿引用过期数字。
 */
export function datasetSchema(input: StructuredDataInput, counts: {
  entries: number;
  providers: number;
  official: number;
  aggregate: number;
}): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    '@id': `${input.origin}#dataset`,
    name: 'AI API 与订阅套餐价格数据集',
    description:
      `覆盖 ${counts.providers} 家厂商、${counts.entries} 条计价的 AI 模型价格与订阅套餐数据集；`
      + `其中 ${counts.official} 条逐条核对官方定价页，${counts.aggregate} 条取自第三方聚合源并显式标注。`,
    url: input.url,
    inLanguage: 'zh-CN',
    creator: { '@type': 'Person', name: AUTHOR.name },
    dateModified: input.dateModified,
    // 只声明「从什么时候开始有数据」，不声明结束日期：
    // 结束日期写错会让引擎直接判定数据失效
    temporalCoverage: `${input.dateModified}/..`,
    isAccessibleForFree: true,
    keywords: ['AI API 价格', 'Token Plan', 'Coding Plan', '大模型定价', '人民币汇率换算'],
    variableMeasured: [
      { '@type': 'PropertyValue', name: '输入价格（每百万 token）' },
      { '@type': 'PropertyValue', name: '输出价格（每百万 token）' },
      { '@type': 'PropertyValue', name: '缓存读写价格（每百万 token）' },
      { '@type': 'PropertyValue', name: '套餐月费' },
    ],
  };
}

/** 面包屑：让引擎知道这一页在站点里的位置，也是搜索结果里的路径展示来源 */
export function breadcrumbSchema(input: StructuredDataInput): JsonLd {
  const label = BREADCRUMB_LABELS[input.route] ?? input.title;
  const items = [{ name: '首页', url: input.origin }];
  if (input.route !== '/') items.push({ name: label, url: input.url });

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/** WebPage：把页面的标题/描述/所属站点串起来 */
export function webpageSchema(input: StructuredDataInput): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    '@id': input.url,
    url: input.url,
    name: input.title,
    description: input.description,
    inLanguage: 'zh-CN',
    isPartOf: { '@id': `${input.origin}#website` },
    dateModified: input.dateModified,
  };
}

/** 组装某页面要注入的全部结构化数据 */
export function buildStructuredData(
  input: StructuredDataInput,
  counts: { entries: number; providers: number; official: number; aggregate: number },
  isHome: boolean,
): JsonLd[] {
  const schemas: JsonLd[] = [webpageSchema(input), breadcrumbSchema(input)];
  if (isHome) {
    // 站点与数据集实体只在首页声明一次：每页都声明会被当成重复实体
    schemas.push(websiteSchema(input), datasetSchema(input, counts));
  }
  return schemas;
}
