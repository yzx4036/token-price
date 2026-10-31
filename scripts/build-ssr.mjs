#!/usr/bin/env node
/**
 * SSR 构建包装器：设置 BUILD_TARGET=ssr 后 spawn vite build。
 *
 * 为什么不写 cross-env / 不写 npx vite：
 *   - 不引入额外依赖（req §7 N7）；
 *   - `npx vite ...` 在本机会被工具链误判成长驻进程拒跑（req §2 F20），
 *     所以统一用 node + node_modules/vite/bin/vite.js 直接调用。
 */
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const viteBin = join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');

const result = spawnSync(process.execPath, [viteBin, 'build'], {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, BUILD_TARGET: 'ssr' },
});

if (result.error) {
  console.error('[build:ssr] 启动 vite 失败：', result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
