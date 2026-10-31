import { describe, expect, it } from 'vitest';
import {
  MAX_PROBE_URLS,
  checkSourceReachability,
  selectSourceUrls,
} from '../scripts/data/lib/reachability.mjs';

function fakeFetch(handler: (url: string) => unknown) {
  const calls: string[] = [];
  const impl = async (url: string) => {
    calls.push(url);
    return handler(url);
  };
  return { impl: impl as unknown as typeof fetch, calls };
}

const htmlPage = (chars: number) => ({
  ok: true,
  status: 200,
  text: async () => 'a'.repeat(chars),
});

describe('来源可达性抽查（默认关闭的独立开关）', () => {
  it('探测清单去重、排序并截断到上限', () => {
    const urls = ['https://b.example/pricing', 'https://a.example/pricing', 'https://b.example/pricing'];
    const echo = Array.from({ length: MAX_PROBE_URLS + 5 }, (_, index) => `https://s${String(index).padStart(2, '0')}.example/pricing`);
    expect(selectSourceUrls(urls)).toEqual(['https://a.example/pricing', 'https://b.example/pricing']);
    expect(selectSourceUrls(echo)).toHaveLength(MAX_PROBE_URLS);
    expect(selectSourceUrls(echo).at(-1)).toBe('https://s11.example/pricing');
  });

  it('HTTP 403 只记提醒，不影响整体结论', async () => {
    const { impl } = fakeFetch(() => ({ ok: false, status: 403, text: async () => '' }));
    const result = await checkSourceReachability(['https://x.example/pricing'], { fetchImpl: impl });
    expect(result.checked).toBe(1);
    expect(result.ok).toBe(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ url: 'https://x.example/pricing', status: 403 });
    expect(result.failed[0].reason).toContain('403');
  });

  it('正文过短的 JS 空壳页算提醒', async () => {
    const { impl } = fakeFetch(() => htmlPage(120));
    const result = await checkSourceReachability(['https://spa.example/pricing'], { fetchImpl: impl });
    expect(result.failed[0].reason).toContain('JS 空壳');
  });

  it('网络错误也算提醒，不抛错', async () => {
    const { impl } = fakeFetch(() => {
      throw new Error('ECONNREFUSED');
    });
    const result = await checkSourceReachability(['http://127.0.0.1:9/x'], { fetchImpl: impl });
    expect(result.failed[0].reason).toContain('ECONNREFUSED');
  });

  it('可达页面计入 ok，且串行探测（顺序稳定）', async () => {
    const { impl, calls } = fakeFetch(() => htmlPage(2000));
    const result = await checkSourceReachability(['https://b.example/p', 'https://a.example/p'], { fetchImpl: impl });
    expect(result).toMatchObject({ checked: 2, ok: 2, failed: [] });
    expect(calls).toEqual(['https://a.example/p', 'https://b.example/p']);
  });

  it('结果结构可直接塞进 verify --json 的 reachability 字段', async () => {
    const { impl } = fakeFetch(() => htmlPage(2000));
    const result = await checkSourceReachability(['https://a.example/p'], { fetchImpl: impl });
    expect(Object.keys(result)).toEqual(
      expect.arrayContaining(['checked', 'ok', 'failed', 'limit', 'timeoutMs', 'urls']),
    );
    expect(result.timeoutMs).toBe(8000);
    expect(result.limit).toBe(12);
  });
});
