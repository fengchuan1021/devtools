<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '../stores/device'
import { fetchScreenShot } from '../api/device'
import Card from 'primevue/card'

const props = defineProps({
  /** 选中的设备序列号 */
  serial: {
    type: String,
    default: '',
  },
})

const deviceStore = useDeviceStore()
const { screenshotRefreshKey } = storeToRefs(deviceStore)

const imageUrl = ref('')
const loading = ref(false)
const error = ref('')

async function loadScreenshot() {
  if (!props.serial) {
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = ''
    error.value = ''
    return
  }

  error.value = ''
  loading.value = true
  try {
    const blob = await fetchScreenShot(props.serial)
    if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
    imageUrl.value = URL.createObjectURL(blob)
  } catch (e) {
    error.value = e.message || '截图获取失败'
    imageUrl.value = ''
  } finally {
    loading.value = false
  }
}

watch(
  [() => props.serial, screenshotRefreshKey],
  () => loadScreenshot(),
  { immediate: true }
)

onBeforeUnmount(() => {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})
</script>

<template>
  <Card class="h-full">
    <template #title>设备截图</template>
    <template #content>
      <div
        class="flex min-h-[400px] flex-col items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-slate-200 bg-slate-50"
      >
        <template v-if="!serial">
          <span class="text-slate-400">请先选择设备</span>
        </template>
        <template v-else-if="loading">
          <i class="pi pi-spin pi-spinner mb-2 text-2xl text-slate-400"></i>
          <span class="text-slate-400">加载中...</span>
        </template>
        <template v-else-if="error">
          <span class="text-red-500">{{ error }}</span>
        </template>
        <template v-else-if="imageUrl">
          <img
            :src="imageUrl"
            alt="设备截图"
            class="max-h-full max-w-full object-contain"
          />
        </template>
      </div>
    </template>
  </Card>
</template>
