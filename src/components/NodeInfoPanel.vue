<script setup>
import Card from 'primevue/card'
</script>

<template>
  <Card class="h-full">
    <template #title>节点信息</template>
    <template #content>
      <div class="flex min-h-[400px] items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50">
        <span class="text-slate-400">选中节点的信息展示</span>
      </div>
    </template>
  </Card>
</template>
