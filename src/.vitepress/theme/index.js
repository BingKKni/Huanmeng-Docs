import Layout from './Layout.vue'
import '@fontsource-variable/inter/wght.css'
import '@fontsource/noto-sans-sc/chinese-simplified-400.css'
import '@fontsource/noto-sans-sc/chinese-simplified-500.css'
import '@fontsource/noto-sans-sc/chinese-simplified-600.css'
import './style.css'
import { enhanceAppWithTabs } from 'vitepress-plugin-tabs/client'

/** @type {import('vitepress').Theme} */
export default {
  Layout,
  enhanceApp({ app, router, siteData }) {
    // 注册 vitepress-plugin-tabs 的 Vue 组件
    enhanceAppWithTabs(app)
  }
}
