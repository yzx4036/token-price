<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { SITE_NAME } from '../lib/site-meta';

const route = useRoute();
/** <768 折叠成汉堡：菜单项默认隐藏，点开后是覆盖式下拉，不撑高 nav（R6） */
const open = ref(false);

const links = [
  { to: '/api-pricing/', label: 'API 比价' },
  { to: '/plans/', label: 'Token Plan' },
  { to: '/calculator/', label: '成本计算器' },
  { to: '/sources/', label: '数据来源' },
  { to: '/methodology/', label: '数据口径' },
] as const;

watch(
  () => route.fullPath,
  () => {
    open.value = false;
  },
);
</script>

<template>
  <header class="site-header">
    <nav class="shell nav" aria-label="主导航">
      <!-- 站名已足够短（16 字符），不再需要长短名切换 -->
      <RouterLink class="brand" to="/">{{ SITE_NAME }}</RouterLink>

      <button
        class="nav-toggle"
        type="button"
        :aria-expanded="open ? 'true' : 'false'"
        aria-controls="nav-links"
        @click="open = !open"
      >
        <span class="nav-toggle-bars" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </span>
        <span class="sr-only">展开或收起主导航</span>
      </button>

      <div id="nav-links" class="nav-links" :class="{ 'is-open': open }">
        <RouterLink v-for="link in links" :key="link.to" class="nav-link" :to="link.to">
          {{ link.label }}
        </RouterLink>
      </div>
    </nav>
  </header>
</template>
