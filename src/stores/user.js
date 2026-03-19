import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null
  }),

  getters: {
    isAdmin: (state) => state.user?.role_id === 1,
    isAgent: (state) => state.user?.role_id === 2
  },

  actions: {
    setUser(user) {
      this.user = user
      if (user) {
       
        try {
          localStorage.setItem('user', JSON.stringify(user))
        } catch {}
      } else {
        try {
          localStorage.removeItem('user')
        } catch {}
      }
    },

    loadUserFromStorage() {
      try {
        const raw = localStorage?.getItem?.('user') ?? 'null'
        const user = JSON.parse(raw)
        this.user = user
        return user
      } catch {
        this.user = null
        return null
      }
    },

    logout() {
      this.user = null
      try {
        localStorage.removeItem('user')
        localStorage.removeItem('token')
      } catch {}
    }
  }
})
