# DevTools

基于 Vue 3 + PrimeVue + Pinia + TailwindCSS 的桌面端应用工程。

## 技术栈

- **Vue 3** - 渐进式 JavaScript 框架
- **Vite** - 下一代前端构建工具
- **PrimeVue** - 丰富的 Vue UI 组件库
- **Pinia** - Vue 状态管理
- **TailwindCSS** - 原子化 CSS 框架

> 本工程仅针对电脑端设计，不考虑移动端适配。

## 开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

## 项目结构

```
src/
├── assets/       # 静态资源
├── components/   # 可复用组件
├── stores/       # Pinia 状态管理
├── App.vue       # 根组件
├── main.js       # 入口文件
└── style.css     # 全局样式
```
