<script setup>
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '../stores/device'
import { useWebSocket } from '../composables/useWebSocket'
import DeviceScreenshotArea from '../components/DeviceScreenshotArea.vue'
import DeviceScrcpyArea from '../components/DeviceScrcpyArea.vue'
import DeviceToolbar from '../components/DeviceToolbar.vue'
import NodeInfoPanel from '../components/NodeInfoPanel.vue'
import ScriptPanel from '../components/ScriptPanel.vue'
import LogPanel from '../components/LogPanel.vue'
import DeviceTerminalHost from '../components/DeviceTerminalHost.vue'

const deviceStore = useDeviceStore()
const { selectedDevice, isscrcpy, selectedSerial } = storeToRefs(deviceStore)
const { connect } = useWebSocket(selectedDevice)

onMounted(() => {
  connect()
})
</script>

<template>
  <div class="flex h-screen flex-col bg-slate-50">
    <header class="flex shrink-0 items-center border-b border-slate-200 bg-white px-4 py-3">
      <DeviceToolbar />
    </header>

    <div class="flex flex-1 gap-4 p-4">
      <aside class="w-1/3 min-w-[280px] shrink-0">
        <DeviceScrcpyArea v-if="isscrcpy" :serial="selectedSerial" />
        <DeviceScreenshotArea v-else :serial="selectedSerial" />
      </aside>

      <main class="min-w-0 flex-1">
        <NodeInfoPanel :serial="selectedSerial"  />
      </main>

      <aside class="flex w-1/3 min-w-[280px] shrink-0 flex-col gap-3 overflow-hidden">
        <ScriptPanel />
        <LogPanel :serial="selectedSerial" />
      </aside>
    </div>
    <DeviceTerminalHost />
  </div>
</template>
