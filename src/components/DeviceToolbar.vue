<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '../stores/device'
import { getDevices, sendScrcpyCmd } from '../api/device'
import AutoComplete from 'primevue/autocomplete'
import Button from 'primevue/button'
import Checkbox from 'primevue/checkbox'

const deviceStore = useDeviceStore()
const { isscrcpy } = storeToRefs(deviceStore)
const selectedDevice = ref(null)

function deviceSerial(device) {
  if (!device) return ''
  return typeof device === 'string' ? device : (device.serial || '')
}

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

watch(
  () => ({ on: isscrcpy.value, serial: deviceSerial(selectedDevice.value) }),
  async (curr, prev) => {
    const prevOn = prev?.on
    const prevSerial = prev?.serial || ''
    if (prevOn && prevSerial && (!curr.on || prevSerial !== curr.serial)) {
      try {
        await sendScrcpyCmd(prevSerial, 'endScrcpy')
      } catch (err) {
        console.warn('结束 scrcpy 失败:', err)
      }
    }
    if (curr.on && curr.serial && (curr.on !== prevOn || curr.serial !== prevSerial)) {
      try {
        await sendScrcpyCmd(curr.serial, 'beginScrcpy')
      } catch (err) {
        console.warn('开始 scrcpy 失败:', err)
      }
    }
  }
)

onBeforeUnmount(async () => {
  const serial = deviceSerial(selectedDevice.value)
  if (isscrcpy.value && serial) {
    deviceStore.setIsScrcpy(false)
    try {
      await sendScrcpyCmd(serial, 'endScrcpy')
    } catch (err) {
      console.warn('结束 scrcpy 失败:', err)
    }
  }
})
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
    <div class="flex items-center gap-2">
      <Checkbox v-model="isscrcpy" binary />
      <span
        class="cursor-pointer select-none text-sm text-slate-600"
        @click="isscrcpy = !isscrcpy"
      >scrcpy</span>
    </div>
  </div>
</template>
