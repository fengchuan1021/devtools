<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Card from 'primevue/card'
import { onBeforeUnmount, ref, watch } from 'vue'
import { fetchScreenShot } from '../api/device'
import { useDeviceStore } from '../stores/device'

const props = defineProps<{
  serial?: string
}>()

const deviceStore = useDeviceStore()
const { screenshotRefreshKey, containingNodesBounds } = storeToRefs(deviceStore)

const imageUrl = ref('')
const loading = ref(false)
const error = ref('')
const imgRef = ref<HTMLImageElement | null>(null)
const imageNaturalSize = ref({ width: 0, height: 0 })

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

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
  } catch (reason) {
    error.value = errorText(reason, '截图获取失败')
    imageUrl.value = ''
  } finally {
    loading.value = false
  }
}

function onImageClick(event: MouseEvent) {
  const img = imgRef.value
  if (!img || !img.naturalWidth) return
  const rect = img.getBoundingClientRect()
  const scaleX = img.naturalWidth / rect.width
  const scaleY = img.naturalHeight / rect.height
  deviceStore.setSelectedPoint({
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  })
}

function onImageLoad() {
  const img = imgRef.value
  if (img?.naturalWidth && img.naturalHeight) {
    imageNaturalSize.value = { width: img.naturalWidth, height: img.naturalHeight }
  } else {
    imageNaturalSize.value = { width: 0, height: 0 }
  }
}

watch([() => props.serial, screenshotRefreshKey], () => loadScreenshot(), { immediate: true })

onBeforeUnmount(() => {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})
</script>

<template>
  <Card
    class="flex h-full min-h-0 flex-col [&_.p-card-body]:flex [&_.p-card-body]:min-h-0 [&_.p-card-body]:flex-1 [&_.p-card-body]:flex-col [&_.p-card-content]:flex [&_.p-card-content]:min-h-0 [&_.p-card-content]:flex-1 [&_.p-card-content]:flex-col"
  >
    <template #content>
      <div class="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden">
        <template v-if="!serial">
          <span class="text-sm text-muted-color">请先选择设备</span>
        </template>
        <template v-else-if="loading">
          <i class="pi pi-spin pi-spinner mb-2 text-2xl text-muted-color" />
          <span class="text-sm text-muted-color">加载中...</span>
        </template>
        <template v-else-if="error">
          <span class="text-sm text-red-400">{{ error }}</span>
        </template>
        <template v-else-if="imageUrl">
          <div class="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
            <div
              class="relative max-h-full max-w-full"
              :style="
                imageNaturalSize.width && imageNaturalSize.height
                  ? { aspectRatio: `${imageNaturalSize.width} / ${imageNaturalSize.height}` }
                  : undefined
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
                  v-for="(bounds, index) in containingNodesBounds"
                  :key="index"
                  :x="bounds.left"
                  :y="bounds.top"
                  :width="bounds.width"
                  :height="bounds.height"
                  fill="none"
                  stroke="#007acc"
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
