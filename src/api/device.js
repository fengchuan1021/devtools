/**
 * 设备相关 API
 */

import request from '../utils/request'

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
  const res = await request.post('/api/dev/runDevScript', { serial: serial.trim(), script: String(script) })
  return res
}
