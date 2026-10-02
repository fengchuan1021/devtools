<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted } from 'vue'
import DeviceScreenshotArea from '../components/DeviceScreenshotArea.vue'
import DeviceTerminalHost from '../components/DeviceTerminalHost.vue'
import DeviceToolbar from '../components/DeviceToolbar.vue'
import LogPanel from '../components/LogPanel.vue'
import NodeInfoPanel from '../components/NodeInfoPanel.vue'
import ScriptPanel from '../components/ScriptPanel.vue'
import { useWebSocket } from '../composables/useWebSocket'
import { useDeviceStore } from '../stores/device'

const deviceStore = useDeviceStore()
const { selectedDevice, selectedSerial } = storeToRefs(deviceStore)
const { connect } = useWebSocket(selectedDevice)

onMounted(() => {
  connect()
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex shrink-0 items-center border-b border-surface px-4 py-2">
      <DeviceToolbar />
    </header>

    <div class="flex min-h-0 flex-1 gap-3 p-3">
      <aside class="flex min-h-0 min-w-0 flex-1 flex-col">
        <DeviceScreenshotArea class="min-h-0 flex-1" :serial="selectedSerial" />
      </aside>

      <main class="flex min-h-0 min-w-0 flex-[1.4] flex-col">
        <NodeInfoPanel class="min-h-0 flex-1" :serial="selectedSerial" />
      </main>

      <aside class="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto">
        <ScriptPanel />
        <LogPanel class="min-h-40 flex-1" :serial="selectedSerial" />
      </aside>
    </div>
    <DeviceTerminalHost />
  </div>
</template>
