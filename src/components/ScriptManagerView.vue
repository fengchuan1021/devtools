<script setup>
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'
import {
  listScripts,
  getScriptCategories,
  updateScriptCategoryOnly,
  deleteScript
} from '../api/script'

const emit = defineEmits(['change'])

const scripts = ref([])
const categories = ref([])
const loading = ref(false)
const moveDialogVisible = ref(false)
const moveTargetScript = ref(null)
const moveTargetCategoryId = ref(null)
const moveLoading = ref(false)
const moveError = ref('')

const categoryMap = computed(() => {
  const m = {}
  for (const c of categories.value) m[c.id] = c.name || `分类 ${c.id}`
  return m
})

async function load() {
  loading.value = true
  try {
    const [scriptsRes, categoriesRes] = await Promise.all([
      listScripts(),
      getScriptCategories()
    ])
    scripts.value = scriptsRes?.data ?? []
    categories.value = categoriesRes?.data ?? []
  } catch (_) {
    scripts.value = []
    categories.value = []
  } finally {
    loading.value = false
  }
}

function openMoveDialog(script) {
  moveTargetScript.value = script
  moveTargetCategoryId.value = script.category_id
  moveError.value = ''
  moveDialogVisible.value = true
}

async function confirmMove() {
  const script = moveTargetScript.value
  const categoryId = moveTargetCategoryId.value
  if (!script || categoryId == null || categoryId === script.category_id) {
    moveDialogVisible.value = false
    return
  }
  moveLoading.value = true
  moveError.value = ''
  try {
    await updateScriptCategoryOnly(script.id, categoryId)
    moveDialogVisible.value = false
    await load()
    emit('change')
  } catch (e) {
    moveError.value = e?.response?.data?.error || e?.message || '移动失败'
  } finally {
    moveLoading.value = false
  }
}

async function doDelete(script) {
  if (!confirm(`确定要删除脚本「${script.name}」吗？此操作不可恢复。`)) return
  try {
    await deleteScript(script.id)
    await load()
    emit('change')
  } catch (e) {
    alert(e?.response?.data?.error || e?.message || '删除失败')
  }
}

onMounted(() => {
  load()
})
</script>

<template>
  <div class="script-manager flex flex-col gap-2">
    <div v-if="loading" class="text-sm text-slate-500 py-4 text-center">加载中...</div>
    <div v-else class="max-h-[360px] overflow-y-auto rounded border border-slate-200">
      <table class="w-full text-sm">
        <thead class="bg-slate-100 sticky top-0">
          <tr>
            <th class="text-left py-2 px-3 font-medium">脚本名称</th>
            <th class="text-left py-2 px-3 font-medium">所属分类</th>
            <th class="text-right py-2 px-3 font-medium w-32">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="s in scripts"
            :key="s.id"
            class="border-t border-slate-200 hover:bg-slate-50"
          >
            <td class="py-2 px-3">{{ s.name || `脚本 ${s.id}` }}</td>
            <td class="py-2 px-3 text-slate-600">{{ categoryMap[s.category_id] ?? '-' }}</td>
            <td class="py-2 px-3 text-right">
              <Button
                icon="pi pi-folder-open"
                text
                rounded
                size="small"
                severity="secondary"
                title="移动分类"
                @click="openMoveDialog(s)"
              />
              <Button
                icon="pi pi-trash"
                text
                rounded
                size="small"
                severity="danger"
                title="删除"
                @click="doDelete(s)"
              />
            </td>
          </tr>
          <tr v-if="!scripts.length">
            <td colspan="3" class="py-6 text-center text-slate-500">暂无脚本</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <Dialog
    v-model:visible="moveDialogVisible"
    header="移动分类"
    modal
    :style="{ width: '340px' }"
    @hide="moveError = ''"
  >
    <div class="flex flex-col gap-3">
      <p v-if="moveTargetScript" class="text-sm text-slate-600">
        将「{{ moveTargetScript.name }}」移至：
      </p>
      <Select
        v-model="moveTargetCategoryId"
        :options="categories"
        option-label="name"
        option-value="id"
        placeholder="选择分类"
        class="w-full"
      />
      <p v-if="moveError" class="text-sm text-red-600">{{ moveError }}</p>
    </div>
    <template #footer>
      <Button label="取消" text @click="moveDialogVisible = false" />
      <Button label="确定" :loading="moveLoading" @click="confirmMove" />
    </template>
  </Dialog>
</template>
