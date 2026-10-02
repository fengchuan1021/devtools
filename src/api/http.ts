import axios from 'axios'
import { useUserStore } from '../stores/user'

declare module 'axios' {
  interface AxiosRequestConfig {
    skipAuth?: boolean
  }
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
})

http.interceptors.request.use((config) => {
  if (config.skipAuth) {
    return config
  }

  const token = useUserStore().token
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})
