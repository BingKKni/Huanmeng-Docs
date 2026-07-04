import Layout from './Layout.vue'
import '@fontsource-variable/inter/wght.css'
/* 可变字体 + unicode-range 分片：一个分片文件覆盖 100–900 全部字重，
   浏览器只下载页面实际用到的片；标题可用 550 这类中间字重。 */
import '@fontsource-variable/noto-sans-sc/index.css'
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
