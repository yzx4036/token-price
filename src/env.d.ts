/// <reference types="vite/client" />

/**
 * 构建期注入的布尔常量（见 vite.config.ts 的 define）。
 *
 * 用它判断「public/ 下是否已放入 wechat-qr 图片」：SSR 与客户端读的是同一个值，
 * 所以不会出现水合前后 DOM 不一致。运行时用 fetch 探测会让预渲染产物
 * 与客户端首帧分叉，那是 hydration mismatch 的经典成因。
 */
declare const __HAS_WECHAT_QR__: boolean;

/** 实际命中的二维码文件名（如 wechat-qr.png）；未放入时为空串 */
declare const __WECHAT_QR_FILE__: string;
