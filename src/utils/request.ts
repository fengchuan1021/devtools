import { redirectToLogin } from '../router/redirect'
import { useUserStore } from '../stores/user'

const BASE_URL = import.meta.env.VITE_API_BASE || ''

export class ApiError extends Error {
  response: { data: unknown }

  constructor(message: string, data: unknown) {
    super(message)
    this.name = 'ApiError'
    this.response = { data }
  }
}

function authHeaders(extra?: HeadersInit) {
  const headers = new Headers(extra)
  const token = useUserStore().token.trim()
  if (token) headers.set('token', token)
  return headers
}

function errorMessage(data: unknown, fallback: string) {
  if (data && typeof data === 'object' && 'error' in data) {
    const error = (data as { error?: unknown }).error
    if (typeof error === 'string' && error) return error
  }
  return fallback
}

async function readJson(res: Response) {
  return res.json().catch(() => ({}))
}

function reject(res: Response, data: unknown): never {
  if (res.status === 401) {
    redirectToLogin()
    throw new ApiError(errorMessage(data, '登录已过期'), data)
  }
  throw new ApiError(errorMessage(data, '请求失败'), data)
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = authHeaders({
    'Content-Type': 'application/json',
    ...options.headers,
  })
  const res = await fetch(`${BASE_URL}${url}`, { ...options, headers })
  const data = await readJson(res)
  if (!res.ok) reject(res, data)
  return data as T
}

async function getBlob(url: string) {
  const res = await fetch(`${BASE_URL}${url}`, { method: 'GET', headers: authHeaders() })
  if (!res.ok) reject(res, await readJson(res))
  return res.blob()
}

/** GET 请求并返回响应正文为纯文本（如 XML） */
async function getText(url: string) {
  const res = await fetch(`${BASE_URL}${url}`, { method: 'GET', headers: authHeaders() })
  if (!res.ok) reject(res, await readJson(res))
  return res.text()
}

export default {
  get: <T = unknown>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  patch: <T = unknown>(url: string, body?: unknown) =>
    request<T>(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: <T = unknown>(url: string) => request<T>(url, { method: 'DELETE' }),
  getBlob,
  getText,
}
