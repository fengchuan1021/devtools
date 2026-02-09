import { getItem, removeItem } from './storage'

const BASE_URL = import.meta.env.VITE_API_BASE || ''

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
      removeItem('token')
      removeItem('user')
      window.location.href = '/login'
      throw new Error(data?.error || '登录已过期')
    }
    const err = new Error(data?.error || '请求失败')
    err.response = { data }
    throw err
  }
  return data
}

export default {
  get: (url) => request(url, { method: 'GET' }),
  post: (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) }),
}
