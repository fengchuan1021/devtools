<template>
  <div class="flex min-h-screen min-w-[1024px] items-center justify-center bg-slate-100">
    <div class="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-lg">
      <h1 class="mb-6 text-center text-2xl font-semibold text-slate-800">登录</h1>

      <Message v-if="errorMsg" severity="error" :closable="false" class="mb-4">
        {{ errorMsg }}
      </Message>

      <form class="flex flex-col gap-4" @submit.prevent="handleLogin">
        <div class="flex flex-col gap-2">
          <label for="username" class="text-sm font-medium text-slate-700">用户名</label>
          <InputText
            id="username"
            v-model="username"
            placeholder="请输入用户名"
            class="w-full"
            required
          />
        </div>

        <div class="flex flex-col gap-2">
          <label for="password" class="text-sm font-medium text-slate-700">密码</label>
          <Password
            id="password"
            v-model="password"
            placeholder="请输入密码"
            :feedback="false"
            toggle-mask
            class="w-full"
            input-class="w-full"
            required
          />
        </div>

        <Button
          type="submit"
          label="登录"
          icon="pi pi-sign-in"
          :loading="loading"
          class="mt-2"
        />
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { login } from './api/user'
import { useUserStore } from './stores/user'
import { setItem } from './utils/storage'

const router = useRouter()
const userStore = useUserStore()

const username = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')

async function handleLogin() {
  errorMsg.value = ''
  loading.value = true
  try {
    const res = await login(username.value, password.value)
    const { token, user } = res?.data ?? {}
    setItem('token', token)
    if(token){
    try {
          const result = JSON.parse(window.AndroidBridge.setToken(token))
        } catch {}
      }
    if (user) {
      userStore.setUser(user)
    }
    router.push('/')
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || err?.message || '登录失败'
  } finally {
    loading.value = false
  }
}
</script>
