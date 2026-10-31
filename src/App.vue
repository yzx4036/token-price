<script setup lang="ts">
import AppFooter from './components/AppFooter.vue';
import AppHeader from './components/AppHeader.vue';
</script>

<template>
  <div class="site">
    <AppHeader />
    <main id="main" class="shell">
      <RouterView />
    </main>
    <AppFooter />
  </div>
</template>
