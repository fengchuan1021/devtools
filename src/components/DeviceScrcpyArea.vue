<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '../stores/device'
import { getItem } from '../utils/storage'
import { createScrcpyPlayer } from '../composables/useScrcpyPlayer'
import Card from 'primevue/card'

const props = defineProps({
  serial: {
    type: String,
    default: '',
  },
})

const deviceStore = useDeviceStore()
const { containingNodesBounds } = storeToRefs(deviceStore)

const canvasRef = ref(null)
const status = ref('')
const error = ref('')
const videoSize = ref({ width: 0, height: 0 })

const statusText = computed(() => {
  if (!props.serial) return '请先选择设备'
  if (error.value) return ''
  if (status.value === 'streaming') return ''
  if (status.value === 'waiting') return '等待设备画面...'
  return '正在连接 scrcpy...'
})

let ws = null
let player = null
let reconnectTimer = null

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.onopen = null
    ws.onclose = null
    ws.onerror = null
    ws.onmessage = null
    ws.close()
    ws = null
  }
  if (player) {
    player.dispose()
    player = null
  }
}

function connect() {
  disconnect()
  error.value = ''
  status.value = ''
  videoSize.value = { width: 0, height: 0 }
  if (!props.serial) return

  player = createScrcpyPlayer({
    canvas: () => canvasRef.value,
    onSize: (size) => {
      videoSize.value = size
    },
    onStatus: (s) => {
      status.value = s
      if (s === 'streaming') error.value = ''
    },
    onError: (msg) => {
      error.value = msg
    },
  })

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const token = getItem('token') || ''
  const params = new URLSearchParams({ serial: props.serial })
  if (token) params.set('token', token)
  const url = `${protocol}//${location.host}/api/dev/scrcpyWs?${params}`
  ws = new WebSocket(url)
  ws.binaryType = 'arraybuffer'

  ws.onopen = () => {
    status.value = 'waiting'
  }

  ws.onmessage = (event) => {
    if (!(event.data instanceof ArrayBuffer) || !player) return
    player.push(event.data)
  }

  ws.onclose = () => {
    if (!props.serial) return
    status.value = ''
    reconnectTimer = setTimeout(connect, 2000)
  }

  ws.onerror = () => {
    error.value = 'scrcpy 连接失败'
  }
}

function onCanvasClick(e) {
  const canvas = canvasRef.value
  if (!canvas || !canvas.width || !canvas.height) return
  const rect = canvas.getBoundingClientRect()
  if (!rect.width || !rect.height) return
  const x = ((e.clientX - rect.left) / rect.width) * canvas.width
  const y = ((e.clientY - rect.top) / rect.height) * canvas.height
  deviceStore.setSelectedPoint({ x, y })
}

watch(
  () => props.serial,
  () => connect(),
  { immediate: true }
)

onBeforeUnmount(disconnect)
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
        <template v-else>
          <div
            class="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
          >
            <div
              class="relative max-h-full max-w-full"
              :style="
                videoSize.width && videoSize.height
                  ? { aspectRatio: `${videoSize.width} / ${videoSize.height}` }
                  : {}
              "
            >
              <canvas
                ref="canvasRef"
                class="block h-full w-full cursor-crosshair object-contain"
                @click="onCanvasClick"
              />
              <svg
                v-if="videoSize.width && videoSize.height && containingNodesBounds.length"
                class="pointer-events-none absolute inset-0 block h-full w-full"
                :viewBox="`0 0 ${videoSize.width} ${videoSize.height}`"
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
            <div
              v-if="statusText || error"
              class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
            >
              <i
                v-if="!error"
                class="pi pi-spin pi-spinner mb-2 text-2xl text-slate-400"
              ></i>
              <span :class="error ? 'text-red-500' : 'text-slate-400'">
                {{ error || statusText }}
              </span>
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
