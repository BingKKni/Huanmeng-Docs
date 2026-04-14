<script setup>
import { useData, useRouter, withBase, onContentUpdated } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue'
import SidebarNavItem from './components/SidebarNavItem.vue'


const { site, frontmatter, page } = useData()

const tocHeaders = ref([])
const activeTocId = ref('')
const tocIndicatorStyle = ref({ transform: 'translateY(0)', height: '0', opacity: '0' })

watch(activeTocId, async (newId) => {
  if (!newId) {
    tocIndicatorStyle.value.opacity = '0'
    return
  }
  await nextTick()
  try {
    const idSelector = CSS.escape(newId)
    const linkEl = document.querySelector(`.toc-nav .toc-link[href="#${idSelector}"]`) || document.querySelector(`.toc-nav .toc-link[href="#${newId}"]`)
    if (linkEl) {
      const pillHeight = 16;
      const topOffset = linkEl.offsetTop + (linkEl.offsetHeight - pillHeight) / 2;
      tocIndicatorStyle.value = {
        transform: `translateY(${topOffset}px)`,
        height: `${pillHeight}px`,
        opacity: '1'
      }
    } else {
      tocIndicatorStyle.value.opacity = '0'
    }
  } catch(e) {
    tocIndicatorStyle.value.opacity = '0'
  }
}, { immediate: true })

function updateActiveToc() {
  const headers = tocHeaders.value
  if (headers.length === 0) {
    activeTocId.value = ''
    return
  }
  
  // 增加触底检测：如果滚动到了页面底部，则直接选中最后一个标题
  const scrollHeight = document.documentElement.scrollHeight
  const scrollTop = window.scrollY
  const clientHeight = document.documentElement.clientHeight
  if (scrollTop + clientHeight >= scrollHeight - 30) {
    activeTocId.value = headers[headers.length - 1].id
    return
  }

  let currentId = ''
  for (let i = 0; i < headers.length; i++) {
    const el = document.getElementById(headers[i].id)
    if (el) {
      const top = el.getBoundingClientRect().top
      if (top <= 120) { // 阈值调整，避开可能存在的加厚顶栏
        currentId = headers[i].id
      } else {
        break
      }
    }
  }
  activeTocId.value = currentId
}

let tocScrollTimeout = null
function handleTocScroll() {
  if (tocScrollTimeout) return
  updateActiveToc()
}

onContentUpdated(() => {
  if (!docArticleRef.value) {
    tocHeaders.value = []
    return
  }
  const headings = Array.from(docArticleRef.value.querySelectorAll('h1, h2, h3, h4'))
  if (headings.length === 0) {
    tocHeaders.value = []
    return
  }
  tocHeaders.value = headings.map(h => {
    let title = h.textContent.trim()
    if (title.endsWith('#')) title = title.substring(0, title.length - 1).trim()
    return {
      id: h.id,
      level: parseInt(h.tagName.charAt(1)),
      title: title
    }
  })
  nextTick(() => {
    updateActiveToc()
  })
})

function easeInOutQuint(t) {
  return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2;
}

function smoothScrollTo(endY, duration, callback) {
  const startY = window.scrollY;
  const distanceY = endY - startY;
  const startTime = performance.now();

  function step(time) {
    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = easeInOutQuint(progress);
    
    window.scrollTo(0, startY + distanceY * ease);

    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      if (callback) callback();
    }
  }
  requestAnimationFrame(step);
}

function scrollToToc(id) {
  const el = document.getElementById(id)
  if (el) {
    if (tocScrollTimeout) clearTimeout(tocScrollTimeout)
    activeTocId.value = id
    
    const top = el.getBoundingClientRect().top + window.scrollY - 120 // offset for site header
    const distance = Math.abs(top - window.scrollY)
    const duration = Math.min(Math.max(distance * 0.25, 300), 650)
    
    smoothScrollTo(top, duration, () => {
      el.classList.remove('heading-flash')
      void el.offsetWidth
      el.classList.add('heading-flash')
      setTimeout(() => {
        el.classList.remove('heading-flash')
      }, 1200)
    })
    
    // 锁定 activeTocId，防止平滑滚动过程中由于阈值判断导致的高亮“回跳”
    tocScrollTimeout = setTimeout(() => {
      tocScrollTimeout = null
    }, duration + 50)
  }
}

const shouldShowTOC = computed(() => {
  return shouldShowDesktopSidebar.value && sidebarSpaceEnough.value && tocHeaders.value.length > 0
})
// --- Search Logic ---
const rawDocs = import.meta.glob('../../docs/**/*.md', { query: '?raw', import: 'default', eager: true })
const searchActive = ref(false)
const searchQuery = ref('')
const searchInputRef = ref(null)
const mobileSearchInputRef = ref(null)
const globalSearchModalActive = ref(false)
const globalSearchInputRef = ref(null)

// Regex patterns pre-compiled
const mdStripRegexes = [
  { p: /^---[\s\S]*?^---/m, r: '' }, // strip frontmatter
  { p: /```[\s\S]*?```/g, r: '' }, // strip code blocks
  { p: /`([^`]+)`/g, r: '$1' }, // inline code
  { p: /<[^>]*>/g, r: '' }, // html
  { p: /!\[[^\]]*\]\([^)]*\)/g, r: '' }, // images
  { p: /\[([^\]]+)\]\([^)]+\)/g, r: '$1' }, // links
  { p: /^#{1,6}\s+/gm, r: '' }, // ATX headers
  { p: /^==\s+/gm, r: '' }, // strip tab markers
  { p: /(?:\*\*|__)(.*?)(?:\*\*|__)/g, r: '$1' }, // bold
  { p: /(?:\*|_)(.*?)(?:\*|_)/g, r: '$1' }, // italic
  { p: /^\s*>\s+/gm, r: '' }, // blockquotes
  { p: /^\s*[-*+]\s+/gm, r: '' }, // lists
  { p: /^\s*\d+\.\s+/gm, r: '' }, // ordered lists
  { p: /^:::\s*\w*.*$/gm, r: '' }, // custom blocks
  { p: /:::/g, r: '' },
  { p: /\n+/g, r: ' ' } // condense newlines
]

function stripMarkdown(str) {
  let result = str
  for (const { p, r } of mdStripRegexes) {
    result = result.replace(p, r)
  }
  return result.trim()
}

// Compute allDocsContent once since rawDocs doesn't change during navigation
let cachedAllDocsContent = null
function sidebarItemHasChildren(item) {
  return Array.isArray(item.children) && item.children.length > 0
}

function flattenSidebarLinks(items) {
  return items.flatMap(item => [
    item,
    ...(sidebarItemHasChildren(item) ? flattenSidebarLinks(item.children) : [])
  ])
}

function getAllDocsContent() {
  if (cachedAllDocsContent) return cachedAllDocsContent
  const arr = []
  const searchableLinks = [...navLinks, ...flattenSidebarLinks(desktopSidebarLinks)]
  for (const path in rawDocs) {
    const rawContent = rawDocs[path] || ''
    
    let link = path.replace('../../', '/')
    link = link.replace(/\.md$/, '.html')
    if (link.endsWith('/index.html')) {
      link = link.replace('/index.html', '/')
    }
    
    let title = ''
    try {
      for (const item of searchableLinks) {
         const itemHrefBase = item.href.replace(/\/$/, '')
         const linkBase = link.replace(/\/$/, '')
         if (itemHrefBase === linkBase) {
            title = item.label
            break
         }
      }
    } catch { /* ignore */ }
    
    if (!title) {
       const titleMatch = rawContent.match(/^#\s+(.*)/m)
       if (titleMatch) {
          title = titleMatch[1].trim()
       } else {
          const h2Match = rawContent.match(/^##\s+(.*)/m)
          if (h2Match) {
             title = h2Match[1].trim()
          } else {
             const parts = path.split('/')
             const filename = parts[parts.length - 1].replace(/\.md$/, '')
             title = filename === 'index' ? parts[parts.length - 2] || '首页' : filename
          }
       }
    }
    
    const content = stripMarkdown(rawContent)
    arr.push({ title, link, content })
  }
  cachedAllDocsContent = arr
  return arr
}

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []
  const query = searchQuery.value.toLowerCase()
  const results = []
  const docs = getAllDocsContent()
  
  for (let i = 0, len = docs.length; i < len; i++) {
    const doc = docs[i]
    const rawContent = doc.content
    const lowerContent = rawContent.toLowerCase()
    
    let index = lowerContent.indexOf(query)
    if (index !== -1) {
      const snippetStart = Math.max(0, index - 30)
      const snippetEnd = Math.min(rawContent.length, index + query.length + 40)
      
      let snippetBefore = rawContent.substring(snippetStart, index)
      if (snippetStart > 0) snippetBefore = '...' + snippetBefore
      
      let snippetMatch = rawContent.substring(index, index + query.length)
      
      let snippetAfter = rawContent.substring(index + query.length, snippetEnd)
      if (snippetEnd < rawContent.length) snippetAfter = snippetAfter + '...'
      
      results.push({
        title: doc.title,
        link: doc.link,
        snippetBefore,
        match: snippetMatch,
        snippetAfter
      })
      if (results.length >= 10) break // limit to top 10 results for better performance
    }
  }
  return results
})

function handleResultClick() {
  searchQuery.value = ''
  searchActive.value = false
  closeMobileMenu()
}

function handleSearchIconClick() {
  if (!searchActive.value) {
    searchActive.value = true
    nextTick(() => {
      searchInputRef.value?.focus()
    })
  } else {
    searchActive.value = false
    searchQuery.value = ''
  }
}

function handleMobileSearchClick() {
  if (isMobileViewport()) {
    if (!menuOpen.value) {
      menuOpen.value = true
      nextTick(() => {
        mobileSearchInputRef.value?.focus()
      })
    } else {
      mobileSearchInputRef.value?.focus()
    }
  } else {
    // Desktop Home fallback
    globalSearchModalActive.value = true
    nextTick(() => {
      globalSearchInputRef.value?.focus()
    })
  }
}

function closeGlobalSearch() {
  globalSearchModalActive.value = false
  searchQuery.value = ''
}
function handleSearchBlur() {
  setTimeout(() => {
    if (!searchQuery.value && searchActive.value && document.activeElement !== searchInputRef.value) {
      searchActive.value = false
    }
  }, 150)
}


const navLinks = [
  { href: '/', label: '首页', isActive: relativePath => relativePath === 'index.md' },
  {
    href: '/docs/',
    label: '机器人文档',
    isActive: relativePath => relativePath === 'docs/index.md' || relativePath.startsWith('docs/')
  },
  {
    href: 'https://github.com/BingKKni/Huanmeng-Docs',
    label: 'Github',
    isExternal: true,
    isActive: () => false
  }
]

/* 侧边栏定义 */
const desktopSidebarLinks = [
  { href: '/docs/', label: '🏠 首页', isActive: relativePath => relativePath === 'docs/index.md' },
  { 
    href: '/docs/entertainment/', 
    label: '✨ 娱乐功能', 
    isActive: relativePath => relativePath === 'docs/entertainment/index.md',
    hasAnyActive: relativePath => relativePath === 'docs/entertainment/index.md' || relativePath.startsWith('docs/entertainment/'),
    children: [
      { href: '/docs/entertainment/signin', label: '打卡', isActive: relativePath => relativePath === 'docs/entertainment/signin.md' },
      { href: '/docs/entertainment/fortune', label: '运势', isActive: relativePath => relativePath === 'docs/entertainment/fortune.md' },
      { href: '/docs/entertainment/sence', label: '好感度', isActive: relativePath => relativePath === 'docs/entertainment/sence.md' },
      {
        href: '/docs/entertainment/ctc/',
        label: '圈小猫',
        isActive: relativePath => relativePath === 'docs/entertainment/ctc/index.md',
        hasAnyActive: relativePath => relativePath.startsWith('docs/entertainment/ctc/'),
        children: [
          {
            href: '/docs/entertainment/ctc/multiplayer',
            label: '多人模式',
            isActive: relativePath => relativePath === 'docs/entertainment/ctc/multiplayer.md'
          }
        ]
      },
      { href: '/docs/entertainment/random_image', label: '随机图', isActive: relativePath => relativePath === 'docs/entertainment/random_image.md' },
      { href: '/docs/entertainment/paint_bomb', label: '油漆炸弹', isActive: relativePath => relativePath === 'docs/entertainment/paint_bomb.md' },
      { href: '/docs/entertainment/twenty_four_points', label: '二十四点', isActive: relativePath => relativePath === 'docs/entertainment/twenty_four_points.md' },
      { href: '/docs/entertainment/word_chain', label: '词汇接龙', isActive: relativePath => relativePath === 'docs/entertainment/word_chain.md' }
    ]
  },
  { 
    href: '/docs/delta_force/', 
    label: '🗺️ 三角洲行动攻略', 
    isActive: relativePath => relativePath === 'docs/delta_force/index.md',
    hasAnyActive: relativePath => relativePath === 'docs/delta_force/index.md' || relativePath.startsWith('docs/delta_force/'),
    children: [
      { href: '/docs/delta_force/password', label: '每日密码门位置', isActive: relativePath => relativePath === 'docs/delta_force/password.md' }
    ]
  },
  { 
    href: '/docs/faq/', 
    label: '❓ 常见问题FAQ', 
    isActive: relativePath => relativePath === 'docs/faq/index.md',
    hasAnyActive: relativePath => relativePath === 'docs/faq/index.md' || relativePath.startsWith('docs/faq/'),
    children: [
      { href: '/docs/faq/appeal', label: '封禁申诉', isActive: relativePath => relativePath === 'docs/faq/appeal.md' }
    ]
  },
  { href: '/docs/support', label: '🧋 支持幻梦', isActive: relativePath => relativePath === 'docs/support.md' },
]

const currentYear = new Date().getFullYear()
/** 文档/首页切换时驱动淡入淡出（与导航切换同一套 key） */
const docContentTransitionKey = computed(() =>
  frontmatter.value.home ? 'vp-route-home' : page.value.relativePath
)

const currentPageLabel = computed(() => {
  const activeLink = navLinks.find(link => link.isActive(page.value.relativePath))
  return activeLink?.label || page.value.title || site.value.title
})
const shouldShowDesktopSidebar = computed(() => page.value.relativePath.startsWith('docs/'))

const mobileSidebarOpen = ref(false)
const menuOpen = ref(false)
/** 关闭菜单时延迟到面板收起动画结束再撤掉顶栏 overflow，否则下拉层会被立刻裁掉 */
const mobileNavClosingHold = ref(false)
let mobileNavCloseFallbackTimer = null
const mobileHeaderHidden = ref(false)
const mobileHeaderElevated = ref(false)
const isMobileView = ref(false)
const sidebarSpaceEnough = ref(true)

const lightboxSrc = ref('')
const lightboxVisible = ref(false)
const lightboxScale = ref(1)
const lightboxPhase = ref('closed')
const lightboxBackdropOpacity = ref(0)
const lightboxRootRef = ref(null)
const lightboxFlipRef = ref(null)
const lightboxImgRef = ref(null)
/** 文档页 `<article class="doc-article">`，避免 `querySelector` 命中过渡中错误的节点 */
const docArticleRef = ref(null)
const siteHeaderRef = ref(null)
const mainContainerRef = ref(null)
const infoDialogVisible = ref(false)
const infoDialogTitle = ref('信息')
const infoDialogMessage = ref('')
const infoDialogShowCancel = ref(false)
let infoDialogOnConfirm = null
const infoDialogConfirmButton = ref(null)
const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)'
/** 与 Bootstrap `d-lg-block` / style.css 中桌面侧栏媒体查询一致 */
const DESKTOP_SIDEBAR_MEDIA_QUERY = '(min-width: 992px)'
const DESKTOP_SIDEBAR_WIDTH_PX = 240
const DESKTOP_MAIN_SHIFT_X = 10
const DESKTOP_SIDEBAR_SHIFT_X = -30 // Not used anymore but kept to avoid breaking other things if any
const DESKTOP_SIDEBAR_GAP = 40
const DESKTOP_SIDEBAR_SHIFT_Y = 0
/** 与 style.css 中 .mobile-nav 的 grid-template-rows 时长一致 */
const MOBILE_NAV_PANEL_MS = 300
const MOBILE_NAV_CLOSE_FALLBACK_MS = MOBILE_NAV_PANEL_MS + 100
const MOBILE_HEADER_SCROLL_DELTA = 8
const LIGHTBOX_SCALE_MIN = 1
const DESKTOP_LIGHTBOX_SCALE_MAX = 4
const DESKTOP_LIGHTBOX_SCALE_STEP = 0.2
/** 遮罩最深约 50% 黑 */
const LIGHTBOX_OVERLAY_MAX = 0.5
/** 灯箱打开：位移 + 遮罩淡入 */
const LIGHTBOX_OPEN_ANIM_MS = 300
/** 灯箱关闭：位移 + 遮罩淡出（可单独比打开更短） */
const LIGHTBOX_CLOSE_ANIM_MS = 150
/** 打开：略先快后慢，落地柔和 */
const LIGHTBOX_ANIM_EASE = 'cubic-bezier(0.22, 0.82, 0.24, 1)'
/**
 * 关闭：先快后更快（ease-in）。cubic-bezier(x1,y1,x2,y2)：
 */
const LIGHTBOX_CLOSE_ANIM_EASE = 'cubic-bezier(0.18, 0, 1, 1)'

/** flip 同时 transform + opacity，打开/关闭各用各自的 ms 与 ease */
function lightboxOpenFlipTransition() {
  const d = LIGHTBOX_OPEN_ANIM_MS
  const e = LIGHTBOX_ANIM_EASE
  return `transform ${d}ms ${e}, opacity ${d}ms ${e}`
}

function lightboxCloseFlipTransition() {
  const d = LIGHTBOX_CLOSE_ANIM_MS
  const e = LIGHTBOX_CLOSE_ANIM_EASE
  return `transform ${d}ms ${e}, opacity ${d}ms ${e}`
}

/** 无 FLIP 时仅淡入/淡出，仍共用对应 ms、ease */
function lightboxOpenOpacityOnlyTransition() {
  return `opacity ${LIGHTBOX_OPEN_ANIM_MS}ms ${LIGHTBOX_ANIM_EASE}`
}

function lightboxCloseOpacityOnlyTransition() {
  return `opacity ${LIGHTBOX_CLOSE_ANIM_MS}ms ${LIGHTBOX_CLOSE_ANIM_EASE}`
}

const COPY_BUTTON_RESET_DELAY = 4000
const NAV_ROUTE_PROGRESS_START_MS = 0
const NAV_ROUTE_PROGRESS_PER_SECOND = 60
const NAV_ROUTE_PROGRESS_CAP = 90
const NAV_ROUTE_PROGRESS_TO_100_MS = 320
const NAV_ROUTE_PROGRESS_FADE_MS = 360
const DOC_PAGE_TRANSITION_MS = 240
const DOC_PAGE_FAST_SWITCH_WINDOW_MS = 180
const DOC_PAGE_FAST_SWITCH_DISABLE_ANIM_MS = 420
let lastScrollY = 0
let bodyScrollLocked = false
/** 点击打开时的文档内图片，关闭时优先用其最新 getBoundingClientRect */
let lightboxOriginImg = null
/** 打开瞬间的缩略图矩形，源节点已不在 DOM 时作回退 */
let thumbRectSnapshot = { left: 0, top: 0, width: 0, height: 0 }
let previousBodyOverflow = ''
let imageRowProcessFrame = 0
let imageRowForceProcess = false
const copyButtonResetTimers = new Map()

/** 移动端文档切换顶部进度条（不占文档流） */
const navRouteProgress = ref(0)
const navRouteProgressVisible = ref(false)
const navRouteProgressFading = ref(false)
const navRouteProgressSmooth = ref(false)

let routerProgressPrevBefore = undefined
let routerProgressPrevAfter = undefined
let navRoutePendingKey = null
let navRouteShowTimer = null
let navRouteRaf = null
let navRouteProgressStartedAt = 0
let navRouteCompleteTimer = null
let navRouteFadeResetTimer = null
let docPageTransitionRunId = 0
const docPageTransitionState = new WeakMap()
let lastRouteSwitchStartedAt = 0
let docPageDisableAnimUntil = 0

function routeNavComparableKey(href) {
  try {
    const u = new URL(href, window.location.href)
    return `${u.pathname}${u.search}`
  } catch {
    return href
  }
}

function clearNavRouteProgressTimers() {
  if (navRouteShowTimer != null) {
    clearTimeout(navRouteShowTimer)
    navRouteShowTimer = null
  }
  if (navRouteRaf != null) {
    cancelAnimationFrame(navRouteRaf)
    navRouteRaf = null
  }
  if (navRouteCompleteTimer != null) {
    clearTimeout(navRouteCompleteTimer)
    navRouteCompleteTimer = null
  }
  if (navRouteFadeResetTimer != null) {
    clearTimeout(navRouteFadeResetTimer)
    navRouteFadeResetTimer = null
  }
}

function tickNavRouteProgress() {
  if (!navRoutePendingKey || !navRouteProgressVisible.value) {
    navRouteRaf = null
    return
  }
  const elapsedSec = (performance.now() - navRouteProgressStartedAt) / 1000
  navRouteProgress.value = Math.min(NAV_ROUTE_PROGRESS_CAP, elapsedSec * NAV_ROUTE_PROGRESS_PER_SECOND)
  navRouteRaf = requestAnimationFrame(tickNavRouteProgress)
}

function beginRouteNavProgress(href) {
  clearNavRouteProgressTimers()
  const now = performance.now()
  if (lastRouteSwitchStartedAt && now - lastRouteSwitchStartedAt <= DOC_PAGE_FAST_SWITCH_WINDOW_MS) {
    docPageDisableAnimUntil = now + DOC_PAGE_FAST_SWITCH_DISABLE_ANIM_MS
  }
  lastRouteSwitchStartedAt = now

  navRoutePendingKey = routeNavComparableKey(href)
  navRouteProgress.value = 0
  navRouteProgressVisible.value = false
  navRouteProgressFading.value = false
  navRouteProgressSmooth.value = false

  navRouteShowTimer = window.setTimeout(() => {
    navRouteShowTimer = null
    if (!navRoutePendingKey) return
    navRouteProgressVisible.value = true
    navRouteProgressStartedAt = performance.now()
    navRouteRaf = requestAnimationFrame(tickNavRouteProgress)
  }, NAV_ROUTE_PROGRESS_START_MS)
}

function completeRouteNavProgressByKey(key) {
  if (navRoutePendingKey == null || key !== navRoutePendingKey) return

  navRoutePendingKey = null
  clearNavRouteProgressTimers()

  if (!navRouteProgressVisible.value) {
    navRouteProgress.value = 0
    return
  }

  navRouteProgressSmooth.value = true
  navRouteProgress.value = 100

  navRouteCompleteTimer = window.setTimeout(() => {
    navRouteCompleteTimer = null
    navRouteProgressFading.value = true
    navRouteFadeResetTimer = window.setTimeout(() => {
      navRouteFadeResetTimer = null
      navRouteProgressVisible.value = false
      navRouteProgressFading.value = false
      navRouteProgressSmooth.value = false
      navRouteProgress.value = 0
    }, NAV_ROUTE_PROGRESS_FADE_MS)
  }, NAV_ROUTE_PROGRESS_TO_100_MS)
}

function isActiveLink(link) {
  return link.isActive(page.value.relativePath)
}

function getNavHref(link) {
  if (link.isExternal) return link.href
  return withBase(link.href)
}

function isMobileViewport() {
  return isMobileView.value
}

function syncViewportMode() {
  isMobileView.value = window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

/**
 * 桌面侧栏定位：
 * - 垂直：直接对齐正文容器的视口顶边（cr.top），使侧栏起始高度与正文文档完全一致
 */
function syncDesktopSidebarLayout() {
  if (typeof document === 'undefined') return
  if (!window.matchMedia(DESKTOP_SIDEBAR_MEDIA_QUERY).matches) {
    sidebarSpaceEnough.value = true
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-left')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-top')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-width')
    return
  }

  const containerEl = mainContainerRef.value
  if (!containerEl) return

  const cr = containerEl.getBoundingClientRect()

  const requiredSpace = DESKTOP_SIDEBAR_WIDTH_PX + 15
  if (cr.left < requiredSpace) {
    sidebarSpaceEnough.value = false
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-left')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-top')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-width')
    document.documentElement.style.removeProperty('--hm-desktop-toc-left')
    document.documentElement.style.removeProperty('--hm-desktop-toc-display')
  } else {
    sidebarSpaceEnough.value = true
    // cr.left 包含 style.css 中的 translateX(100px)，先减去正文偏移恢复基准，再加侧栏要求的 120px 偏移
    const baseLeft = cr.left - DESKTOP_MAIN_SHIFT_X
    const left = Math.max(16, Math.round(baseLeft - DESKTOP_SIDEBAR_WIDTH_PX - DESKTOP_SIDEBAR_GAP))
    const top = Math.max(0, Math.round(cr.top)) + DESKTOP_SIDEBAR_SHIFT_Y
    document.documentElement.style.setProperty('--hm-desktop-sidebar-left', `${left}px`)
    document.documentElement.style.setProperty('--hm-desktop-sidebar-top', `${top}px`)
    document.documentElement.style.setProperty('--hm-desktop-sidebar-width', `${DESKTOP_SIDEBAR_WIDTH_PX}px`)
    
    // Calculate right TOC layout
    const tocLeft = Math.round(cr.right) + 40
    document.documentElement.style.setProperty('--hm-desktop-toc-left', `${tocLeft}px`)
    if (tocLeft + 220 > document.documentElement.clientWidth) {
      document.documentElement.style.setProperty('--hm-desktop-toc-display', `none`)
    } else {
      document.documentElement.style.setProperty('--hm-desktop-toc-display', `block`)
    }
  }
}

function clampLightboxScale(scale) {
  const maxScale = isMobileViewport()
    ? LIGHTBOX_SCALE_MIN
    : DESKTOP_LIGHTBOX_SCALE_MAX

  return Math.min(Math.max(scale, LIGHTBOX_SCALE_MIN), maxScale)
}

function syncLightboxScale() {
  if (!lightboxVisible.value) return
  lightboxScale.value = clampLightboxScale(lightboxScale.value)
}

function clearMobileNavCloseFallback() {
  if (mobileNavCloseFallbackTimer != null) {
    clearTimeout(mobileNavCloseFallbackTimer)
    mobileNavCloseFallbackTimer = null
  }
}

function armMobileNavCloseHold() {
  mobileNavClosingHold.value = true
  clearMobileNavCloseFallback()
  mobileNavCloseFallbackTimer = window.setTimeout(() => {
    mobileNavCloseFallbackTimer = null
    mobileNavClosingHold.value = false
    syncBodyScrollLock()
  }, MOBILE_NAV_CLOSE_FALLBACK_MS)
}

function onMobileNavTransitionEnd(e) {
  if (menuOpen.value) return
  if (e.propertyName !== 'grid-template-rows') return
  mobileNavClosingHold.value = false
  clearMobileNavCloseFallback()
  syncBodyScrollLock()
}

/** 顶栏 overflow:visible 与 body 滚动锁：展开或收起过程中都视为「菜单占场」 */
const siteHeaderMobileNavExpanded = computed(
  () => menuOpen.value || mobileNavClosingHold.value
)

function syncBodyScrollLock() {
  const mobileMenuActive =
    isMobileViewport() && (menuOpen.value || mobileNavClosingHold.value)
  const shouldLock = infoDialogVisible.value || lightboxVisible.value || mobileMenuActive || mobileSidebarOpen.value
  if (shouldLock === bodyScrollLocked) return

  if (shouldLock) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    bodyScrollLocked = true
    return
  }

  document.body.style.overflow = previousBodyOverflow
  previousBodyOverflow = ''
  bodyScrollLocked = false
}

function closeMobileMenu() {
  menuOpen.value = false
}

function toggleMobileMenu() {
  menuOpen.value = !menuOpen.value
}

function snapshotRect(r) {
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function getRectCenter(rect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  }
}

function computeUniformFlipTransform(fromRect, toRect) {
  if (
    fromRect.width < 2 ||
    fromRect.height < 2 ||
    toRect.width < 2 ||
    toRect.height < 2
  ) {
    return null
  }

  const fromCenter = getRectCenter(fromRect)
  const toCenter = getRectCenter(toRect)
  const widthRatio = fromRect.width / toRect.width
  const heightRatio = fromRect.height / toRect.height
  const scale = Number((((widthRatio + heightRatio) / 2)).toFixed(6))

  return {
    x: fromCenter.x - toCenter.x,
    y: fromCenter.y - toCenter.y,
    scale
  }
}

function openLightboxWithoutFlyAnimation(src) {
  if (!src) return
  lightboxOriginImg = null
  thumbRectSnapshot = { left: 0, top: 0, width: 0, height: 0 }
  lightboxSrc.value = src
  lightboxScale.value = 1
  lightboxPhase.value = 'open'
  lightboxBackdropOpacity.value = LIGHTBOX_OVERLAY_MAX
  lightboxVisible.value = true
  syncBodyScrollLock()
}

async function openLightbox(src, originEl) {
  if (!src) return
  if (!(originEl instanceof HTMLImageElement)) {
    openLightboxWithoutFlyAnimation(src)
    return
  }

  lightboxOriginImg = originEl
  thumbRectSnapshot = snapshotRect(originEl.getBoundingClientRect())

  lightboxSrc.value = src
  lightboxScale.value = 1
  lightboxPhase.value = 'opening'
  lightboxBackdropOpacity.value = 0
  lightboxVisible.value = true
  syncBodyScrollLock()

  await nextTick()

  const root = lightboxRootRef.value
  const flip = lightboxFlipRef.value
  const img = lightboxImgRef.value

  if (!root || !flip || !img) {
    lightboxPhase.value = 'open'
    lightboxBackdropOpacity.value = LIGHTBOX_OVERLAY_MAX
    return
  }

  /* 在 load/decode 完成前即隐藏根节点，避免异步间隙内闪一帧全尺寸图 */
  root.style.visibility = 'hidden'

  if (!img.complete) {
    await new Promise(resolve => {
      img.addEventListener('load', resolve, { once: true })
      img.addEventListener('error', resolve, { once: true })
    })
  }
  try {
    await img.decode()
  } catch {
    /* 解码失败仍尝试 FLIP */
  }

  await nextTick()

  const last = img.getBoundingClientRect()
  const first = thumbRectSnapshot

  if (last.width < 2 || last.height < 2 || first.width < 2 || first.height < 2) {
    root.style.visibility = ''
    flip.style.transform = ''
    flip.style.transition = 'none'
    flip.style.opacity = '0'
    void flip.offsetWidth
    requestAnimationFrame(() => {
      flip.style.transition = lightboxOpenOpacityOnlyTransition()
      flip.style.opacity = '1'
    })
    lightboxPhase.value = 'open'
    lightboxBackdropOpacity.value = LIGHTBOX_OVERLAY_MAX
    return
  }

  const transform = computeUniformFlipTransform(first, last)
  if (!transform) {
    root.style.visibility = ''
    flip.style.transform = ''
    flip.style.transition = 'none'
    flip.style.opacity = '0'
    void flip.offsetWidth
    requestAnimationFrame(() => {
      flip.style.transition = lightboxOpenOpacityOnlyTransition()
      flip.style.opacity = '1'
    })
    lightboxPhase.value = 'open'
    lightboxBackdropOpacity.value = LIGHTBOX_OVERLAY_MAX
    return
  }

  flip.style.transition = 'none'
  flip.style.opacity = '0'
  flip.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
  root.style.visibility = ''

  let openingDone = false
  const markOpen = () => {
    if (openingDone) return
    openingDone = true
    flip.removeEventListener('transitionend', onOpenEnd)
    lightboxPhase.value = 'open'
    flip.style.transition = ''
    flip.style.transform = ''
    flip.style.opacity = ''
  }
  function onOpenEnd(e) {
    if (e.target !== flip) return
    if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return
    markOpen()
  }
  flip.addEventListener('transitionend', onOpenEnd)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flip.style.transition = lightboxOpenFlipTransition()
      flip.style.transform = 'translate(0, 0) scale(1)'
      flip.style.opacity = '1'
      lightboxBackdropOpacity.value = LIGHTBOX_OVERLAY_MAX
    })
  })

  window.setTimeout(() => {
    if (lightboxPhase.value === 'opening') markOpen()
  }, LIGHTBOX_OPEN_ANIM_MS + 100)
}

function finishCloseLightbox() {
  const flip = lightboxFlipRef.value
  const root = lightboxRootRef.value
  if (flip) {
    flip.style.transition = ''
    flip.style.transform = ''
    flip.style.opacity = ''
  }
  if (root) root.style.visibility = ''

  lightboxVisible.value = false
  lightboxSrc.value = ''
  lightboxScale.value = 1
  lightboxPhase.value = 'closed'
  lightboxBackdropOpacity.value = 0
  lightboxOriginImg = null
  syncBodyScrollLock()
}

function forceCloseLightbox() {
  finishCloseLightbox()
}

function startLightboxCloseAnimation() {
  if (lightboxPhase.value !== 'open') return

  const flip = lightboxFlipRef.value
  const img = lightboxImgRef.value

  const dest = lightboxOriginImg?.isConnected
    ? snapshotRect(lightboxOriginImg.getBoundingClientRect())
    : thumbRectSnapshot

  const destInvalid = dest.width < 2 || dest.height < 2

  if (!flip || !img || destInvalid) {
    lightboxPhase.value = 'closing'
    if (flip) {
      flip.style.transition = 'none'
      flip.style.opacity = '1'
      void flip.offsetWidth
      requestAnimationFrame(() => {
        flip.style.transition = lightboxCloseOpacityOnlyTransition()
        flip.style.opacity = '0'
      })
    }
    lightboxBackdropOpacity.value = 0
    window.setTimeout(finishCloseLightbox, LIGHTBOX_CLOSE_ANIM_MS + 40)
    return
  }

  lightboxPhase.value = 'closing'

  const first = img.getBoundingClientRect()
  if (first.width < 2 || first.height < 2) {
    flip.style.transition = 'none'
    flip.style.opacity = '1'
    void flip.offsetWidth
    requestAnimationFrame(() => {
      flip.style.transition = lightboxCloseOpacityOnlyTransition()
      flip.style.opacity = '0'
    })
    lightboxBackdropOpacity.value = 0
    window.setTimeout(finishCloseLightbox, LIGHTBOX_CLOSE_ANIM_MS + 40)
    return
  }

  const transform = computeUniformFlipTransform(dest, first)
  if (!transform) {
    flip.style.transition = 'none'
    flip.style.opacity = '1'
    void flip.offsetWidth
    requestAnimationFrame(() => {
      flip.style.transition = lightboxCloseOpacityOnlyTransition()
      flip.style.opacity = '0'
    })
    lightboxBackdropOpacity.value = 0
    window.setTimeout(finishCloseLightbox, LIGHTBOX_CLOSE_ANIM_MS + 40)
    return
  }

  flip.style.transition = 'none'
  flip.style.transform = 'translate(0, 0) scale(1)'
  flip.style.opacity = '1'
  void flip.offsetWidth

  let closingDone = false
  const done = () => {
    if (closingDone) return
    closingDone = true
    flip.removeEventListener('transitionend', onCloseEnd)
    finishCloseLightbox()
  }
  function onCloseEnd(e) {
    if (e.target !== flip) return
    if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return
    done()
  }
  flip.addEventListener('transitionend', onCloseEnd)

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      flip.style.transition = lightboxCloseFlipTransition()
      flip.style.transform = `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`
      flip.style.opacity = '0'
      lightboxBackdropOpacity.value = 0
    })
  })

  window.setTimeout(() => {
    if (lightboxPhase.value === 'closing') done()
  }, LIGHTBOX_CLOSE_ANIM_MS + 100)
}

function handleDocumentKeydown(e) {
  // --- Intercept Ctrl+F and Ctrl+K ---
  const isSearchKey = (e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'f' || e.key.toLowerCase() === 'k')
  if (isSearchKey) {
    e.preventDefault()
    if (isMobileViewport() || (shouldShowDesktopSidebar.value && !sidebarSpaceEnough.value)) {
      if (shouldShowDesktopSidebar.value && !sidebarSpaceEnough.value) {
        if (!mobileSidebarOpen.value) {
          mobileSidebarOpen.value = true
        }
        nextTick(() => {
          searchInputRef.value?.focus()
        })
      } else {
        handleMobileSearchClick()
      }
    } else if (shouldShowDesktopSidebar.value) {
      if (!searchActive.value) {
        handleSearchIconClick()
      } else {
        searchInputRef.value?.focus()
      }
    } else {
      // Fallback for pages without sidebar (e.g. Home)
      handleMobileSearchClick()
    }
    return
  }

  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    const article = docArticleRef.value
    const tab = e.target?.closest?.('button.plugin-tabs--tab')
    if (article && tab && article.contains(tab)) {
      nextTick(() => scheduleImageRowProcessing(true))
    }
  }

  if (e.key !== 'Escape') return

  if (infoDialogVisible.value) {
    closeInfoDialog()
    return
  }

  if (lightboxVisible.value) {
    if (lightboxPhase.value === 'closing') return
    if (lightboxPhase.value === 'opening') {
      forceCloseLightbox()
      return
    }
    startLightboxCloseAnimation()
    return
  }

  if (globalSearchModalActive.value) {
    closeGlobalSearch()
    return
  }

  if (menuOpen.value) closeMobileMenu()
}

function handleLightboxClick() {
  if (lightboxPhase.value !== 'open') return
  startLightboxCloseAnimation()
}

function handleDesktopLightboxWheel(e) {
  if (isMobileViewport()) return
  if (lightboxPhase.value !== 'open') return

  const scaleDelta = e.deltaY < 0
    ? DESKTOP_LIGHTBOX_SCALE_STEP
    : -DESKTOP_LIGHTBOX_SCALE_STEP

  lightboxScale.value = clampLightboxScale(
    Number((lightboxScale.value + scaleDelta).toFixed(2))
  )
}

function resetMobileHeaderState() {
  mobileHeaderHidden.value = false
  lastScrollY = Math.max(window.scrollY || 0, 0)
  mobileHeaderElevated.value = lastScrollY > 12
}

function handleMobileHeaderScroll() {
  if (!isMobileViewport()) {
    resetMobileHeaderState()
    return
  }

  const currentScrollY = Math.max(window.scrollY || 0, 0)
  mobileHeaderElevated.value = currentScrollY > 12

  if (menuOpen.value || mobileNavClosingHold.value || currentScrollY <= 12) {
    mobileHeaderHidden.value = false
    lastScrollY = currentScrollY
    return
  }

  const delta = currentScrollY - lastScrollY
  if (Math.abs(delta) < MOBILE_HEADER_SCROLL_DELTA) return

  mobileHeaderHidden.value = delta > 0
  lastScrollY = currentScrollY
}

function handleWindowResize() {
  syncViewportMode()
  syncLightboxScale()
  syncDesktopSidebarLayout()

  if (!isMobileViewport()) {
    clearMobileNavCloseFallback()
    closeMobileMenu()
    mobileNavClosingHold.value = false
  }
  syncBodyScrollLock()
  scheduleImageRowProcessing(true)

  if (!isMobileViewport()) {
    resetMobileHeaderState()
    return
  }

  lastScrollY = Math.max(window.scrollY || 0, 0)
  mobileHeaderElevated.value = lastScrollY > 12
}

function isImageOnlyParagraph(p) {
  return Array.from(p.childNodes).every(n => {
    if (n.nodeType === 8) return true
    if (n.nodeType === 3 && n.textContent.trim() === '') return true
    if (n.nodeType === 1 && n.tagName === 'IMG') return true
    if (n.nodeType === 1 && n.tagName === 'A') {
      return (
        n.childNodes.length === 1 &&
        n.firstChild.nodeType === 1 &&
        n.firstChild.tagName === 'IMG'
      )
    }
    return false
  })
}

function bindLightboxTrigger(img) {
  if (img.dataset.hmLightboxBound === '1') return
  img.dataset.hmLightboxBound = '1'
  img.style.cursor = 'pointer'
  img.addEventListener('click', () => openLightbox(img.src, img))
}

function openInfoDialog(message, title = '信息', onConfirm = null, showCancel = false) {
  infoDialogTitle.value = title
  infoDialogMessage.value = message
  infoDialogOnConfirm = onConfirm
  infoDialogShowCancel.value = !!(showCancel.value ?? showCancel)
  infoDialogVisible.value = true
  syncBodyScrollLock()
}

function handleInfoDialogConfirm() {
  const onConfirm = infoDialogOnConfirm
  if (typeof onConfirm === 'function') {
    onConfirm()
  }
  closeInfoDialog()
}

function closeInfoDialog() {
  infoDialogVisible.value = false
  infoDialogOnConfirm = null
  infoDialogShowCancel.value = false
  syncBodyScrollLock()
}

function updateCopyButtonLabel(button, state) {
  const labelMap = {
    idle: '复制代码',
    success: '复制成功',
    error: '复制失败'
  }
  const label = labelMap[state] || labelMap.idle
  button.setAttribute('aria-label', label)
  button.setAttribute('title', label)
}

function setCopyButtonState(button, state) {
  const existingTimer = copyButtonResetTimers.get(button)
  if (existingTimer) {
    clearTimeout(existingTimer)
    copyButtonResetTimers.delete(button)
  }

  button.dataset.copyState = state
  updateCopyButtonLabel(button, state)

  if (state === 'idle') return

  const resetTimer = window.setTimeout(() => {
    if (document.body.contains(button)) {
      button.dataset.copyState = 'idle'
      updateCopyButtonLabel(button, 'idle')
    }
    copyButtonResetTimers.delete(button)
  }, COPY_BUTTON_RESET_DELAY)

  copyButtonResetTimers.set(button, resetTimer)
}

async function ensureClipboardWritable() {
  if (!navigator.clipboard?.writeText) {
    throw new Error('clipboard-unavailable')
  }

  if (!navigator.permissions?.query) return

  try {
    const permissionStatus = await navigator.permissions.query({ name: 'clipboard-write' })
    if (permissionStatus.state === 'denied') {
      throw new Error('clipboard-denied')
    }
  } catch (error) {
    if (error?.message === 'clipboard-denied') throw error
  }
}

function getCodeBlockText(block) {
  const code = block.querySelector('pre code')
  return code?.textContent?.replace(/\n$/, '') || ''
}

async function handleCopyButtonClick(block, button) {
  const code = getCodeBlockText(block)

  try {
    await ensureClipboardWritable()
    await navigator.clipboard.writeText(code)
    setCopyButtonState(button, 'success')
    openInfoDialog('复制成功!')
  } catch (error) {
    setCopyButtonState(button, 'error')
    openInfoDialog('复制失败，请授予剪贴板写入权限!', '提示')
  }
}

function bindCodeBlockCopy(block) {
  let button = block.querySelector(':scope > .copy')
  if (!button) {
    button = document.createElement('button')
    button.type = 'button'
    button.className = 'copy'
    block.appendChild(button)
  }

  if (button.dataset.hmCopyBound === '1') {
    if (!button.dataset.copyState) setCopyButtonState(button, 'idle')
    return
  }

  button.type = 'button'
  button.dataset.hmCopyBound = '1'
  setCopyButtonState(button, 'idle')
  button.addEventListener('click', e => {
    e.preventDefault()
    e.stopPropagation()
    handleCopyButtonClick(block, button)
  })
}

function processCodeBlocks() {
  document.querySelectorAll(".site-shell div[class*='language-']").forEach(bindCodeBlockCopy)
}

function bindJoinGroupButtons(root = null) {
  const container = root ?? docArticleRef.value
  if (!container) return
  container.querySelectorAll('.group-join-btn').forEach(btn => {
    if (btn.dataset.hmConfirmBound === '1') return
    btn.dataset.hmConfirmBound = '1'
    btn.addEventListener('click', e => {
      e.preventDefault()
      const href = btn.href
      const target = btn.target || '_blank'
      openInfoDialog(
        '即将跳转到 幻梦丨🈲广商丨③群，是否确认？',
        '提示',
        () => {
          window.open(href, target)
        },
        true
      )
    })
  })
}

function processContentActions(root = null) {
  processCodeBlocks()
  bindJoinGroupButtons(root)
}

function scheduleImageRowProcessing(force = false) {
  imageRowForceProcess = imageRowForceProcess || force

  if (imageRowProcessFrame) {
    window.cancelAnimationFrame(imageRowProcessFrame)
  }

  imageRowProcessFrame = window.requestAnimationFrame(() => {
    void processImageRowsAsync({ force: imageRowForceProcess })
    imageRowForceProcess = false
    imageRowProcessFrame = 0
  })
}

/**
 * vitepress-plugin-tabs 非当前面板用 v-if 卸载，切换标签会挂载全新 DOM；
 * 须在激活后重新跑图片行布局逻辑，否则仅首屏标签会正确计算图片行高度。
 * 键盘切换见 handleDocumentKeydown（左右箭头）。
 */
function handleVitepressPluginTabClick(ev) {
  const article = docArticleRef.value
  if (!article) return
  const tab = ev.target?.closest?.('button.plugin-tabs--tab')
  if (!tab || !article.contains(tab)) return
  nextTick(() => scheduleImageRowProcessing(true))
}

function nextDoubleRaf() {
  return new Promise(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(resolve))
  })
}

function applyMultiImageRowHeights(p, imgs) {
  const IMG_ROW_GAP_PX = 12
  const containerWidth = p.clientWidth
  const availWidth = containerWidth - IMG_ROW_GAP_PX * (imgs.length - 1)
  const eachWidth = availWidth / imgs.length
  const heights = imgs.map(img => {
    if (img.naturalWidth === 0) return Infinity
    return eachWidth * (img.naturalHeight / img.naturalWidth)
  })
  const minHeight = Math.min(...heights.filter(h => h !== Infinity && h > 0))
  const targetHeight = minHeight > 0 && isFinite(minHeight) ? Math.round(minHeight) : null

  imgs.forEach(img => {
    bindLightboxTrigger(img)

    if (targetHeight) {
      img.style.height = `${targetHeight}px`
      img.style.objectFit = 'cover'
      return
    }

    img.style.removeProperty('height')
    img.style.removeProperty('object-fit')
  })
}

/**
 * 应用文档内多图行等样式；多图会等 decode 后再算高。
 * @param {HTMLElement | null} [root] 过渡 enter 时传入当前 article，避免 ref 尚未同步。
 */
async function processImageRowsAsync({ force = false, root = null } = {}) {
  const article = root ?? docArticleRef.value
  if (!article) return

  // 1. 先确保文档内的所有图片都绑定了灯箱
  article.querySelectorAll('img').forEach(img => {
    bindLightboxTrigger(img)
  })

  // 2. 然后处理「纯图片段落」的多图并排布局
  const pending = []
  article.querySelectorAll('p').forEach(p => {
    if (!force && p.dataset.hmProcessedRow) return

    const imgs = Array.from(p.querySelectorAll('img'))
    // 只有当段落内只有图片（且不只一张）时，才应用 Row 布局
    if (imgs.length <= 1 || !isImageOnlyParagraph(p)) return

    p.dataset.hmProcessedRow = '1'
    p.classList.add('hm-img-row')

    const loadPromises = imgs.map(img => {
      if (img.complete && img.naturalHeight > 0) return Promise.resolve()
      return new Promise(r => {
        img.addEventListener('load', r, { once: true })
        img.addEventListener('error', r, { once: true })
      })
    })

    pending.push(
      Promise.all(loadPromises).then(async () => {
        await Promise.all(
          imgs.map(img => {
            if (img.decode && img.naturalWidth > 0) {
              return img.decode().catch(() => {})
            }
            return Promise.resolve()
          })
        )
        applyMultiImageRowHeights(p, imgs)
      })
    )
  })

  await Promise.all(pending)
}

function processImageRows(opts) {
  void processImageRowsAsync(opts)
}

function setDocPageTransitionState(el, patch = {}) {
  const prev = docPageTransitionState.get(el) || {}
  const next = { ...prev, ...patch }
  docPageTransitionState.set(el, next)
  return next
}

function isDocPageTransitionValid(el, runId) {
  const state = docPageTransitionState.get(el)
  return Boolean(state && state.runId === runId && !state.cancelled && el.isConnected)
}

function cancelDocPageEnterTransition(el) {
  const state = docPageTransitionState.get(el)
  if (!state?.cancelEnter) return
  const cancel = state.cancelEnter
  setDocPageTransitionState(el, { cancelEnter: null })
  cancel()
}

onMounted(() => {
  syncViewportMode()
  resetMobileHeaderState()
  nextTick(() => {
    processContentActions()
    syncDesktopSidebarLayout()
    processImageRows({ force: true })
  })
  document.addEventListener('keydown', handleDocumentKeydown)
  document.addEventListener('click', handleVitepressPluginTabClick)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('scroll', handleMobileHeaderScroll, { passive: true })
  window.addEventListener('scroll', handleTocScroll, { passive: true })

  const router = useRouter()
  routerProgressPrevBefore = router.onBeforeRouteChange
  routerProgressPrevAfter = router.onAfterRouteChange ?? router.onAfterRouteChanged

  router.onBeforeRouteChange = async href => {
    const prev = await routerProgressPrevBefore?.(href)
    if (prev === false) return false
    beginRouteNavProgress(href)
  }

  router.onAfterRouteChange = async href => {
    await routerProgressPrevAfter?.(href)
  }
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-left')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-top')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-width')
  }
  clearMobileNavCloseFallback()
  if (imageRowProcessFrame) window.cancelAnimationFrame(imageRowProcessFrame)
  copyButtonResetTimers.forEach(timer => clearTimeout(timer))
  copyButtonResetTimers.clear()
  clearNavRouteProgressTimers()
  navRoutePendingKey = null

  try {
    const router = useRouter()
    router.onBeforeRouteChange = routerProgressPrevBefore
    router.onAfterRouteChange = routerProgressPrevAfter
  } catch {
    /* HMR / teardown */
  }

  document.removeEventListener('keydown', handleDocumentKeydown)
  document.removeEventListener('click', handleVitepressPluginTabClick)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('scroll', handleMobileHeaderScroll)
  window.removeEventListener('scroll', handleTocScroll)
  if (bodyScrollLocked) {
    document.body.style.overflow = previousBodyOverflow
  }
})

watch(
  () => page.value.relativePath,
  () => {
    searchQuery.value = ''
    searchActive.value = false
    closeMobileMenu()

    closeInfoDialog()
    forceCloseLightbox()
    resetMobileHeaderState()
    nextTick(() => {
      processContentActions()
      syncDesktopSidebarLayout()
    })
  },
  { flush: 'post' }
)

function onDocPageBeforeEnter(el) {
  setDocPageTransitionState(el, {
    runId: ++docPageTransitionRunId,
    cancelled: false,
    cancelEnter: null
  })
  el.style.transition = 'none'
  el.style.opacity = '0'
  el.style.transform = 'translateY(12px)'
}

async function onDocPageEnter(el, done) {
  const runId = docPageTransitionState.get(el)?.runId
  try {
    await nextTick()
    if (!isDocPageTransitionValid(el, runId)) {
      done()
      return
    }
    if (el.classList.contains('doc-article')) {
      await processImageRowsAsync({ force: true, root: el })
      bindJoinGroupButtons(el)
    }
  } catch (e) {
    console.error(e)
  }

  if (!isDocPageTransitionValid(el, runId)) {
    done()
    return
  }

  completeRouteNavProgressByKey(routeNavComparableKey(window.location.href))

  await nextDoubleRaf()
  if (!isDocPageTransitionValid(el, runId)) {
    done()
    return
  }

  const ms = performance.now() < docPageDisableAnimUntil ? 0 : DOC_PAGE_TRANSITION_MS
  let finished = false
  let tid = null
  let rafOuter = null
  let rafInner = null
  const onEnd = e => {
    if (e.target !== el || e.propertyName !== 'opacity') return
    safeDone()
  }
  const cleanup = () => {
    el.removeEventListener('transitionend', onEnd)
    if (tid != null) {
      window.clearTimeout(tid)
      tid = null
    }
    if (rafOuter != null) {
      cancelAnimationFrame(rafOuter)
      rafOuter = null
    }
    if (rafInner != null) {
      cancelAnimationFrame(rafInner)
      rafInner = null
    }
  }
  const safeDone = ({ cancelled = false } = {}) => {
    if (finished) return
    finished = true
    cleanup()
    const state = docPageTransitionState.get(el)
    if (state?.runId === runId) {
      if (cancelled) {
        setDocPageTransitionState(el, { cancelEnter: null, cancelled: true })
      } else {
        docPageTransitionState.delete(el)
      }
    }
    if (!cancelled) {
      el.style.transition = ''
      el.style.opacity = ''
      el.style.transform = ''
    }
    done()
  }
  setDocPageTransitionState(el, {
    cancelEnter: () => safeDone({ cancelled: true })
  })
  el.addEventListener('transitionend', onEnd)
  tid = window.setTimeout(safeDone, ms + 100)

  if (ms === 0) {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
    safeDone()
    return
  }

  el.style.transition = `opacity ${ms}ms ease, transform ${ms}ms ease`
  rafOuter = requestAnimationFrame(() => {
    rafInner = requestAnimationFrame(() => {
      if (!isDocPageTransitionValid(el, runId)) {
        safeDone({ cancelled: true })
        return
      }
      el.style.opacity = '1'
      el.style.transform = 'translateY(0)'
    })
  })
}

function onDocPageLeave(el, done) {
  const state = docPageTransitionState.get(el)
  if (state) state.cancelled = true
  cancelDocPageEnterTransition(el)
  const ms = performance.now() < docPageDisableAnimUntil ? 0 : DOC_PAGE_TRANSITION_MS
  let finished = false
  const safeDone = () => {
    if (finished) return
    finished = true
    el.removeEventListener('transitionend', onEnd)
    window.clearTimeout(tid)
    el.style.transition = ''
    el.style.opacity = ''
    el.style.transform = ''
    docPageTransitionState.delete(el)
    done()
  }
  const onEnd = e => {
    if (e.target !== el || e.propertyName !== 'opacity') return
    safeDone()
  }
  el.addEventListener('transitionend', onEnd)
  const tid = window.setTimeout(safeDone, ms + 100)

  if (ms === 0) {
    el.style.opacity = '0'
    el.style.transform = 'translateY(0)'
    safeDone()
    return
  }

  el.style.transition = `opacity ${ms}ms ease, transform ${ms}ms ease`
  requestAnimationFrame(() => {
    el.style.opacity = '0'
    el.style.transform = 'translateY(12px)'
  })
}

watch(menuOpen, isOpen => {
  if (isOpen) {
    clearMobileNavCloseFallback()
    mobileNavClosingHold.value = false
    resetMobileHeaderState()
  } else {
    armMobileNavCloseHold()
  }
  syncBodyScrollLock()
})

watch(lightboxVisible, () => {
  syncBodyScrollLock()
})

watch(mobileSidebarOpen, () => {
  syncBodyScrollLock()
})

watch(infoDialogVisible, async visible => {
  syncBodyScrollLock()
  if (!visible) return
  await nextTick()
  infoDialogConfirmButton.value?.focus()
})
</script>

<template>
  <div class="site-shell" :class="{ 'sidebar-compact-mode': !sidebarSpaceEnough }">
    <header
      ref="siteHeaderRef"
      class="site-header border-bottom bg-white"
      :class="{
        'mobile-header-hidden': mobileHeaderHidden && !menuOpen,
        'mobile-header-elevated': mobileHeaderElevated && !mobileHeaderHidden,
        'site-header--mobile-nav-open': siteHeaderMobileNavExpanded
      }"
    >
      <div class="container site-header-container">
        <div class="d-flex align-items-center justify-content-between site-header-inner">
          <div class="site-branding">
            <a class="site-branding-title" :href="withBase('/')">
              <span class="site-branding-title-desktop">幻梦</span>
              <span class="site-branding-title-mobile">{{ currentPageLabel }}</span>
            </a>
            <div class="text-muted small site-branding-description">{{ currentPageLabel }}</div>
          </div>

          <!-- 桌面端导航，仅 md 及以上可见 -->
          <nav class="nav nav-pills d-none d-md-flex">
            <a
              v-for="link in navLinks"
              :key="link.href"
              class="nav-link"
              :class="{ active: isActiveLink(link), 'nav-link--external': link.isExternal }"
              :href="getNavHref(link)"
              :target="link.isExternal ? '_blank' : undefined"
              :rel="link.isExternal ? 'noopener noreferrer' : undefined"
              :aria-current="isActiveLink(link) ? 'page' : undefined"
            >
              {{ link.label }}
              <svg v-if="link.isExternal" class="nav-link-external-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>
          </nav>

          <!-- 移动端汉堡按钮，仅 md 以下可见 -->
          <button
            class="mobile-menu-btn d-md-none"
            :class="{ open: menuOpen }"
            type="button"
            aria-label="站点导航"
            aria-controls="mobile-site-nav"
            :aria-expanded="menuOpen ? 'true' : 'false'"
            @click="toggleMobileMenu"
          >
            <span class="mobile-menu-icon">
              <span></span>
              <span></span>
              <span></span>
            </span>
          </button>
        </div>

        <!-- 移动端下拉导航 -->
        <div
          class="mobile-nav d-md-none"
          :class="{ open: menuOpen }"
          :aria-hidden="menuOpen ? 'false' : 'true'"
          @transitionend.self="onMobileNavTransitionEnd"
        >
          <div class="mobile-nav-inner">
            <!-- 移动端搜索框 -->
            <div class="mobile-nav-search pt-3 px-3">
              <div class="mobile-search-box">
                <input 
                  ref="mobileSearchInputRef"
                  v-model="searchQuery" 
                  type="text" 
                  placeholder="搜索文档..." 
                />
                <svg class="mobile-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
            </div>
            <nav id="mobile-site-nav" class="nav nav-pills mobile-nav-grid pt-2 pb-1" aria-label="移动端站点导航">
              <a
                v-for="link in navLinks"
                :key="link.href"
                class="nav-link"
                :class="{ active: isActiveLink(link), 'nav-link--external': link.isExternal }"
                :href="getNavHref(link)"
                :target="link.isExternal ? '_blank' : undefined"
                :rel="link.isExternal ? 'noopener noreferrer' : undefined"
                :aria-current="isActiveLink(link) ? 'page' : undefined"
              >
                {{ link.label }}
                <svg v-if="link.isExternal" class="nav-link-external-icon" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
              </a>
            </nav>
          </div>
        </div>
      </div>

      <!-- 顶部导航加载进度条（移动端/桌面端统一） -->
      <div
        v-show="navRouteProgressVisible || navRouteProgressFading"
        class="site-nav-route-progress"
        :class="{ 'site-nav-route-progress--fading': navRouteProgressFading }"
        aria-hidden="true"
      >
        <div
          class="site-nav-route-progress__fill"
          :class="{ 'site-nav-route-progress__fill--smooth': navRouteProgressSmooth }"
          :style="{ width: `${navRouteProgress}%` }"
        />
      </div>
    </header>

    <!-- 点击遮罩关闭移动端菜单 -->
    <Transition name="mobile-nav-backdrop-fade">
      <div v-if="menuOpen && !searchQuery.trim()" class="mobile-nav-backdrop d-md-none" @click="closeMobileMenu"></div>
    </Transition>

    <!-- 移动端呼出侧边栏按钮 -->
    <button
      v-if="shouldShowDesktopSidebar && !mobileSidebarOpen"
      class="mobile-sidebar-trigger"
      :class="{ 'd-lg-none': sidebarSpaceEnough }"
      @click="mobileSidebarOpen = true"
      aria-label="打开侧边栏"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="13 17 18 12 13 7"></polyline><polyline points="6 17 11 12 6 7"></polyline></svg>
    </button>

    <!-- 侧边栏遮罩 -->
    <Transition name="sidebar-backdrop-fade">
      <div v-if="mobileSidebarOpen && shouldShowDesktopSidebar" class="sidebar-backdrop" @click="mobileSidebarOpen = false"></div>
    </Transition>

    <aside
      v-if="shouldShowDesktopSidebar"
      class="desktop-doc-sidebar"
      :class="{ 'mobile-open': mobileSidebarOpen }"
      aria-label="文档快捷入口"
    >
      <nav class="desktop-doc-sidebar__panel">
        <!-- 顶部标题与分割站与搜索 -->
        <div class="sidebar-search-header" :class="{ 'search-active': searchActive }">
          <span v-if="!searchActive" class="desktop-doc-sidebar__heading">页面切换</span>
          <div v-else class="sidebar-search-box">
            <input 
              ref="searchInputRef"
              v-model="searchQuery" 
              type="text" 
              placeholder="搜索文档..." 
              @blur="handleSearchBlur"
            />
          </div>
          <div class="sidebar-header-actions">
            <button class="sidebar-search-trigger" @click="handleSearchIconClick" aria-label="搜索文档">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </button>
            <button class="sidebar-close-trigger" :class="{ 'd-lg-none': sidebarSpaceEnough }" @click="mobileSidebarOpen = false" aria-label="收起侧边栏">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
            </button>
          </div>
        </div>
        <hr class="desktop-doc-sidebar__divider" />
        <SidebarNavItem
          :items="desktopSidebarLinks"
          :page-relative-path="page.relativePath"
        />
      </nav>
    </aside>

    <aside
      v-if="shouldShowTOC"
      class="desktop-toc-sidebar"
      aria-label="本页目录"
    >
      <div class="toc-header">本页内容:</div>
      <nav class="toc-nav">
        <div class="toc-indicator" :style="tocIndicatorStyle"></div>
        <a
          v-for="h in tocHeaders"
          :key="h.id"
          :href="`#${h.id}`"
          class="toc-link"
          :class="[`toc-level-${h.level}`, { active: activeTocId === h.id }]"
          @click.prevent="scrollToToc(h.id)"
        >
          {{ h.title }}
        </a>
      </nav>
    </aside>

    <main
      class="py-4 py-md-5"
      :class="{ 'hmdoc-index-main': !frontmatter.home && page.relativePath === 'hmdoc/index.md' }"
    >
      <div
        ref="mainContainerRef"
        class="container"
        :class="{ 'hmdoc-index-container': !frontmatter.home && page.relativePath === 'hmdoc/index.md' }"
      >
        <Transition
          :css="false"
          mode="out-in"
          appear
          @before-enter="onDocPageBeforeEnter"
          @enter="onDocPageEnter"
          @leave="onDocPageLeave"
        >
          <div v-if="frontmatter.home && !searchQuery.trim()" key="vp-route-home">
            <Content />
          </div>
          <article
            v-else-if="!searchQuery.trim()"
            ref="docArticleRef"
            :key="page.relativePath"
            class="doc-article p-4 p-md-5"
            :class="{
              'docs-index-article': page.relativePath === 'docs/index.md',
              'docs-support-article': page.relativePath === 'docs/support.md'
            }"
          >
            <Content />
          </article>
          
          <article
            v-else
            key="vp-route-search"
            class="doc-article search-results-article p-4 p-md-5"
          >
            <h1 class="mb-4">搜索结果（共{{ searchResults.length }}条）</h1>
            <hr class="mb-4"/>
            <div class="search-results-list">
              <a 
                v-for="(res, index) in searchResults" 
                :key="index" 
                :href="withBase(res.link)" 
                class="search-result-item"
                @click="handleResultClick"
              >
                <h3 class="search-result-title">{{ res.title }}</h3>
                <p class="search-result-snippet">
                  {{ res.snippetBefore }}<span class="search-highlight">{{ res.match }}</span>{{ res.snippetAfter }}
                </p>
              </a>
              <div v-if="searchResults.length === 0" class="text-muted pt-3">
                未找到包含 "{{ searchQuery }}" 的结果。
              </div>
            </div>
          </article>
        </Transition>
      </div>
    </main>

    <footer class="site-footer border-top">
      <div class="container py-3 d-flex flex-column flex-md-row justify-content-between text-muted small site-footer-inner">
        <span><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" class="text-muted">浙ICP备2026018380号</a></span>
        <span>©2024-{{ currentYear }} 幻梦，保留所有权利</span>
        <span><a href="https://register.ccopyright.com.cn/query.html" target="_blank" rel="noopener noreferrer" class="text-muted">软件著作权登记号: 2024SR0589691</a></span>
      </div>
    </footer>

    <Transition name="hm-dialog">
      <div v-if="infoDialogVisible" class="hm-dialog" role="presentation">
        <div class="hm-dialog__backdrop" @click="closeInfoDialog"></div>
        <div
          class="hm-dialog__panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="hm-dialog-title"
          aria-describedby="hm-dialog-message"
        >
          <button type="button" class="hm-dialog__close" aria-label="关闭" @click="closeInfoDialog">&times;</button>
          <div class="hm-dialog__header">
            <h2 id="hm-dialog-title" class="hm-dialog__title">{{ infoDialogTitle }}</h2>
          </div>
          <div class="hm-dialog__body">
            <p id="hm-dialog-message" class="hm-dialog__message">{{ infoDialogMessage }}</p>
          </div>
          <div class="hm-dialog__footer">
            <button
              ref="infoDialogConfirmButton"
              type="button"
              class="hm-dialog__confirm"
              @click="handleInfoDialogConfirm"
            >
              确定
            </button>
            <button
              v-if="infoDialogShowCancel"
              type="button"
              class="hm-dialog__cancel"
              @click="closeInfoDialog"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <div
      v-show="lightboxVisible"
      ref="lightboxRootRef"
      class="hm-lightbox"
      :class="{
        'hm-lightbox--busy':
          lightboxPhase === 'opening' || lightboxPhase === 'closing',
        'hm-lightbox--opening': lightboxPhase === 'opening',
        'hm-lightbox--closing': lightboxPhase === 'closing'
      }"
      @click="handleLightboxClick"
    >
      <div
        class="hm-lightbox__backdrop"
        :style="{ opacity: lightboxBackdropOpacity }"
      />
      <div class="hm-lightbox__content">
        <div ref="lightboxFlipRef" class="hm-lightbox__flip">
          <img
            ref="lightboxImgRef"
            :src="lightboxSrc"
            alt=""
            :style="{ transform: `scale(${lightboxScale})` }"
            @wheel.prevent="handleDesktopLightboxWheel"
          >
        </div>
      </div>
    </div>

    <!-- 全局搜索弹窗 (Fallback / Mobile) -->
    <Transition name="search-modal">
      <div v-if="globalSearchModalActive" class="hm-search-modal" role="dialog" aria-modal="true">
        <div class="hm-search-modal__backdrop" @click="closeGlobalSearch"></div>
        <div class="hm-search-modal__container">
          <div class="hm-search-modal__box">
            <svg class="hm-search-modal__icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <input 
              ref="globalSearchInputRef"
              v-model="searchQuery" 
              type="text" 
              placeholder="搜索文档..." 
              @keydown.esc="closeGlobalSearch"
              @keydown.enter="closeGlobalSearch"
            />
            <button class="hm-search-modal__close" @click="closeGlobalSearch" title="关闭">Esc</button>
          </div>
          <div class="hm-search-modal__tips">
            输入关键词自动展示结果，按 Enter 查看，Esc 退出
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>
