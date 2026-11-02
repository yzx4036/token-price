<script setup lang="ts">
import { AUTHOR, QR_SRC } from '../lib/site-meta';

/**
 * 公众号二维码。
 *
 * 两种形态共享同一个 `__HAS_WECHAT_QR__` 判定（构建期常量），
 * 图片没放进来时**整个区块不渲染**——不留破图、不留空框。
 *
 * - footer：全站页脚小图，只给二维码 + 一句关注理由，不打扰主流程
 * - guide ：数据来源页一次性引导，图更大、带完整介绍
 */
withDefaults(defineProps<{ variant?: 'footer' | 'guide' }>(), { variant: 'footer' });

const hasQr = __HAS_WECHAT_QR__;
</script>

<template>
  <!-- 图片缺失时静默不渲染：宁可没有，也不要一个 404 的破图 -->
  <div v-if="hasQr" :class="['wechat-qr', `wechat-qr--${variant}`]">
    <img
      class="wechat-qr-img"
      :src="QR_SRC"
      :alt="variant === 'guide' ? `${AUTHOR.name} 的微信公众号二维码` : '微信公众号二维码'"
      width="112"
      height="112"
      loading="lazy"
      decoding="async"
    />
    <div class="wechat-qr-text">
      <p class="wechat-qr-title">微信公众号</p>
      <p v-if="variant === 'guide'" class="wechat-qr-intro">{{ AUTHOR.wechatIntro }}</p>
      <p v-else class="wechat-qr-hint">每周更新价格变动与实测记录</p>
      <!-- 合规边界：公众号属个人号，与所收录厂商无任何隶属或合作关系（见 docs/compliance/data-fetching.md） -->
      <p class="wechat-qr-boundary">个人项目，与所收录厂商无隶属或合作关系</p>
    </div>
  </div>
</template>
