<script setup lang="ts">
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Password from 'primevue/password'
import { ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { readErrorMessage, register } from '../api/auth'

const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const confirmPassword = ref('')
const errorMessage = ref('')
const submitting = ref(false)

async function submit() {
  errorMessage.value = ''
  const name = username.value.trim()
  if (!name || !password.value || !confirmPassword.value) {
    errorMessage.value = '请填写用户名和密码'
    return
  }
  if (password.value !== confirmPassword.value) {
    errorMessage.value = '两次密码不一致'
    return
  }

  submitting.value = true
  try {
    await register(name, password.value)
    await router.replace({ name: 'login', query: route.query })
  } catch (error) {
    errorMessage.value = readErrorMessage(error)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="submit">
    <h1 class="text-2xl font-medium">注册</h1>
    <Message v-if="errorMessage" severity="error" :closable="false">{{ errorMessage }}</Message>
    <label class="flex flex-col gap-2 text-sm" for="register-username">
      用户名
      <InputText id="register-username" v-model="username" fluid autocomplete="username" />
    </label>
    <label class="flex flex-col gap-2 text-sm" for="register-password">
      密码
      <Password
        v-model="password"
        input-id="register-password"
        fluid
        :feedback="false"
        toggle-mask
        autocomplete="new-password"
      />
    </label>
    <label class="flex flex-col gap-2 text-sm" for="register-confirm">
      确认密码
      <Password
        v-model="confirmPassword"
        input-id="register-confirm"
        fluid
        :feedback="false"
        toggle-mask
        autocomplete="new-password"
      />
    </label>
    <Button type="submit" label="注册" :loading="submitting" />
    <p class="text-sm text-muted-color">
      已有账号？
      <RouterLink class="text-primary" :to="{ name: 'login', query: route.query }">登录</RouterLink>
    </p>
  </form>
</template>
