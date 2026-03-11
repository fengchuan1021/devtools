import { ref, watch, onUnmounted } from 'vue'
import { useLogStore } from '../stores/log'
import { getItem } from '../utils/storage'

/**
 * 建立与后端的 WebSocket 连接，并在 HomeView 卸载时断开
 * 发送 monitor_serial 后，服务端将持续推送该设备的日志
 * @param {import('vue').Ref<{serial?: string}|string|null>} deviceOrSerialRef - selectedDevice 或 serial 字符串的 ref
 */
export function useWebSocket(deviceOrSerialRef) {
  const connected = ref(false)
  let ws = null
  let reconnectTimer = null
  const reconnectDelay = 3000

  const getSerial = () => {
    const v = deviceOrSerialRef?.value
    if (!v) return ''
    return typeof v === 'string' ? v : (v?.serial ?? '')
  }

  const sendMonitorSerial = (serial) => {
    if (ws && ws.readyState === WebSocket.OPEN && serial) {
      ws.send(JSON.stringify({ monitor_serial: serial }))
    }
  }

  const connect = () => {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = location.host
    const token = getItem('token') || ''
    const url = `${protocol}//${host}/api/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`
    ws = new WebSocket(url)

    ws.onopen = () => {
      connected.value = true
      useLogStore().info('WebSocket 已连接')
      sendMonitorSerial(getSerial())
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const msg = data.message || data.msg || event.data
        const level = data.level || 'info'
        useLogStore().append(level, msg)
      } catch {
        useLogStore().info(event.data)
      }
    }

    ws.onclose = () => {
      connected.value = false
      useLogStore().warn('WebSocket 已断开')
      reconnectTimer = setTimeout(connect, reconnectDelay)
    }

    ws.onerror = () => {
      useLogStore().error('WebSocket 连接错误')
    }
  }

  if (deviceOrSerialRef) {
    watch(deviceOrSerialRef, () => sendMonitorSerial(getSerial()), { deep: true })
  }

  const disconnect = () => {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (ws) {
      ws.close()
      ws = null
    }
    connected.value = false
  }

  onUnmounted(disconnect)

  return { connected, connect, disconnect, sendMonitorSerial }
}
