import { defineConfig } from 'vitepress'
import { tabsMarkdownPlugin } from 'vitepress-plugin-tabs'
import colorTextPlugin from './plugins/colorText.js'
import imageThumbnailPlugin from './plugins/imageThumbnail.mjs'
import preserveBlankLinesPlugin from './plugins/preserveBlankLines.js'
import tableEnhancePlugin from './plugins/tableEnhance.js'
import markdownItAttrs from 'markdown-it-attrs'
import { loadImageThumbnailManifest } from './image-thumbnail-utils.mjs'

const imageThumbnailManifest = loadImageThumbnailManifest()

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "幻梦Bot",
  lang: 'zh-CN',
  cleanUrls: true,
  sitemap: {
    hostname: 'https://xbdqwq.com',
    transformItems: items => items.filter(item => item.url !== 'search/')
  },
  /** 首屏按系统偏好切换深色/浅色，并注入 check-dark-mode 避免闪烁；用户手动切换后会写入 localStorage 固定偏好。 */
  appearance: true,
  description: "QQ幻梦机器人的说明文档",
  head: [
    ['meta', { name: 'viewport', content: 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/favicon.png' }],
    // 为方便爬虫机器人能够爬取到网页信息，这里要设置一些属性
    ['meta', { property: 'og:title', content: '幻梦Bot' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:description', content: 'QQ幻梦机器人的说明文档' }],
    ['meta', { property: 'og:image', content: 'https://xbdqwq.com/img/hm_icon.png' }],
    ['meta', { property: 'og:site_name', content: '幻梦Bot' }],
    ['meta', { name: 'twitter:card', content: 'summary' }],
    ['meta', { name: 'twitter:title', content: '幻梦Bot' }],
    ['meta', { name: 'twitter:description', content: 'QQ幻梦机器人的说明文档' }],
    ['meta', { name: 'twitter:image', content: 'https://xbdqwq.com/img/hm_icon.png' }],
    ['link', { rel: 'alternate', type: 'text/plain', href: '/llms.txt', title: 'Huanmeng Bot AI Documentation Index' }],
    ['link', { rel: 'alternate', type: 'text/plain', href: '/llms-full.txt', title: 'Huanmeng Bot Full Documentation Text' }],
    ['script', { type: 'application/ld+json' }, JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: '幻梦Bot 文档',
      alternateName: 'Huanmeng Bot Documentation',
      url: 'https://xbdqwq.com/',
      description: 'QQ 幻梦机器人的官方使用文档',
      inLanguage: 'zh-CN',
      hasPart: [
        {
          '@type': 'CreativeWork',
          name: 'Huanmeng Bot AI Documentation Index',
          url: 'https://xbdqwq.com/llms.txt',
          encodingFormat: 'text/plain'
        },
        {
          '@type': 'CreativeWork',
          name: 'Huanmeng Bot Full Documentation Text',
          url: 'https://xbdqwq.com/llms-full.txt',
          encodingFormat: 'text/plain'
        }
      ]
    })],
    // 明确告知爬虫与 AI Bot 允许索引本站内容
    ['meta', { name: 'robots', content: 'index, follow' }],
    ['meta', { name: 'googlebot', content: 'index, follow' }],
    // 声明页面语言，有助于 AI 爬虫正确识别内容
    ['meta', { 'http-equiv': 'content-language', content: 'zh-CN' }]
  ],
  themeConfig: {
    notFound: {
      code: '404',
      title: '未找到对应页面',
      quote: '很抱歉，您访问的页面不存在。',
      linkLabel: '返回首页',
      linkText: '返回首页'
    }
  },
  markdown: {
    math: true,
    // 需要注册 vitepress-plugin-tabs 的 markdown-it 插件，以支持 ::: tabs 语法
    config(md) {
      // 让 Markdown 中的单个文本换行也渲染为 <br>
      md.set({ breaks: true })
      md.use(tabsMarkdownPlugin)
      md.use(colorTextPlugin)
      md.use(preserveBlankLinesPlugin)
      md.use(tableEnhancePlugin)
      md.use(markdownItAttrs)
      md.use(imageThumbnailPlugin, { manifest: imageThumbnailManifest })
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
      /* 每次构建清空 dist，避免旧哈希资产无限堆积。
         .htaccess / error.html 等部署文件已移入 src/public/，
         构建时会自动拷回 dist 根目录，不会丢失。 */
      emptyOutDir: true
    }
  }
})
