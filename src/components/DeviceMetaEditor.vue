<script setup lang="ts">
import { ref, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import request from '../utils/request'

interface DeviceRecord {
  id: number
  serial?: string
  profile_serial?: string
  group_id?: number
  note?: string
}

interface DeviceGroupNode {
  id: number
  group_name: string
  devices?: DeviceRecord[]
}

const visible = defineModel<boolean>('visible', { default: false })
const props = defineProps<{ serial: string }>()
const emit = defineEmits<{ saved: [] }>()

const loading = ref(false)
const saving = ref(false)
const error = ref('')
const deviceId = ref<number | null>(null)
const profileSerial = ref('')
const groupId = ref(0)
const note = ref('')
const groups = ref<DeviceGroupNode[]>([])
let loadGeneration = 0

watch(visible, (open) => {
  if (open) void loadDevice()
})

function failMessage(err: unknown, fallback: string) {
  if (err && typeof err === 'object' && 'response' in err) {
    const data = (err as { response?: { data?: { msg?: string; error?: string } } }).response?.data
    if (data?.msg) return data.msg
    if (data?.error) return data.error
  }
  if (err instanceof Error && err.message) return err.message
  return fallback
}

async function loadDevice() {
  const generation = ++loadGeneration
  const serial = props.serial.trim()
  loading.value = true
  saving.value = false
  error.value = ''
  deviceId.value = null
  profileSerial.value = ''
  groupId.value = 0
  note.value = ''
  groups.value = []
  if (!serial) {
    loading.value = false
    error.value = '缺少设备序列号'
    return
  }
  try {
    const body = await request.post<{ code?: number; msg?: string; data?: DeviceGroupNode[] }>(
      '/api/devices/getDevicesTree',
      { allusers: false },
    )
    if (generation !== loadGeneration || !visible.value) return
    if (body.code !== 200 || !Array.isArray(body.data)) {
      error.value = body.msg || '获取设备信息失败'
      return
    }
    groups.value = body.data
    let found: DeviceRecord | undefined
    let foundGroupId = 0
    for (const group of body.data) {
      const device = (group.devices ?? []).find((item) => (item.serial || '').trim() === serial)
      if (!device) continue
      found = device
      foundGroupId = device.group_id ?? group.id
      break
    }
    if (!found) {
      error.value = '未找到该设备'
      return
    }
    deviceId.value = found.id
    profileSerial.value = found.profile_serial || ''
    groupId.value = foundGroupId
    note.value = found.note || ''
  } catch (err) {
    if (generation !== loadGeneration || !visible.value) return
    error.value = failMessage(err, '获取设备信息失败')
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

async function saveDevice() {
  if (deviceId.value == null || saving.value) return
  saving.value = true
  error.value = ''
  try {
    const body = await request.patch<{ code?: number; msg?: string }>(`/api/devices/meta/${deviceId.value}`, {
      profile_serial: profileSerial.value.trim(),
      group_id: groupId.value,
      note: note.value.trim(),
    })
    if (body.code !== 200) {
      error.value = body.msg || '保存失败'
      return
    }
    visible.value = false
    emit('saved')
  } catch (err) {
    error.value = failMessage(err, '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog
    v-model:visible="visible"
    :header="serial.trim() ? `编辑设备 · ${serial.trim()}` : '编辑设备'"
    modal
    :style="{ width: '420px' }"
  >
    <div v-if="loading" class="flex items-center justify-center gap-2 py-8 text-sm text-muted-color">
      <i class="pi pi-spin pi-spinner" />
      加载中...
    </div>
    <div v-else class="flex flex-col gap-4">
      <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
      <label class="flex flex-col gap-2 text-sm" for="device-profile-serial">
        设备编号
        <InputText
          id="device-profile-serial"
          v-model="profileSerial"
          maxlength="64"
          fluid
          :disabled="deviceId == null"
        />
      </label>
      <label class="flex flex-col gap-2 text-sm" for="device-group">
        设备分组
        <Select
          v-model="groupId"
          input-id="device-group"
          :options="groups"
          option-label="group_name"
          option-value="id"
          placeholder="选择设备分组"
          fluid
          :disabled="deviceId == null"
        />
      </label>
      <label class="flex flex-col gap-2 text-sm" for="device-note">
        备注
        <Textarea
          id="device-note"
          v-model="note"
          rows="3"
          auto-resize
          fluid
          :disabled="deviceId == null"
        />
      </label>
    </div>
    <template #footer>
      <Button label="取消" severity="secondary" text :disabled="saving" @click="visible = false" />
      <Button label="保存" :disabled="deviceId == null" :loading="saving" @click="saveDevice" />
    </template>
  </Dialog>
</template>
