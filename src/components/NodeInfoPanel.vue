<script setup>
import { computed, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useDeviceStore } from '../stores/device'
import { getXmlLayout } from '../api/device'
import Card from 'primevue/card'

const props = defineProps({
  /** 选中的设备序列号 */
  serial: {
    type: String,
    default: '',
  },
})

const deviceStore = useDeviceStore()
const { screenshotRefreshKey, selectedPoint } = storeToRefs(deviceStore)

const xmllayout = ref('')
const loading = ref(false)
const error = ref('')

async function loadXmlLayout() {
  if (!props.serial) {
    xmllayout.value = ''
    error.value = ''
    return
  }
  loading.value = true
  error.value = ''
  try {
    xmllayout.value = await getXmlLayout(props.serial)
  } catch (e) {
    error.value = e.message || '获取布局失败'
    xmllayout.value = ''
  } finally {
    loading.value = false
  }
}

/** 解析 bounds 字符串 "[left,top][right,bottom]" */
function parseBounds(boundsStr) {
  if (!boundsStr || typeof boundsStr !== 'string') return null
  const m = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
  if (!m) return null
  return {
    left: parseInt(m[1], 10),
    top: parseInt(m[2], 10),
    right: parseInt(m[3], 10),
    bottom: parseInt(m[4], 10),
    width: parseInt(m[3], 10) - parseInt(m[1], 10),
    height: parseInt(m[4], 10) - parseInt(m[2], 10),
  }
}

/** 在 XML 中查找包含 (x,y) 的所有 node，按面积从小到大排序，返回 { bounds, attrs } 数组 */
function findAllNodesAtPoint(xmlString, x, y) {
  if (!xmlString || typeof x !== 'number' || typeof y !== 'number') return []
  let doc
  try {
    doc = new DOMParser().parseFromString(xmlString, 'text/xml')
  } catch {
    return []
  }
  const nodes = doc.querySelectorAll('node')
  const containing = []
  for (const el of nodes) {
    const boundsStr = el.getAttribute('bounds')
    const b = parseBounds(boundsStr)
    if (!b) continue
    if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) {
      const area = b.width * b.height
      const attrs = {}
      for (const a of el.attributes) {
        attrs[a.name] = a.value
      }
      containing.push({ area, bounds: b, attrs })
    }
  }
  containing.sort((a, b) => a.area - b.area)
  return containing.map((item) => ({ bounds: item.bounds, attrs: item.attrs }))
}

/** 在 XML 字符串中查找包含 (x,y) 的最内层 node（面积最小的），返回其属性 */
function findNodeAtPoint(xmlString, x, y) {
  const all = findAllNodesAtPoint(xmlString, x, y)
  return all.length ? all[0].attrs : null
}

const selectedNode = computed(() => {
  const point = selectedPoint.value
  if (!point || !xmllayout.value) return null
  return findNodeAtPoint(xmllayout.value, point.x, point.y)
})

async function copyValueToClipboard(key,text) {
  try {
    let txt='';
    console.log(key);
    if(key==='class'){
      txt='className("'+text+'")'
    }
    else if(key==='text'){
      txt='text("'+text+'")'
    }
    else if(key==='content-desc'){
      txt='desc("'+text+'")'
    }
    else if(key==='resource-id'){
      txt='id("'+text+'")'
    }
    else{
      txt=text
    }
 
    await navigator.clipboard.writeText(txt)
  } catch {
    // 降级：部分环境无 clipboard API
  }
}

const nodeInfoEntries = computed(() => {
  const node = selectedNode.value
  if (!node) return []
  const order = [
    'class',
    'package',
    'text',
    'content-desc',
    'resource-id',
    'bounds',
    'checkable',
    'checked',
    'clickable',
    'enabled',
    'focusable',
    'focused',
    'scrollable',
    'long-clickable',
    'selected',
    'visible-to-user',
    'index',
  ]
  return order.filter((k) => node[k] != null).map((k) => ({ key: k, value: node[k] }))
})

watch(
  [() => props.serial, screenshotRefreshKey],
  () => loadXmlLayout(),
  { immediate: true }
)

watch(
  [selectedPoint, xmllayout],
  () => {
    const point = selectedPoint.value
    const xml = xmllayout.value
    if (!point || !xml) {
      deviceStore.setContainingNodesBounds([])
      return
    }
    const list = findAllNodesAtPoint(xml, point.x, point.y)
    deviceStore.setContainingNodesBounds(list.map((item) => item.bounds))
  },
  { immediate: true }
)
</script>

<template>
  <Card class="h-full">
  
    <template #content>
      <div
        class="flex min-h-[300px] flex-col overflow-hidden rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 p-3"
      >
        <template v-if="!serial">
          <span class="text-slate-400">请先选择设备</span>
        </template>
        <template v-else-if="loading">
          <i class="pi pi-spin pi-spinner mb-2 text-2xl text-slate-400"></i>
          <span class="text-slate-400">加载布局中...</span>
        </template>
        <template v-else-if="error">
          <span class="text-red-500">{{ error }}</span>
        </template>
        <template v-else-if="!selectedPoint">
          <span class="text-slate-500">点击左侧设备截图中的位置，将在此显示包裹该点的 xmllayout 节点信息。</span>
        </template>
        <template v-else-if="!selectedNode">
          <p class="mb-2 text-slate-600">
            点击坐标：<code class="rounded bg-slate-200 px-1">{{ selectedPoint.x }}, {{ selectedPoint.y }}</code>
          </p>
          <span class="text-amber-600">未找到包含该点的节点</span>
        </template>
        <template v-else>
          <p class="mb-3 text-slate-600">
            点击坐标：<code class="rounded bg-slate-200 px-1">{{ selectedPoint.x }}, {{ selectedPoint.y }}</code>
            （最内层节点）
          </p>
          <dl class="space-y-1.5 text-sm">
            <template v-for="entry in nodeInfoEntries" :key="entry.key">
              <div class="flex items-center gap-x-2">
                <dt class="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-500">
                  {{ entry.key }}
                </dt>
                <dd class="min-w-0 flex-1 break-all font-normal text-slate-900">
                  {{ entry.value }}
                </dd>
                <button
                  type="button"
                  class="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  title="复制"
                  @click="copyValueToClipboard(entry.key,entry.value)"
                >
                  <i class="pi pi-copy text-sm"></i>
                </button>
              </div>
            </template>
          </dl>
        </template>
      </div>
    </template>
  </Card>
</template>
