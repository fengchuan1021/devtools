import { defineStore } from 'pinia'
import { searchDevicesRemote } from '../api/device'

export const useDeviceStore = defineStore('device', {
  state: () => ({
    /** 本地设备列表（加载时从 /api/dev/getDevices 获取） */
    devices: [],
    /** 当前选中的设备 */
    selectedDevice: null,
    /** 搜索建议列表（过滤/远程结果） */
    suggestions: [],
    /** 远程搜索进行中 */
    searching: false,
    /** 截图刷新标记，点击刷新时递增以触发子组件刷新 */
    screenshotRefreshKey: 0,
    /** 截图上的点击坐标（设备像素），用于在 xmllayout 中定位节点 { x, y } */
    selectedPoint: null,
    /** 包含点击点的所有节点的 bounds 列表，用于在截图上绘制矩形 [{ left, top, right, bottom, width, height }, ...] */
    containingNodesBounds: [],
  }),

  actions: {
    /**
     * 搜索设备：先过滤本地，无结果时调用远程 API
     * @param {string} query - 输入内容
     */
    async searchDevices(query) {
      const q = (query || '').trim().toLowerCase()
      if (!q) {
        this.suggestions = this.devices.length ? [...this.devices] : []
        this.searching = false
        return
      }

      // 1. 本地过滤：序列号包含输入内容
      const localMatches = this.devices.filter((d) =>
        (d.serial || '').toLowerCase().includes(q)
      )

      if (localMatches.length > 0) {
        this.suggestions = localMatches
        this.searching = false
        return
      }

      // 2. 本地无结果，远程搜索
      this.searching = true
      try {
        const remote = await searchDevicesRemote(query)
        const remoteWithSerial = remote.map((d) =>
          typeof d === 'string' ? { serial: d } : { ...d, serial: d.serial || d.id }
        )
        this.suggestions = remoteWithSerial
      } finally {
        this.searching = false
      }
    },

    setSelectedDevice(device) {
      this.selectedDevice = device
    },

    setDevices(devices) {
      this.devices = Array.isArray(devices) ? devices : []
    },

    /** 添加设备到本地列表（如从远程搜索后连接） */
    addDevice(device) {
      if (device && !this.devices.some((d) => d.serial === device.serial)) {
        this.devices.push(device)
      }
    },

    /** 刷新设备截图 */
    refreshScreenshot() {
      this.screenshotRefreshKey += 1
    },

    /** 设置截图上的点击坐标，用于在 NodeInfoPanel 中展示对应 xmllayout 节点 */
    setSelectedPoint(point) {
      this.selectedPoint = point == null ? null : { x: Math.round(point.x), y: Math.round(point.y) }
    },

    /** 设置包含点击点的所有节点的 bounds，用于在截图上绘制矩形 */
    setContainingNodesBounds(bounds) {
      this.containingNodesBounds = Array.isArray(bounds) ? bounds : []
    },
  },
})
