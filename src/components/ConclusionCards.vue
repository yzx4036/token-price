<script setup lang="ts">
export type Conclusion = {
  label: string;
  value: string;
  note?: string;
};

defineProps<{ items: Conclusion[] }>();
</script>

<!--
  顶部结论卡：让读者 3 秒拿到「谁最便宜」这类结论，不必扫完整张表。
  数值全部在视图里从真实数据算好传进来，本组件不碰数据、不含业务判断。
-->
<template>
  <ul class="conclusions">
    <li v-for="item in items" :key="item.label" class="conclusion">
      <span class="conclusion-label">{{ item.label }}</span>
      <strong class="conclusion-value">{{ item.value }}</strong>
      <span v-if="item.note" class="conclusion-note">{{ item.note }}</span>
    </li>
  </ul>
</template>
