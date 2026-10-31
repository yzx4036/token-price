/**
 * 来源可达性抽查（R-06）。
 *
 * 只用于人工排查「官方定价页是否还能打开」，属于抽查性质：
 * - 默认关闭，只有 `verify --check-sources` 才触发；
 * - 串行探测、单条 8 秒超时、最多 12 个唯一 URL；
 * - 结果只产出提醒，永不改变退出码；
 * - publish 不调用它，发布路径保持无网络、可复现。
 */

export const PROBE_TIMEOUT_MS = 8000;
export const MAX_PROBE_URLS = 12;
/** 正文短于这个字符数，视为 JS 空壳页（HTML 里没有价格表） */
export const MIN_BODY_CHARS = 500;

const UA = 'token-price-data-cli/0.2 (+https://github.com/yzx4036/token-price)';

/** 去重 + 排序 + 截断：保证抽样清单确定，不随条目顺序抖动 */
export function selectSourceUrls(urls, limit = MAX_PROBE_URLS) {
  return [...new Set(urls)].sort().slice(0, limit);
}

async function probe(url, { fetchImpl, timeoutMs }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'user-agent': UA, accept: 'text/html,text/markdown,text/plain,*/*' },
    });
  } catch (error) {
    return { ok: false, reason: `请求失败：${error instanceof Error ? error.message : String(error)}` };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, reason: `HTTP ${response.status}（可能需要登录、拦截脚本或已改版）` };
  }
  let body = '';
  try {
    body = await response.text();
  } catch {
    return { ok: false, status: response.status, reason: '响应正文读取失败' };
  }
  const chars = body.length;
  if (chars < MIN_BODY_CHARS) {
    return { ok: false, status: response.status, chars, reason: `正文仅 ${chars} 字符（疑似 JS 空壳页）` };
  }
  return { ok: true, status: response.status, chars };
}

/**
 * 串行探测一批 URL。返回结构直接进 `verify --json` 的 reachability 字段。
 * 失败项只是提醒清单，调用方不得据此改变退出码。
 */
export async function checkSourceReachability(
  urls,
  { fetchImpl = globalThis.fetch, timeoutMs = PROBE_TIMEOUT_MS, limit = MAX_PROBE_URLS } = {},
) {
  const targets = selectSourceUrls(urls, limit);
  const failed = [];
  let ok = 0;
  for (const url of targets) {
    const outcome = await probe(url, { fetchImpl, timeoutMs });
    if (outcome.ok) {
      ok += 1;
      continue;
    }
    failed.push({
      url,
      reason: outcome.reason,
      status: outcome.status ?? null,
      chars: outcome.chars ?? null,
    });
  }
  return {
    checked: targets.length,
    ok,
    failed,
    totalUnique: new Set(urls).size,
    limit,
    timeoutMs,
    urls: targets,
  };
}
