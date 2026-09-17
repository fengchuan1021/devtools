<script setup>
import { storeToRefs } from 'pinia'
import Dialog from 'primevue/dialog'
import { useDeviceStore } from '../stores/device'
import DeviceTerminal from './DeviceTerminal.vue'

const deviceStore = useDeviceStore()
const { terminals } = storeToRefs(deviceStore)

function onHide(id) {
  deviceStore.closeTerminal(id)
}
</script>

<template>
  <Dialog
    v-for="(term, index) in terminals"
    :key="term.id"
    v-model:visible="term.visible"
    :modal="false"
    :dismissable-mask="false"
    :closable="true"
    :draggable="true"
    :maximizable="true"
    :style="{ width: '720px', marginLeft: `${(index % 6) * 28}px`, marginTop: `${(index % 6) * 28}px` }"
    @hide="onHide(term.id)"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <i class="pi pi-desktop text-slate-500"></i>
        <span>终端 {{ term.serial || '未选择设备' }}</span>
      </div>
    </template>
    <DeviceTerminal :serial="term.serial" :session="term.id" @close="onHide(term.id)" />
  </Dialog>
</template>
