/**
 * 设备相关 API
 */

import request from '../utils/request'
import { getItem } from '../utils/storage'

const API_BASE = import.meta.env.VITE_API_BASE || ''

/**
 * 获取设备列表
 * @returns {Promise<Array<{serial: string}>>}
 */
export async function getDevices() {
  const res = await request.get('/api/dev/getDevices')
  const data = res?.data
  return Array.isArray(data) ? data : []
}

/**
 * 根据序列号从远程搜索设备（本地无结果时调用）
 * @param {string} query - 搜索关键词（序列号包含的内容）
 * @returns {Promise<Array<{serial: string, name?: string}>>}
 */
export async function searchDevicesRemote(query) {
  if (!query?.trim()) return []

  try {
    const res = await request.get(
      `/api/devices?serial=${encodeURIComponent(query)}`
    )
    const data = res?.data ?? res?.devices
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.warn('Remote device search failed:', err)
    return []
  }
}

/**
 * 获取设备截图 URL
 * @param {string} serial - 设备序列号
 * @param {number} t - 时间戳，用于刷新缓存
 * @returns {string}
 */
export function getScreenShotUrl(serial, t = Date.now()) {
  if (!serial) return ''
  const params = new URLSearchParams({ serial })
  if (t) params.set('t', String(t))
  return `${API_BASE}/api/dev/getScreenShot?${params}`
}


/**
 * 请求设备截图（返回 blob，用于创建 object URL）
 * @param {string} serial - 设备序列号
 * @returns {Promise<Blob>}
 */
export async function fetchScreenShot(serial) {
  if (!serial) throw new Error('serial required')
  const url = `/api/dev/getScreenShot?${new URLSearchParams({ serial })}`
  return request.getBlob(url)
}

/**
 * 在指定设备上执行脚本（管理端）
 * @param {string} serial - 设备序列号
 * @param {string} script - 脚本内容
 * @returns {Promise<{data: string}>}
 */
export async function runDevScript(serial, script) {
  if (!serial?.trim()) throw new Error('serial 必填')
  if (script == null) throw new Error('script 必填')
    console.log('run script', serial)
  const res = await request.post('/api/dev/runDevScript', { serial: serial.trim(), script: String(script) })
  console.log('run script res', res)
  return res
}
/**
 * 获取设备当前 UI 层级 XML（与截图对应的 xmllayout）
 * @param {string} serial - 设备序列号
 * @returns {Promise<string>} XML 字符串
 */
export async function getXmlLayout(serial) {
  if (!serial) return ''
  const url = `/api/dev/getXmlLayout?${new URLSearchParams({ serial })}`
  return request.getText(url)
}

/**
 * 开始 / 结束设备上的 scrcpy
 * @param {string} serial
 * @param {'beginScrcpy'|'endScrcpy'} cmdtype
 */
export async function sendScrcpyCmd(serial, cmdtype) {
  if (!serial) throw new Error('serial required')
  if (!cmdtype) throw new Error('cmdtype required')
  const params = new URLSearchParams({ serial, cmdtype })
  return request.post(`/api/dev/sendScrcpyCmd?${params}`, {})
}

/**
 * 在设备上以 root 执行 shell，返回 stdout+stderr
 * @param {string} serial
 * @param {string} command
 * @returns {Promise<string>}
 */
export async function runDeviceShell(serial, command) {
  if (!serial?.trim()) throw new Error('serial 必填')
  if (command == null || command === '') throw new Error('command 必填')
  const res = await request.post('/api/dev/runShell', {
    serial: serial.trim(),
    command: String(command),
  })
  return res?.data ?? ''
}

/**
 * 操作设备交互式 PTY 会话
 * @param {'open'|'write'|'interrupt'|'close'} op
 */
export async function runDeviceShellSession(serial, session, op, data = '', seq = 0) {
  if (!serial?.trim()) throw new Error('serial 必填')
  if (!session?.trim()) throw new Error('session 必填')
  if (!op) throw new Error('op 必填')
  const res = await request.post('/api/dev/shell', {
    serial: serial.trim(),
    session: String(session),
    op,
    data: data == null ? '' : String(data),
    seq: Number(seq) || 0,
  })
  return res?.data ?? ''
}

/**
 * 订阅 PTY 输出（SSE）。token 走 header，需浏览器 ReadableStream。
 * @returns {Promise<void>}
 */
export async function openDeviceShellStream(serial, session, { onEvent, signal } = {}) {
  if (!serial?.trim()) throw new Error('serial 必填')
  if (!session?.trim()) throw new Error('session 必填')
  const headers = {}
  const token = getItem('token') || ''
  if (token) headers.token = token
  headers.Accept = 'text/event-stream'
  const params = new URLSearchParams({ serial: serial.trim(), session: String(session) })
  const res = await fetch(`/api/dev/shellStream?${params}`, {
    headers,
    signal,
    cache: 'no-store',
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || data?.msg || '订阅终端输出失败')
  }
  if (!res.body) throw new Error('浏览器不支持流式输出')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (!signal?.aborted) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    buf = buf.replace(/\r\n/g, '\n')
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      for (const line of frame.split('\n')) {
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).replace(/^\s/, '')
        if (!payload) continue
        try {
          onEvent?.(JSON.parse(payload))
        } catch {
          // ignore malformed frames
        }
      }
    }
  }
}