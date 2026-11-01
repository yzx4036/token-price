/** 类型声明：脚本是 .mjs（Node 直接执行），测试用 TS 导入时靠这份声明。 */

export class IndexNowError extends Error {}

/** key 必须是 8–128 位 [a-zA-Z0-9-] */
export function validateKey(key: unknown): boolean;

/** 生成 32 位十六进制 key */
export function generateKey(): string;

/** 确保配置里有合法 key，没有就生成并原子写回 */
export function ensureKey(configPath?: string): { key: string; created: boolean };

/** 读配置里的 key；缺失或不合规返回 null */
export function readKey(configPath?: string): string | null;

/** 把 <key>.txt 写到站点仓根目录（内容只有 key，无 BOM） */
export function writeKeyFile(args: { key: string; siteDir: string }): { path: string; key: string };

/** 从 dist/sitemap.xml 取要提交的 URL 列表 */
export function collectUrls(canonicalSiteUrl: string, distDir?: string, sitemapPath?: string | null): string[];

/** 提交 URL 列表到 api.indexnow.org */
export function submitUrls(args: {
  key: string;
  urls: string[];
  fetchImpl?: typeof fetch;
  dryRun?: boolean;
}): Promise<{
  status: number;
  dryRun?: boolean;
  payload: {
    host: string;
    key: string;
    keyLocation: string;
    urlList: string[];
  };
}>;

/** 状态码 → 人话 */
export function explainStatus(status: number): string;
