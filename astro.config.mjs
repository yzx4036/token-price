import { defineConfig } from 'astro/config';

const configuredBase = process.env.PUBLIC_BASE_PATH || '/';
const base = `/${configuredBase.replace(/^\/+|\/+$/g, '')}`;

export default defineConfig({
  output: 'static',
  base: base === '/' ? '/' : base,
  trailingSlash: 'always',
});
