/** 类型声明：脚本是 .mjs（Node 直接执行），测试用 TS 导入时靠这份声明。 */
export const ROOT: string;
export const DEFAULT_CONFIG_PATH: string;
export const DEFAULT_DIST_DIR: string;
export const GITHUB_PAGES_IPV4: readonly string[];

export class DomainError extends Error {}

export type SiteConfig = { customDomain: string | null; raw?: Record<string, unknown> };
export type CnameAction = 'written' | 'removed' | 'absent';
export type CnameResult = { action: CnameAction; path: string; domain?: string };
export type DnsCheck = {
  domain: string;
  ok: boolean;
  mode: 'CNAME' | 'address' | 'none' | 'error' | null;
  records: string[];
  cnameChain?: string[];
  expected: string[] | null;
  note: string;
};
export type DnsResolver = {
  lookup(hostname: string, options: { all: true }): Promise<{ address: string; family: number }[]>;
  resolveCname(hostname: string): Promise<string[]>;
};

export function normalizeDomain(input: unknown): string;
export function readSiteConfig(configPath?: string): SiteConfig;
export function writeSiteConfig(domain: string | null, configPath?: string): string | null;
export function syncCname(domain: string | null, distDir?: string): CnameResult;
export function checkDns(domain: string, options?: { resolver?: DnsResolver }): Promise<DnsCheck>;
