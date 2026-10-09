<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import TitleBar from '../components/TitleBar.vue'
import { menuItems } from '../router/menu'

const route = useRoute()
</script>

<template>
  <div class="flex h-svh flex-col bg-[var(--p-content-background)] text-color">
    <TitleBar />
    <div class="flex min-h-0 flex-1">
      <aside class="flex w-56 shrink-0 flex-col border-r border-surface bg-[var(--p-content-background)]">
        <nav class="flex flex-col gap-1 p-2">
          <RouterLink
            v-for="item in menuItems"
            :key="item.name"
            :to="{ name: item.name }"
            class="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
            :class="route.name === item.name ? 'bg-highlight' : 'hover:bg-emphasis'"
          >
            <i :class="item.icon" aria-hidden="true" />
            {{ item.label }}
          </RouterLink>
        </nav>
      </aside>
      <main class="min-w-0 flex-1 overflow-auto">
        <RouterView v-slot="{ Component }">
          <KeepAlive>
            <component :is="Component" />
          </KeepAlive>
        </RouterView>
      </main>
    </div>
  </div>
</template>
