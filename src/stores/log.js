import { defineStore } from 'pinia'

export const useLogStore = defineStore('log', {
  state: () => ({
    /** 日志条目列表 { time, level, message } */
    entries: [],
    /** 最大保留条数 */
    maxEntries: 5000,
  }),

  actions: {
    append(level, message,tag='') {
      const entry = {
        time: new Date().toLocaleTimeString('zh-CN'),
        level, // 'info' | 'warn' | 'error' | 'debug'
        tag,
        message: String(message),
      }
      this.entries.push(entry)
      if (this.entries.length > this.maxEntries) {
        this.entries = this.entries.slice(-this.maxEntries)
      }
    },

    info(msg) {
      this.append('info', msg)
    },

    warn(msg) {
      this.append('warn', msg)
    },

    error(msg) {
      this.append('error', msg)
    },

    debug(msg) {
      this.append('debug', msg)
    },

    clear() {
      this.entries = []
    },
  },
})
