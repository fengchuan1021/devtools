import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface LogEntry {
  time: string
  level: string
  tag: string
  message: string
}

const maxEntries = 5000

export const useLogStore = defineStore('log', () => {
  const entries = ref<LogEntry[]>([])

  function append(level: string, message: unknown, tag = '') {
    entries.value.push({
      time: new Date().toLocaleTimeString('zh-CN'),
      level,
      tag,
      message: String(message),
    })
    if (entries.value.length > maxEntries) {
      entries.value = entries.value.slice(-maxEntries)
    }
  }

  function info(message: unknown) {
    append('info', message)
  }

  function warn(message: unknown) {
    append('warn', message)
  }

  function error(message: unknown) {
    append('error', message)
  }

  function debug(message: unknown) {
    append('debug', message)
  }

  function clear() {
    entries.value = []
  }

  return { entries, append, info, warn, error, debug, clear }
})
