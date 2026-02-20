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
const { screenshotRefreshKey, containingNodesBounds } = storeToRefs(deviceStore)

const imageUrl = ref('')
const loading = ref(false)
const error = ref('')
const imgRef = ref(null)
/** 图片原始尺寸（设备像素），用于 SVG viewBox 与矩形坐标 */
const imageNaturalSize = ref({ width: 0, height: 0 })

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

function onImageLoad() {
  const img = imgRef.value
  if (img && img.naturalWidth && img.naturalHeight) {
    imageNaturalSize.value = { width: img.naturalWidth, height: img.naturalHeight }
  } else {
    imageNaturalSize.value = { width: 0, height: 0 }
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
 
    <template #content>
      <div
        class="flex h-full min-h-0 min-h-[400px] flex-col items-center justify-center overflow-hidden"
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
          <div
            class="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
          >
            <div
              class="relative max-h-full max-w-full"
              :style="
                imageNaturalSize.width && imageNaturalSize.height
                  ? { aspectRatio: `${imageNaturalSize.width} / ${imageNaturalSize.height}` }
                  : {}
              "
            >
              <img
                ref="imgRef"
                :src="imageUrl"
                alt="设备截图"
                class="block h-full w-full cursor-crosshair object-contain"
                @click="onImageClick"
                @load="onImageLoad"
              />
              <svg
                v-if="imageNaturalSize.width && imageNaturalSize.height && containingNodesBounds.length"
                class="pointer-events-none absolute inset-0 block h-full w-full"
                :viewBox="`0 0 ${imageNaturalSize.width} ${imageNaturalSize.height}`"
                preserveAspectRatio="none"
              >
                <rect
                  v-for="(b, i) in containingNodesBounds"
                  :key="i"
                  :x="b.left"
                  :y="b.top"
                  :width="b.width"
                  :height="b.height"
                  fill="none"
                  stroke="rgba(59, 130, 246, 0.85)"
                  stroke-width="4"
                />
              </svg>
            </div>
          </div>
        </template>
      </div>
    </template>
  </Card>
</template>

<style scoped>
:deep(.p-card-body),
:deep(.p-card-content) {
  height: 100%;
}
</style>
