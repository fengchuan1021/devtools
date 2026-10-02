<script setup>
import { onMounted, ref, watch } from 'vue'
import { useDeviceStore } from '../stores/device'
import { getDevices } from '../api/device'
import AutoComplete from 'primevue/autocomplete'
import Button from 'primevue/button'

const deviceStore = useDeviceStore()
const selectedDevice = ref(null)

// 加载后获取设备列表
onMounted(async () => {
  try {
    const list = await getDevices()
    deviceStore.setDevices(list.map((d) => ({ serial: d.serial })))
  } catch (err) {
    console.warn('获取设备列表失败:', err)
  }
})

// 绑定 store 的选中设备
watch(
  () => deviceStore.selectedDevice,
  (v) => { selectedDevice.value = v },
  { immediate: true }
)

watch(selectedDevice, (v) => {
  deviceStore.setSelectedDevice(v)
})

function onSearch(event) {
  deviceStore.searchDevices(event.query)
}

function onRefresh() {
  deviceStore.refreshScreenshot()
}
</script>

<template>
  <div class="flex items-center gap-3">
    <AutoComplete
      v-model="selectedDevice"
      :suggestions="deviceStore.suggestions"
      option-label="serial"
      placeholder="输入序列号搜索设备"
      class="min-w-[260px]"
      dropdown
      :loading="deviceStore.searching"
      @complete="onSearch"
    />
    <Button
      icon="pi pi-refresh"
      label="刷新"
      severity="secondary"
      @click="onRefresh"
    />
  </div>
</template>
