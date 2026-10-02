import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

const tokenKey = 'token'
const userKey = 'user'

export interface UserInfo {
  id: number
  username: string
  role_id: number
  is_banned?: boolean
  register_time?: string
  expire_at?: string
  is_svip?: boolean
}

function readItem(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeItem(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // 部分 WebView 禁止写入本地存储
  }
}

function removeItem(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    // 部分 WebView 禁止写入本地存储
  }
}

function readProfile() {
  const raw = readItem(userKey)
  if (!raw) return null
  try {
    return JSON.parse(raw) as UserInfo
  } catch {
    return null
  }
}

export const useUserStore = defineStore('user', () => {
  const token = ref(readItem(tokenKey) ?? '')
  const profile = ref<UserInfo | null>(readProfile())

  const isAdmin = computed(() => profile.value?.role_id === 1)
  const isAgent = computed(() => profile.value?.role_id === 2)

  function setToken(value: string) {
    token.value = value
    if (value) writeItem(tokenKey, value)
    else removeItem(tokenKey)
  }

  function setProfile(user: UserInfo | null) {
    profile.value = user
    if (user) writeItem(userKey, JSON.stringify(user))
    else removeItem(userKey)
  }

  function logout() {
    setToken('')
    setProfile(null)
  }

  return { token, profile, isAdmin, isAgent, setToken, setProfile, logout }
})
