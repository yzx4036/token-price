import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

/**
 * base 由 PUBLIC_BASE_PATH 驱动：
 *   默认 `/`；发布到 GitHub Pages 子路径时用 `/token-price/`（deploy-site.sh 会导出）。
 * 规范化成「始终带前后斜杠」的形式，保证 import.meta.env.BASE_URL 与 router 的 base 一致。
 */
const rawBase = process.env.PUBLIC_BASE_PATH ?? '/';
const trimmedBase = rawBase.replace(/^\/+|\/+$/g, '');
const base = trimmedBase === '' ? '/' : `/${trimmedBase}/`;

/** 双构建：client 产出 dist/，ssr 产出入 dist-server/ 供 scripts/prerender.mjs 逐路由渲染 */
const isSsrBuild = process.env.BUILD_TARGET === 'ssr';

export default defineConfig({
  base,
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
