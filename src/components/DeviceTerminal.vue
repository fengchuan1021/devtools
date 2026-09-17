<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { openDeviceShellStream, runDeviceShell, runDeviceShellSession } from '../api/device'

const props = defineProps({
  serial: {
    type: String,
    default: '',
  },
  session: {
    type: String,
    default: '',
  },
})
const emit = defineEmits(['close'])

const SHELL_COMMANDS = [
  'ls', 'cd', 'pwd', 'cat', 'echo', 'grep', 'find', 'ps', 'kill', 'chmod', 'chown',
  'cp', 'mv', 'rm', 'mkdir', 'touch', 'ln', 'df', 'du', 'mount', 'umount', 'id',
  'which', 'whoami', 'uname', 'date', 'clear', 'exit', 'export', 'setprop', 'getprop',
  'am', 'pm', 'dumpsys', 'logcat', 'service', 'settings', 'toybox', 'busybox', 'sh',
  'reboot', 'sync', 'stat', 'head', 'tail', 'wc', 'sed', 'awk', 'tar', 'gzip',
  'chcon', 'restorecon', 'magisk', 'su',
]

const cwd = ref('/')
const input = ref('')
const busy = ref(false)
const completing = ref(false)
const ready = ref(false)
const lines = ref([])
const history = ref([])
const historyIndex = ref(-1)
const bodyRef = ref(null)
const inputRef = ref(null)
const rootRef = ref(null)
const sessionId =
  props.session || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const MAX_LINES = 4000
let completeSeq = 0
let streamAbort = null
let outTail = ''
let streamLoop = 0
let alive = true
let lastOutAt = 0
let runSeq = 0

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function unwrapCompletionToken(token) {
  let t = token
  if (t.startsWith("'")) {
    t = t.slice(1)
    if (t.endsWith("'")) t = t.slice(0, -1)
    return t.replace(/'\\''/g, "'")
  }
  if (t.startsWith('"')) {
    t = t.slice(1)
    if (t.endsWith('"')) t = t.slice(0, -1)
    return t.replace(/\\(.)/g, '$1')
  }
  return t.replace(/\\(.)/g, '$1')
}

function quoteCompletionToken(value) {
  if (!value) return value
  if (/[\s'"\\$`;&|<>(){}[\]!*?#~]/.test(value)) {
    return `'${value.replace(/'/g, `'\\''`)}'`
  }
  return value
}

function getTokenAtCursor(value, cursor) {
  let inSingle = false
  let inDouble = false
  let tokenStart = 0
  for (let i = 0; i < cursor; i++) {
    const c = value[i]
    if (inSingle) {
      if (c === "'") inSingle = false
      continue
    }
    if (inDouble) {
      if (c === '\\' && i + 1 < cursor) {
        i += 1
        continue
      }
      if (c === '"') inDouble = false
      continue
    }
    if (c === "'") {
      inSingle = true
      continue
    }
    if (c === '"') {
      inDouble = true
      continue
    }
    if (c === '\\' && i + 1 < cursor) {
      i += 1
      continue
    }
    if (/\s/.test(c)) tokenStart = i + 1
  }

  let tokenEnd = cursor
  let s = inSingle
  let d = inDouble
  for (let i = cursor; i < value.length; i++) {
    const c = value[i]
    if (s) {
      if (c === "'") s = false
      tokenEnd = i + 1
      continue
    }
    if (d) {
      if (c === '\\' && i + 1 < value.length) {
        i += 1
        tokenEnd = i + 1
        continue
      }
      if (c === '"') d = false
      tokenEnd = i + 1
      continue
    }
    if (/\s/.test(c)) break
    tokenEnd = i + 1
  }

  return {
    before: value.slice(0, tokenStart),
    token: value.slice(tokenStart, cursor),
    after: value.slice(tokenEnd),
  }
}

function splitPathToken(token) {
  const lastSlash = token.lastIndexOf('/')
  if (lastSlash < 0) return { dir: '', base: token }
  return { dir: token.slice(0, lastSlash + 1), base: token.slice(lastSlash + 1) }
}

function listPathFromDir(dir) {
  if (!dir) return '.'
  if (dir === '/') return '/'
  return dir.replace(/\/+$/, '') || '/'
}

function commonPrefix(items) {
  if (!items.length) return ''
  let prefix = items[0]
  for (const item of items) {
    let i = 0
    while (i < prefix.length && i < item.length && prefix[i] === item[i]) i += 1
    prefix = prefix.slice(0, i)
    if (!prefix) break
  }
  return prefix
}

function parseListNames(raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n').replace(/\x1b\[[0-9;]*m/g, '')
  const names = []
  for (const line of text.split('\n')) {
    const name = line.replace(/\r$/, '')
    if (!name || name === '.' || name === '..' || name === './' || name === '../') continue
    if (name.startsWith('ls:')) continue
    names.push(name)
  }
  return names
}

function addUnique(list, seen, name) {
  if (!name || seen.has(name)) return
  seen.add(name)
  list.push(name)
}

function pushLine(text, kind = 'out') {
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

function stripAnsi(text) {
  return String(text ?? '')
    .replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
}

function appendOutput(chunk) {
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

function applyCompletion(parsed, dir, name, unique) {
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

function showMatches(matches) {
  const max = 80
  let text = matches.slice(0, max).join('  ')
  if (matches.length > max) text += `  … 共 ${matches.length} 个`
  pushLine(text, 'meta')
  scrollToBottom()
}

function pickCompletion(parsed, dir, base, matches) {
  if (!matches.length) return
  matches.sort((a, b) => a.localeCompare(b))
  if (matches.length === 1) {
    applyCompletion(parsed, dir, matches[0], true)
    return
  }
  const prefix = commonPrefix(matches)
  if (prefix.length > base.length) {
    applyCompletion(parsed, dir, prefix, false)
    return
  }
  showMatches(matches)
}

function completionStillValid(seq, value) {
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
  const matches = []
  const seen = new Set()

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
  } catch (e) {
    if (!completionStillValid(seq, value)) return
    if (matches.length) {
      pickCompletion(parsed, dir, base, matches)
      return
    }
    pushLine(e.message || '补齐失败', 'err')
    await scrollToBottom()
  } finally {
    if (seq === completeSeq) completing.value = false
    focusInput()
  }
}

async function sendOp(op, data = '', seq = 0) {
  if (!props.serial) throw new Error('未选择设备')
  const result = await runDeviceShellSession(props.serial, sessionId, op, data, seq)
  if (result && result !== 'ok' && !String(result).startsWith('ok')) {
    if (String(result).includes('unknown')) {
      throw new Error('设备固件过旧，不支持交互式终端')
    }
    if (op !== 'close') throw new Error(result)
  }
  return result
}

function onShellEvent(ev) {
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
    sendOp('open').then(() => {
      if (alive) ready.value = true
    }).catch((e) => {
      if (alive) pushLine(e.message || '重连失败', 'err')
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
    } catch (e) {
      if (ac.signal.aborted || loop !== streamLoop) return
      pushLine(e.message || '终端输出中断', 'err')
      await scrollToBottom()
    }
    if (ac.signal.aborted || loop !== streamLoop) return
    await new Promise((r) => setTimeout(r, 1200))
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
  } catch (e) {
    pushLine(e.message || '中断失败', 'err')
    await scrollToBottom()
  }
}

function isCtrlC(e) {
  return (e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'c' || e.key === 'C' || e.code === 'KeyC')
}

function terminalHasFocus() {
  const root = rootRef.value
  const el = document.activeElement
  return !!(root && el && root.contains(el))
}

function onGlobalKeydown(e) {
  if (!isCtrlC(e)) return
  const streaming = busy.value || Date.now() - lastOutAt < 2000
  if (!streaming && !terminalHasFocus()) return
  e.preventDefault()
  e.stopPropagation()
  if (streaming) interrupt()
  else input.value = ''
}

async function runCommand(command) {
  const cmd = command.replace(/\s+$/, '')
  if (!cmd) return
  if (cmd === 'clear') {
    lines.value = []
    outTail = ''
    return
  }
  if (cmd === 'exit') {
    emitClose()
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
  } catch (e) {
    busy.value = false
    pushLine(e.message || '执行失败', 'err')
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

function onKeydown(e) {
  if (isCtrlC(e)) {
    e.preventDefault()
    e.stopPropagation()
    if (busy.value || Date.now() - lastOutAt < 2000) interrupt()
    else input.value = ''
    return
  }
  if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    e.preventDefault()
    e.stopPropagation()
    if (!e.shiftKey && !busy.value) completeTab()
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (!history.value.length) return
    historyIndex.value = Math.max(0, historyIndex.value - 1)
    input.value = history.value[historyIndex.value] || ''
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (historyIndex.value >= history.value.length - 1) {
      historyIndex.value = history.value.length
      input.value = ''
      return
    }
    historyIndex.value += 1
    input.value = history.value[historyIndex.value] || ''
  }
}

function emitClose() {
  emit('close')
}

async function bootSession() {
  if (!props.serial) {
    pushLine('未选择设备', 'err')
    return
  }
  startStream()
  await new Promise((r) => setTimeout(r, 120))
  try {
    await sendOp('open')
    ready.value = true
  } catch (e) {
    pushLine(e.message || '打开终端失败', 'err')
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
    class="flex h-[380px] flex-col overflow-hidden rounded bg-zinc-950 font-mono text-[13px] text-zinc-100"
    tabindex="-1"
    @keydown.capture="onKeydown"
  >
    <div
      ref="bodyRef"
      class="min-h-0 flex-1 overflow-y-auto px-3 py-2 whitespace-pre-wrap break-all"
      @click="focusInput"
    >
      <div
        v-for="(line, i) in lines"
        :key="i"
        :class="{
          'text-emerald-400': line.kind === 'cmd',
          'text-red-400': line.kind === 'err',
          'text-zinc-500': line.kind === 'meta',
          'text-zinc-100': line.kind === 'out',
        }"
      >{{ line.text }}</div>
      <form class="flex items-center gap-2 pt-1" @submit.prevent="onSubmit">
        <span class="shrink-0 text-amber-300">#</span>
        <span class="shrink-0 text-zinc-500">{{ cwd }}</span>
        <input
          ref="inputRef"
          v-model="input"
          class="min-w-0 flex-1 bg-transparent outline-none"
          :disabled="!ready && !busy"
          spellcheck="false"
          autocomplete="off"
          @keydown.capture="onKeydown"
        />
        <button
          v-if="busy"
          type="button"
          class="shrink-0 text-zinc-500 hover:text-amber-300"
          @click="interrupt"
        >Ctrl+C 停止</button>
        <span v-else-if="completing" class="text-zinc-500">...</span>
      </form>
    </div>
  </div>
</template>
