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
const imgRef = ref(null)

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

/** 将点击位置转换为设备像素坐标，并通知 store，用于在 xmllayout 中定位节点 */
function onImageClick(e) {
  const img = imgRef.value
  if (!img || !img.naturalWidth) return
  const rect = img.getBoundingClientRect()
  const displayX = e.clientX - rect.left
  const displayY = e.clientY - rect.top
  const scaleX = img.naturalWidth / rect.width
  const scaleY = img.naturalHeight / rect.height
  const x = displayX * scaleX
  const y = displayY * scaleY
  deviceStore.setSelectedPoint({ x, y })
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
            ref="imgRef"
            :src="imageUrl"
            alt="设备截图"
            class="max-h-full max-w-full cursor-crosshair object-contain"
            @click="onImageClick"
          />
        </template>
      </div>
    </template>
  </Card>
</template>
