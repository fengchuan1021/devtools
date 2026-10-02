<script setup lang="ts">
import axios from 'axios'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { http } from '../api/http'
import { pathAfterLogin } from '../router/redirect'
import { useUserStore, type UserInfo } from '../stores/user'

interface LoginBody {
  msg?: string
  error?: string
  data?: {
    token?: string
    user?: UserInfo
  }
}

const route = useRoute()
const router = useRouter()
const user = useUserStore()

const username = ref('')
const password = ref('')
const errorMessage = ref('')
const submitting = ref(false)

function loginError(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string; message?: string; msg?: string } | undefined
    if (data?.error) return data.error
    if (data?.message) return data.message
    if (data?.msg) return data.msg
    if (!error.response) return '无法连接服务器'
  }
  return '登录失败'
}

function notifyHost(token: string) {
  const bridge = (window as Window & { AndroidBridge?: { setToken?: (value: string) => string } })
    .AndroidBridge
  if (!bridge?.setToken) return
  try {
    JSON.parse(bridge.setToken(token))
  } catch {
    // 宿主不一定返回 JSON
  }
}

async function submit() {
  errorMessage.value = ''
  const name = username.value.trim()
  if (!name || !password.value) {
    errorMessage.value = '请填写用户名和密码'
    return
  }

  submitting.value = true
  try {
    const { data } = await http.post<LoginBody>(
      '/api/user/login',
      { username: name, password: password.value },
      { skipAuth: true },
    )
    const token = data.data?.token
    const profile = data.data?.user
    if (!token || !profile) {
      errorMessage.value = data.msg || data.error || '登录失败'
      return
    }
    user.setToken(token)
    user.setProfile(profile)
    notifyHost(token)
    const next = pathAfterLogin(route.query.redirect)
    await router.replace(typeof next === 'string' ? next : '/')
  } catch (error) {
    errorMessage.value = loginError(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <h1 class="text-2xl font-medium">登录</h1>
    <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>
    <label class="flex flex-col gap-2 text-sm" for="login-username">
      用户名
      <InputText id="login-username" v-model="username" fluid autocomplete="username" />
    </label>
    <label class="flex flex-col gap-2 text-sm" for="login-password">
      密码
      <Password
        v-model="password"
        input-id="login-password"
        fluid
        :feedback="false"
        toggle-mask
        autocomplete="current-password"
      />
    </label>
    <Button type="submit" label="登录" icon="pi pi-sign-in" :loading="submitting" />
    <p class="text-sm text-muted-color">
      还没有账号？
      <RouterLink class="text-primary" :to="{ name: 'register', query: route.query }">注册</RouterLink>
    </p>
  </form>
</template>
