/**
 * 站点身份与作者的单一来源。
 *
 * 为什么集中在一个文件：站点全名会被 title、header、footer、JSON-LD、llms.txt
 * 五处引用，作者信息还会被结构化数据与「数据来源」页引用。散落各处的结果是
 * 改一次要搜全仓，而且必然有漏网的一处（线上就出现过 title 改了、og 没改）。
 */

/** 站点全名（用户指定，勿自行简写） */
export const SITE_NAME = 'AI Token Pricing';

/**
 * 子页 title 后缀用的品牌名。
 *
 * 当前与全名一致（16 字符，拼进 title 后仍在 60 字符内）。
 * 保留这个常量是为了将来站名变长时，只改一处就能让子页 title 不被截断。
 */
export const SITE_SHORT = SITE_NAME;

/** 站点一句话定位，用于结构化数据与 llms.txt */
export const SITE_TAGLINE =
  '面向中文开发者的 AI 模型与订阅套餐价格对比站：按原币种标价比较，逐条标注官方页抓取或聚合来源。';

/** 维护者。只在「数据来源」页与结构化数据里出现，不铺到全站页脚。 */
export const AUTHOR = {
  name: 'WhyZero',
  /** 公众号引导文案（用户提供原文，勿改写） */
  wechatIntro: '欢迎关注我的微信公众号，一个名不见经传的游戏开发码农、独立开发者。专注游戏开发与AI工作流实践。',
} as const;

/**
 * 二维码图片的最终 URL。
 *
 * 两点必须注意：
 * 1) 文件名来自构建期常量（public/ 下可能放 png/jpg/webp 任一种），
 *    不能写死后缀；
 * 2) 必须拼 `BASE_URL`：站点发布在 /token-price/ 子路径下，
 *    写成 `/wechat-qr.png` 会指向域名根、拿到 404。
 *    这一点和 index.html 里的 favicon 不同——那里由 Vite 静态改写，
 *    运行时拼出来的字符串它看不到。
 */
export const QR_SRC = __HAS_WECHAT_QR__ ? `${import.meta.env.BASE_URL}${__WECHAT_QR_FILE__}` : '';

/** 全站通用免责（页脚与结构化数据共用，避免两处措辞不一致） */
export const SITE_DISCLAIMER =
  '本站是个人维护的静态信息与估算工具，与所收录厂商无隶属、合作或授权关系，不代表任何厂商，不构成采购、财务或法律建议。厂商名称与商标归各自权利人所有。';
