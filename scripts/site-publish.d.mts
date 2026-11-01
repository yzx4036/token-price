/** 类型声明：脚本是 .mjs（Node 直接执行），测试用 TS 导入时靠这份声明。 */
export const ROOT: string;

export class PublishError extends Error {}

export function validateSubpath(subpath: unknown, options?: { allowEmpty?: boolean }): string;
export function copyTree(srcDir: string, destDir: string): number;
export function syncSubpath(args: { distDir: string; siteDir: string; subpath: string }): {
  target: string;
  files: number;
};
export function syncHome(args: { homeDir: string; siteDir: string }): { files: number; skipped: boolean };
export function writeSiteCname(args: { domain: string | null; siteDir: string }): {
  action: 'written' | 'removed' | 'absent';
  path: string;
  domain?: string;
};
export function ensureNoJekyll(siteDir: string): { action: 'created' | 'present'; path: string };

/** 从构建产物反推路由清单（缺 index.html 的目录不算路由） */
export function listDistRoutes(distDir: string): string[];

/** 在站点仓根目录写域名级 robots.txt 与 sitemap.xml（含主页） */
export function writeSiteSeo(args: {
  origin: string;
  subpath: string;
  routes: string[];
  siteDir: string;
}): { robots: string; sitemap: string; urls: number };
