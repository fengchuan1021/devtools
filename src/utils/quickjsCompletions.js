/**
 * QuickJS API 补全数据与 Monaco 补全注册（与 docs/QuickJS_API.md 一致）
 */

const CompletionItemKind = {
  Function: 0,
  Method: 1,
  Snippet: 14
}

/** 全局函数与筛选器补全（可直接调用） */
const GLOBAL_ITEMS = [
  { label: 'home', insertText: 'home()', detail: '(): boolean', documentation: '模拟按 Home 键回到桌面；会尝试亮屏/解锁。' },
  { label: 'back', insertText: 'back()', detail: '(): boolean', documentation: '模拟按 Back 键返回上一级。' },
  { label: 'launchApp', insertText: 'launchApp(${1:packageName})', detail: '(packageName: string): boolean', documentation: '将指定包名的应用带到前台。' },
  { label: 'isAppInstalled', insertText: 'isAppInstalled(${1:packageName})', detail: '(packageName: string): boolean', documentation: '判断是否已安装该包名应用。' },
  { label: 'getInstalledApps', insertText: 'getInstalledApps()', detail: '(): string[]', documentation: '返回已安装应用包名数组。' },
  { label: 'getAppVersion', insertText: 'getAppVersion(${1:packageName})', detail: '(packageName: string): string', documentation: '返回已安装应用的版本号。' },
  { label: 'installApp', insertText: 'installApp(${1:pathOrUrl})', detail: '(pathOrUrl: string): boolean', documentation: '安装 APK；支持本地路径或下载 URL。' },
  { label: 'click', insertText: 'click(${1:x}, ${2:y})', detail: '(x: number, y?: number): boolean', documentation: '在屏幕坐标 (x, y) 执行点击。' },
  { label: 'swipe', insertText: 'swipe(${1:x1}, ${2:y1}, ${3:x2}, ${4:y2}, ${5:duration})', detail: '(x1,y1,x2,y2,duration): boolean', documentation: '从 (x1,y1) 滑动到 (x2,y2)，duration 毫秒。' },
  { label: 'swipeUp', insertText: 'swipeUp()', detail: '(): boolean', documentation: '向上滑动。' },
  { label: 'swipeDown', insertText: 'swipeDown()', detail: '(): boolean', documentation: '向下滑动。' },
  { label: 'getDeviceInfo', insertText: 'getDeviceInfo()', detail: '(): object', documentation: '返回设备信息对象。' },
  { label: 'getCurrentApp', insertText: 'getCurrentApp()', detail: '(): string', documentation: '当前前台应用包名。' },
  { label: 'getCurrentActivity', insertText: 'getCurrentActivity()', detail: '(): string', documentation: '当前前台 Activity 名称。' },
  { label: 'getAllTexts', insertText: 'getAllTexts()', detail: '(): string[]', documentation: '当前界面无障碍树中所有文本列表。' },
  { label: 'getAllIds', insertText: 'getAllIds()', detail: '(): string[]', documentation: '当前界面无障碍树中所有 view id 列表。' },
  { label: 'enablelog', insertText: 'enablelog()', detail: '(): boolean', documentation: '开启日志输出。' },
  { label: 'loadImg', insertText: 'loadImg(${1:url})', detail: '(url: string): ImageObject', documentation: '加载图片并返回图像对象。' },
  { label: 'loadScript', insertText: 'loadScript(${1:scriptUrl}, ${2:forceUpdate})', detail: '(scriptUrl: string, forceUpdate?: number): boolean', documentation: '加载并执行脚本；forceUpdate=1 时强制重新下载。' },
  { label: 'clearStorage', insertText: 'clearStorage()', detail: '(): boolean', documentation: '清除所有白名单外的 app。' },
  { label: 'requireEngine', insertText: 'requireEngine(${1:engineVersion})', detail: '(engineVersion: number): void', documentation: '校验引擎版本，不匹配时更新并重启。' },
  // 筛选器：正向匹配（返回 AccessibilityFilter，可链式）
  { label: 'text', insertText: 'text(${1:text})', detail: '(text: string): AccessibilityFilter', documentation: '只匹配文本完全等于 text 的节点。' },
  { label: 'textContains', insertText: 'textContains(${1:text})', detail: '(text: string): AccessibilityFilter', documentation: '匹配文本包含 text 的节点。' },
  { label: 'textRegMatch', insertText: 'textRegMatch(${1:text})', detail: '(text: string): AccessibilityFilter', documentation: '正则匹配文本。' },
  { label: 'desc', insertText: 'desc(${1:text})', detail: '(text: string): AccessibilityFilter', documentation: '只匹配节点描述完全等于 text 的节点。' },
  { label: 'descContains', insertText: 'descContains(${1:text})', detail: '(text: string): AccessibilityFilter', documentation: '匹配节点描述包含 text 的节点。' },
  { label: 'descRegMatch', insertText: 'descRegMatch(${1:text})', detail: '(text: string): AccessibilityFilter', documentation: '正则匹配节点描述。' },
  { label: 'id', insertText: 'id(${1:id})', detail: '(id: string): AccessibilityFilter', documentation: '匹配 view id 完全等于 id 的节点。' },
  { label: 'idContains', insertText: 'idContains(${1:id})', detail: '(id: string): AccessibilityFilter', documentation: '匹配 view id 包含 id 的节点。' },
  { label: 'idRegMatch', insertText: 'idRegMatch(${1:id})', detail: '(id: string): AccessibilityFilter', documentation: '正则匹配 view id。' },
  { label: 'className', insertText: 'className(${1:className})', detail: '(className: string): AccessibilityFilter', documentation: '匹配类名完全等于 className 的节点。' },
  { label: 'classNameContains', insertText: 'classNameContains(${1:className})', detail: '(className: string): AccessibilityFilter', documentation: '匹配类名包含 className 的节点。' },
  { label: 'classNameRegMatch', insertText: 'classNameRegMatch(${1:className})', detail: '(className: string): AccessibilityFilter', documentation: '正则匹配类名。' },
  { label: 'notText', insertText: 'notText(${1:text})', detail: '(text: string): true', documentation: '设置排除：文本完全等于 text 的节点。' },
  { label: 'notId', insertText: 'notId(${1:id})', detail: '(id: string): true', documentation: '设置排除：id 完全等于 id 的节点。' },
  { label: 'notClassName', insertText: 'notClassName(${1:className})', detail: '(className: string): true', documentation: '设置排除：类名完全等于 className 的节点。' },
  { label: 'notDesc', insertText: 'notDesc(${1:desc})', detail: '(desc: string): true', documentation: '设置排除：描述完全等于 desc 的节点。' },
  { label: 'notTextContains', insertText: 'notTextContains(${1:text})', detail: '(text: string): true', documentation: '设置排除：文本包含 text 的节点。' },
  { label: 'notIdContains', insertText: 'notIdContains(${1:id})', detail: '(id: string): true', documentation: '设置排除：id 包含 id 的节点。' },
  { label: 'notClassNameContains', insertText: 'notClassNameContains(${1:className})', detail: '(className: string): true', documentation: '设置排除：类名包含 className 的节点。' },
  { label: 'notDescContains', insertText: 'notDescContains(${1:desc})', detail: '(desc: string): true', documentation: '设置排除：描述包含 desc 的节点。' },
  { label: 'notTextRegMatch', insertText: 'notTextRegMatch(${1:regex})', detail: '(regex: string): true', documentation: '设置排除：文本匹配正则的节点。' },
  { label: 'notIdRegMatch', insertText: 'notIdRegMatch(${1:regex})', detail: '(regex: string): true', documentation: '设置排除：id 匹配正则的节点。' },
  { label: 'notClassNameRegMatch', insertText: 'notClassNameRegMatch(${1:regex})', detail: '(regex: string): true', documentation: '设置排除：类名匹配正则的节点。' },
  { label: 'notDescRegMatch', insertText: 'notDescRegMatch(${1:regex})', detail: '(regex: string): true', documentation: '设置排除：描述匹配正则的节点。' },
  // 全局排除
  { label: 'global_excludeText', insertText: 'global_excludeText(${1:text})', detail: '(text: string): true', documentation: '全局排除：文本完全等于 text 的节点。' },
  { label: 'global_excludeTextContains', insertText: 'global_excludeTextContains(${1:text})', detail: '(text: string): true', documentation: '全局排除：文本包含 text 的节点。' },
  { label: 'global_excludeTextRegMatch', insertText: 'global_excludeTextRegMatch(${1:regex})', detail: '(regex: string): true', documentation: '全局排除：文本匹配正则的节点。' },
  { label: 'global_excludeDesc', insertText: 'global_excludeDesc(${1:desc})', detail: '(desc: string): true', documentation: '全局排除：描述完全等于 desc 的节点。' },
  { label: 'global_excludeDescContains', insertText: 'global_excludeDescContains(${1:desc})', detail: '(desc: string): true', documentation: '全局排除：描述包含 desc 的节点。' },
  { label: 'global_excludeDescRegMatch', insertText: 'global_excludeDescRegMatch(${1:regex})', detail: '(regex: string): true', documentation: '全局排除：描述匹配正则的节点。' },
  { label: 'global_excludeId', insertText: 'global_excludeId(${1:id})', detail: '(id: string): true', documentation: '全局排除：view id 完全等于 id 的节点。' },
  { label: 'global_excludeIdContains', insertText: 'global_excludeIdContains(${1:id})', detail: '(id: string): true', documentation: '全局排除：view id 包含 id 的节点。' },
  { label: 'global_excludeIdRegMatch', insertText: 'global_excludeIdRegMatch(${1:regex})', detail: '(regex: string): true', documentation: '全局排除：view id 匹配正则的节点。' },
  { label: 'global_excludeClassName', insertText: 'global_excludeClassName(${1:className})', detail: '(className: string): true', documentation: '全局排除：类名完全等于 className 的节点。' },
  { label: 'global_excludeClassNameContains', insertText: 'global_excludeClassNameContains(${1:className})', detail: '(className: string): true', documentation: '全局排除：类名包含 className 的节点。' },
  { label: 'global_excludeClassNameRegMatch', insertText: 'global_excludeClassNameRegMatch(${1:regex})', detail: '(regex: string): true', documentation: '全局排除：类名匹配正则的节点。' },
  // 2.7.2 尺寸与位置
  { label: 'widthless', insertText: 'widthless(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配宽度 ≤ value 的节点。' },
  { label: 'widthgreater', insertText: 'widthgreater(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配宽度 ≥ value 的节点。' },
  { label: 'heightless', insertText: 'heightless(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配高度 ≤ value 的节点。' },
  { label: 'heightgreater', insertText: 'heightgreater(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配高度 ≥ value 的节点。' },
  { label: 'topless', insertText: 'topless(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 top ≤ value 的节点。' },
  { label: 'topgreater', insertText: 'topgreater(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 top ≥ value 的节点。' },
  { label: 'leftless', insertText: 'leftless(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 left ≤ value 的节点。' },
  { label: 'leftgreater', insertText: 'leftgreater(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 left ≥ value 的节点。' },
  { label: 'rightless', insertText: 'rightless(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 right ≤ value 的节点。' },
  { label: 'rightgreater', insertText: 'rightgreater(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 right ≥ value 的节点。' },
  { label: 'bottomless', insertText: 'bottomless(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 bottom ≤ value 的节点。' },
  { label: 'bottomgreater', insertText: 'bottomgreater(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 bottom ≥ value 的节点。' },
  // 2.7.3 子节点与形状
  { label: 'childrenCount', insertText: 'childrenCount(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配子节点数量等于 value 的节点。' },
  { label: 'childrenCountLess', insertText: 'childrenCountLess(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配子节点数量 ≤ value 的节点。' },
  { label: 'childrenCountGreater', insertText: 'childrenCountGreater(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配子节点数量 ≥ value 的节点。' },
  { label: 'isSquare', insertText: 'isSquare(${1:tolerance})', detail: '(tolerance?: number): AccessibilityFilter', documentation: '匹配宽高近似相等的节点。' },
  // 2.7.4 边界值
  { label: 'width', insertText: 'width(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配宽度等于 value 的节点。' },
  { label: 'height', insertText: 'height(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配高度等于 value 的节点。' },
  { label: 'left', insertText: 'left(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 left 等于 value 的节点。' },
  { label: 'right', insertText: 'right(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 right 等于 value 的节点。' },
  { label: 'top', insertText: 'top(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 top 等于 value 的节点。' },
  { label: 'bottom', insertText: 'bottom(${1:value})', detail: '(value: number): AccessibilityFilter', documentation: '只匹配 bottom 等于 value 的节点。' }
]

/** NodeObject / ImageObject 方法补全（输入方法名时提示，如 getText、click） */
const NODE_AND_IMAGE_ITEMS = [
  { label: 'getText', insertText: 'getText()', detail: '(): string | null', documentation: '节点文本内容。', kind: CompletionItemKind.Method },
  { label: 'getBounds', insertText: 'getBounds()', detail: '(): BoundObject', documentation: '节点在屏幕上的边界。', kind: CompletionItemKind.Method },
  { label: 'getClassName', insertText: 'getClassName()', detail: '(): string', documentation: '节点类名。', kind: CompletionItemKind.Method },
  { label: 'getId', insertText: 'getId()', detail: '(): string', documentation: '节点 view id。', kind: CompletionItemKind.Method },
  { label: 'parent', insertText: 'parent()', detail: '(): NodeObject | null', documentation: '父节点。', kind: CompletionItemKind.Method },
  { label: 'children', insertText: 'children()', detail: '(): 节点集合', documentation: '所有子节点。', kind: CompletionItemKind.Method },
  { label: 'toImage', insertText: 'toImage()', detail: '(): ImageObject', documentation: '将节点区域截图为图像对象。', kind: CompletionItemKind.Method },
  { label: 'show', insertText: 'show()', detail: '(): boolean', documentation: '将节点区域截图并显示（调试用）。', kind: CompletionItemKind.Method },
  { label: 'click', insertText: 'click(${1:offsetX}, ${2:offsetY})', detail: '(offsetX?, offsetY?): boolean', documentation: '在节点中心点击；可加偏移。', kind: CompletionItemKind.Method },
  { label: 'findHSVStraightLine', insertText: 'findHSVStraightLine(${1:expression}, ${2:threshold}, ${3:paddingTop}, ${4:paddingRight}, ${5:paddingBottom}, ${6:paddingLeft})', detail: '(expression, threshold, padding?): BoundObject', documentation: '按 HSV 条件找水平直线。', kind: CompletionItemKind.Method },
  { label: 'hasColor', insertText: 'hasColor(${1:expression}, ${2:threshold}, ${3:paddingTop}, ${4:paddingRight}, ${5:paddingBottom}, ${6:paddingLeft})', detail: '(expression, threshold, padding?): boolean', documentation: '区域内是否存在满足 HSV 条件的像素。', kind: CompletionItemKind.Method },
  { label: 'ocr', insertText: 'ocr(${1:paddingTop}, ${2:paddingRight}, ${3:paddingBottom}, ${4:paddingLeft})', detail: '(padding?): Array<{text,confidence,box}>', documentation: '对节点区域做 OCR。', kind: CompletionItemKind.Method },
  { label: 'crop', insertText: 'crop(${1:paddingTop}, ${2:paddingRight}, ${3:paddingBottom}, ${4:paddingLeft})', detail: '(padding): ImageObject', documentation: '按内边距裁剪，返回新图像对象。', kind: CompletionItemKind.Method }
]

function buildSuggestions(monaco, wordUntilPosition) {
  const word = (wordUntilPosition || '').toLowerCase()
  const kindFunction = monaco.languages.CompletionItemKind.Function
  const kindMethod = monaco.languages.CompletionItemKind.Method
  const insertRule = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
  const suggestions = []

  const add = (list, defaultKind = kindFunction) => {
    for (const item of list) {
      const label = item.label
      if (word && !label.toLowerCase().startsWith(word)) continue
      suggestions.push({
        label,
        kind: item.kind ?? defaultKind,
        detail: item.detail,
        documentation: { value: item.documentation },
        insertText: item.insertText,
        insertTextRules: item.insertText.includes('${') ? insertRule : undefined
      })
    }
  }

  add(GLOBAL_ITEMS)
  add(NODE_AND_IMAGE_ITEMS, kindMethod)
  return suggestions
}

/**
 * 为 Monaco 注册 QuickJS API 的补全提供者（javascript）
 * @param {typeof import('monaco-editor')} monaco - Monaco 模块（来自 editorWillMount）
 * @returns {import('monaco-editor').IDisposable} 可 dispose 取消注册
 */
export function registerQuickJSCompletions(monaco) {
  if (!monaco || !monaco.languages) return null
  return monaco.languages.registerCompletionItemProvider('javascript', {
    triggerCharacters: ['.'],
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      }
      const raw = buildSuggestions(monaco, word.word)
      const suggestions = raw.map((s) => ({ ...s, range }))
      return { suggestions }
    }
  })
}
