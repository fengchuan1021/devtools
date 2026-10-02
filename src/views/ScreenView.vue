<script setup lang="ts">
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { onMounted, onUnmounted, ref } from 'vue'

const RELAY_KEY = 'screenlink.relay'
const STUN_KEY = 'screenlink.stun'
const relayUrl = import.meta.env.VITE_RELAY_URL
const stunUrl = import.meta.env.VITE_STUN_URL

const relay = ref(localStorage.getItem(RELAY_KEY) || relayUrl)
const stun = ref(localStorage.getItem(STUN_KEY) || stunUrl)
const code = ref('')
const status = ref('输入手机进程打印的连接码')
const name = ref('')
const ratio = ref(9 / 16)
const videoEl = ref<HTMLVideoElement>()
const connected = ref(false)

let socket: WebSocket | undefined
let peer: RTCPeerConnection | undefined
const pending: RTCIceCandidateInit[] = []
let remoteSet = false

onMounted(() => {
  videoEl.value?.addEventListener('loadedmetadata', syncRatio)
})

onUnmounted(() => {
  videoEl.value?.removeEventListener('loadedmetadata', syncRatio)
  disconnect()
})

function syncRatio() {
  const video = videoEl.value
  if (video && video.videoWidth > 0 && video.videoHeight > 0) {
    ratio.value = video.videoWidth / video.videoHeight
  }
}

function remember() {
  localStorage.setItem(RELAY_KEY, relay.value.trim())
  localStorage.setItem(STUN_KEY, stun.value.trim())
}

function connect() {
  if (connected.value) {
    disconnect()
    status.value = '已断开'
    return
  }
  const normalized = code.value.trim().toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    status.value = '连接码必须是 6 位字母或数字'
    return
  }
  remember()
  remoteSet = false
  pending.length = 0
  name.value = ''
  status.value = '正在连接中继'
  connected.value = true
  const current = new WebSocket(relay.value.trim())
  socket = current
  current.onopen = () => {
    status.value = '正在等待手机'
    current.send(JSON.stringify({ type: 'join', code: normalized }))
  }
  current.onmessage = (event) => {
    if (typeof event.data === 'string') {
      void onSignal(event.data)
    }
  }
  current.onerror = () => {
    status.value = '中继连接失败'
  }
  current.onclose = () => {
    if (socket === current) {
      socket = undefined
      connected.value = false
      status.value = '信令已断开'
    }
  }
}

async function onSignal(text: string) {
  const message = JSON.parse(text) as {
    type?: string
    name?: string
    sdp?: string
    candidate?: string
    sdpMid?: string
    sdpMLineIndex?: number
    message?: string
    ok?: boolean
  }
  if (message.type === 'waiting') {
    status.value = '等待手机登记'
    return
  }
  if (message.type === 'joined') {
    name.value = message.name || '手机'
    status.value = '正在建立画面'
    openPeer()
    return
  }
  if (message.type === 'error') {
    status.value = message.message || '信令错误'
    return
  }
  if (message.type === 'peer-left') {
    status.value = '手机已断开'
    return
  }
  if (message.type === 'shot') {
    status.value = message.ok ? '截图已保存到手机 Download' : '截图失败'
    return
  }
  if (!peer) {
    return
  }
  if (message.type === 'offer' && message.sdp) {
    await peer.setRemoteDescription({ type: 'offer', sdp: message.sdp })
    remoteSet = true
    for (const candidate of pending) {
      await peer.addIceCandidate(candidate)
    }
    pending.length = 0
    const answer = await peer.createAnswer()
    await peer.setLocalDescription(answer)
    socket?.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }))
    return
  }
  if (message.type === 'candidate' && message.candidate) {
    const candidate: RTCIceCandidateInit = {
      candidate: message.candidate,
      sdpMid: message.sdpMid,
      sdpMLineIndex: message.sdpMLineIndex,
    }
    if (!remoteSet) {
      pending.push(candidate)
    } else {
      await peer.addIceCandidate(candidate)
    }
  }
}

function openPeer() {
  peer?.close()
  const connection = new RTCPeerConnection({
    iceServers: [{ urls: stun.value.trim() }],
  })
  peer = connection
  connection.ontrack = (event) => {
    const video = videoEl.value
    if (!video) {
      return
    }
    const stream = event.streams[0] ?? new MediaStream([event.track])
    video.srcObject = stream
    void video.play().catch(() => {})
    status.value = '正在接收画面'
  }
  connection.onicecandidate = (event) => {
    if (!event.candidate) {
      return
    }
    socket?.send(
      JSON.stringify({
        type: 'candidate',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex,
      }),
    )
  }
  connection.oniceconnectionstatechange = () => {
    if (connection.iceConnectionState === 'connected' || connection.iceConnectionState === 'completed') {
      status.value = '画面通道已建立'
    } else if (connection.iceConnectionState === 'failed') {
      status.value = 'UDP 打洞失败'
    }
  }
}

function sendControl(action: string) {
  if (!name.value || socket?.readyState !== WebSocket.OPEN) {
    return
  }
  socket.send(JSON.stringify({ type: 'control', action }))
}

let pressing = false
let lastPoint: { x: number; y: number } | undefined
let moveTimer: number | undefined

function videoPoint(event: MouseEvent) {
  const video = videoEl.value
  if (!video) {
    return
  }
  const rect = video.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) {
    return
  }
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  }
}

function sendTouch(phase: string, x: number, y: number) {
  if (!name.value || socket?.readyState !== WebSocket.OPEN) {
    return
  }
  socket.send(JSON.stringify({ type: 'control', action: 'touch', phase, x, y }))
}

function onPointerDown(event: PointerEvent) {
  if (!name.value) {
    return
  }
  if (event.button === 2) {
    sendControl('back')
    return
  }
  if (event.button === 1) {
    sendControl('home')
    return
  }
  if (event.button !== 0) {
    return
  }
  const point = videoPoint(event)
  if (!point) {
    return
  }
  pressing = true
  lastPoint = point
  sendTouch('down', point.x, point.y)
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  } catch {
    // 非用户手势时捕获会失败，触摸已经发出
  }
}

function onPointerMove(event: PointerEvent) {
  if (!pressing) {
    return
  }
  const point = videoPoint(event)
  if (!point) {
    return
  }
  lastPoint = point
  if (moveTimer != null) {
    return
  }
  moveTimer = window.setTimeout(() => {
    moveTimer = undefined
    if (pressing && lastPoint) {
      sendTouch('move', lastPoint.x, lastPoint.y)
    }
  }, 16)
}

function onPointerUp(event: PointerEvent) {
  if (!pressing || (event.type !== 'pointercancel' && event.button !== 0)) {
    return
  }
  pressing = false
  if (moveTimer != null) {
    window.clearTimeout(moveTimer)
    moveTimer = undefined
  }
  const point = videoPoint(event) ?? lastPoint
  if (point) {
    sendTouch('up', point.x, point.y)
  }
}

function onWheel(event: WheelEvent) {
  const point = videoPoint(event)
  if (!point || !name.value || socket?.readyState !== WebSocket.OPEN) {
    return
  }
  const dx = Math.max(-1, Math.min(1, event.deltaX / 120))
  const dy = Math.max(-1, Math.min(1, -event.deltaY / 120))
  if (dx === 0 && dy === 0) {
    return
  }
  socket.send(JSON.stringify({ type: 'control', action: 'scroll', x: point.x, y: point.y, dx, dy }))
}

function disconnect() {
  connected.value = false
  socket?.close()
  socket = undefined
  peer?.close()
  peer = undefined
  if (videoEl.value) {
    videoEl.value.srcObject = null
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col gap-4 p-6">
    <div class="flex items-end justify-between gap-4">
      <h1 class="text-3xl font-medium">画面</h1>
      <p class="text-sm text-muted-color">{{ status }}</p>
    </div>
    <form class="flex flex-wrap gap-2" @submit.prevent="connect">
      <InputText v-model="relay" class="min-w-64 flex-1" :placeholder="relayUrl" />
      <InputText v-model="stun" class="min-w-48 flex-1" :placeholder="stunUrl" />
      <InputText v-model="code" class="w-32 uppercase" placeholder="连接码" maxlength="6" />
      <Button type="submit" :label="connected ? '断开' : '连接'" />
    </form>
    <div class="flex min-h-0 flex-1 flex-col gap-2">
      <p v-if="name" class="text-sm">{{ name }}</p>
      <div class="flex min-h-0 flex-1 items-center justify-center rounded-md [container-type:size]">
        <video
          ref="videoEl"
          autoplay
          playsinline
          muted
          class="bg-black touch-none select-none"
          aria-label="手机画面"
          :style="{
            aspectRatio: `${ratio}`,
            width: `min(100cqw, calc(100cqh * ${ratio}))`,
            height: 'auto',
          }"
          @pointerdown.prevent="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @contextmenu.prevent
          @wheel.prevent="onWheel"
        />
      </div>
      <div class="flex justify-center gap-2">
        <Button icon="pi pi-arrow-left" rounded outlined aria-label="返回" :disabled="!name" @click="sendControl('back')" />
        <Button icon="pi pi-home" rounded outlined aria-label="主页" :disabled="!name" @click="sendControl('home')" />
        <Button icon="pi pi-clone" rounded outlined aria-label="最近任务" :disabled="!name" @click="sendControl('recents')" />
        <Button icon="pi pi-camera" rounded outlined aria-label="截图" :disabled="!name" @click="sendControl('shot')" />
      </div>
    </div>
  </section>
</template>
