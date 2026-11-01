import { onMounted, onScopeDispose, ref, type Ref } from 'vue';

function canQuery(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/**
 * 响应式媒体查询。
 *
 * 首次渲染固定为 false（移动优先），与 SSR 输出严格一致，避免 hydration mismatch；
 * 真实断点在 onMounted 后再取，并在断点变化时更新。
 * 代价是桌面首帧仍会先出现移动卡片再切成表格——这是「预渲染不带 JS 也能看到价格」
 * 换来的必然顺序，不能用 setup 顶层读 matchMedia，否则静态 HTML 与客户端首帧对不上。
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (!canQuery()) return matches;

  let mql: MediaQueryList | null = null;
  let modern = false;
  const onChange = (event: MediaQueryListEvent): void => {
    matches.value = event.matches;
  };

  onMounted(() => {
    mql = window.matchMedia(query);
    matches.value = mql.matches;
    // Safari < 14 只有旧的 addListener API
    modern = typeof mql.addEventListener === 'function';
    if (modern) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
  });

  onScopeDispose(() => {
    if (!mql) return;
    if (modern) mql.removeEventListener('change', onChange);
    else mql.removeListener(onChange);
  });
  return matches;
}

/** 桌面表格断点（req §4 R2/R4）：<1024 卡片列表，>=1024 表格 */
export const DESKTOP_QUERY = '(min-width: 1024px)';

export function useIsDesktop(): Ref<boolean> {
  return useMediaQuery(DESKTOP_QUERY);
}

/**
 * 折叠块默认是否展开。
 *
 * 历史行为是「桌面展开、移动折叠」，实测发现这会把 API 页首屏挤到只剩 1 行：
 * 免责说明展开占 309px，hero 高达 558px，第一个价格被推到 826px（视口 900）。
 * 现在统一**默认折叠**，把首屏让给价格；需要看说明的人点一下即可。
 *
 * 刻意**不订阅 change**：只在初始化时取一次快照，这样用户手动展开/收起后，
 * 拖窗口 / 转屏导致的断点变化不会覆盖用户操作。
 */
export function useFoldOpenByDefault(_query = DESKTOP_QUERY): Ref<boolean> {
  // 参数保留是为了不改调用方签名；默认值统一为折叠
  return ref(false);
}
