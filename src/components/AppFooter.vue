<script setup lang="ts">
import { fxRate } from '../lib/data';
import { RATE_DISCLAIMER, fxNote } from '../lib/fx';
</script>

<template>
  <footer class="site-footer">
    <div class="shell footer-row">
      <p>Token Price · 面向中文开发者的静态比价工具 · 主列按厂商账单币种</p>
      <p>1 USD = {{ fxRate.rate }} CNY · {{ fxNote(fxRate) }}</p>
    </div>
    <div class="shell footer-row">
      <p class="meta">
        {{ RATE_DISCLAIMER }}价格并非购买建议，请在使用前复核官方页面。国内厂商为人民币官方原价；国际厂商以美元原价为准，人民币仅为汇率估算副列。
      </p>
    </div>
  </footer>
</template>
