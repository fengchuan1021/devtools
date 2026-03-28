import { createRouter, createWebHashHistory } from 'vue-router'
import { getItem } from '../utils/storage'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { title: '首页' }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../LoginView.vue'),
    meta: { title: '登录' }
  }
]

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

// 路由守卫：token 为空则默认跳转登录页
router.beforeEach((to) => {
  if (to.path === '/login') return true

  const token = getItem('token')
  if (!token || !String(token).trim()) {
    return { path: '/login' }
  }

  return true
})

export default router
