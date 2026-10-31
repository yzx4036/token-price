import { CliError } from './io.mjs';

const UA = 'token-price-data-cli/0.2 (+https://github.com/yzx4036/token-price)';

/** 仅 CLI 命令允许发起网络请求；构建期与浏览器运行期一律不发。 */
export async function fetchWithTimeout(url, { timeoutMs = 30000, headers = {}, method = 'GET' } = {}) {
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method,
      signal,
      headers: { 'user-agent': UA, accept: 'application/json,text/plain,*/*', ...headers },
      redirect: 'follow',
    });
  } catch (error) {
    throw new CliError(`请求失败：${url}\n原因：${error instanceof Error ? error.message : String(error)}`, {
      code: 'HTTP_FAILED',
    });
  }
  if (!response.ok) {
    throw new CliError(`请求失败：${url}\nHTTP ${response.status} ${response.statusText}`, { code: 'HTTP_STATUS' });
  }
  return response;
}

export async function fetchJson(url, options) {
  const response = await fetchWithTimeout(url, options);
  try {
    return await response.json();
  } catch {
    throw new CliError(`响应不是合法 JSON：${url}`, { code: 'HTTP_JSON' });
  }
}
