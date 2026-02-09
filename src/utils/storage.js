// 安全访问 localStorage，兼容 WebView 中 localStorage 为 null 的情况
export function getItem(key) {
  try {
    return localStorage?.getItem?.(key) ?? null
  } catch {
    return null
  }
}

export function setItem(key, value) {
  try {
    localStorage?.setItem?.(key, value)
  } catch {}
}

export function removeItem(key) {
  try {
    localStorage?.removeItem?.(key)
  } catch {}
}
