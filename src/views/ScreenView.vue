<script setup lang="ts">
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { installDroppedApk, sendScreenLinkCmd } from '../api/device'
import DeviceMetaEditor from '../components/DeviceMetaEditor.vue'
import request from '../utils/request'

interface DeviceGroup {
  id: number
  group_name: string
  devices?: Array<{ serial?: string; profile_serial?: string }>
}

interface Tile {
  serial: string
  profileSerial: string
  label: string
  groupId: number
  status: string
  name: string
  ratio: number
  connected: boolean
  hasVideo: boolean
}

interface Session {
  socket?: WebSocket
  peer?: RTCPeerConnection
  pending: RTCIceCandidateInit[]
  remoteSet: boolean
  pressing: boolean
  lastPoint?: { x: number; y: number }
  moveTimer?: number
  video?: HTMLVideoElement
  stream?: MediaStream
  generation: number
}

const deviceEditorVisible = ref(false)
const deviceEditorSerial = ref('')
const relay = ref('')
const stun = ref('')
const pageStatus = ref('')
const devicesReady = ref(false)
const groups = ref<DeviceGroup[]>([])
const selectedGroup = ref<number | 'all'>('all')
const deviceQuery = ref('')
const dragOverSerial = ref('')
const tiles = ref<Tile[]>([])
const tileWidth = ref(240)
const tileHeight = ref(288)
const sessions = new Map<string, Session>()
const heldKeys = new Map<string, number>()
let activeSerial = ''
let resizing = false
let resizeOrigin = { x: 0, y: 0, width: 0, height: 0 }

const visibleTiles = computed(() => {
  const query = deviceQuery.value.trim().toLowerCase()
  return tiles.value.filter((tile) => {
    if (selectedGroup.value !== 'all' && tile.groupId !== selectedGroup.value) return false
    if (!query) return true
    return tile.serial.toLowerCase().includes(query) || tile.profileSerial.toLowerCase().includes(query)
  })
})

onMounted(() => {
  window.addEventListener('keydown', onShortcutKey, true)
  window.addEventListener('keyup', onShortcutKey, true)
  window.addEventListener('blur', releaseHeldKeys)
  void Promise.all([loadWebRTCConfig(), loadDevices()])
})

onUnmounted(() => {
  window.removeEventListener('keydown', onShortcutKey, true)
  window.removeEventListener('keyup', onShortcutKey, true)
  window.removeEventListener('blur', releaseHeldKeys)
  for (const tile of tiles.value) disconnectTile(tile)
})

function sessionOf(serial: string) {
  let session = sessions.get(serial)
  if (!session) {
    session = { pending: [], remoteSet: false, pressing: false, generation: 0 }
    sessions.set(serial, session)
  }
  return session
}

async function loadWebRTCConfig() {
  try {
    const data = await request.get<{ relay?: string; stun?: string }>('/api/getwebrtcconfig')
    relay.value = (data.relay || '').trim()
    stun.value = (data.stun || '').trim()
    if (!relay.value || !stun.value) {
      pageStatus.value = '画面配置不完整'
    }
  } catch {
    pageStatus.value = '获取画面配置失败'
  }
}

async function loadDevices() {
  try {
    const body = await request.post<{ code?: number; msg?: string; data?: DeviceGroup[] }>(
      '/api/devices/getDevicesTree',
      { allusers: false },
    )
    if (body.code !== 200 || !Array.isArray(body.data)) {
      pageStatus.value = body.msg || '获取设备分组失败'
      return
    }
    groups.value = body.data
    rebuildTiles(body.data)
  } catch {
    pageStatus.value = '获取设备分组失败'
  } finally {
    devicesReady.value = true
  }
}

function rebuildTiles(list: DeviceGroup[]) {
  const next: Tile[] = []
  const seen = new Set<string>()
  for (const group of list) {
    for (const device of group.devices ?? []) {
      const serial = (device.serial || '').trim()
      if (!serial || seen.has(serial)) continue
      seen.add(serial)
      const profile = (device.profile_serial || '').trim()
      const previous = tiles.value.find((item) => item.serial === serial)
      if (previous) {
        previous.profileSerial = profile
        previous.label = `${profile}-${serial}`
        previous.groupId = group.id
        next.push(previous)
        continue
      }
      next.push({
        serial,
        profileSerial: profile,
        label: `${profile}-${serial}`,
        groupId: group.id,
        status: '',
        name: '',
        ratio: 9 / 16,
        connected: false,
        hasVideo: false,
      })
    }
  }
  for (const tile of tiles.value) {
    if (!seen.has(tile.serial)) disconnectTile(tile)
  }
  tiles.value = next
}

function selectGroup(id: number | 'all') {
  selectedGroup.value = id
}

function tileFocused(tile: Tile) {
  return deviceQuery.value.trim().toLowerCase() === tile.serial.toLowerCase()
}

function toggleFocus(tile: Tile) {
  deviceQuery.value = tileFocused(tile) ? '' : tile.serial
}

function setVideo(serial: string, element: unknown) {
  // 列表重绘时 Vue 会先用 null 调用旧 ref。忽略这次清空，避免正在播放的画面被拆掉。
  if (!(element instanceof HTMLVideoElement)) return
  const session = sessionOf(serial)
  session.video = element
  if (session.stream && element.srcObject !== session.stream) {
    element.srcObject = session.stream
    void element.play().catch(() => {})
  }
}

function syncRatio(tile: Tile, event: Event) {
  const video = event.target
  if (!(video instanceof HTMLVideoElement) || video.videoWidth <= 0 || video.videoHeight <= 0) return
  tile.ratio = video.videoWidth / video.videoHeight
}

async function connectTile(tile: Tile) {
  if (tile.connected) return
  activeSerial = tile.serial
  if (!relay.value || !stun.value) {
    tile.status = '画面配置未就绪'
    return
  }
  const session = sessionOf(tile.serial)
  const generation = ++session.generation
  session.remoteSet = false
  session.pending = []
  tile.name = ''
  tile.hasVideo = false
  tile.status = '正在通知手机'
  tile.connected = true
  try {
    await sendScreenLinkCmd(tile.serial, 'begin')
  } catch {
    if (session.generation === generation) {
      tile.connected = false
      tile.status = '通知手机失败'
    }
    return
  }
  if (session.generation !== generation) {
    void sendScreenLinkCmd(tile.serial, 'end').catch(() => {})
    return
  }
  tile.status = '正在连接中继'
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const current = new WebSocket(`${protocol}//${location.host}/screenlink`)
  session.socket = current
  current.onopen = () => {
    if (session.socket !== current) return
    tile.status = '正在等待手机'
    current.send(JSON.stringify({ type: 'join', code: tile.serial }))
  }
  current.onmessage = (event) => {
    if (typeof event.data === 'string') void onSignal(tile, event.data)
  }
  current.onerror = () => {
    if (session.socket === current) tile.status = '中继连接失败'
  }
  current.onclose = () => {
    if (session.socket !== current) return
    session.socket = undefined
    closePeer(tile)
    tile.connected = false
    tile.hasVideo = false
    tile.name = ''
    tile.status = '信令已断开'
    void sendScreenLinkCmd(tile.serial, 'end').catch(() => {})
  }
}

async function onSignal(tile: Tile, text: string) {
  let message: {
    type?: string
    name?: string
    sdp?: string
    candidate?: string
    sdpMid?: string
    sdpMLineIndex?: number
    message?: string
    ok?: boolean
  }
  try {
    message = JSON.parse(text)
  } catch {
    return
  }
  const session = sessionOf(tile.serial)
  if (message.type === 'waiting') {
    tile.status = '等待手机登记'
    return
  }
  if (message.type === 'joined') {
    tile.name = message.name || '手机'
    tile.status = '正在建立画面'
    openPeer(tile)
    return
  }
  if (message.type === 'error') {
    tile.status = message.message || '信令错误'
    return
  }
  if (message.type === 'peer-left') {
    tile.status = '手机已断开'
    tile.name = ''
    tile.hasVideo = false
    closePeer(tile)
    return
  }
  if (message.type === 'shot') {
    tile.status = message.ok ? '截图已保存到手机 Download' : '截图失败'
    return
  }
  if (!session.peer) return
  if (message.type === 'offer' && message.sdp) {
    await session.peer.setRemoteDescription({ type: 'offer', sdp: message.sdp })
    session.remoteSet = true
    for (const candidate of session.pending) {
      await session.peer.addIceCandidate(candidate)
    }
    session.pending = []
    const answer = await session.peer.createAnswer()
    await session.peer.setLocalDescription(answer)
    session.socket?.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }))
    return
  }
  if (message.type === 'candidate' && message.candidate) {
    const candidate: RTCIceCandidateInit = {
      candidate: message.candidate,
      sdpMid: message.sdpMid,
      sdpMLineIndex: message.sdpMLineIndex,
    }
    if (!session.remoteSet) {
      session.pending.push(candidate)
    } else {
      await session.peer.addIceCandidate(candidate)
    }
  }
}

function openPeer(tile: Tile) {
  const session = sessionOf(tile.serial)
  session.peer?.close()
  const connection = new RTCPeerConnection({
    iceServers: [{ urls: stun.value }],
  })
  session.peer = connection
  connection.ontrack = (event) => {
    const stream = event.streams[0] ?? new MediaStream([event.track])
    session.stream = stream
    tile.hasVideo = true
    if (session.video) {
      session.video.srcObject = stream
      void session.video.play().catch(() => {})
    }
    tile.status = '正在接收画面'
  }
  connection.onicecandidate = (event) => {
    if (!event.candidate || session.socket?.readyState !== WebSocket.OPEN) return
    session.socket.send(
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
      tile.status = '画面通道已建立'
    } else if (connection.iceConnectionState === 'failed') {
      tile.status = 'UDP 打洞失败'
    }
  }
}

function closePeer(tile: Tile) {
  const session = sessions.get(tile.serial)
  if (!session) return
  const video = session.video
  const stream = session.stream
  session.peer?.close()
  session.peer = undefined
  session.stream = undefined
  session.remoteSet = false
  session.pending = []
  if (video && video.srcObject === stream) video.srcObject = null
}

function sendControl(tile: Tile, action: string) {
  const session = sessions.get(tile.serial)
  if (!tile.name || session?.socket?.readyState !== WebSocket.OPEN) return
  activeSerial = tile.serial
  session.socket.send(JSON.stringify({ type: 'control', action }))
}

function shortcutTile() {
  const selected = tiles.value.find((tile) => tile.serial === activeSerial && tile.name)
  if (selected) return selected
  const joined = tiles.value.filter((tile) => tile.name)
  return joined.length === 1 ? joined[0] : undefined
}

function onShortcutKey(event: KeyboardEvent) {
  const target = event.target
  if (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
  ) {
    return
  }
  if (event.type === 'keydown' && event.altKey && !event.repeat && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    const action =
      event.code === 'KeyH' ? 'home' : event.code === 'KeyS' ? 'recents' : event.code === 'KeyB' ? 'back' : ''
    if (!action) return
    const tile = shortcutTile()
    if (!tile) return
    event.preventDefault()
    sendControl(tile, action)
    return
  }
  if (event.type !== 'keydown' && event.type !== 'keyup') return
  if (event.altKey || event.ctrlKey || event.metaKey) return
  const key = controlKey(event.code)
  if (!key) return
  const tile = shortcutTile()
  if (!tile) return
  event.preventDefault()
  if (event.type === 'keydown') {
    const repeat = event.repeat ? (heldKeys.get(key) ?? 0) + 1 : 0
    heldKeys.set(key, repeat)
    sendKey(tile, key, event.shiftKey, true, repeat)
    return
  }
  if (!heldKeys.has(key)) return
  heldKeys.delete(key)
  sendKey(tile, key, event.shiftKey, false, 0)
}

function releaseHeldKeys() {
  const tile = shortcutTile()
  const keys = [...heldKeys.keys()]
  heldKeys.clear()
  if (!tile) return
  for (const key of keys) sendKey(tile, key, false, false, 0)
}

const NAMED_KEYS = new Set([
  'Backspace',
  'Enter',
  'NumpadEnter',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Tab',
  'Escape',
  'Delete',
  'Home',
  'End',
  'PageUp',
  'PageDown',
])

function controlKey(code: string) {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3)
  if (/^Digit[0-9]$/.test(code)) return code.slice(5)
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift'
  return NAMED_KEYS.has(code) ? code : ''
}

function sendKey(tile: Tile, key: string, shift: boolean, down: boolean, repeat: number) {
  const session = sessions.get(tile.serial)
  if (!tile.name || session?.socket?.readyState !== WebSocket.OPEN) return
  activeSerial = tile.serial
  session.socket.send(JSON.stringify({ type: 'control', action: 'key', key, shift, down, repeat }))
}

function videoPoint(event: MouseEvent) {
  const video = event.currentTarget
  if (!(video instanceof HTMLVideoElement)) return
  const rect = video.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
  }
}

function sendTouch(tile: Tile, phase: string, x: number, y: number) {
  const session = sessions.get(tile.serial)
  if (!tile.name || session?.socket?.readyState !== WebSocket.OPEN) return
  session.socket.send(JSON.stringify({ type: 'control', action: 'touch', phase, x, y }))
}

function onPointerDown(tile: Tile, event: PointerEvent) {
  if (!tile.name) return
  activeSerial = tile.serial
  if (event.button === 2) {
    sendControl(tile, 'back')
    return
  }
  if (event.button === 1) {
    sendControl(tile, 'home')
    return
  }
  if (event.button !== 0) return
  const point = videoPoint(event)
  if (!point) return
  const session = sessionOf(tile.serial)
  session.pressing = true
  session.lastPoint = point
  sendTouch(tile, 'down', point.x, point.y)
  try {
    ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  } catch {
    // 非用户手势时捕获会失败，触摸已经发出
  }
}

function onPointerMove(tile: Tile, event: PointerEvent) {
  const session = sessions.get(tile.serial)
  if (!session?.pressing) return
  const point = videoPoint(event)
  if (!point) return
  session.lastPoint = point
  if (session.moveTimer != null) return
  session.moveTimer = window.setTimeout(() => {
    session.moveTimer = undefined
    if (session.pressing && session.lastPoint) {
      sendTouch(tile, 'move', session.lastPoint.x, session.lastPoint.y)
    }
  }, 16)
}

function onPointerUp(tile: Tile, event: PointerEvent) {
  const session = sessions.get(tile.serial)
  if (!session?.pressing || (event.type !== 'pointercancel' && event.button !== 0)) return
  session.pressing = false
  if (session.moveTimer != null) {
    window.clearTimeout(session.moveTimer)
    session.moveTimer = undefined
  }
  const point = videoPoint(event) ?? session.lastPoint
  if (point) sendTouch(tile, 'up', point.x, point.y)
}

function onWheel(tile: Tile, event: WheelEvent) {
  const session = sessions.get(tile.serial)
  const point = videoPoint(event)
  if (!point || !tile.name || session?.socket?.readyState !== WebSocket.OPEN) return
  const dx = Math.max(-1, Math.min(1, event.deltaX / 120))
  const dy = Math.max(-1, Math.min(1, -event.deltaY / 120))
  if (dx === 0 && dy === 0) return
  session.socket.send(JSON.stringify({ type: 'control', action: 'scroll', x: point.x, y: point.y, dx, dy }))
}

function onResizeDown(event: PointerEvent) {
  resizing = true
  resizeOrigin = {
    x: event.clientX,
    y: event.clientY,
    width: tileWidth.value,
    height: tileHeight.value,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onResizeMove(event: PointerEvent) {
  if (!resizing) return
  tileWidth.value = Math.min(960, Math.max(180, resizeOrigin.width + event.clientX - resizeOrigin.x))
  tileHeight.value = Math.min(1400, Math.max(120, resizeOrigin.height + event.clientY - resizeOrigin.y))
}

function onResizeUp() {
  resizing = false
}

function onApkDragOver(tile: Tile, event: DragEvent) {
  const types = event.dataTransfer?.types
  if (!types || !Array.from(types).includes('Files')) return
  event.preventDefault()
  dragOverSerial.value = tile.serial
}

function onApkDragLeave(tile: Tile, event: DragEvent) {
  const next = event.relatedTarget
  const current = event.currentTarget
  if (next instanceof Node && current instanceof Node && current.contains(next)) return
  if (dragOverSerial.value === tile.serial) dragOverSerial.value = ''
}

async function onApkDrop(tile: Tile, event: DragEvent) {
  event.preventDefault()
  dragOverSerial.value = ''
  const file = Array.from(event.dataTransfer?.files ?? []).find((item) => item.name.toLowerCase().endsWith('.apk'))
  if (!file) {
    tile.status = '请拖入 apk'
    return
  }
  tile.status = `正在安装 ${file.name}`
  try {
    const body = await installDroppedApk(tile.serial, file)
    const result = typeof body.data === 'string' ? body.data.trim() : ''
    tile.status = result.includes('Success') ? '安装成功' : result || '安装失败'
  } catch (error) {
    tile.status = error instanceof Error ? error.message : '安装失败'
  }
}

function editTile(tile: Tile) {
  deviceEditorSerial.value = tile.serial
  deviceEditorVisible.value = true
}

function disconnectTile(tile: Tile) {
  const wasConnected = tile.connected
  const session = sessions.get(tile.serial)
  if (session) {
    session.generation++
    const current = session.socket
    session.socket = undefined
    current?.close()
    if (session.moveTimer != null) {
      window.clearTimeout(session.moveTimer)
      session.moveTimer = undefined
    }
    session.pressing = false
    closePeer(tile)
  }
  tile.connected = false
  tile.hasVideo = false
  tile.name = ''
  tile.status = '已断开'
  if (activeSerial === tile.serial) activeSerial = ''
  if (wasConnected) {
    void sendScreenLinkCmd(tile.serial, 'end').catch(() => {})
  }
}
</script>

<template>
  <section class="flex h-full min-h-0 flex-col gap-4 p-6">
    <div class="flex items-end justify-between gap-4">
   
      <p class="text-sm text-muted-color">{{ pageStatus }}</p>
    </div>
    <div class="flex flex-wrap gap-2">
      <Button label="全部" size="small" :outlined="selectedGroup !== 'all'" @click="selectGroup('all')" />
      <Button
        v-for="group in groups"
        :key="group.id"
        size="small"
        :label="group.group_name || `分组 ${group.id}`"
        :outlined="selectedGroup !== group.id"
        @click="selectGroup(group.id)"
      />
      <InputText
        v-model="deviceQuery"
        size="small"
        placeholder="搜索序列号"
        class="w-52"
        aria-label="搜索序列号"
      />
    </div>
    <p v-if="devicesReady && visibleTiles.length === 0" class="text-sm text-muted-color">
      {{ deviceQuery.trim() ? '没有匹配的设备' : '没有设备' }}
    </p>
    <div class="flex min-h-0 flex-1 flex-wrap content-start gap-3 overflow-auto">
      <article
        v-for="tile in visibleTiles"
        :key="tile.serial"
        class="relative flex flex-col gap-2 rounded-md border p-2"
        :class="dragOverSerial === tile.serial ? 'border-primary bg-primary/10' : 'border-surface'"
        :style="{ width: `${tileWidth}px` }"
        @dragover="onApkDragOver(tile, $event)"
        @dragleave="onApkDragLeave(tile, $event)"
        @drop="onApkDrop(tile, $event)"
      >
        <div class="flex items-center gap-2">
          <p class="min-w-0 flex-1 truncate text-sm" :title="tile.label">{{ tile.label }}</p>
          
          <span v-tooltip.top="'编辑'" class="inline-flex">
            <Button icon="pi pi-pencil" rounded outlined size="small" aria-label="编辑" @click="editTile(tile)" />
          </span>

          <span v-tooltip.top="'连接'" class="inline-flex">
            <Button icon="pi pi-link" rounded outlined size="small" aria-label="连接" :disabled="tile.connected" :class="tile.connected ? 'pointer-events-none' : ''" @click="connectTile(tile)" />
          </span>
          <span v-tooltip.top="'断开'" class="inline-flex">
            <Button icon="pi pi-power-off" rounded outlined size="small" severity="secondary" aria-label="断开" :disabled="!tile.connected" :class="tile.connected ? '' : 'pointer-events-none'" @click="disconnectTile(tile)" />
          </span>
        </div>
        <div
          class="flex items-center justify-center overflow-hidden rounded-md bg-black"
          :style="{ height: `${tileHeight}px` }"
        >
          <i v-show="!tile.hasVideo" class="pi pi-image text-4xl text-muted-color" aria-label="加载失败" />
          <video
            v-show="tile.hasVideo"
            :ref="(element) => setVideo(tile.serial, element)"
            autoplay
            playsinline
            muted
            class="max-h-full bg-black touch-none select-none"
            :aria-label="tile.label"
            :style="{ aspectRatio: `${tile.ratio}`, height: '100%' }"
            @loadedmetadata="syncRatio(tile, $event)"
            @pointerdown.prevent="onPointerDown(tile, $event)"
            @pointermove="onPointerMove(tile, $event)"
            @pointerup="onPointerUp(tile, $event)"
            @pointercancel="onPointerUp(tile, $event)"
            @contextmenu.prevent
            @wheel.prevent="onWheel(tile, $event)"
          />
        </div>
        <div class="flex justify-center gap-1">
          <Button icon="pi pi-arrow-left" rounded outlined aria-label="返回" size="small" :disabled="!tile.name" @click="sendControl(tile, 'back')" />
          <Button icon="pi pi-home" rounded outlined aria-label="主页" size="small" :disabled="!tile.name" @click="sendControl(tile, 'home')" />
          <Button icon="pi pi-clone" rounded outlined aria-label="最近任务" size="small" :disabled="!tile.name" @click="sendControl(tile, 'recents')" />
          <Button icon="pi pi-camera" rounded outlined aria-label="截图" size="small" :disabled="!tile.name" @click="sendControl(tile, 'shot')" />
          <span v-tooltip.top="tileFocused(tile) ? '失焦' : '聚焦'" class="inline-flex">
            <Button
              :icon="tileFocused(tile) ? 'pi pi-eye-slash' : 'pi pi-eye'"
              rounded
              size="small"
              :outlined="!tileFocused(tile)"
              :aria-label="tileFocused(tile) ? '失焦' : '聚焦'"
              @click="toggleFocus(tile)"
            />
          </span>
        </div>
        <p class="truncate text-xs text-muted-color">{{ tile.status }}</p>
        <div
          class="absolute bottom-0 right-0 z-10 h-4 w-4 cursor-nwse-resize"
          @pointerdown.stop.prevent="onResizeDown"
          @pointermove="onResizeMove"
          @pointerup="onResizeUp"
          @pointercancel="onResizeUp"
        >
          <span class="pointer-events-none absolute bottom-1 right-1 h-2.5 w-2.5 border-b-2 border-r-2 border-muted-color" />
        </div>
      </article>
    </div>
    <DeviceMetaEditor v-model:visible="deviceEditorVisible" :serial="deviceEditorSerial" @saved="loadDevices" />
  </section>
</template>
