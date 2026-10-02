<script setup lang="ts">
import { storeToRefs } from 'pinia'
import Card from 'primevue/card'
import { computed, ref, watch } from 'vue'
import { getXmlLayout } from '../api/device'
import { useDeviceStore, type NodeBounds } from '../stores/device'

const props = defineProps<{
  serial?: string
}>()

const deviceStore = useDeviceStore()
const { screenshotRefreshKey, selectedPoint, containingNodesBounds } = storeToRefs(deviceStore)

const xmllayout = ref('')
const loading = ref(false)
const error = ref('')

interface XmlAttrs {
  [key: string]: string
}

interface XmlTreeNode {
  bounds: NodeBounds | null
  attrs: XmlAttrs
  children: XmlTreeNode[]
  key: string
}

function errorText(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback
}

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
  } catch (reason) {
    error.value = errorText(reason, '获取布局失败')
    xmllayout.value = ''
  } finally {
    loading.value = false
  }
}

function parseBounds(boundsStr: string | null) {
  if (!boundsStr) return null
  const matched = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/)
  if (!matched) return null
  const left = parseInt(matched[1] ?? '', 10)
  const top = parseInt(matched[2] ?? '', 10)
  const right = parseInt(matched[3] ?? '', 10)
  const bottom = parseInt(matched[4] ?? '', 10)
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

function readAttrs(el: Element) {
  const attrs: XmlAttrs = {}
  for (const attr of el.attributes) attrs[attr.name] = attr.value
  return attrs
}

function findAllNodesAtPoint(xmlString: string, x: number, y: number) {
  if (!xmlString || typeof x !== 'number' || typeof y !== 'number') return []
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xmlString, 'text/xml')
  } catch {
    return []
  }
  const containing: { area: number; bounds: NodeBounds; attrs: XmlAttrs }[] = []
  for (const el of doc.querySelectorAll('node')) {
    const bounds = parseBounds(el.getAttribute('bounds'))
    if (!bounds) continue
    if (x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom) {
      containing.push({ area: bounds.width * bounds.height, bounds, attrs: readAttrs(el) })
    }
  }
  containing.sort((a, b) => a.area - b.area)
  return containing.map((item) => ({ bounds: item.bounds, attrs: item.attrs }))
}

function findNodeAtPoint(xmlString: string, x: number, y: number) {
  const all = findAllNodesAtPoint(xmlString, x, y)
  return all.length ? all[0]?.attrs ?? null : null
}

function boundsKey(bounds: NodeBounds | null) {
  if (!bounds) return ''
  return `${bounds.left},${bounds.top},${bounds.right},${bounds.bottom}`
}

function boundsEqual(a: NodeBounds | null, b: NodeBounds | null) {
  if (!a || !b) return false
  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom
}

function buildXmlTree(xmlString: string): XmlTreeNode | null {
  if (!xmlString) return null
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xmlString, 'text/xml')
  } catch {
    return null
  }
  const root = doc.documentElement?.tagName === 'node' ? doc.documentElement : doc.querySelector('node')
  if (!root) return null

  function buildNode(el: Element): XmlTreeNode {
    const bounds = parseBounds(el.getAttribute('bounds'))
    const children = Array.from(el.children)
      .filter((child) => child.tagName === 'node')
      .map((child) => buildNode(child))
    return { bounds, attrs: readAttrs(el), children, key: bounds ? boundsKey(bounds) : '' }
  }
  return buildNode(root)
}

function findPathToBounds(node: XmlTreeNode | null, targetBounds: NodeBounds | null, path: XmlTreeNode[] = []): XmlTreeNode[] | null {
  if (!node || !targetBounds) return null
  const nextPath = [...path, node]
  if (boundsEqual(node.bounds, targetBounds)) return nextPath
  for (const child of node.children) {
    const found = findPathToBounds(child, targetBounds, nextPath)
    if (found) return found
  }
  return null
}

function nodeLabel(node: XmlTreeNode | null) {
  if (!node?.attrs) return 'node'
  const attrs = node.attrs
  if (attrs['resource-id']) return attrs['resource-id'].split('/').pop() || attrs['resource-id']
  if (attrs.class) return attrs.class.split('.').pop() || attrs.class
  if (attrs.text) return attrs.text.slice(0, 20) + (attrs.text.length > 20 ? '…' : '') || 'node'
  if (attrs['content-desc']) {
    return attrs['content-desc'].slice(0, 20) + (attrs['content-desc'].length > 20 ? '…' : '') || 'node'
  }
  return 'node'
}

const selectedNode = computed(() => {
  const point = selectedPoint.value
  if (!point || !xmllayout.value) return null
  return findNodeAtPoint(xmllayout.value, point.x, point.y)
})

const selectedBounds = computed(() => {
  const list = containingNodesBounds.value
  return list?.length ? list[0] : null
})

const xmlTree = computed(() => buildXmlTree(xmllayout.value))
const expandedKeys = ref(new Set<string>())
const selectedNodeRowRef = ref<HTMLElement | null>(null)

function expandPathAndScrollToSelected() {
  const tree = xmlTree.value
  const bounds = selectedBounds.value
  if (!tree || !bounds) return
  const path = findPathToBounds(tree, bounds)
  if (path) {
    const keys = new Set(expandedKeys.value)
    path.forEach((node) => node.key && keys.add(node.key))
    expandedKeys.value = keys
  }
  setTimeout(() => {
    selectedNodeRowRef.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }, 50)
}

function toggleExpand(key: string) {
  const next = new Set(expandedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  expandedKeys.value = next
}

function selectTreeNodeBounds(node: XmlTreeNode) {
  deviceStore.setContainingNodesBounds(node?.bounds ? [node.bounds] : [])
}

const selectedBoundsKey = computed(() => (selectedBounds.value ? boundsKey(selectedBounds.value) : ''))

const flattenedTree = computed(() => {
  const tree = xmlTree.value
  const expanded = expandedKeys.value
  if (!tree) return []
  const out: { node: XmlTreeNode; depth: number }[] = []
  function walk(node: XmlTreeNode | null, depth: number) {
    if (!node) return
    out.push({ node, depth })
    if (node.children?.length && (depth === 0 || expanded.has(node.key))) {
      node.children.forEach((child) => walk(child, depth + 1))
    }
  }
  walk(tree, 0)
  return out
})

function trackSelectedRow(key: string, el: unknown) {
  if (key === selectedBoundsKey.value && el instanceof HTMLElement) {
    selectedNodeRowRef.value = el
  }
}

async function copyValueToClipboard(key: string, text: string) {
  let value = text
  if (key === 'class') value = `className("${text}")`
  else if (key === 'text') value = `text("${text}")`
  else if (key === 'content-desc') value = `desc("${text}")`
  else if (key === 'resource-id') value = `id("${text}")`
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // 部分环境没有剪贴板权限
  }
}

function copyEntryValueWithoutNewline(event: ClipboardEvent, value: string) {
  if (event.defaultPrevented) return
  event.clipboardData?.setData('text/plain', String(value ?? '').replace(/\r?\n/g, ''))
  event.preventDefault()
}

function getClosestCopyValueElement(node: Node | null) {
  if (!node) return null
  const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
  return el?.closest?.('[data-copy-value]') ?? null
}

function copySelectionValueWithoutNewline(event: ClipboardEvent) {
  const selection = window.getSelection?.()
  if (!selection || !selection.rangeCount) return
  const anchorEl = getClosestCopyValueElement(selection.anchorNode)
  const focusEl = getClosestCopyValueElement(selection.focusNode)
  if (!anchorEl || anchorEl !== focusEl) return
  copyEntryValueWithoutNewline(event, anchorEl.getAttribute('data-copy-value') ?? '')
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
  return order.filter((key) => node[key] != null).map((key) => ({ key, value: node[key] ?? '' }))
})

watch([() => props.serial, screenshotRefreshKey], () => loadXmlLayout(), { immediate: true })

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
  { immediate: true },
)

watch([selectedBounds, xmlTree], () => expandPathAndScrollToSelected(), { immediate: true })
</script>

<template>
  <Card
    class="flex h-full min-h-0 flex-col [&_.p-card-body]:flex [&_.p-card-body]:min-h-0 [&_.p-card-body]:flex-1 [&_.p-card-body]:flex-col [&_.p-card-content]:flex [&_.p-card-content]:min-h-0 [&_.p-card-content]:flex-1 [&_.p-card-content]:flex-col"
  >
    <template #content>
      <div
        id="node-info-panel"
        class="flex min-h-0 flex-1 flex-col overflow-hidden"
        @copy.capture="copySelectionValueWithoutNewline"
      >
        <template v-if="!serial">
          <span class="text-sm text-muted-color">请先选择设备</span>
        </template>
        <template v-else-if="loading">
          <i class="pi pi-spin pi-spinner mb-2 text-2xl text-muted-color" />
          <span class="text-sm text-muted-color">加载布局中...</span>
        </template>
        <template v-else-if="error">
          <span class="text-sm text-red-400">{{ error }}</span>
        </template>
        <template v-else-if="!selectedPoint">
          <span class="text-sm text-muted-color">点击左侧设备截图中的位置，将在此显示包裹该点的节点信息。</span>
        </template>
        <template v-else-if="!selectedNode">
          <p class="mb-2 text-sm text-muted-color">
            点击坐标：<code class="rounded bg-emphasis px-1 text-color">{{ selectedPoint.x }}, {{ selectedPoint.y }}</code>
          </p>
          <span class="text-sm text-amber-400">未找到包含该点的节点</span>
        </template>
        <template v-else>
          <p class="mb-3 text-sm text-muted-color">
            点击坐标：<code class="rounded bg-emphasis px-1 text-color">{{ selectedPoint.x }}, {{ selectedPoint.y }}</code>
            （最内层节点）
          </p>
          <div class="mb-4 flex flex-col gap-1.5 text-sm">
            <div v-for="entry in nodeInfoEntries" :key="entry.key" class="flex items-center gap-2">
              <span class="w-28 shrink-0 text-xs font-medium tracking-wide text-muted-color uppercase">
                {{ entry.key }}
              </span>
              <span class="min-w-0 flex-1 truncate" :title="entry.value">{{ entry.value }}</span>
              <button
                type="button"
                class="shrink-0 rounded p-1 text-muted-color hover:bg-emphasis hover:text-color"
                title="复制"
                @click="copyValueToClipboard(entry.key, entry.value)"
              >
                <i class="pi pi-copy text-sm" />
              </button>
            </div>
          </div>
          <div v-if="xmlTree" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <p class="mb-2 text-xs font-medium tracking-wide text-muted-color uppercase">XML 层级</p>
            <div class="min-h-0 flex-1 overflow-y-auto rounded-md border border-surface py-1 text-sm">
              <div
                v-for="item in flattenedTree"
                :key="item.node.key + '-' + item.depth"
                :ref="(el) => trackSelectedRow(item.node.key, el)"
                class="flex cursor-pointer items-center gap-1 py-0.5 pr-2 hover:bg-emphasis"
                :class="item.node.key === selectedBoundsKey ? 'bg-highlight' : ''"
                :style="{ paddingLeft: `${12 + item.depth * 16}px` }"
                @click="selectTreeNodeBounds(item.node)"
              >
                <i
                  v-if="item.node.children?.length"
                  class="pi shrink-0 text-muted-color"
                  :class="expandedKeys.has(item.node.key) ? 'pi-chevron-down' : 'pi-chevron-right'"
                  @click.stop="toggleExpand(item.node.key)"
                />
                <span v-else class="w-4 shrink-0" />
                <span class="min-w-0 truncate" :title="nodeLabel(item.node)">{{ nodeLabel(item.node) }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </Card>
</template>
