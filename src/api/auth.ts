import axios from 'axios'
import type { UserInfo } from '../stores/user'
import { http } from './http'

export interface AuthResult {
  token: string
  user: UserInfo
}

export function login(username: string, password: string) {
  return http.post<AuthResult>('/auth/login', { username, password }, { skipAuth: true })
}

export function register(username: string, password: string) {
  return http.post<AuthResult>('/auth/register', { username, password }, { skipAuth: true })
}

export function readErrorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message) {
      return message
    }
    if (!error.response) {
      return '无法连接服务器'
    }
  }
  return '请求失败'
}
