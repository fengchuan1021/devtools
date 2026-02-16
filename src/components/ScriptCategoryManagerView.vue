<script setup>
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import {
  getScriptCategories,
  createScriptCategory,
  updateScriptCategory,
  deleteScriptCategory
} from '../api/script'

const emit = defineEmits(['change'])

const list = ref([])
const loading = ref(false)
const dialogVisible = ref(false)
const dialogLoading = ref(false)
const dialogError = ref('')
/** 编辑时为目标分类 id，新建时为 null */
const editingId = ref(null)

const form = ref({
  name: '',
  description: '',
  is_new: false,
  is_hot: false,
  sort_order: 999
})

async function loadList() {
  loading.value = true
  try {
    const res = await getScriptCategories()
    list.value = res?.data ?? []
  } catch (_) {
    list.value = []
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editingId.value = null
  form.value = {
    name: '',
    description: '',
    is_new: false,
    is_hot: false,
    sort_order: list.value.length ? Math.max(...list.value.map(c => c.sort_order ?? 0), 0) + 1 : 0
  }
  dialogError.value = ''
  dialogVisible.value = true
}

function openEdit(cat) {
  editingId.value = cat.id
  form.value = {
    name: cat.name || '',
    description: cat.description || '',
    is_new: !!cat.is_new,
    is_hot: !!cat.is_hot,
    sort_order: cat.sort_order ?? 0
  }
  dialogError.value = ''
  dialogVisible.value = true
}

async function confirmSave() {
  const { name, description, is_new, is_hot, sort_order } = form.value
  if (!name?.trim()) {
    dialogError.value = '请输入分类名称'
    return
  }
  dialogLoading.value = true
  dialogError.value = ''
  try {
    const payload = {
      name: name.trim(),
      description: (description || '').trim(),
      is_new: !!is_new,
      is_hot: !!is_hot,
      sort_order: typeof sort_order === 'number' ? sort_order : 999
    }
    if (editingId.value != null) {
      await updateScriptCategory(editingId.value, payload)
    } else {
      await createScriptCategory(payload)
    }
    dialogVisible.value = false
    await loadList()
    emit('change')
  } catch (e) {
    dialogError.value = e?.response?.data?.error || e?.message || '保存失败'
  } finally {
    dialogLoading.value = false
  }
}

async function doDelete(cat) {
  if (!confirm(`确定要删除分类「${cat.name}」吗？其下脚本将变为未分类，请先移动或删除脚本。`)) return
  try {
    await deleteScriptCategory(cat.id)
    await loadList()
    emit('change')
  } catch (e) {
    alert(e?.response?.data?.error || e?.message || '删除失败')
  }
}

onMounted(() => {
  loadList()
})
</script>

<template>
  <div class="script-category-manager rounded border border-slate-200 bg-slate-50/80 p-2">
    <div class="flex items-center justify-between gap-2 mb-2">
      <span class="text-sm font-medium text-slate-600">脚本分类</span>
      <Button
        icon="pi pi-plus"
        label="添加分类"
        size="small"
        severity="secondary"
        @click="openAdd"
      />
    </div>
    <div v-if="loading" class="text-sm text-slate-500 py-1">加载中...</div>
    <ul v-else class="flex flex-wrap gap-1.5">
      <li
        v-for="cat in list"
        :key="cat.id"
        class="inline-flex items-center gap-1 rounded bg-white border border-slate-200 px-2 py-1 text-sm"
      >
        <span class="font-medium">{{ cat.name }}</span>
        <span v-if="cat.is_new" class="text-amber-600 text-xs">新品</span>
        <span v-if="cat.is_hot" class="text-red-500 text-xs">热门</span>
        <Button
          icon="pi pi-pencil"
          text
          rounded
          size="small"
          severity="secondary"
          class="!p-0.5"
          @click="openEdit(cat)"
        />
        <Button
          icon="pi pi-trash"
          text
          rounded
          size="small"
          severity="danger"
          class="!p-0.5"
          @click="doDelete(cat)"
        />
      </li>
      <li v-if="!list.length" class="text-sm text-slate-500 py-1">暂无分类，点击「添加分类」添加</li>
    </ul>
  </div>

  <Dialog
    v-model:visible="dialogVisible"
    :header="editingId != null ? '编辑分类' : '新建分类'"
    modal
    :style="{ width: '380px' }"
    @hide="dialogError = ''"
  >
    <div class="flex flex-col gap-3">
      <div>
        <label class="block text-sm font-medium mb-1">名称</label>
        <InputText v-model="form.name" placeholder="分类名称" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">描述</label>
        <InputText v-model="form.description" placeholder="可选" class="w-full" />
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">排序（数字越小越靠前）</label>
        <InputNumber v-model="form.sort_order" :min="0" class="w-full" />
      </div>
      <div class="flex items-center gap-4">
        <div class="flex items-center gap-2">
          <Checkbox v-model="form.is_new" input-id="cat-is-new" :binary="true" />
          <label for="cat-is-new" class="text-sm">新品</label>
        </div>
        <div class="flex items-center gap-2">
          <Checkbox v-model="form.is_hot" input-id="cat-is-hot" :binary="true" />
          <label for="cat-is-hot" class="text-sm">热门</label>
        </div>
      </div>
      <p v-if="dialogError" class="text-sm text-red-600">{{ dialogError }}</p>
    </div>
    <template #footer>
      <Button label="取消" text @click="dialogVisible = false" />
      <Button label="保存" :loading="dialogLoading" @click="confirmSave" />
    </template>
  </Dialog>
</template>
