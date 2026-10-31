import { defineConfig } from 'vitest/config';

/**
 * 测试只跑在 node 环境：既有 10 个测试文件都基于 lib 层与可注入的 DOM 桩，
 * 不需要 jsdom，也不加载 .vue（组件逻辑都在 lib / scripts 里，可被直接引用）。
 * 单独一份配置，避免把 vite.config.ts 的 build 分支带进测试。
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
