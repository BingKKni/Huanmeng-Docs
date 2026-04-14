import { defineConfig } from 'vitepress'
import { tabsMarkdownPlugin } from 'vitepress-plugin-tabs'
import colorTextPlugin from './plugins/colorText.js'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "幻梦Bot",
  cleanUrls: true,
  description: "QQ幻梦机器人的说明文档",
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/img/hm_icon.png' }],
    // 为方便爬虫机器人能够爬取到网页信息，这里要设置一些属性
    ['meta', { property: 'og:title', content: '幻梦Bot' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:description', content: 'QQ幻梦机器人的说明文档' }],
    ['meta', { property: 'og:image', content: 'https://xbdqwq.com/img/hm_icon.png' }],
    ['meta', { property: 'og:site_name', content: '幻梦Bot' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: '幻梦Bot' }],
    ['meta', { name: 'twitter:description', content: 'QQ幻梦机器人的说明文档' }],
    ['meta', { name: 'twitter:image', content: 'https://xbdqwq.com/img/hm_icon.png' }]
  ],
  markdown: {
    // 需要注册 vitepress-plugin-tabs 的 markdown-it 插件，以支持 ::: tabs 语法
    config(md) {
      // 让 Markdown 中的单个文本换行也渲染为 <br>
      md.set({ breaks: true })
      md.use(tabsMarkdownPlugin)
      md.use(colorTextPlugin)
    },
    container: {
      tipLabel: '提示',
      warningLabel: '注意',
      dangerLabel: '注意',
      infoLabel: '信息'
    }
  },
  vite: {
    build: {
      // Preserve existing deployment files like .user.ini in the output directory.
      emptyOutDir: false
    }
  }
})
