import vue from '@vitejs/plugin-vue';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig } from 'vite';

/**
 * base 由 PUBLIC_BASE_PATH 驱动：
 *   默认 `/`；发布到 GitHub Pages 子路径时用 `/token-price/`（deploy-site.sh 会导出）。
 * 规范化成「始终带前后斜杠」的形式，保证 import.meta.env.BASE_URL 与 router 的 base 一致。
 */
const rawBase = process.env.PUBLIC_BASE_PATH ?? '/';
const trimmedBase = rawBase.replace(/^\/+|\/+$/g, '');
const base = trimmedBase === '' ? '/' : `/${trimmedBase}/`;

/**
 * 公众号二维码是否存在，构建期一次性判定并注入常量。
 *
 * 为什么在构建期定而不能在运行时探测：站点是静态预渲染的，
 * SSR 与客户端必须渲染出**完全相同**的 DOM，否则水合会报 mismatch。
 * 构建期算一次、两边读同一个常量，是唯一不会分叉的做法。
 *
 * 文件不存在时整个二维码区块就不渲染——不会出现破图，
 * 也不会因为「忘了放图」而被门禁判红、卡住发布。
 *
 * 扩展名按顺序探测：站长可能放 png/jpg/webp 里的任意一种，
 * 写死一个后缀会让「图放进去了但不显示」变成一个查不出原因的坏体验。
 */
const QR_CANDIDATES = ['wechat-qr.png', 'wechat-qr.jpg', 'wechat-qr.jpeg', 'wechat-qr.webp'];
const publicDir = join(import.meta.dirname, 'public');
const wechatQrFile = QR_CANDIDATES.find((name) => existsSync(join(publicDir, name))) ?? null;

/** 双构建：client 产出 dist/，ssr 产出入 dist-server/ 供 scripts/prerender.mjs 逐路由渲染 */
const isSsrBuild = process.env.BUILD_TARGET === 'ssr';

export default defineConfig({
  base,
  define: {
    __HAS_WECHAT_QR__: JSON.stringify(wechatQrFile !== null),
    __WECHAT_QR_FILE__: JSON.stringify(wechatQrFile ?? ''),
  },
  plugins: [vue()],
  build: isSsrBuild
    ? {
        ssr: 'src/entry-server.ts',
        outDir: 'dist-server',
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
          output: {
            format: 'es',
            entryFileNames: 'entry-server.js',
            chunkFileNames: 'chunks/[name]-[hash].js',
          },
        },
      }
    : {
        outDir: 'dist',
        emptyOutDir: true,
        assetsDir: 'assets',
      },
});
