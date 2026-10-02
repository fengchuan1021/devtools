import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { searchDevicesRemote } from '../api/device'

export interface DeviceRecord {
  serial: string
  id?: string
  name?: string
}

export interface DevicePoint {
  x: number
  y: number
}

export interface NodeBounds {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

export interface DeviceTerminalSession {
  id: string
  serial: string
  visible: boolean
}

function asDevice(value: unknown): DeviceRecord | null {
  if (typeof value === 'string' && value) return { serial: value }
  if (!value || typeof value !== 'object') return null
  const record = value as { serial?: unknown; id?: unknown }
  if (typeof record.serial === 'string' && record.serial) {
    return { ...(value as DeviceRecord), serial: record.serial }
  }
  if (typeof record.id === 'string' && record.id) {
    return { ...(value as DeviceRecord), serial: record.id }
  }
  return null
}

export const useDeviceStore = defineStore('device', () => {
  const devices = ref<DeviceRecord[]>([])
  const selectedDevice = ref<DeviceRecord | string | null>(null)
  const suggestions = ref<DeviceRecord[]>([])
  const searching = ref(false)
  const screenshotRefreshKey = ref(0)
  const selectedPoint = ref<DevicePoint | null>(null)
  const containingNodesBounds = ref<NodeBounds[]>([])
  const isscrcpy = ref(false)
  const terminals = ref<DeviceTerminalSession[]>([])

  const selectedSerial = computed(() => {
    const device = selectedDevice.value
    if (!device) return ''
    return typeof device === 'string' ? device : device.serial || ''
  })

  async function searchDevices(query: string) {
    const q = (query || '').trim().toLowerCase()
    if (!q) {
      suggestions.value = devices.value.length ? [...devices.value] : []
      searching.value = false
      return
    }

    const localMatches = devices.value.filter((device) =>
      (device.serial || '').toLowerCase().includes(q),
    )
    if (localMatches.length > 0) {
      suggestions.value = localMatches
      searching.value = false
      return
    }

    searching.value = true
    try {
      const remote = await searchDevicesRemote(query)
      const list = Array.isArray(remote) ? remote : []
      suggestions.value = list.flatMap((item) => {
        const device = asDevice(item)
        return device ? [device] : []
      })
    } finally {
      searching.value = false
    }
  }

  function setSelectedDevice(device: DeviceRecord | string | null) {
    selectedDevice.value = device
  }

  function setDevices(list: DeviceRecord[]) {
    devices.value = Array.isArray(list) ? list : []
  }

  function addDevice(device: DeviceRecord | null) {
    if (device && !devices.value.some((item) => item.serial === device.serial)) {
      devices.value.push(device)
    }
  }

  function refreshScreenshot() {
    screenshotRefreshKey.value += 1
  }

  function setIsScrcpy(value: boolean) {
    isscrcpy.value = !!value
  }

  function openTerminal() {
    terminals.value.push({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      serial: selectedSerial.value,
      visible: true,
    })
  }

  function closeTerminal(id: string) {
    terminals.value = terminals.value.filter((item) => item.id !== id)
  }

  function setSelectedPoint(point: DevicePoint | null) {
    selectedPoint.value =
      point == null ? null : { x: Math.round(point.x), y: Math.round(point.y) }
  }

  function setContainingNodesBounds(bounds: NodeBounds[]) {
    containingNodesBounds.value = Array.isArray(bounds) ? bounds : []
  }

  return {
    devices,
    selectedDevice,
    suggestions,
    searching,
    screenshotRefreshKey,
    selectedPoint,
    containingNodesBounds,
    isscrcpy,
    terminals,
    selectedSerial,
    searchDevices,
    setSelectedDevice,
    setDevices,
    addDevice,
    refreshScreenshot,
    setIsScrcpy,
    openTerminal,
    closeTerminal,
    setSelectedPoint,
    setContainingNodesBounds,
  }
})
