<script setup>
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '../stores/device'
import { useWebSocket } from '../composables/useWebSocket'
import DeviceScreenshotArea from '../components/DeviceScreenshotArea.vue'
import DeviceToolbar from '../components/DeviceToolbar.vue'
import NodeInfoPanel from '../components/NodeInfoPanel.vue'
import ScriptPanel from '../components/ScriptPanel.vue'

const deviceStore = useDeviceStore()
const { selectedDevice } = storeToRefs(deviceStore)
const { connect } = useWebSocket()

onMounted(() => {
  connect()
})
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-50">
    <header class="flex shrink-0 items-center border-b border-slate-200 bg-white px-4 py-3">
      <DeviceToolbar />
    </header>

    <div class="flex flex-1 gap-4 overflow-hidden p-4">
      <aside class="w-1/3 min-w-[280px] shrink-0">
        <DeviceScreenshotArea :serial="selectedDevice?.serial ?? ''" />
      </aside>

      <main class="min-w-0 flex-1">
        <NodeInfoPanel />
      </main>

      <aside class="w-1/3 min-w-[280px] shrink-0">
        <ScriptPanel />
      </aside>
    </div>
  </div>
</template>
