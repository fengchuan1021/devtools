/**
 * 设备相关 API
 */

import request from '../utils/request'

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
