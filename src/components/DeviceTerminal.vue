<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { openDeviceShellStream, runDeviceShell, runDeviceShellSession } from '../api/device'

const props = withDefaults(
  defineProps<{
    serial?: string
    session?: string
  }>(),
  { serial: '', session: '' },
)
const emit = defineEmits<{ close: [] }>()

const SHELL_COMMANDS = [
  'ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find', 'ps', 'kill', 'chmod', 'chown',
  'cp', 'mv', 'rm', 'mkdir', 'touch', 'ln', 'df', 'du', 'mount', 'umount', 'id',
  'which', 'whoami', 'uname', 'date', 'clear', 'exit', 'export', 'setprop', 'getprop',
  'am', 'pm', 'dumpsys', 'logcat', 'service', 'settings', 'toybox', 'busybox', 'sh',
  'reboot', 'sync', 'stat', 'head', 'tail', 'wc', 'sed', 'awk', 'tar', 'gzip',
  'chcon', 'restorecon', 'magisk', 'su',
]

type LineKind = 'out' | 'cmd' | 'err' | 'meta'
interface TermLine {
  kind: LineKind
  text: string
}
interface ShellEvent {
  type?: string
  data?: string
  cwd?: string
  seq?: number
}

const cwd = ref('/')
const input = ref('')
const busy = ref(false)
const completing = ref(false)
const ready = ref(false)
const lines = ref<TermLine[]>([])
const history = ref<string[]>([])
const historyIndex = ref(-1)
const bodyRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const rootRef = ref<HTMLElement | null>(null)
const sessionId = props.session || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const MAX_LINES = 4000
let completeSeq = 0
let streamAbort: AbortController | null = null
let outTail = ''
let streamLoop = 0
let alive = true
let lastOutAt = 0
let runSeq = 0

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

function shellQuote(value: string) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function unwrapCompletionToken(token: string) {
  let text = token
  if (text.startsWith("'")) {
    text = text.slice(1)
    if (text.endsWith("'")) text = text.slice(0, -1)
    return text.replace(/'\\''/g, "'")
  }
  if (text.startsWith('"')) {
    text = text.slice(1)
    if (text.endsWith('"')) text = text.slice(0, -1)
    return text.replace(/\\(.)/g, '$1')
  }
  return text.replace(/\\(.)/g, '$1')
}

function quoteCompletionToken(value: string) {
  if (!value) return value
  if (/[\s'"\\$`;&|<>(){}[\]!*?#~]/.test(value)) {
    return `'${value.replace(/'/g, `'\\''`)}'`
  }
  return value
}

function getTokenAtCursor(value: string, cursor: number) {
  let inSingle = false
  let inDouble = false
  let tokenStart = 0
  for (let i = 0; i < cursor; i++) {
    const char = value[i]
    if (inSingle) {
      if (char === "'") inSingle = false
      continue
    }
    if (inDouble) {
      if (char === '\\' && i + 1 < cursor) {
        i += 1
        continue
      }
      if (char === '"') inDouble = false
      continue
    }
    if (char === "'") {
      inSingle = true
      continue
    }
    if (char === '"') {
      inDouble = true
      continue
    }
    if (char === '\\' && i + 1 < cursor) {
      i += 1
      continue
    }
    if (char && /\s/.test(char)) tokenStart = i + 1
  }

  let tokenEnd = cursor
  let single = inSingle
  let double = inDouble
  for (let i = cursor; i < value.length; i++) {
    const char = value[i]
    if (single) {
      if (char === "'") single = false
      tokenEnd = i + 1
      continue
    }
    if (double) {
      if (char === '\\' && i + 1 < value.length) {
        i += 1
        tokenEnd = i + 1
        continue
      }
      if (char === '"') double = false
      tokenEnd = i + 1
      continue
    }
    if (char && /\s/.test(char)) break
    tokenEnd = i + 1
  }

  return {
    before: value.slice(0, tokenStart),
    token: value.slice(tokenStart, cursor),
    after: value.slice(tokenEnd),
  }
}

function splitPathToken(token: string) {
  const lastSlash = token.lastIndexOf('/')
  if (lastSlash < 0) return { dir: '', base: token }
  return { dir: token.slice(0, lastSlash + 1), base: token.slice(lastSlash + 1) }
}

function listPathFromDir(dir: string) {
  if (!dir) return '.'
  if (dir === '/') return '/'
  return dir.replace(/\/+$/, '') || '/'
}

function commonPrefix(items: string[]) {
  if (!items.length) return ''
  let prefix = items[0] ?? ''
  for (const item of items) {
    let i = 0
    while (i < prefix.length && i < item.length && prefix[i] === item[i]) i += 1
    prefix = prefix.slice(0, i)
    if (!prefix) break
  }
  return prefix
}

function parseListNames(raw: unknown) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n').replace(/\x1b\[[0-9;]*m/g, '')
  const names: string[] = []
  for (const line of text.split('\n')) {
    const name = line.replace(/\r$/, '')
    if (!name || name === '.' || name === '..' || name === './' || name === '../') continue
    if (name.startsWith('ls:')) continue
    names.push(name)
  }
  return names
}

function addUnique(list: string[], seen: Set<string>, name: string) {
  if (!name || seen.has(name)) return
  seen.add(name)
  list.push(name)
}

function pushLine(text: string, kind: LineKind = 'out') {
  const chunks = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  if (chunks.length && chunks[chunks.length - 1] === '') chunks.pop()
  if (!chunks.length) {
    lines.value.push({ kind, text: '' })
    trimLines()
    return
  }
  for (const chunk of chunks) {
    lines.value.push({ kind, text: chunk })
  }
  trimLines()
}

function trimLines() {
  if (lines.value.length > MAX_LINES) {
    lines.value.splice(0, lines.value.length - MAX_LINES)
  }
}

function stripAnsi(text: string) {
  return String(text ?? '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
}

function appendOutput(chunk: string) {
  const text = stripAnsi(`${outTail}${chunk}`.replace(/\r\n/g, '\n'))
  const parts = text.split('\n')
  outTail = parts.pop() ?? ''
  for (const line of parts) {
    pushLine(line.replace(/^[^\r]*\r/, ''), 'out')
  }
}

function flushOutput() {
  if (!outTail) return
  pushLine(stripAnsi(outTail).replace(/^[^\r]*\r/, ''), 'out')
  outTail = ''
}

async function scrollToBottom() {
  await nextTick()
  const el = bodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function focusInput() {
  inputRef.value?.focus()
}

function applyCompletion(
  parsed: { before: string; after: string },
  dir: string,
  name: string,
  unique: boolean,
) {
  let completed = dir + name
  completed = quoteCompletionToken(completed)
  if (unique && !name.endsWith('/') && !completed.endsWith(' ')) completed += ' '
  input.value = parsed.before + completed + parsed.after
  const pos = parsed.before.length + completed.length
  nextTick(() => {
    inputRef.value?.setSelectionRange(pos, pos)
    focusInput()
  })
}

function showMatches(matches: string[]) {
  const max = 80
  let text = matches.slice(0, max).join('  ')
  if (matches.length > max) text += `  … 共 ${matches.length} 个`
  pushLine(text, 'meta')
  scrollToBottom()
}

function pickCompletion(
  parsed: { before: string; after: string },
  dir: string,
  base: string,
  matches: string[],
) {
  if (!matches.length) return
  matches.sort((a, b) => a.localeCompare(b))
  if (matches.length === 1) {
    applyCompletion(parsed, dir, matches[0] ?? '', true)
    return
  }
  const prefix = commonPrefix(matches)
  if (prefix.length > base.length) {
    applyCompletion(parsed, dir, prefix, false)
    return
  }
  showMatches(matches)
}

function completionStillValid(seq: number, value: string) {
  return seq === completeSeq && input.value === value
}

async function completeTab() {
  if (busy.value || completing.value) return
  const el = inputRef.value
  if (!el) return
  if (!props.serial) {
    pushLine('未选择设备', 'err')
    await scrollToBottom()
    return
  }

  const value = input.value
  const cursor = el.selectionStart ?? value.length
  const parsed = getTokenAtCursor(value, cursor)
  const token = unwrapCompletionToken(parsed.token)
  const { dir, base } = splitPathToken(token)
  const firstWord = !parsed.before.trim()
  const matches: string[] = []
  const seen = new Set<string>()

  if (firstWord && !token.includes('/')) {
    for (const cmd of SHELL_COMMANDS) {
      if (cmd.startsWith(base)) addUnique(matches, seen, cmd)
    }
  }

  completing.value = true
  const seq = ++completeSeq
  try {
    const script = `cd ${shellQuote(cwd.value)} || true
d=${shellQuote(listPathFromDir(dir))}
if [ -d "$d" ]; then
  ls -1ap "$d" 2>/dev/null || ls -1a "$d" 2>/dev/null
fi`
    const raw = await runDeviceShell(props.serial, script)
    if (!completionStillValid(seq, value)) return
    for (const name of parseListNames(raw)) {
      if (name.startsWith(base)) addUnique(matches, seen, name)
    }
    pickCompletion(parsed, dir, base, matches)
  } catch (reason) {
    if (!completionStillValid(seq, value)) return
    if (matches.length) {
      pickCompletion(parsed, dir, base, matches)
      return
    }
    pushLine(errorText(reason, '补齐失败'), 'err')
    await scrollToBottom()
  } finally {
    if (seq === completeSeq) completing.value = false
    focusInput()
  }
}

async function sendOp(op: 'open' | 'write' | 'interrupt' | 'close', data = '', seq = 0) {
  if (!props.serial) throw new Error('未选择设备')
  const result = await runDeviceShellSession(props.serial, sessionId, op, data, seq)
  if (result && result !== 'ok' && !String(result).startsWith('ok')) {
    if (String(result).includes('unknown')) {
      throw new Error('设备固件过旧，不支持交互式终端')
    }
    if (op !== 'close') throw new Error(String(result))
  }
  return result
}

function onShellEvent(ev: ShellEvent) {
  if (!ev || typeof ev !== 'object') return
  if (ev.type === 'out' && ev.data) {
    lastOutAt = Date.now()
    appendOutput(ev.data)
    scrollToBottom()
    return
  }
  if (ev.type === 'idle') {
    flushOutput()
    if (ev.cwd && ev.cwd.startsWith('/') && ev.cwd !== '/$PWD') cwd.value = ev.cwd
    if (typeof ev.seq === 'number' && runSeq > 0 && ev.seq !== runSeq) {
      ready.value = true
      return
    }
    busy.value = false
    ready.value = true
    scrollToBottom()
    focusInput()
    return
  }
  if (ev.type === 'closed') {
    flushOutput()
    busy.value = false
    ready.value = false
    if (!alive) return
    pushLine('会话已结束，正在重连…', 'meta')
    scrollToBottom()
    sendOp('open')
      .then(() => {
        if (alive) ready.value = true
      })
      .catch((reason: unknown) => {
        if (alive) pushLine(errorText(reason, '重连失败'), 'err')
      })
    return
  }
  if (ev.type === 'error' && ev.data) {
    pushLine(ev.data, 'err')
    scrollToBottom()
  }
}

async function startStream() {
  if (!props.serial) return
  streamAbort?.abort()
  const ac = new AbortController()
  streamAbort = ac
  const loop = ++streamLoop
  while (loop === streamLoop && !ac.signal.aborted) {
    try {
      await openDeviceShellStream(props.serial, sessionId, {
        onEvent: onShellEvent,
        signal: ac.signal,
      })
    } catch (reason) {
      if (ac.signal.aborted || loop !== streamLoop) return
      pushLine(errorText(reason, '终端输出中断'), 'err')
      await scrollToBottom()
    }
    if (ac.signal.aborted || loop !== streamLoop) return
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
}

function stopStream() {
  streamLoop += 1
  streamAbort?.abort()
  streamAbort = null
}

async function interrupt() {
  pushLine('^C', 'cmd')
  await scrollToBottom()
  try {
    await sendOp('interrupt')
  } catch (reason) {
    pushLine(errorText(reason, '中断失败'), 'err')
    await scrollToBottom()
  }
}

function isCtrlC(event: KeyboardEvent) {
  return (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    (event.key === 'c' || event.key === 'C' || event.code === 'KeyC')
  )
}

function terminalHasFocus() {
  const root = rootRef.value
  const el = document.activeElement
  return !!(root && el && root.contains(el))
}

function onGlobalKeydown(event: KeyboardEvent) {
  if (!isCtrlC(event)) return
  const streaming = busy.value || Date.now() - lastOutAt < 2000
  if (!streaming && !terminalHasFocus()) return
  event.preventDefault()
  event.stopPropagation()
  if (streaming) interrupt()
  else input.value = ''
}

async function runCommand(command: string) {
  const cmd = command.replace(/\s+$/, '')
  if (!cmd) return
  if (cmd === 'clear') {
    lines.value = []
    outTail = ''
    return
  }
  if (cmd === 'exit') {
    emit('close')
    return
  }
  if (!props.serial) {
    pushLine('未选择设备', 'err')
    await scrollToBottom()
    return
  }

  history.value.push(cmd)
  historyIndex.value = history.value.length
  pushLine(`# ${cmd}`, 'cmd')
  busy.value = true
  await scrollToBottom()
  try {
    await sendOp('write', `${cmd}\n`, ++runSeq)
  } catch (reason) {
    busy.value = false
    pushLine(errorText(reason, '执行失败'), 'err')
    await scrollToBottom()
    focusInput()
  }
}

function onSubmit() {
  if (busy.value || completing.value || !ready.value) return
  const cmd = input.value
  input.value = ''
  runCommand(cmd)
}

function onKeydown(event: KeyboardEvent) {
  if (isCtrlC(event)) {
    event.preventDefault()
    event.stopPropagation()
    if (busy.value || Date.now() - lastOutAt < 2000) interrupt()
    else input.value = ''
    return
  }
  if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
    event.preventDefault()
    event.stopPropagation()
    if (!event.shiftKey && !busy.value) completeTab()
    return
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (!history.value.length) return
    historyIndex.value = Math.max(0, historyIndex.value - 1)
    input.value = history.value[historyIndex.value] || ''
  } else if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (historyIndex.value >= history.value.length - 1) {
      historyIndex.value = history.value.length
      input.value = ''
      return
    }
    historyIndex.value += 1
    input.value = history.value[historyIndex.value] || ''
  }
}

async function bootSession() {
  if (!props.serial) {
    pushLine('未选择设备', 'err')
    return
  }
  startStream()
  await new Promise((resolve) => setTimeout(resolve, 120))
  try {
    await sendOp('open')
    ready.value = true
  } catch (reason) {
    pushLine(errorText(reason, '打开终端失败'), 'err')
    await scrollToBottom()
  }
}

onMounted(() => {
  pushLine(`root@${props.serial || 'device'}:${cwd.value}`, 'meta')
  pushLine('以 root 在设备上执行。Tab 补齐，Ctrl+C 停止前台命令，clear 清屏，exit 关闭。', 'meta')
  window.addEventListener('keydown', onGlobalKeydown, true)
  bootSession()
  focusInput()
})

onBeforeUnmount(() => {
  alive = false
  window.removeEventListener('keydown', onGlobalKeydown, true)
  stopStream()
  if (props.serial) {
    runDeviceShellSession(props.serial, sessionId, 'close', '').catch(() => {})
  }
})

defineExpose({ focusInput })
</script>

<template>
  <div
    ref="rootRef"
    class="flex h-[380px] flex-col overflow-hidden rounded-md border border-surface bg-[#1e1e1e] font-mono text-[13px] text-color"
    tabindex="-1"
    @keydown.capture="onKeydown"
  >
    <div
      ref="bodyRef"
      class="min-h-0 flex-1 overflow-y-auto px-3 py-2 break-all whitespace-pre-wrap"
      @click="focusInput"
    >
      <div
        v-for="(line, index) in lines"
        :key="index"
        :class="{
          'text-primary': line.kind === 'cmd',
          'text-red-400': line.kind === 'err',
          'text-muted-color': line.kind === 'meta',
          'text-color': line.kind === 'out',
        }"
      >
        {{ line.text }}
      </div>
      <form class="flex items-center gap-2 pt-1" @submit.prevent="onSubmit">
        <span class="shrink-0 text-primary">#</span>
        <span class="shrink-0 text-muted-color">{{ cwd }}</span>
        <input
          ref="inputRef"
          v-model="input"
          class="min-w-0 flex-1 bg-transparent text-color outline-none"
          :disabled="!ready && !busy"
          spellcheck="false"
          autocomplete="off"
          @keydown.capture="onKeydown"
        />
        <button
          v-if="busy"
          type="button"
          class="shrink-0 text-muted-color hover:text-primary"
          @click="interrupt"
        >
          Ctrl+C 停止
        </button>
        <span v-else-if="completing" class="text-muted-color">...</span>
      </form>
    </div>
  </div>
</template>
