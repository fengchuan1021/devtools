<script setup lang="ts">
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { nextTick, reactive, ref } from 'vue'
import DeviceTerminal from './DeviceTerminal.vue'

interface TerminalSession {
  id: string
  serial: string
  visible: boolean
}

const terminals = ref<TerminalSession[]>([])

type TermApi = {
  focus: () => void
  interrupt: () => void
  reconnect: () => void
  fit: () => void
}

const apis = new Map<string, TermApi>()
const statusText = reactive<Record<string, string>>({})

const labels: Record<string, string> = {
  connecting: '连接中',
  ready: '已连接',
  closed: '已退出',
  error: '未连接',
}

const contentStyle = {
  padding: '0',
  overflow: 'hidden',
  flex: '1 1 auto',
  display: 'flex',
  flexDirection: 'column',
  minHeight: '0',
  background: '#1e1e1e',
}

function dialogStyle(index: number) {
  const n = index % 6
  return {
    width: '920px',
    height: 'min(680px, 86vh)',
    marginLeft: `${n * 28}px`,
    marginTop: `${n * 28}px`,
  }
}

function openTerminal(serial = '') {
  terminals.value.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    serial: serial.trim(),
    visible: true,
  })
}

function onHide(id: string) {
  apis.delete(id)
  delete statusText[id]
  terminals.value = terminals.value.filter((item) => item.id !== id)
}

defineExpose({ openTerminal })

function setTerm(id: string, el: unknown) {
  if (el && typeof el === 'object' && 'focus' in el) apis.set(id, el as TermApi)
  else apis.delete(id)
}

function onStatus(id: string, state: string, detail = '') {
  statusText[id] = detail || labels[state] || '连接中'
}

function callTerm(id: string, method: 'interrupt' | 'reconnect' | 'focus' | 'fit') {
  apis.get(id)?.[method]()
}

function refit(id: string) {
  nextTick(() => callTerm(id, 'fit'))
}
</script>

<template>
  <Dialog
    v-for="(term, index) in terminals"
    :key="term.id"
    v-model:visible="term.visible"
    append-to="self"
    :modal="false"
    :dismissable-mask="false"
    :closable="true"
    :draggable="true"
    :maximizable="true"
    :close-on-escape="false"
    :style="dialogStyle(index)"
    :content-style="contentStyle"
    :pt="{ root: { class: 'device-terminal-dialog' } }"
    @hide="onHide(term.id)"
    @show="callTerm(term.id, 'focus')"
    @maximize="refit(term.id)"
    @unmaximize="refit(term.id)"
  >
    <template #header>
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <i class="pi pi-desktop text-muted-color" />
        <span class="min-w-0 truncate" title="方向键、Tab、Ctrl+C 直接交给设备 shell。Ctrl+F 搜索，选中文本后 Ctrl+C 复制。">
          终端 {{ term.serial || '未选择设备' }}
        </span>
        <span class="shrink-0 text-xs text-muted-color">{{ statusText[term.id] || '连接中' }}</span>
        <span class="flex-1" />
        <Button
          label="中断"
          text
          size="small"
          severity="secondary"
          @mousedown.stop
          @click="callTerm(term.id, 'interrupt')"
        />
        <Button
          label="重连"
          text
          size="small"
          severity="secondary"
          @mousedown.stop
          @click="callTerm(term.id, 'reconnect')"
        />
      </div>
    </template>
    <DeviceTerminal
      :ref="(el) => setTerm(term.id, el)"
      class="min-h-0 flex-1"
      :serial="term.serial"
      :session="term.id"
      @status="(state, detail) => onStatus(term.id, state, detail)"
    />
  </Dialog>
</template>

<style>
.device-terminal-dialog.p-dialog {
  display: flex;
  flex-direction: column;
  max-height: 100vh;
}
.device-terminal-dialog .p-dialog-content {
  flex: 1 1 auto;
  min-height: 0;
}
.device-terminal-dialog.p-dialog-maximized {
  width: 100vw !important;
  height: 100vh !important;
  max-height: 100vh !important;
  margin: 0 !important;
}
</style>
