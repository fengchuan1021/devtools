import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '../layouts/AppLayout.vue'
import AuthLayout from '../layouts/AuthLayout.vue'
import DevView from '../views/DevView.vue'
import ScreenView from '../views/ScreenView.vue'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
const publicNames = new Set(['login', 'register'])

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      component: AuthLayout,
      children: [
        {
          path: '',
          name: 'login',
          component: LoginView,
        },
      ],
    },
    {
      path: '/register',
      component: AuthLayout,
      children: [
        {
          path: '',
          name: 'register',
          component: RegisterView,
        },
      ],
    },
    {
      path: '/',
      component: AppLayout,
      children: [
        {
          path: '',
          name: 'dev',
          component: DevView,
        },
        {
          path: 'screen',
          name: 'screen',
          component: ScreenView,
        },
      ],
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
})

router.beforeEach((to) => {
  //const token = getItem('token')
  const loggedIn = true
  const isPublic = publicNames.has(String(to.name))

  if (!loggedIn && !isPublic) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  if (loggedIn && isPublic) {
    return { name: 'home' }
  }
})

export default router
