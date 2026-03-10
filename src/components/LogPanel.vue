<script setup>
import { storeToRefs } from 'pinia'
import { useLogStore } from '../stores/log'
import Button from 'primevue/button'

const props = defineProps({
  /** 当前监控的设备 serial，日志来自该设备 */
  serial: { type: String, default: '' },
})

const logStore = useLogStore()
const { entries } = storeToRefs(logStore)

const levelClass = {
  info: 'text-slate-600',
  warn: 'text-amber-600',
  error: 'text-red-600',
  debug: 'text-slate-500',
}
</script>

<template>
  <div class="flex flex-1 flex-col rounded-lg border border-slate-200 bg-slate-50">
    <div class="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3 py-2">
      <span class="text-sm font-medium text-slate-700">
        日志{{ props.serial ? ` (${props.serial})` : '' }}
      </span>
      <Button
        icon="pi pi-trash"
        label="清空"
        size="small"
        text
        severity="secondary"
        @click="logStore.clear"
      />
    </div>
    <div
      class="min-h-[120px] max-h-[200px] flex-1 overflow-y-auto px-3 py-2 font-mono text-xs"
    >
      <div
        v-for="(entry, i) in entries"
        :key="i"
        class="flex gap-2 border-b border-slate-100 py-1 last:border-0"
        :class="levelClass[entry.level] || 'text-slate-600'"
      >
        <span class="shrink-0 text-slate-400">{{ entry.time }}</span>
        <span class="shrink-0 font-medium">{{ entry.level }}</span>
        <span v-if="entry.level === 'image_lib'" class="min-w-0">
          <img
            :src="entry.message"
            alt="image_lib log image"
            class="max-w-full max-h-40 rounded border border-slate-200 object-contain"
          />
        </span>
        <span v-else class="min-w-0 break-words">{{ entry.message }}</span>
      </div>
      <div
        v-if="entries.length === 0"
        class="py-4 text-center text-slate-400"
      >
        暂无日志
      </div>
    </div>
  </div>
</template>
