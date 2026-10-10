<script setup>
import { markRaw, nextTick, onActivated, onMounted, onUnmounted, ref } from 'vue'
import Button from 'primevue/button'
import DatePicker from 'primevue/datepicker'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Textarea from 'primevue/textarea'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import markerIcon from 'leaflet/dist/images/marker-icon.png'
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png'
import markerShadow from 'leaflet/dist/images/marker-shadow.png'
import { sendScreenLinkCmd } from '../api/device'
import DeviceMetaEditor from '../components/DeviceMetaEditor.vue'
import DeviceTerminalHost from '../components/DeviceTerminalHost.vue'
import {
  listRedroidServers,
  getRedroidServer,
  createRedroidServer,
  updateRedroidServer,
  deleteRedroidServer,
  listRedroidContainers,
  startRedroidContainer,
  stopRedroidContainer,
  createRedroidContainer,
  getRedroidContainerLocation,
  updateRedroidContainerLocation
} from '../api/redroidServer'
import request from '../utils/request'

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
const locationPurpose = ref('save')
const locationLoading = ref(false)
const locationSaving = ref(false)
const locationError = ref('')
const locationName = ref('')
const locationPoint = ref(null)
const createVisible = ref(false)
const createSaving = ref(false)
const createError = ref('')
const createServer = ref(null)
const createForm = ref(emptyCreateForm())
const containerImageOptions = [
  {
    label: '192.168.1.231:5000/redroid:12.0.0-arm64',
    value: '192.168.1.231:5000/redroid:12.0.0-arm64'
  },
  {
    label: '192.168.1.231:5000/redroid:12.0.0-arm64-gms',
    value: '192.168.1.231:5000/redroid:12.0.0-arm64-gms'
  }
]
const localeOptions = [{ label: '中文', value: 'zh-CN' }]
const mapEl = ref(null)
let locationMap = null
let locationMarker = null
const deviceEditorVisible = ref(false)
const terminalHost = ref(null)
const deviceEditorSerial = ref('')
const screens = ref([])
const screenHint = ref('')
const relay = ref('')
const stun = ref('')
let screenSeq = 0
let screenHintTimer = 0

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

function randomSerial() {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  const out = []
  const bytes = new Uint8Array(32)
  while (out.length < 16) {
    crypto.getRandomValues(bytes)
    for (const value of bytes) {
      if (value >= 252) continue
      out.push(alphabet[value % alphabet.length])
      if (out.length === 16) break
    }
  }
  return out.join('')
}

function emptyCreateForm() {
  return {
    name: '',
    serial: randomSerial(),
    locale: 'zh-CN',
    timezone: 'Asia/Shanghai',
    latitude: null,
    longitude: null,
    image: '192.168.1.231:5000/redroid:12.0.0-arm64'
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
  locationPurpose.value = 'save'
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

function openCreateLocation() {
  destroyLocationMap()
  locationPurpose.value = 'pick'
  locationName.value = ''
  const { latitude, longitude } = createForm.value
  locationPoint.value = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null
  locationError.value = ''
  locationLoading.value = false
  locationVisible.value = true
}

function createContainer(row) {
  createServer.value = row
  createForm.value = emptyCreateForm()
  createError.value = ''
  createVisible.value = true
}

async function confirmCreate() {
  const server = createServer.value
  if (!server) return
  const name = createForm.value.name.trim()
  const serial = createForm.value.serial.trim()
  const locale = createForm.value.locale.trim()
  const timezone = createForm.value.timezone.trim()
  if (!/^[a-z0-9][a-z0-9-]{0,127}$/.test(name) || name === 'redroid') {
    createError.value = '容器名称须为小写字母、数字或连字符'
    return
  }
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(serial)) {
    createError.value = '序列号无效'
    return
  }
  if (!/^[A-Za-z0-9._-]{1,64}$/.test(locale)) {
    createError.value = '语言无效'
    return
  }
  if (!/^[A-Za-z0-9._+\/-]{1,64}$/.test(timezone)) {
    createError.value = '时区无效'
    return
  }
  if (createForm.value.latitude == null || createForm.value.longitude == null) {
    createError.value = '请选择经纬度'
    return
  }
  createSaving.value = true
  createError.value = ''
  try {
    await createRedroidContainer({
      id: server.id,
      name,
      serial,
      locale,
      timezone,
      latitude: createForm.value.latitude,
      longitude: createForm.value.longitude,
      image: createForm.value.image
    })
    createVisible.value = false
    await reloadContainers(server)
  } catch (error) {
    createError.value = error?.response?.data?.error || error?.message || '创建失败'
  } finally {
    createSaving.value = false
  }
}

async function confirmLocation() {
  const point = locationPoint.value
  if (locationPurpose.value === 'pick') {
    if (!point) {
      locationError.value = '请在地图上选择位置'
      return
    }
    createForm.value = {
      ...createForm.value,
      latitude: point.lat,
      longitude: point.lng
    }
    closeLocation()
    return
  }
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

function showScreenHint(text) {
  screenHint.value = text
  window.clearTimeout(screenHintTimer)
  screenHintTimer = window.setTimeout(() => {
    if (screenHint.value === text) screenHint.value = ''
  }, 3000)
}

function emptyScreenSession() {
  return markRaw({
    socket: undefined,
    peer: undefined,
    pending: [],
    remoteSet: false,
    pressing: false,
    lastPoint: undefined,
    moveTimer: undefined,
    video: undefined,
    stream: undefined,
    generation: 0
  })
}

async function loadWebRTCConfig() {
  try {
    const data = await request.get('/api/getwebrtcconfig')
    relay.value = (data?.relay || '').trim()
    stun.value = (data?.stun || '').trim()
  } catch {
    relay.value = ''
    stun.value = ''
  }
}

function setScreenVideo(screen, element) {
  if (!(element instanceof HTMLVideoElement)) return
  const session = screen.session
  session.video = element
  if (session.stream && element.srcObject !== session.stream) {
    element.srcObject = session.stream
    void element.play().catch(() => {})
  }
}

function syncScreenRatio(screen, event) {
  const video = event.target
  if (!(video instanceof HTMLVideoElement) || video.videoWidth <= 0 || video.videoHeight <= 0) return
  screen.ratio = video.videoWidth / video.videoHeight
}

function openContainerEdit(item) {
  const serial = String(item?.serial || '').trim()
  if (!serial) {
    showScreenHint('容器没有序列号')
    return
  }
  deviceEditorSerial.value = serial
  deviceEditorVisible.value = true
}

function openContainerTerminal(item) {
  const serial = String(item?.serial || '').trim()
  if (!serial) {
    showScreenHint('容器没有序列号')
    return
  }
  terminalHost.value?.openTerminal(serial)
}

function openContainerScreen(item) {
  if (!item?.running) {
    showScreenHint('请先启动容器')
    return
  }
  const serial = String(item.serial || '').trim()
  if (!serial) {
    showScreenHint('容器没有序列号')
    return
  }
  if (screens.value.some((screen) => screen.visible && screen.serial === serial)) return
  const screen = {
    id: ++screenSeq,
    visible: true,
    serial,
    title: item.name || serial,
    status: '',
    hasVideo: false,
    ratio: 9 / 16,
    peerName: '',
    connected: false,
    slot: screens.value.length,
    session: emptyScreenSession()
  }
  screens.value.push(screen)
  void connectScreen(screen)
}

function screenDialogStyle(screen) {
  const col = screen.slot % 3
  const row = Math.floor(screen.slot / 3) % 3
  return {
    width: '420px',
    position: 'fixed',
    margin: '0',
    left: `${16 + col * 436}px`,
    top: `${64 + row * 72}px`
  }
}

let screenLayer = 1200

function raiseScreenDialog(event) {
  const mask = event.currentTarget?.parentElement
  if (!(mask instanceof HTMLElement)) return
  mask.style.zIndex = String(++screenLayer)
}

function closeScreen(screen) {
  if (!screen.visible) return
  screen.visible = false
  disconnectScreen(screen)
}

function removeScreen(screen) {
  const index = screens.value.findIndex((item) => item.id === screen.id)
  if (index >= 0) screens.value.splice(index, 1)
}

async function connectScreen(screen) {
  const serial = screen.serial
  if (!serial || screen.connected) return
  if (!relay.value || !stun.value) await loadWebRTCConfig()
  if (!screen.visible || screen.serial !== serial) return
  if (!relay.value || !stun.value) {
    screen.status = '画面配置未就绪'
    return
  }
  const session = screen.session
  const generation = ++session.generation
  session.remoteSet = false
  session.pending = []
  screen.peerName = ''
  screen.hasVideo = false
  screen.status = '正在通知手机'
  screen.connected = true
  try {
    await sendScreenLinkCmd(serial, 'begin')
  } catch {
    if (session.generation === generation) {
      screen.connected = false
      screen.status = '通知手机失败'
    }
    return
  }
  if (session.generation !== generation) {
    void sendScreenLinkCmd(serial, 'end').catch(() => {})
    return
  }
  screen.status = '正在连接中继'
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
  const current = new WebSocket(`${protocol}//${location.host}/screenlink`)
  session.socket = current
  current.onopen = () => {
    if (session.socket !== current) return
    screen.status = '正在等待手机'
    current.send(JSON.stringify({ type: 'join', code: serial }))
  }
  current.onmessage = (event) => {
    if (session.socket !== current || typeof event.data !== 'string') return
    void onScreenSignal(screen, event.data)
  }
  current.onerror = () => {
    if (session.socket === current) screen.status = '中继连接失败'
  }
  current.onclose = () => {
    if (session.socket !== current) return
    session.socket = undefined
    closeScreenPeer(screen)
    screen.connected = false
    screen.hasVideo = false
    screen.peerName = ''
    screen.status = '信令已断开'
    void sendScreenLinkCmd(serial, 'end').catch(() => {})
  }
}

async function onScreenSignal(screen, text) {
  let message
  try {
    message = JSON.parse(text)
  } catch {
    return
  }
  const session = screen.session
  if (!session || !screen.visible) return
  if (message.type === 'waiting') {
    screen.status = '等待手机登记'
    return
  }
  if (message.type === 'joined') {
    screen.peerName = message.name || '手机'
    screen.status = '正在建立画面'
    openScreenPeer(screen)
    return
  }
  if (message.type === 'error') {
    screen.status = message.message || '信令错误'
    return
  }
  if (message.type === 'peer-left') {
    screen.status = '手机已断开'
    screen.peerName = ''
    screen.hasVideo = false
    closeScreenPeer(screen)
    return
  }
  if (message.type === 'shot') {
    screen.status = message.ok ? '截图已保存到手机 Download' : '截图失败'
    return
  }
  if (!session.peer) return
  if (message.type === 'offer' && message.sdp) {
    await session.peer.setRemoteDescription({ type: 'offer', sdp: message.sdp })
    session.remoteSet = true
    for (const candidate of session.pending) {
      await session.peer.addIceCandidate(candidate)
    }
    session.pending = []
    const answer = await session.peer.createAnswer()
    await session.peer.setLocalDescription(answer)
    session.socket?.send(JSON.stringify({ type: 'answer', sdp: answer.sdp }))
    return
  }
  if (message.type === 'candidate' && message.candidate) {
    const candidate = {
      candidate: message.candidate,
      sdpMid: message.sdpMid,
      sdpMLineIndex: message.sdpMLineIndex
    }
    if (!session.remoteSet) {
      session.pending.push(candidate)
    } else {
      await session.peer.addIceCandidate(candidate)
    }
  }
}

function openScreenPeer(screen) {
  const session = screen.session
  if (!session) return
  session.peer?.close()
  const connection = new RTCPeerConnection({
    iceServers: [{ urls: stun.value }]
  })
  session.peer = connection
  connection.ontrack = (event) => {
    const stream = event.streams[0] ?? new MediaStream([event.track])
    session.stream = stream
    screen.hasVideo = true
    if (session.video) {
      session.video.srcObject = stream
      void session.video.play().catch(() => {})
    }
    screen.status = '正在接收画面'
  }
  connection.onicecandidate = (event) => {
    if (!event.candidate || session.socket?.readyState !== WebSocket.OPEN) return
    session.socket.send(
      JSON.stringify({
        type: 'candidate',
        candidate: event.candidate.candidate,
        sdpMid: event.candidate.sdpMid,
        sdpMLineIndex: event.candidate.sdpMLineIndex
      })
    )
  }
  connection.oniceconnectionstatechange = () => {
    if (connection.iceConnectionState === 'connected' || connection.iceConnectionState === 'completed') {
      screen.status = '画面通道已建立'
    } else if (connection.iceConnectionState === 'failed') {
      screen.status = 'UDP 打洞失败'
    }
  }
}

function closeScreenPeer(screen) {
  const session = screen.session
  if (!session) return
  const video = session.video
  const stream = session.stream
  session.peer?.close()
  session.peer = undefined
  session.stream = undefined
  session.remoteSet = false
  session.pending = []
  if (video && video.srcObject === stream) video.srcObject = null
}

function sendScreenControl(screen, action) {
  const session = screen.session
  if (!screen.peerName || session?.socket?.readyState !== WebSocket.OPEN) return
  session.socket.send(JSON.stringify({ type: 'control', action }))
}

function screenVideoPoint(event) {
  const video = event.currentTarget
  if (!(video instanceof HTMLVideoElement)) return
  const rect = video.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return
  return {
    x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
    y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height))
  }
}

function sendScreenTouch(screen, phase, x, y) {
  const session = screen.session
  if (!screen.peerName || session?.socket?.readyState !== WebSocket.OPEN) return
  session.socket.send(JSON.stringify({ type: 'control', action: 'touch', phase, x, y }))
}

function onScreenPointerDown(screen, event) {
  if (!screen.peerName) return
  if (event.button === 2) {
    sendScreenControl(screen, 'back')
    return
  }
  if (event.button === 1) {
    sendScreenControl(screen, 'home')
    return
  }
  if (event.button !== 0) return
  const point = screenVideoPoint(event)
  if (!point || !screen.session) return
  screen.session.pressing = true
  screen.session.lastPoint = point
  sendScreenTouch(screen, 'down', point.x, point.y)
  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    // 非用户手势时捕获会失败，触摸已经发出
  }
}

function onScreenPointerMove(screen, event) {
  const session = screen.session
  if (!session?.pressing) return
  const point = screenVideoPoint(event)
  if (!point) return
  session.lastPoint = point
  if (session.moveTimer != null) return
  session.moveTimer = window.setTimeout(() => {
    session.moveTimer = undefined
    if (session.pressing && session.lastPoint) {
      sendScreenTouch(screen, 'move', session.lastPoint.x, session.lastPoint.y)
    }
  }, 16)
}

function onScreenPointerUp(screen, event) {
  const session = screen.session
  if (!session?.pressing || (event.type !== 'pointercancel' && event.button !== 0)) return
  session.pressing = false
  if (session.moveTimer != null) {
    window.clearTimeout(session.moveTimer)
    session.moveTimer = undefined
  }
  const point = screenVideoPoint(event) ?? session.lastPoint
  if (point) sendScreenTouch(screen, 'up', point.x, point.y)
}

function onScreenWheel(screen, event) {
  const session = screen.session
  const point = screenVideoPoint(event)
  if (!point || !screen.peerName || session?.socket?.readyState !== WebSocket.OPEN) return
  const dx = Math.max(-1, Math.min(1, event.deltaX / 120))
  const dy = Math.max(-1, Math.min(1, -event.deltaY / 120))
  if (dx === 0 && dy === 0) return
  session.socket.send(JSON.stringify({ type: 'control', action: 'scroll', x: point.x, y: point.y, dx, dy }))
}

function disconnectScreen(screen) {
  const serial = screen.serial
  const wasConnected = screen.connected
  const session = screen.session
  if (session) {
    session.generation += 1
    const current = session.socket
    session.socket = undefined
    current?.close()
    if (session.moveTimer != null) {
      window.clearTimeout(session.moveTimer)
      session.moveTimer = undefined
    }
    session.pressing = false
    closeScreenPeer(screen)
  }
  screen.connected = false
  screen.hasVideo = false
  screen.peerName = ''
  if (wasConnected && serial) {
    void sendScreenLinkCmd(serial, 'end').catch(() => {})
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
  void loadWebRTCConfig()
})

onActivated(() => {
  if (locationMap) setTimeout(() => locationMap.invalidateSize(), 50)
  for (const screen of screens.value) {
    const video = screen.session?.video
    const stream = screen.session?.stream
    if (!video || !stream) continue
    if (video.srcObject !== stream) video.srcObject = stream
    void video.play().catch(() => {})
  }
})

onUnmounted(() => {
  window.clearTimeout(screenHintTimer)
  for (const screen of screens.value) disconnectScreen(screen)
})
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <header class="flex shrink-0 items-center justify-between border-b border-surface px-4 py-2">
      <span class="text-sm font-medium">服务器列表</span>
      <Button label="添加服务器" icon="pi pi-plus" size="small" @click="openAdd" />
    </header>

    <Message v-if="screenHint" severity="warn" :closable="false" class="mx-3 mt-3">{{ screenHint }}</Message>

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
                    <span>{{ item.serial }}</span>
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
                    <Button
                      v-if="item.name"
                      v-tooltip.top="'编辑'"
                      icon="pi pi-pencil"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      aria-label="编辑"
                      @click="openContainerEdit(item)"
                    />
                    <Button
                      v-if="item.name"
                      v-tooltip.top="'连接'"
                      icon="pi pi-link"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      aria-label="连接"
                      @click="openContainerScreen(item)"
                    />
                    <Button
                      v-if="item.name"
                      v-tooltip.top="'终端'"
                      icon="pi pi-desktop"
                      text
                      rounded
                      size="small"
                      severity="secondary"
                      aria-label="终端"
                      @click="openContainerTerminal(item)"
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
                    v-tooltip.top="'创建容器'"
                    icon="pi pi-plus"
                    text
                    rounded
                    size="small"
                    severity="secondary"
                    aria-label="创建容器"
                    @click="createContainer(row)"
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
      v-model:visible="createVisible"
      header="创建容器"
      modal
      :style="{ width: '480px' }"
      @hide="createError = ''"
    >
      <div class="flex flex-col gap-4">
        <Message v-if="createError" severity="error" :closable="false">{{ createError }}</Message>
        <label class="flex flex-col gap-2 text-sm" for="container-name">
          容器名称
          <InputText id="container-name" v-model="createForm.name" placeholder="小写字母、数字或连字符" fluid />
        </label>
        <label class="flex flex-col gap-2 text-sm" for="container-serial">
          序列号
          <InputText id="container-serial" v-model="createForm.serial" maxlength="128" fluid />
        </label>
        <label class="flex flex-col gap-2 text-sm" for="container-locale">
          语言
          <Select
            v-model="createForm.locale"
            input-id="container-locale"
            :options="localeOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </label>
        <label class="flex flex-col gap-2 text-sm" for="container-timezone">
          时区
          <InputText id="container-timezone" v-model="createForm.timezone" fluid />
        </label>
        <div class="flex flex-col gap-2 text-sm">
          经纬度
          <div class="flex items-center justify-between gap-3">
            <span v-if="createForm.latitude != null && createForm.longitude != null">
              纬度 {{ formatCoord(createForm.latitude) }}，经度 {{ formatCoord(createForm.longitude) }}
            </span>
            <span v-else class="text-muted-color">尚未选择位置</span>
            <Button label="选择位置" severity="secondary" size="small" @click="openCreateLocation" />
          </div>
        </div>
        <label class="flex flex-col gap-2 text-sm" for="container-image">
          镜像地址
          <Select
            v-model="createForm.image"
            input-id="container-image"
            :options="containerImageOptions"
            option-label="label"
            option-value="value"
            fluid
          />
        </label>
      </div>
      <template #footer>
        <Button label="取消" severity="secondary" text :disabled="createSaving" @click="createVisible = false" />
        <Button label="创建" :loading="createSaving" @click="confirmCreate" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="locationVisible"
      :header="locationPurpose === 'pick' ? '选择位置' : locationName ? `设置位置 · ${locationName}` : '设置位置'"
      modal
      :style="{ width: '760px' }"
      @show="onLocationDialogShow"
      @hide="destroyLocationMap"
    >
      <p class="mb-3 text-sm text-muted-color">
        {{ locationPurpose === 'pick' ? '在地图上点击选择位置。' : '在地图上点击选择位置，保存后写入该设备的经纬度。' }}
      </p>
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

    <DeviceMetaEditor v-model:visible="deviceEditorVisible" :serial="deviceEditorSerial" />
    <DeviceTerminalHost ref="terminalHost" />

    <Dialog
      v-for="screen in screens"
      :key="screen.id"
      :visible="screen.visible"
      :header="screen.title ? `容器画面 · ${screen.title}` : '容器画面'"
      :modal="false"
      :close-on-escape="false"
      :style="screenDialogStyle(screen)"
      :pt="{ root: { onMousedown: raiseScreenDialog } }"
      @update:visible="(visible) => !visible && closeScreen(screen)"
      @after-hide="removeScreen(screen)"
    >
      <div class="flex flex-col gap-3">
        <div class="flex h-[640px] items-center justify-center overflow-hidden rounded-md bg-black">
          <i v-show="!screen.hasVideo" class="pi pi-image text-4xl text-muted-color" aria-label="等待画面" />
          <video
            v-show="screen.hasVideo"
            :ref="(element) => setScreenVideo(screen, element)"
            autoplay
            playsinline
            muted
            class="max-h-full bg-black touch-none select-none"
            :aria-label="screen.title || '容器画面'"
            :style="{ aspectRatio: String(screen.ratio), height: '100%' }"
            @loadedmetadata="syncScreenRatio(screen, $event)"
            @pointerdown.prevent="onScreenPointerDown(screen, $event)"
            @pointermove="onScreenPointerMove(screen, $event)"
            @pointerup="onScreenPointerUp(screen, $event)"
            @pointercancel="onScreenPointerUp(screen, $event)"
            @contextmenu.prevent
            @wheel.prevent="onScreenWheel(screen, $event)"
          />
        </div>
        <div class="flex justify-center gap-1">
          <Button icon="pi pi-arrow-left" rounded outlined aria-label="返回" size="small" :disabled="!screen.peerName" @click="sendScreenControl(screen, 'back')" />
          <Button icon="pi pi-home" rounded outlined aria-label="主页" size="small" :disabled="!screen.peerName" @click="sendScreenControl(screen, 'home')" />
          <Button icon="pi pi-clone" rounded outlined aria-label="最近任务" size="small" :disabled="!screen.peerName" @click="sendScreenControl(screen, 'recents')" />
          <Button icon="pi pi-camera" rounded outlined aria-label="截图" size="small" :disabled="!screen.peerName" @click="sendScreenControl(screen, 'shot')" />
        </div>
        <p class="truncate text-xs text-muted-color">{{ screen.status }}</p>
      </div>
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
