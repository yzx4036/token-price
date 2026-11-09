/**
 * 对外展示用语的单一真源。
 *
 * 为什么单独一个文件：旧措辞把「数据只是从厂商官方页抓来的」写成了「本站已确认过」，
 * 而本站与厂商无授权关系（详见 docs/compliance/data-fetching.md）。改词必须一次改到位——
 * 实测同类字面量曾散在 22 个文件 49 处，各页各写一句必然漏。
 *
 * 纪律：页面里出现溯源等级、官方页价格标签、抓取日期标签时，一律从本文件取常量，
 * 不要在模板里硬写中文字面量；`tests/copy.test.ts` 会拦住写回旧词的情况。
 *
 * 本文件刻意不 import 任何运行时模块（含 ./fx）：scripts/gen-llms-txt.mjs 直接用
 * node 载入它取文案，少一层依赖就少一处 node 解析类型的风险（也避免 copy <-> fx 循环）。
 */

/** 溯源等级：官方页抓取（维护者按公开定价页逐条录入并校验，本站未获厂商背书，不代厂商表态） */
export const PROVENANCE_OFFICIAL = '官方页抓取';

/** 溯源等级：聚合数据（第三方快照补位，未核对官方页） */
export const PROVENANCE_AGGREGATE = '聚合数据';

/** 聚合条目的缺省补充说明 */
export const AGGREGATE_NOTE = '未核官方页';

/** 官方页币种口径标签（描述「厂商在官方页上标的价」，不是促销意义上的「原价」） */
export const OFFICIAL_PRICE_LABEL = '官方标价';

/** 抓取日期标签 */
export const FETCHED_AT_LABEL = '抓取日期';

/** 抓取时间介词，用于 `抓取于 2026-11-08` 这类行内标注 */
export const FETCHED_ON = '抓取于';

/** 价格缺失（不猜、不补零；也不再用暗示本站做过比对的说法） */
export const PRICE_MISSING = '缺价';

/** 字段厂商未公布：用于额度 / 周期 / 模型这类非价格字段 */
export const FIELD_UNPUBLISHED = '未公开';

/** 官方页链接的统称（不再混用「官方页面」「定价页」） */
export const SOURCE_PAGE_LABEL = '官方定价页';

/** 套餐字段标签：值抄自厂商页面，本站只转述，不代厂商背书 */
export const VENDOR_TERMS_LABEL = '用途限制（厂商转述）';

/** 套餐额度标签：与反推出来的「等效 API 用量」分列，避免读者混淆两者 */
export const ALLOWANCE_SOURCE_LABEL = '额度原文';

/** 非口径页 hero 末行的最短免责（完整四要素在页脚与 /methodology/） */
export const NON_OFFICIAL_BRIEF = '非官方站点，价格仅供参考';

/**
 * 表级汇率声明的固定骨架（数字与日期由 fx.ts 填）。
 *
 * 为什么要拆出骨架：`scripts/qa/copy-guard.mjs` 要判断「这一页是不是只写了一次」，
 * 它拿骨架当比较基准（把数字抹掉再比），所以数字必须留在占位符里，不能写死。
 */
export const FX_TABLE_NOTE_TEMPLATE =
  '价格副行 ≈ ¥ 按 1 USD = {rate} CNY（{date}）估算，汇率与账单口径见页末说明。';

/** 填好汇率与日期的表级声明（值一律由调用方从数据里取） */
export function fxTableNote(rate: string, date: string): string {
  return FX_TABLE_NOTE_TEMPLATE.replace('{rate}', rate).replace('{date}', date);
}

/** 按溯源等级取短标签 */
export function provenanceShortLabel(provenance: 'official' | 'aggregate'): string {
  return provenance === 'aggregate' ? PROVENANCE_AGGREGATE : PROVENANCE_OFFICIAL;
}
