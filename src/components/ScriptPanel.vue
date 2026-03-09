<script setup>
import { ref, onMounted } from 'vue'
import Card from 'primevue/card'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Checkbox from 'primevue/checkbox'
import Tree from 'primevue/tree'
import { CodeEditor } from 'monaco-editor-vue3'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '../stores/device'
import { getScriptCategories, createScriptCategory, createScript, updateScript, getScriptsTree, getScript } from '../api/script'
import { getApplications } from '../api/application'
import { runDevScript } from '../api/device'
import ScriptCategoryManagerView from './ScriptCategoryManagerView.vue'
import ScriptManagerView from './ScriptManagerView.vue'

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

const deviceStore = useDeviceStore()
const { selectedDevice } = storeToRefs(deviceStore)

const runScriptLoading = ref(false)
const runScriptMessage = ref('')

const runScript = async () => {
  const serial = selectedDevice.value?.serial
  if (!serial) {
    runScriptMessage.value = '请先选择设备'
    return
  }
  runScriptMessage.value = ''
  //runScriptLoading.value = true
  try {
    const res = await runDevScript(serial, code.value)
    const data = res?.data ?? ''
    runScriptMessage.value = data ? `执行结果: ${data}` : '已下发执行'
  } catch (e) {
    runScriptMessage.value = e?.response?.data?.error || e?.message || '执行失败'
  } finally {
    runScriptLoading.value = false
  }
}

const saveDialogVisible = ref(false)
const scriptCategories = ref([])
const applications = ref([])
const saveForm = ref({
  name: '',
  description: '',
  categoryId: null,
  newCategory: false,
  newCategoryName: '',
  selectedAppPackageName: null
})
const saveLoading = ref(false)
const saveError = ref('')

const loadDialogVisible = ref(false)
const categoryManagerVisible = ref(false)
const scriptManagerVisible = ref(false)
const loadTreeNodes = ref([])
const loadTreeLoading = ref(false)
const loadScriptLoading = ref(false)

/** 从后端加载的脚本元数据，用于保存弹窗预填与区分更新/新建 */
const loadedScript = ref(null)

const apiBase = (import.meta.env.VITE_API_BASE || '').replace(/\/api\/?$/, '') || ''

async function loadCategories() {
  try {
    const res = await getScriptCategories()
    scriptCategories.value = res?.data ?? []
  } catch (_) {
    scriptCategories.value = []
  }
}

async function loadApplications() {
  try {
    const res = await getApplications()
    applications.value = res?.data ?? []
  } catch (_) {
    applications.value = []
  }
}

function buildIconUrl(iconPath) {
  if (!iconPath?.trim()) return ''
  const path = iconPath.replace(/^\//, '')
  return path ? `${apiBase}/${path}` : ''
}

function buildTreeNodes(treeData) {
  if (!Array.isArray(treeData)) return []
  return treeData.map(cat => ({
    key: `cat-${cat.id}`,
    label: cat.name || `分类 ${cat.id}`,
    children: (cat.scripts || []).map(s => ({
      key: `script-${s.id}`,
      label: s.name || `脚本 ${s.id}`,
      data: { scriptId: s.id }
    }))
  }))
}

async function openLoadDialog() {
  loadDialogVisible.value = true
  loadTreeLoading.value = true
  loadTreeNodes.value = []
  try {
    const res = await getScriptsTree()
    const data = res?.data ?? []
    loadTreeNodes.value = buildTreeNodes(data)
  } catch (_) {
    loadTreeNodes.value = []
  } finally {
    loadTreeLoading.value = false
  }
}

async function onLoadTreeSelect(event) {
  const node = event?.node ?? event
  const scriptId = node?.data?.scriptId
  if (!scriptId) return
  loadScriptLoading.value = true
  try {
    const res = await getScript(scriptId)
    const script = res?.data
    if (script && typeof script.content === 'string') {
      code.value = script.content
      loadedScript.value = {
        id: script.id,
        name: script.name || '',
        description: script.description || '',
        category_id: script.category_id,
        package_name: script.package_name || '',
        icon_url: script.icon_url || ''
      }
      loadDialogVisible.value = false
    }
  } catch (_) {}
  finally {
    loadScriptLoading.value = false
  }
}

function openSaveDialog() {
  const fromLoaded = loadedScript.value
  saveForm.value = {
    name: fromLoaded?.name ?? '',
    description: fromLoaded?.description ?? '',
    categoryId: fromLoaded != null && fromLoaded.category_id != null ? fromLoaded.category_id : null,
    newCategory: false,
    newCategoryName: '',
    selectedAppPackageName: fromLoaded?.package_name || null
  }
  saveError.value = ''
  saveDialogVisible.value = true
}

async function confirmSave() {
  const { name, description, categoryId, newCategory, newCategoryName } = saveForm.value
  
  let categoryIdToUse = categoryId
  if (categoryIdToUse == null || categoryIdToUse === '') {
    saveError.value = '请选择所属分类或新建分类并填写名称'
    return
  }
  const selectedApp = applications.value.find(a => a.package_name === saveForm.value.selectedAppPackageName)
  const packageName = selectedApp ? selectedApp.package_name : ''
  const scriptName= selectedApp ? selectedApp.name : name.trim()
  if(!name){
    name=scriptName;
  }
  if (!name?.trim()) {
    saveError.value = '请输入脚本名称'
    return
  }

  const iconUrl = selectedApp ? buildIconUrl(selectedApp.icon_path) : ''

  const payload = {
    name: name.trim(),
    description: (description || '').trim(),
    category_id: categoryIdToUse,
    content: code.value,
    package_name: packageName,
    icon_url: iconUrl
  }

  saveLoading.value = true
  saveError.value = ''
  try {
    if (loadedScript.value?.id) {
      await updateScript(loadedScript.value.id, payload)
      loadedScript.value = { ...loadedScript.value, ...payload }
    } else {
      await createScript(payload)
    }
    saveDialogVisible.value = false
  } catch (e) {
    saveError.value = e?.response?.data?.error || e?.message || '保存失败'
  } finally {
    saveLoading.value = false
  }
}

onMounted(() => {
  loadCategories()
  loadApplications()
})
</script>

<template>
  <Card>
  
    <template #content>
      <div class="flex flex-col gap-2">
        <div class="flex justify-end gap-2">
          <Button
            icon="pi pi-list"
            label="分类管理"
            size="small"
            severity="secondary"
            @click="categoryManagerVisible = true"
          />
          <Button
            icon="pi pi-code"
            label="脚本管理"
            size="small"
            severity="secondary"
            @click="scriptManagerVisible = true"
          />
          <Button
            icon="pi pi-folder-open"
            label="加载"
            size="small"
            @click="openLoadDialog"
          />
          <Button
            icon="pi pi-save"
            label="保存"
            size="small"
            @click="openSaveDialog"
          />
        </div>
        <div class="relative h-[280px] rounded-lg border border-slate-200 overflow-hidden">
          <Button
            icon="pi pi-play"
            label="执行"
            class="!absolute top-2 right-2 z-10 shadow-md"
            size="small"
            :loading="runScriptLoading"
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
      </div>
    </template>
  </Card>

  <Dialog
    v-model:visible="saveDialogVisible"
    header="保存脚本"
    modal
    :style="{ width: '400px' }"
    @hide="saveError = ''"
  >
    <div class="flex flex-col gap-3">
      <div>
        <label class="block text-sm font-medium mb-1">脚本名称</label>
        <InputText v-model="saveForm.name" placeholder="请输入脚本名称" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">描述</label>
        <InputText v-model="saveForm.description" placeholder="可选" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">所属分类</label>
        <Select
          v-model="saveForm.categoryId"
          :options="scriptCategories"
          option-label="name"
          option-value="id"
          placeholder="选择分类"
          class="w-full"
          :disabled="saveForm.newCategory"
        />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">所属 App</label>
        <Select
          v-model="saveForm.selectedAppPackageName"
          :options="applications"
          option-label="name"
          option-value="package_name"
          placeholder="可选，选择后将使用该 App 的 package_name 与图标"
          class="w-full"
          show-clear
        />
      </div>
      <div class="flex items-center gap-2">
        <Checkbox v-model="saveForm.newCategory" input-id="new-cat" :binary="true" />
        <label for="new-cat" class="text-sm">新建分类</label>
      </div>
      <div v-if="saveForm.newCategory">
        <label class="block text-sm font-medium mb-1">新分类名称</label>
        <InputText v-model="saveForm.newCategoryName" placeholder="输入新分类名称" class="w-full" />
      </div>
      <p v-if="saveError" class="text-sm text-red-600">{{ saveError }}</p>
    </div>
    <template #footer>
      <Button label="取消" text @click="saveDialogVisible = false" />
      <Button label="确认" :loading="saveLoading" @click="confirmSave" />
    </template>
  </Dialog>

  <Dialog
    v-model:visible="categoryManagerVisible"
    header="分类管理"
    modal
    :style="{ width: '480px' }"
    :dismissable-mask="true"
  >
    <ScriptCategoryManagerView @change="loadCategories" />
  </Dialog>

  <Dialog
    v-model:visible="scriptManagerVisible"
    header="脚本管理"
    modal
    :style="{ width: '520px' }"
    :dismissable-mask="true"
  >
    <ScriptManagerView @change="loadCategories" />
  </Dialog>

  <Dialog
    v-model:visible="loadDialogVisible"
    header="加载脚本"
    modal
    :style="{ width: '360px' }"
  >
    <div v-if="loadTreeLoading" class="py-4 text-center opacity-70">加载中...</div>
    <Tree
      v-else
      :value="loadTreeNodes"
      selection-mode="single"
      class="w-full border-0"
      @node-select="onLoadTreeSelect"
    />
    <p v-if="loadScriptLoading" class="text-sm opacity-70 mt-2">正在加载脚本内容...</p>
  </Dialog>
</template>
