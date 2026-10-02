<script setup lang="ts">
import { CodeEditor } from 'monaco-editor-vue3'
import { storeToRefs } from 'pinia'
import * as monaco from 'monaco-editor'
import Button from 'primevue/button'
import Card from 'primevue/card'
import { ref } from 'vue'
import { runDevScript } from '../api/device'
import { useDeviceStore } from '../stores/device'
import { registerQuickJSCompletions } from '../utils/quickjsCompletions'

let quickJSCompletionsRegistered = false
function ensureQuickJSCompletions() {
  if (!quickJSCompletionsRegistered) {
    registerQuickJSCompletions(monaco)
    quickJSCompletionsRegistered = true
  }
}

const code = ref('loadScript("/common.js");')
const editorOptions = {
  fontSize: 14,
  minimap: { enabled: false },
  automaticLayout: true,
}

const deviceStore = useDeviceStore()
const { selectedDevice } = storeToRefs(deviceStore)

const runScriptLoading = ref(false)
const runScriptMessage = ref('')

function apiError(reason: unknown, fallback: string) {
  if (typeof reason === 'object' && reason !== null) {
    const data = (reason as { response?: { data?: { error?: string } } }).response?.data
    if (data?.error) return data.error
    if ('message' in reason && typeof reason.message === 'string' && reason.message) return reason.message
  }
  return fallback
}

async function runScript() {
  const serial = typeof selectedDevice.value === 'string' ? selectedDevice.value : selectedDevice.value?.serial
  if (!serial) {
    runScriptMessage.value = '请先选择设备'
    return
  }
  runScriptMessage.value = ''
  runScriptLoading.value = true
  try {
    const res = await runDevScript(serial, code.value)
    const data = res?.data ?? ''
    runScriptMessage.value = data ? `执行结果: ${data}` : '已下发执行'
  } catch (reason) {
    runScriptMessage.value = apiError(reason, '执行失败')
  } finally {
    runScriptLoading.value = false
  }
}
</script>

<template>
  <Card>
    <template #content>
      <div class="flex flex-col gap-2">
        <div class="flex justify-end">
          <Button icon="pi pi-play" label="执行" size="small" :loading="runScriptLoading" @click="runScript" />
        </div>
        <div class="h-56 overflow-hidden rounded-md border border-surface">
          <CodeEditor
            v-model:value="code"
            language="javascript"
            theme="vs-dark"
            :options="editorOptions"
            height="100%"
            @editor-did-mount="ensureQuickJSCompletions"
          />
        </div>
        <p v-if="runScriptMessage" class="text-sm text-muted-color">{{ runScriptMessage }}</p>
      </div>
    </template>
  </Card>
</template>
