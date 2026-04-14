// https://vitepress.dev/guide/custom-theme
import 'bootstrap/dist/css/bootstrap.min.css'

import '@fontsource/noto-sans-sc/400.css'
import '@fontsource/noto-sans-sc/500.css'
import '@fontsource/noto-sans-sc/700.css'
import Layout from './Layout.vue'
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

