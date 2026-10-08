<script setup>
import { nextTick, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import {
  listRedroidServers,
  getRedroidServer,
  createRedroidServer,
  updateRedroidServer,
  deleteRedroidServer,
  listRedroidContainers,
  startRedroidContainer,
  stopRedroidContainer,
  getRedroidContainerLocation,
  updateRedroidContainerLocation
} from '../api/redroidServer'

const PI = Math.PI
const GCJ_A = 6378245.0
const GCJ_EE = 0.00669342162296594323

function outOfChina(lng, lat) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271
}

function transformLat(lng, lat) {
  let ret = -100.0 + 2.0 * lng + 3.0 * lat + 0.2 * lat * lat + 0.1 * lng * lat + 0.2 * Math.sqrt(Math.abs(lng))
  ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) / 3.0
  ret += ((160.0 * Math.sin((lat / 12.0) * PI) + 320 * Math.sin((lat * PI) / 30.0)) * 2.0) / 3.0
  return ret
}

function transformLng(lng, lat) {
  let ret = 300.0 + lng + 2.0 * lat + 0.1 * lng * lng + 0.1 * lng * lat + 0.1 * Math.sqrt(Math.abs(lng))
  ret += ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) / 3.0
  ret += ((20.0 * Math.sin(lng * PI) + 40.0 * Math.sin((lng / 3.0) * PI)) * 2.0) / 3.0
  ret += ((150.0 * Math.sin((lng / 12.0) * PI) + 300.0 * Math.sin((lng / 30.0) * PI)) * 2.0) / 3.0
  return ret
}

function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat]
  let dlat = transformLat(lng - 105.0, lat - 35.0)
  let dlng = transformLng(lng - 105.0, lat - 35.0)
  const radlat = (lat / 180.0) * PI
  let magic = Math.sin(radlat)
  magic = 1 - GCJ_EE * magic * magic
  const sqrtmagic = Math.sqrt(magic)
  dlat = (dlat * 180.0) / (((GCJ_A * (1 - GCJ_EE)) / (magic * sqrtmagic)) * PI)
  dlng = (dlng * 180.0) / ((GCJ_A / sqrtmagic) * Math.cos(radlat) * PI)
  return [lng + dlng, lat + dlat]
}

function gcj02ToWgs84(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat]
  const [mgLng, mgLat] = wgs84ToGcj02(lng, lat)
  return [lng * 2 - mgLng, lat * 2 - mgLat]
}

const defaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

const list = ref([])
const loading = ref(false)
const listError = ref('')
const containersById = ref({})
const containerBusy = ref({})
const dialogVisible = ref(false)
const dialogLoading = ref(false)
const dialogError = ref('')
const editingId = ref(null)
const locationVisible = ref(false)
const locationLoading = ref(false)
const locationSaving = ref(false)
const locationError = ref('')
const locationName = ref('')
const locationPoint = ref(null)
const mapEl = ref(null)
let locationMap = null
let locationMarker = null

const form = ref(emptyForm())
const expireDate = ref(null)
const pendingDelete = ref(null)
const deleting = ref(false)

function setExpireDate(value) {
  if (!value) {
    expireDate.value = null
    return
  }
  const date = new Date(value)
  expireDate.value = Number.isNaN(date.getTime()) ? null : date
}

function emptyForm() {
  return {
    machined_id: '',
    ip: '',
    expire_at: '',
    note: ''
  }
}

function containerState(id) {
  return containersById.value[id] || { loading: false, error: '', list: [] }
}

function busyKey(serverId, name) {
  return `${serverId}:${name}`
}

function containerAction(serverId, name) {
  return containerBusy.value[busyKey(serverId, name)] || ''
}

async function reloadContainers(row) {
  try {
    const res = await listRedroidContainers(row.id)
    containersById.value = {
      ...containersById.value,
      [row.id]: {
        loading: false,
        error: res?.error || '',
        list: res?.data ?? []
      }
    }
  } catch (error) {
    containersById.value = {
      ...containersById.value,
      [row.id]: {
        loading: false,
        error: error?.message || '加载失败',
        list: containerState(row.id).list
      }
    }
  }
}

async function runContainerAction(row, item, action) {
  const name = item?.name
  if (!name || containerAction(row.id, name)) return
  const key = busyKey(row.id, name)
  containerBusy.value = { ...containerBusy.value, [key]: action }
  try {
    if (action === 'start') {
      await startRedroidContainer(row.id, name)
    } else {
      await stopRedroidContainer(row.id, name)
    }
    await reloadContainers(row)
  } catch (error) {
    listError.value = error?.response?.data?.error || error?.message || '操作失败'
  } finally {
    const next = { ...containerBusy.value }
    delete next[key]
    containerBusy.value = next
  }
}

function loadContainers(rows) {
  const next = {}
  for (const row of rows) {
    if (!row.ip) {
      next[row.id] = { loading: false, error: '', list: [] }
      continue
    }
    next[row.id] = { loading: true, error: '', list: [] }
    listRedroidContainers(row.id)
      .then((res) => {
        containersById.value = {
          ...containersById.value,
          [row.id]: {
            loading: false,
            error: res?.error || '',
            list: res?.data ?? []
          }
        }
      })
      .catch((error) => {
        containersById.value = {
          ...containersById.value,
          [row.id]: {
            loading: false,
            error: error?.message || '加载失败',
            list: []
          }
        }
      })
  }
  containersById.value = next
}

function pad(value) {
  return String(value).padStart(2, '0')
}

function toDatetimeLocal(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatExpire(value) {
  if (!value) return '未设置'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function isExpired(value) {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now()
}

async function loadList() {
  loading.value = true
  listError.value = ''
  try {
    const res = await listRedroidServers()
    list.value = res?.data ?? []
    loadContainers(list.value)
  } catch (error) {
    list.value = []
    listError.value = error?.message || '加载失败'
  } finally {
    loading.value = false
  }
}

function openAdd() {
  editingId.value = null
  form.value = emptyForm()
  expireDate.value = null
  dialogError.value = ''
  dialogVisible.value = true
}

async function openEdit(row) {
  editingId.value = row.id
  form.value = {
    machined_id: row.machined_id || '',
    ip: row.ip || '',
    expire_at: toDatetimeLocal(row.expire_at),
    note: row.note || ''
  }
  setExpireDate(row.expire_at)
  dialogError.value = ''
  dialogVisible.value = true
  try {
    const res = await getRedroidServer(row.id)
    const data = res?.data
    if (!data || editingId.value !== row.id) return
    form.value = {
      machined_id: data.machined_id || '',
      ip: data.ip || '',
      expire_at: toDatetimeLocal(data.expire_at),
      note: data.note || ''
    }
    setExpireDate(data.expire_at)
  } catch (error) {
    dialogError.value = error?.message || '读取服务器失败'
  }
}

async function confirmSave() {
  const machinedId = form.value.machined_id?.trim()
  if (!machinedId) {
    dialogError.value = '请填写机器ID'
    return
  }
  dialogLoading.value = true
  dialogError.value = ''
  const payload = {
    machined_id: machinedId,
    ip: (form.value.ip || '').trim(),
    expire_at: expireDate.value ? toDatetimeLocal(expireDate.value) : '',
    note: (form.value.note || '').trim()
  }
  try {
    if (editingId.value != null) {
      await updateRedroidServer({ id: editingId.value, ...payload })
    } else {
      await createRedroidServer(payload)
    }
    dialogVisible.value = false
    await loadList()
  } catch (error) {
    dialogError.value = error?.response?.data?.error || error?.message || '保存失败'
  } finally {
    dialogLoading.value = false
  }
}

function formatCoord(value) {
  return Number(value).toFixed(6)
}

function destroyLocationMap() {
  if (locationMap) {
    locationMap.remove()
    locationMap = null
    locationMarker = null
  }
}

function setLocationMarker(lat, lng) {
  if (!locationMap) return
  if (!locationMarker) {
    locationMarker = L.marker([lat, lng], { icon: defaultIcon }).addTo(locationMap)
  } else {
    locationMarker.setLatLng([lat, lng])
  }
}

function initLocationMap() {
  if (!mapEl.value || locationMap) return
  const point = locationPoint.value
  const center = point ? wgs84ToGcj02(point.lng, point.lat).reverse() : [35.0, 105.0]
  locationMap = L.map(mapEl.value, { zoomControl: true }).setView(center, point ? 13 : 4)
  L.tileLayer(
    'https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=7&x={x}&y={y}&z={z}',
    {
      subdomains: ['1', '2', '3', '4'],
      maxZoom: 18,
      attribution: '&copy; 高德地图'
    }
  ).addTo(locationMap)
  locationMap.on('click', (event) => {
    const [lng, lat] = gcj02ToWgs84(event.latlng.lng, event.latlng.lat)
    locationPoint.value = { lat, lng }
    setLocationMarker(event.latlng.lat, event.latlng.lng)
  })
  if (point) {
    const [lng, lat] = wgs84ToGcj02(point.lng, point.lat)
    setLocationMarker(lat, lng)
  }
  setTimeout(() => locationMap?.invalidateSize(), 50)
}

async function openLocation(item) {
  const serial = item?.serial
  if (!serial) return
  destroyLocationMap()
  locationName.value = serial
  locationPoint.value = null
  locationError.value = ''
  locationVisible.value = true
  locationLoading.value = true
  try {
    const res = await getRedroidContainerLocation(serial)
    const lat = Number(res?.data?.latitude)
    const lng = Number(res?.data?.longitude)
    if ((lat || lng) && Number.isFinite(lat) && Number.isFinite(lng)) {
      locationPoint.value = { lat, lng }
    }
  } catch (error) {
    locationError.value = error?.response?.data?.error || error?.message || '读取位置失败'
  } finally {
    locationLoading.value = false
    if (!locationVisible.value) return
    await nextTick()
    initLocationMap()
  }
}

function onLocationDialogShow() {
  if (locationMap) {
    setTimeout(() => locationMap?.invalidateSize(), 50)
    return
  }
  if (!locationLoading.value) initLocationMap()
}

function closeLocation() {
  locationVisible.value = false
  destroyLocationMap()
}

async function confirmLocation() {
  const point = locationPoint.value
  if (!locationName.value || !point) {
    locationError.value = '请在地图上选择位置'
    return
  }
  locationSaving.value = true
  locationError.value = ''
  try {
    await updateRedroidContainerLocation(locationName.value, point.lat, point.lng)
    closeLocation()
  } catch (error) {
    locationError.value = error?.response?.data?.error || error?.message || '保存失败'
  } finally {
    locationSaving.value = false
  }
}

function askDelete(row) {
  pendingDelete.value = row
}

function closeDelete() {
  if (deleting.value) return
  pendingDelete.value = null
}

async function confirmDelete() {
  const row = pendingDelete.value
  if (!row) return
  deleting.value = true
  listError.value = ''
  try {
    await deleteRedroidServer(row.id)
    pendingDelete.value = null
    await loadList()
  } catch (error) {
    listError.value = error?.response?.data?.error || error?.message || '删除失败'
    pendingDelete.value = null
  } finally {
    deleting.value = false
  }
}

onMounted(() => {
  loadList()
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex shrink-0 items-center justify-between border-b border-surface px-4 py-2">
      <span class="text-sm font-medium">服务器列表</span>
      <Button label="添加服务器" icon="pi pi-plus" size="small" @click="openAdd" />
    </header>

    <div class="min-h-0 flex-1 overflow-auto p-3">
      <Message v-if="listError" severity="error" :closable="false" class="mb-3">{{ listError }}</Message>
      <section class="overflow-hidden rounded-md border border-surface">
        <div v-if="loading" class="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-color">
          <i class="pi pi-spin pi-spinner" />
          加载中...
        </div>
        <table v-else class="w-full border-collapse text-sm">
          <thead class="text-left text-xs text-muted-color">
            <tr class="border-b border-surface">
              <th class="px-3 py-2 font-medium">机器ID</th>
              <th class="px-3 py-2 font-medium">IP</th>
              <th class="px-3 py-2 font-medium">镜像列表</th>
              <th class="px-3 py-2 font-medium">到期时间</th>
              <th class="px-3 py-2 font-medium">备注</th>
              <th class="w-28 px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in list" :key="row.id" class="border-b border-surface last:border-b-0 hover:bg-emphasis">
              <td class="px-3 py-2 font-medium">{{ row.machined_id }}</td>
              <td class="px-3 py-2 text-muted-color">{{ row.ip || '—' }}</td>
              <td class="px-3 py-2">
                <span v-if="!row.ip" class="text-muted-color">未设置 IP</span>
                <span v-else-if="containerState(row.id).loading" class="inline-flex items-center gap-2 text-muted-color">
                  <i class="pi pi-spin pi-spinner text-xs" />
                  加载中...
                </span>
                <span v-else-if="containerState(row.id).error" class="text-red-400">{{ containerState(row.id).error }}</span>
                <ul v-else-if="containerState(row.id).list.length" class="flex flex-col gap-1">
                  <li
                    v-for="item in containerState(row.id).list"
                    :key="item.id"
                    class="flex items-center gap-2"
                  >
                    <Tag
                      :value="item.running ? '运行中' : '已停止'"
                      :severity="item.running ? 'success' : 'secondary'"
                    />
                    <span>{{ item.name || item.id }}</span>
                    <Button
                      v-if="item.name"
                      v-tooltip.top="'位置'"
                      icon="pi pi-map-marker"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      aria-label="位置"
                      @click="openLocation(item)"
                    />
                    <Button
                      v-if="item.name"
                      v-tooltip.top="'开始'"
                      icon="pi pi-play"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      aria-label="开始"
                      :disabled="!!containerAction(row.id, item.name)"
                      :loading="containerAction(row.id, item.name) === 'start'"
                      @click="runContainerAction(row, item, 'start')"
                    />
                    <Button
                      v-if="item.name"
                      v-tooltip.top="'停止'"
                      icon="pi pi-stop"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      aria-label="停止"
                      :disabled="!!containerAction(row.id, item.name)"
                      :loading="containerAction(row.id, item.name) === 'stop'"
                      @click="runContainerAction(row, item, 'stop')"
                    />
                  </li>
                </ul>
                <span v-else class="text-muted-color">无容器</span>
              </td>
              <td class="px-3 py-2" :class="isExpired(row.expire_at) ? 'text-red-400' : ''">
                {{ formatExpire(row.expire_at) }}
              </td>
              <td class="max-w-xs truncate px-3 py-2 text-muted-color">{{ row.note || '—' }}</td>
              <td class="px-3 py-2">
                <div class="flex items-center gap-1">
                  <Button
                    v-tooltip.top="'编辑'"
                    icon="pi pi-pencil"
                    text
                    rounded
                    size="small"
                    severity="secondary"
                    aria-label="编辑"
                    @click="openEdit(row)"
                  />
                  <Button
                    v-tooltip.top="'删除'"
                    icon="pi pi-trash"
                    text
                    rounded
                    size="small"
                    severity="danger"
                    aria-label="删除"
                    @click="askDelete(row)"
                  />
                </div>
              </td>
            </tr>
            <tr v-if="!list.length">
              <td colspan="6" class="px-3 py-8 text-center text-sm text-muted-color">暂无服务器，点击「添加服务器」创建</td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <Dialog
      v-model:visible="locationVisible"
      :header="locationName ? `设置位置 · ${locationName}` : '设置位置'"
      modal
      :style="{ width: '760px' }"
      @show="onLocationDialogShow"
      @hide="destroyLocationMap"
    >
      <p class="mb-3 text-sm text-muted-color">在地图上点击选择位置，保存后写入该设备的经纬度。</p>
      <div v-if="locationLoading" class="flex h-[420px] items-center justify-center gap-2 text-sm text-muted-color">
        <i class="pi pi-spin pi-spinner" />
        加载中...
      </div>
      <div v-show="!locationLoading" ref="mapEl" class="location-map rounded-md border border-surface"></div>
      <p class="mt-3 text-sm">
        <template v-if="locationPoint">
          纬度 {{ formatCoord(locationPoint.lat) }}，经度 {{ formatCoord(locationPoint.lng) }}
        </template>
        <template v-else><span class="text-muted-color">尚未选择位置</span></template>
      </p>
      <Message v-if="locationError" severity="error" :closable="false" class="mt-3">{{ locationError }}</Message>
      <template #footer>
        <Button label="取消" severity="secondary" text @click="closeLocation" />
        <Button label="保存" :disabled="!locationPoint" :loading="locationSaving" @click="confirmLocation" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogVisible"
      :header="editingId != null ? '编辑服务器' : '添加服务器'"
      modal
      :style="{ width: '420px' }"
      @hide="dialogError = ''"
    >
      <div class="flex flex-col gap-4">
        <Message v-if="dialogError" severity="error" :closable="false">{{ dialogError }}</Message>
        <label class="flex flex-col gap-2 text-sm" for="server-machine-id">
          机器ID
          <InputText id="server-machine-id" v-model="form.machined_id" placeholder="机器ID" fluid />
        </label>
        <label class="flex flex-col gap-2 text-sm" for="server-ip">
          IP
          <InputText id="server-ip" v-model="form.ip" placeholder="服务器 IP" fluid />
        </label>
        <label class="flex flex-col gap-2 text-sm" for="server-expire">
          到期时间
          <DatePicker
            v-model="expireDate"
            input-id="server-expire"
            show-time
            hour-format="24"
            show-icon
            fluid
            date-format="yy-mm-dd"
            placeholder="选择到期时间"
          />
        </label>
        <label class="flex flex-col gap-2 text-sm" for="server-note">
          备注
          <Textarea id="server-note" v-model="form.note" rows="3" auto-resize fluid placeholder="可选" />
        </label>
      </div>
      <template #footer>
        <Button label="取消" severity="secondary" text @click="dialogVisible = false" />
        <Button label="保存" :loading="dialogLoading" @click="confirmSave" />
      </template>
    </Dialog>

    <Dialog
      :visible="pendingDelete != null"
      header="删除服务器"
      modal
      :style="{ width: '420px' }"
      @update:visible="(visible) => !visible && closeDelete()"
    >
      <p class="text-sm">
        确定删除服务器「{{ pendingDelete?.machined_id || pendingDelete?.id }}」吗？
      </p>
      <template #footer>
        <Button label="取消" severity="secondary" text :disabled="deleting" @click="closeDelete" />
        <Button label="删除" severity="danger" :loading="deleting" @click="confirmDelete" />
      </template>
    </Dialog>
  </div>
</template>

<style>
.location-map {
  height: 420px;
  width: 100%;
  z-index: 0;
}
.location-map img {
  max-width: none !important;
  max-height: none !important;
}
</style>
