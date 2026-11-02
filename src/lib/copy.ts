/**
 * 对外展示用语的单一真源。
 *
 * 为什么单独一个文件：旧措辞把「本站没做过核验、数据只是从官方页抓来的」写成了
 * 「本站已核验且得到官方确认」，而本站与厂商无授权关系（详见
 * docs/compliance/data-fetching.md）。改词必须一次改到位——实测同类字面量曾散在
 * 22 个文件 49 处，各页各写一句必然漏。
 *
 * 纪律：页面里出现溯源等级、官方页价格标签、抓取日期标签时，一律从本文件取常量，
 * 不要在模板里硬写中文字面量；`tests/copy.test.ts` 会拦住写回旧词的情况。
 */

/** 溯源等级：官方页抓取（爬虫抓公开定价页，本站未获厂商确认，不代厂商表态） */
export const PROVENANCE_OFFICIAL = '官方页抓取';

/** 溯源等级：聚合数据（第三方快照补位，未核对官方页） */
export const PROVENANCE_AGGREGATE = '聚合数据';

/** 聚合条目的缺省补充说明 */
export const AGGREGATE_NOTE = '未核官方页';

/** 官方页币种口径标签（描述「厂商在官方页上标的价」，不是促销意义上的「原价」） */
export const OFFICIAL_PRICE_LABEL = '官方标价';

/** 抓取/核验日期标签 */
export const FETCHED_AT_LABEL = '抓取日期';

/** 按溯源等级取短标签 */
export function provenanceShortLabel(provenance: 'official' | 'aggregate'): string {
  return provenance === 'aggregate' ? PROVENANCE_AGGREGATE : PROVENANCE_OFFICIAL;
}
