import { getItem, removeItem } from './storage'

const BASE_URL = import.meta.env.VITE_API_BASE || ''

/** 401 时清除登录态并跳转登录页（供 request 与 screenshot 等复用） */
export function redirectToLogin() {
  removeItem('token')
  removeItem('user')
  window.location.href = '/login'
}

async function request(url, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  const token = getItem('token')
  if (token && String(token).trim()) {
    headers.token = token
  }

  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers })
  const data = await res.json().catch(() => ({}))

  if (!res.ok) {
    if (res.status === 401) {
      redirectToLogin()
      throw new Error(data?.error || '登录已过期')
    }
    const err = new Error(data?.error || '请求失败')
    err.response = { data }
    throw err
  }
  return data
}

async function getBlob(url) {
  const headers = {}
  const token = getItem('token')
  if (token && String(token).trim()) headers.token = token
  const res = await fetch(`${BASE_URL}${url}`, { method: 'GET', headers })
  if (res.status === 401) {
    redirectToLogin()
    throw new Error('登录已过期')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data?.error || '请求失败')
  }
  return res.blob()
}

export default {
  get: (url) => request(url, { method: 'GET' }),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: (url, body) => request(url, { method: 'PATCH', body: JSON.stringify(body) }),
  getBlob,
}
