<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Button from 'primevue/button'
import { useLogStore } from '../stores/log'

const props = defineProps<{
  serial?: string
}>()

const logStore = useLogStore()
const { entries } = storeToRefs(logStore)

const levelClass: Record<string, string> = {
  info: 'text-color',
  warn: 'text-amber-400',
  error: 'text-red-400',
  debug: 'text-muted-color',
}
</script>

<template>
  <section class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-surface">
    <div class="flex shrink-0 items-center justify-between border-b border-surface px-3 py-2">
      <span class="text-sm font-medium">日志{{ props.serial ? ` (${props.serial})` : '' }}</span>
      <Button icon="pi pi-trash" label="清空" size="small" text severity="secondary" @click="logStore.clear" />
    </div>
    <div class="min-h-32 flex-1 overflow-y-auto px-3 py-2 font-mono text-xs">
      <div
        v-for="(entry, index) in entries"
        :key="index"
        class="flex gap-2 border-b border-surface py-1 last:border-0"
        :class="levelClass[entry.level] || 'text-color'"
      >
        <span class="shrink-0 text-muted-color">{{ entry.time }}</span>
        <span class="shrink-0 font-medium">{{ entry.level }}</span>
        <span v-if="entry.level === 'image_lib'" class="min-w-0">
          <img
            :src="entry.message"
            alt="日志图片"
            class="max-h-40 max-w-full rounded-md border border-surface object-contain"
          />
        </span>
        <span v-else class="min-w-0 break-words">{{ entry.message }}</span>
      </div>
      <div v-if="entries.length === 0" class="py-4 text-center text-muted-color">暂无日志</div>
    </div>
  </section>
</template>
