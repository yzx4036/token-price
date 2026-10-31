import { onScopeDispose, ref, type Ref } from 'vue';

function canQuery(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/**
 * 响应式媒体查询。SSR 阶段没有 window，返回 false（按移动优先渲染），
 * 客户端在 setup 期间同步取初值，避免出现「先渲染桌面表格再闪成卡片」的跳变。
 */
export function useMediaQuery(query: string): Ref<boolean> {
  const matches = ref(false);
  if (!canQuery()) return matches;

  const mql = window.matchMedia(query);
  matches.value = mql.matches;

  const onChange = (event: MediaQueryListEvent): void => {
    matches.value = event.matches;
  };
  // Safari < 14 只有旧的 addListener API
  const modern = typeof mql.addEventListener === 'function';
  if (modern) mql.addEventListener('change', onChange);
  else mql.addListener(onChange);
  onScopeDispose(() => {
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
 * 折叠块在桌面端默认展开、移动端默认折叠（R8）。
 * 刻意**不订阅 change**：只在初始化时取一次快照，这样用户手动收起后，
 * 拖窗口 / 转屏导致的断点变化不会把 `open` 重新打回去、覆盖用户操作。
 */
export function useFoldOpenByDefault(query = DESKTOP_QUERY): Ref<boolean> {
  const open = ref(false);
  if (canQuery()) open.value = window.matchMedia(query).matches;
  return open;
}
