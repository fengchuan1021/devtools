import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    count: 0,
    title: 'DevTools',
  }),
  actions: {
    increment() {
      this.count++
    },
    decrement() {
      this.count--
    },
  },
})
