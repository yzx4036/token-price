<script setup lang="ts">
import WechatQr from './WechatQr.vue';
import { fxRate } from '../lib/data';
import { SITE_DISCLAIMER, SITE_NAME } from '../lib/site-meta';
</script>

<template>
  <footer class="site-footer">
    <div class="shell footer-main">
      <div class="footer-text">
        <!--
          免责只在这里和「口径说明」页各写一次完整版（D5）：四要素必须禁 JS 也能读到，
          所以用预渲染的静态文本，不做折叠、不靠 JS 渲染。其余页面只在 hero 末行
          给一句 NON_OFFICIAL_BRIEF + 链接，不再各写一份长句。
        -->
        <p>{{ SITE_NAME }}</p>
        <p>1 USD = {{ fxRate.rate }} CNY（{{ fxRate.date }}）</p>
        <p class="meta">{{ SITE_DISCLAIMER }}</p>
        <p class="meta"><RouterLink to="/methodology/">完整口径与免责</RouterLink></p>
      </div>
      <WechatQr variant="footer" />
    </div>
  </footer>
</template>
