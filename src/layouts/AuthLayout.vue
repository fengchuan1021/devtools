<script setup lang="ts">
import { RouterView } from 'vue-router'
import TitleBar from '../components/TitleBar.vue'
</script>

<template>
  <div class="flex h-svh flex-col bg-[var(--p-content-background)] text-color">
    <TitleBar />
    <main class="flex min-h-0 flex-1 items-center justify-center p-6">
      <div class="w-full max-w-sm">
        <RouterView />
      </div>
    </main>
  </div>
</template>
