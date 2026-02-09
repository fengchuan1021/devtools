/**
 * 截图 API
 */

const API_BASE = import.meta.env.VITE_API_BASE || ''

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
  const url = getScreenShotUrl(serial)
  const res = await fetch(url)
  if (!res.ok) {
    const text = await res.text()
    let msg = '截图获取失败'
    try {
      const json = JSON.parse(text)
      if (json?.error) msg = json.error
    } catch {
      if (text) msg = text
    }
    throw new Error(msg)
  }
  return res.blob()
}
