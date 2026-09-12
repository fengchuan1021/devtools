<script setup>
import { nextTick, onMounted, ref } from 'vue'
import { runDeviceShell } from '../api/device'

const props = defineProps({
  serial: {
    type: String,
    default: '',
  },
})
const emit = defineEmits(['close'])

const cwd = ref('/')
const input = ref('')
const busy = ref(false)
const lines = ref([])
const history = ref([])
const historyIndex = ref(-1)
const bodyRef = ref(null)
const inputRef = ref(null)

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`
}

function pushLine(text, kind = 'out') {
  const chunks = String(text ?? '').replace(/\r\n/g, '\n').split('\n')
  if (chunks.length && chunks[chunks.length - 1] === '') chunks.pop()
  if (!chunks.length) {
    lines.value.push({ kind, text: '' })
    return
  }
  for (const chunk of chunks) {
    lines.value.push({ kind, text: chunk })
  }
}

async function scrollToBottom() {
  await nextTick()
  const el = bodyRef.value
  if (el) el.scrollTop = el.scrollHeight
}

function focusInput() {
  inputRef.value?.focus()
}

function parseOutput(raw) {
  const text = String(raw ?? '').replace(/\r\n/g, '\n')
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (line === '__ANT_CWD__' && i + 1 < lines.length) {
      const nextCwd = lines[i + 1].trim().replace(/^["']|["']$/g, '')
      const output = lines.slice(0, i).join('\n')
      return { output, nextCwd: nextCwd || cwd.value }
    }
    const tagged = line.match(/^__CWD__:(.*)$/)
    if (tagged) {
      const nextCwd = tagged[1].trim().replace(/^["']|["']$/g, '')
      const output = lines.slice(0, i).join('\n')
      return { output, nextCwd: nextCwd || cwd.value }
    }
  }
  return { output: text, nextCwd: cwd.value }
}

async function runCommand(command) {
  const cmd = command.replace(/\s+$/, '')
  if (!cmd) return
  if (cmd === 'clear') {
    lines.value = []
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
    const script = `cd ${shellQuote(cwd.value)} || true
${cmd}
echo __ANT_CWD__
pwd`
    const raw = await runDeviceShell(props.serial, script)
    const { output, nextCwd } = parseOutput(raw)
    if (output) pushLine(output, 'out')
    cwd.value = nextCwd || cwd.value
  } catch (e) {
    pushLine(e.message || '执行失败', 'err')
  } finally {
    busy.value = false
    await scrollToBottom()
    focusInput()
  }
}

function onSubmit() {
  if (busy.value) return
  const cmd = input.value
  input.value = ''
  runCommand(cmd)
}

function onKeydown(e) {
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

onMounted(() => {
  pushLine(`root@${props.serial || 'device'}:${cwd.value}`, 'meta')
  pushLine('以 root 在设备上执行。输入 clear 清屏，exit 关闭。', 'meta')
  focusInput()
})

defineExpose({ focusInput })
</script>

<template>
  <div class="flex h-[380px] flex-col overflow-hidden rounded bg-zinc-950 font-mono text-[13px] text-zinc-100">
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
          :disabled="busy"
          spellcheck="false"
          autocomplete="off"
          @keydown="onKeydown"
        />
        <span v-if="busy" class="text-zinc-500">...</span>
      </form>
    </div>
  </div>
</template>
