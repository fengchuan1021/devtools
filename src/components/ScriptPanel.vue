<script setup>
import { ref } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import { CodeEditor } from 'monaco-editor-vue3'

const code = ref(`// 在此编写 JavaScript 脚本
function hello() {
  console.log('Hello, 脚本引擎!');
}

hello();
`)

const editorOptions = {
  fontSize: 14,
  minimap: { enabled: false },
  automaticLayout: true,
}

const runScript = () => {
  // TODO: 执行脚本逻辑
  console.log('执行脚本:', code.value)
}
</script>

<template>
  <Card class="h-full">
    <template #title>脚本</template>
    <template #content>
      <div class="relative h-[280px] rounded-lg border border-slate-200 overflow-hidden">
        <Button
          icon="pi pi-play"
          label="执行"
          class="!absolute top-2 right-2 z-10 shadow-md"
          size="small"
          @click="runScript"
        />
        <CodeEditor
          v-model:value="code"
          language="javascript"
          theme="vs-dark"
          :options="editorOptions"
          height="100%"
        />
      </div>
    </template>
  </Card>
</template>
