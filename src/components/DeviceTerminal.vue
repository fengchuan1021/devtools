<script setup lang="ts">
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { openDeviceShellStream, runDeviceShellSession } from '../api/device'

const props = withDefaults(
  defineProps<{
    serial?: string
    session?: string
  }>(),
  { serial: '', session: '' },
)
const emit = defineEmits<{
  status: [state: 'connecting' | 'ready' | 'closed' | 'error', detail: string]
}>()

const termHostRef = ref<HTMLElement | null>(null)
const termElRef = ref<HTMLElement | null>(null)
const searchOpen = ref(false)
const searchText = ref('')
const searchRef = ref<HTMLInputElement | null>(null)

const sessionId = props.session || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const term = shallowRef<Terminal | null>(null)
const fitAddon = new FitAddon()
const searchAddon = new SearchAddon()

let disposed = false
let opened = false
let booted = false
let exited = false
let pumping = false
let pendingIn = ''
let cols = 0
let rows = 0
let activeSeq = 0
let resizeTimer = 0
let streamLoop = 0
let streamAbort: AbortController | null = null
let resizeObserver: ResizeObserver | null = null

const searchOptions = {
  incremental: true,
  decorations: {
    matchBackground: '#3a3d41',
    matchOverviewRuler: '#3a3d41',
    activeMatchBackground: '#515c6a',
    activeMatchColorOverviewRuler: '#007acc',
  },
}

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

function visibleError(reason: unknown, fallback: string) {
  return errorText(reason, fallback).replace(/[\u0000-\u001f\u007f]/g, ' ')
}

function emitStatus(state: 'connecting' | 'ready' | 'closed' | 'error', detail = '') {
  emit('status', state, detail)
}

function writeNote(text: string, color = '33') {
  term.value?.write(`\r\n\x1b[${color}m${text}\x1b[0m\r\n`)
}

async function sendOp(
  op: 'open' | 'write' | 'interrupt' | 'close' | 'resize',
  data = '',
  size?: { cols: number; rows: number },
  seq = activeSeq,
) {
  if (!props.serial) throw new Error('未选择设备')
  const result = await runDeviceShellSession(props.serial, sessionId, op, data, seq, size)
  const text = result == null ? '' : String(result)
  if (text && text !== 'ok' && !text.startsWith('ok')) {
    if (text.includes('unknown')) throw new Error('设备固件过旧，不支持交互式终端')
    if (op !== 'close') throw new Error(text)
  }
  return text || 'ok'
}

function pumpInput() {
  if (pumping || disposed || !pendingIn || !opened) return
  const chunk = pendingIn.slice(0, 2000)
  pendingIn = pendingIn.slice(2000)
  pumping = true
  sendOp('write', chunk)
    .catch((reason: unknown) => {
      emitStatus(exited ? 'closed' : 'ready', errorText(reason, '发送失败'))
    })
    .finally(() => {
      pumping = false
      if (!disposed && pendingIn) pumpInput()
    })
}

function enqueueInput(data: string) {
  if (!data || disposed || exited) return
  pendingIn += data
  pumpInput()
}

function onInput(data: string) {
  enqueueInput(data)
}

function currentSize() {
  return {
    cols: cols >= 2 ? cols : 80,
    rows: rows >= 2 ? rows : 24,
  }
}

async function openPty() {
  const seq = ++activeSeq
  await sendOp('open', '', undefined, seq)
  await sendOp('resize', '', currentSize(), seq)
  opened = true
  exited = false
  pumpInput()
}

async function bootPty() {
  emitStatus('connecting')
  try {
    await openPty()
    if (disposed) return
    emitStatus('ready')
    focusSoon()
  } catch (reason) {
    if (disposed) return
    emitStatus('error', errorText(reason, '打开终端失败'))
    writeNote(visibleError(reason, '打开终端失败'), '31')
  }
}

function onShellEvent(ev: { type?: string; data?: string; seq?: number }) {
  if (!ev || disposed) return
  if (ev.type === 'out' && ev.data) {
    term.value?.write(ev.data)
    return
  }
  if (ev.type === 'closed') {
    if (typeof ev.seq === 'number' && activeSeq && ev.seq !== activeSeq) return
    exited = true
    opened = false
    pendingIn = ''
    emitStatus('closed', '会话已结束')
    writeNote('[会话已结束]')
    return
  }
  if (ev.type === 'error' && ev.data) {
    emitStatus('error', ev.data)
    writeNote(ev.data.replace(/[\u0000-\u001f\u007f]/g, ' '), '31')
  }
}

async function startStream() {
  streamAbort?.abort()
  const ac = new AbortController()
  streamAbort = ac
  const loop = ++streamLoop
  while (loop === streamLoop && !ac.signal.aborted && !disposed) {
    try {
      await openDeviceShellStream(props.serial, sessionId, {
        onEvent: onShellEvent,
        onOpen: () => {
          if (disposed) return
          if (!booted) {
            booted = true
            void bootPty()
            return
          }
          if (!exited) emitStatus('ready')
        },
        signal: ac.signal,
      })
    } catch (reason) {
      if (ac.signal.aborted || loop !== streamLoop || disposed) return
      if (!booted) emitStatus('error', errorText(reason, '终端输出中断'))
    }
    if (ac.signal.aborted || loop !== streamLoop || disposed) return
    if (booted && !exited) emitStatus('connecting', '正在恢复输出…')
    await new Promise((resolve) => setTimeout(resolve, 800))
  }
}

function stopStream() {
  streamLoop += 1
  streamAbort?.abort()
  streamAbort = null
}

function fit() {
  if (!term.value || !termElRef.value) return
  fitAddon.fit()
}

function focus() {
  term.value?.focus()
}

function focusSoon() {
  nextTick(() => focus())
  window.setTimeout(() => {
    if (!disposed && !searchOpen.value) focus()
  }, 220)
}

async function interrupt() {
  enqueueInput('\x03')
  try {
    await sendOp('interrupt')
  } catch (reason) {
    emitStatus(exited ? 'closed' : 'ready', errorText(reason, '中断失败'))
  }
}

async function reconnect() {
  if (!props.serial || disposed) return
  exited = false
  opened = false
  pendingIn = ''
  emitStatus('connecting')
  writeNote('[重新连接]')
  try {
    await openPty()
    if (disposed) return
    emitStatus('ready')
    focusSoon()
  } catch (reason) {
    if (disposed) return
    emitStatus('error', errorText(reason, '重连失败'))
    writeNote(visibleError(reason, '重连失败'), '31')
  }
}

function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) {
    searchAddon.clearDecorations()
    focus()
    return
  }
  nextTick(() => searchRef.value?.focus())
}

function find(forward: boolean) {
  const query = searchText.value
  if (!query) return
  if (forward) searchAddon.findNext(query, searchOptions)
  else searchAddon.findPrevious(query, searchOptions)
}

function onSearchKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    searchOpen.value = false
    searchAddon.clearDecorations()
    focus()
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    find(!event.shiftKey)
  }
}

function copySelection() {
  const text = term.value?.getSelection() ?? ''
  if (!text) return false
  navigator.clipboard.writeText(text).catch(() => {})
  return true
}

async function pasteClipboard() {
  try {
    const text = await navigator.clipboard.readText()
    if (text) onInput(text)
  } catch {
    // 浏览器未授权剪贴板时，Ctrl+V 仍由终端自己处理
  }
}

function onContextMenu(event: MouseEvent) {
  if (term.value?.hasSelection()) return
  event.preventDefault()
  void pasteClipboard()
}

function setupTerm() {
  const host = termElRef.value
  if (!host) return
  const instance = new Terminal({
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: 'Menlo, Consolas, "DejaVu Sans Mono", monospace',
    fontSize: 13,
    scrollback: 8000,
    macOptionIsMeta: true,
    overviewRuler: { width: 8 },
    theme: {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#007acc',
      cursorAccent: '#1e1e1e',
      selectionBackground: '#264f78',
      black: '#1e1e1e',
      red: '#f14c4c',
      green: '#23d18b',
      yellow: '#e5e510',
      blue: '#3b8eea',
      magenta: '#d670d6',
      cyan: '#29b8db',
      white: '#e5e5e5',
      brightBlack: '#666666',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#f5f543',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#ffffff',
    },
  })
  instance.loadAddon(fitAddon)
  instance.loadAddon(searchAddon)
  instance.loadAddon(new WebLinksAddon((_event, uri) => {
    window.open(uri, '_blank', 'noopener')
  }))
  instance.open(host)
  instance.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true
    const mod = event.ctrlKey || event.metaKey
    const key = event.key.toLowerCase()
    if (mod && !event.altKey && key === 'f') {
      event.preventDefault()
      toggleSearch()
      return false
    }
    if (mod && event.shiftKey && !event.altKey && key === 'c') {
      event.preventDefault()
      copySelection()
      return false
    }
    if (mod && event.shiftKey && !event.altKey && key === 'v') {
      event.preventDefault()
      void pasteClipboard()
      return false
    }
    if (mod && !event.shiftKey && !event.altKey && key === 'c' && instance.hasSelection()) {
      event.preventDefault()
      copySelection()
      instance.clearSelection()
      return false
    }
    return true
  })
  instance.onData(onInput)
  instance.onResize(({ cols: nextCols, rows: nextRows }) => {
    cols = nextCols
    rows = nextRows
    if (!opened || disposed || exited) return
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (!opened || disposed || exited) return
      sendOp('resize', '', { cols, rows }).catch(() => {})
    }, 60)
  })
  term.value = instance
  const box = termHostRef.value
  if (box) {
    resizeObserver = new ResizeObserver(() => fit())
    resizeObserver.observe(box)
  }
  requestAnimationFrame(() => fit())
}

onMounted(() => {
  setupTerm()
  if (!props.serial) {
    emitStatus('error', '未选择设备')
    writeNote('未选择设备', '31')
    return
  }
  emitStatus('connecting')
  startStream()
  focusSoon()
})

onBeforeUnmount(() => {
  disposed = true
  window.clearTimeout(resizeTimer)
  resizeObserver?.disconnect()
  resizeObserver = null
  stopStream()
  term.value?.dispose()
  term.value = null
  if (props.serial) {
    runDeviceShellSession(props.serial, sessionId, 'close', '').catch(() => {})
  }
})

defineExpose({ focus, interrupt, reconnect, fit })
</script>

<template>
  <div
    class="device-term relative flex min-h-0 w-full flex-1 flex-col bg-[#1e1e1e]"
    @mousedown="focus"
  >
    <form
      v-if="searchOpen"
      class="absolute right-2 top-2 z-10 flex items-center gap-1 rounded border border-white/10 bg-[#252526] px-2 py-1 text-xs text-[#d4d4d4] shadow"
      @submit.prevent="find(true)"
      @mousedown.stop
    >
      <input
        ref="searchRef"
        v-model="searchText"
        class="w-40 bg-transparent outline-none"
        placeholder="搜索"
        spellcheck="false"
        @keydown="onSearchKey"
      />
      <button type="button" class="px-1 text-[#9da5b4] hover:text-white" @click="find(false)">上一个</button>
      <button type="submit" class="px-1 text-[#9da5b4] hover:text-white">下一个</button>
      <button type="button" class="px-1 text-[#9da5b4] hover:text-white" @click="toggleSearch">关闭</button>
    </form>
    <div ref="termHostRef" class="relative min-h-0 flex-1">
      <div ref="termElRef" class="absolute inset-0" @contextmenu="onContextMenu" />
    </div>
  </div>
</template>

<style scoped>
.device-term :deep(.xterm) {
  height: 100%;
  padding: 4px 6px 0;
  box-sizing: border-box;
}
.device-term :deep(.xterm-viewport) {
  background-color: #1e1e1e !important;
}
</style>
