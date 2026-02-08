<script setup>
import DeviceScreenshotArea from './components/DeviceScreenshotArea.vue'
import NodeInfoPanel from './components/NodeInfoPanel.vue'
import ScriptPanel from './components/ScriptPanel.vue'
</script>

<template>
  <div class="flex h-screen bg-slate-50 p-4 gap-4">
    <!-- 左侧：手机设备截图区域 -->
    <aside class="w-1/3 min-w-[280px] shrink-0">
      <DeviceScreenshotArea />
    </aside>

    <!-- 中间：选中的节点信息展示 -->
    <main class="flex-1 min-w-0">
      <NodeInfoPanel />
    </main>

    <!-- 右侧：脚本区域 -->
    <aside class="w-1/3 min-w-[280px] shrink-0">
      <ScriptPanel />
    </aside>
  </div>
</template>
