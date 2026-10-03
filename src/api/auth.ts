import request, { ApiError } from '../utils/request'
import type { UserInfo } from '../stores/user'

export interface AuthResult {
  token: string
  user: UserInfo
}

interface LoginBody {
  msg?: string
  error?: string
  data?: AuthResult
}

interface RegisterBody {
  msg?: string
  error?: string
  data?: {
    username?: string
  }
}

export function login(username: string, password: string) {
  return request.post<LoginBody>('/api/user/login', { username, password })
}

export function register(username: string, password: string) {
  return request.post<RegisterBody>('/api/user/register', { username, password })
}

export function readErrorMessage(error: unknown) {
  if (error instanceof ApiError) {
    const data = error.response.data as { error?: string; message?: string; msg?: string }
    if (data?.error) return data.error
    if (data?.message) return data.message
    if (data?.msg) return data.msg
  }
  if (error instanceof TypeError) return '无法连接服务器'
  return '请求失败'
}
