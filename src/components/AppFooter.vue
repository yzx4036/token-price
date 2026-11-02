<script setup lang="ts">
import WechatQr from './WechatQr.vue';
import { fxRate } from '../lib/data';
import { SITE_NAME } from '../lib/site-meta';
</script>

<template>
  <footer class="site-footer">
    <div class="shell footer-main">
      <div class="footer-text">
        <!--
          页脚只保留三行最短事实：站名 / 汇率 / 一句免责。
          原来的完整免责声明（含「国内人民币标价、国际美元标价、估算副列」等）
          已经在「口径说明」页逐条展开，页脚重复一遍只会把移动端页脚撑到 376px
          ——占掉一半屏幕，而且没人会在页脚读长文。详情交给链接。
        -->
        <p>{{ SITE_NAME }}</p>
        <p>1 USD = {{ fxRate.rate }} CNY（{{ fxRate.date }}）· 人民币为估算参考值，最终以厂商原币种为准。</p>
        <p class="meta">
          价格非购买建议 · <RouterLink to="/methodology/">完整口径与免责</RouterLink>
        </p>
      </div>
      <WechatQr variant="footer" />
    </div>
  </footer>
</template>
