/** 类型声明：脚本是 .mjs（Node 直接执行），测试用 TS 导入时靠这份声明。 */
export const PROBE_TIMEOUT_MS: number;
export const MAX_PROBE_URLS: number;
export const MIN_BODY_CHARS: number;

export type ReachabilityFailure = {
  url: string;
  reason: string;
  status: number | null;
  chars: number | null;
};

export type ReachabilityResult = {
  checked: number;
  ok: number;
  failed: ReachabilityFailure[];
  totalUnique: number;
  limit: number;
  timeoutMs: number;
  urls: string[];
};

export function selectSourceUrls(urls: readonly string[], limit?: number): string[];

export function checkSourceReachability(
  urls: readonly string[],
  options?: { fetchImpl?: typeof fetch; timeoutMs?: number; limit?: number },
): Promise<ReachabilityResult>;
