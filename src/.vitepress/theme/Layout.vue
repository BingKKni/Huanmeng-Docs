<script setup>
import { useData, useRouter, withBase, onContentUpdated } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue'
import SidebarNavItem from './components/SidebarNavItem.vue'


const { site, frontmatter, page } = useData()
const router = useRouter()

const tocHeaders = ref([])
const activeTocId = ref('')
const tocIndicatorStyle = ref({ transform: 'translateY(0)', height: '0', opacity: '0' })

watch(activeTocId, async (newId) => {
  if (typeof window !== 'undefined' && window.matchMedia('(max-width: 767.98px)').matches) {
    tocIndicatorStyle.value.opacity = '0'
    return
  }
  if (!newId) {
    tocIndicatorStyle.value.opacity = '0'
    return
  }
  await nextTick()
  try {
    const idSelector = CSS.escape(newId)
    const linkEl = document.querySelector(`.toc-nav .toc-link[href="#${idSelector}"]`) || document.querySelector(`.toc-nav .toc-link[href="#${newId}"]`)
    if (linkEl) {
      const pillHeight = 16
      const pillVisualOffset = 0.5
      const topOffset = Math.round(linkEl.offsetTop + (linkEl.offsetHeight - pillHeight) / 2 + pillVisualOffset)
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
  if (isMobileViewport()) {
    activeTocId.value = ''
    return
  }

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
let tocScrollListening = false
function handleTocScroll() {
  if (isMobileViewport()) return
  if (tocScrollTimeout) return
  updateActiveToc()
}

function startTocScrollListener() {
  if (typeof window === 'undefined' || tocScrollListening || isMobileViewport()) return
  window.addEventListener('scroll', handleTocScroll, { passive: true })
  tocScrollListening = true
}

function stopTocScrollListener() {
  if (typeof window === 'undefined' || !tocScrollListening) return
  window.removeEventListener('scroll', handleTocScroll)
  tocScrollListening = false
}

function syncTocScrollListener() {
  if (isMobileViewport()) {
    stopTocScrollListener()
    activeTocId.value = ''
    tocIndicatorStyle.value.opacity = '0'
    return
  }

  startTocScrollListener()
  updateActiveToc()
}

onContentUpdated(() => {
  if (!docArticleRef.value) {
    tocHeaders.value = []
    activeTocId.value = ''
    return
  }
  const headings = Array.from(docArticleRef.value.querySelectorAll('h1, h2, h3, h4'))
  if (headings.length === 0) {
    tocHeaders.value = []
    activeTocId.value = ''
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
    syncTocScrollListener()
    void applyPendingSearchHeading()
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

function normalizeHashTarget(hash) {
  if (!hash) return ''
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

function getHashTargetFromHref(href) {
  try {
    return normalizeHashTarget(new URL(href, window.location.href).hash)
  } catch {
    return normalizeHashTarget(href.split('#')[1] || '')
  }
}

function getActiveDocArticle() {
  const article = docArticleRef.value
  if (article && !article.classList.contains('search-results-article')) {
    return article
  }

  return document.querySelector('article.doc-article:not(.search-results-article)')
}

function normalizeHeadingText(text) {
  return String(text || '')
    .replace(/\s+#$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function findHeadingElement(id, title = '') {
  const normalizedId = normalizeHashTarget(id)
  const article = getActiveDocArticle()
  if (!article) return null

  if (normalizedId) {
    const byId = article.querySelector(`#${CSS.escape(normalizedId)}`) || document.getElementById(normalizedId)
    if (byId && article.contains(byId)) return byId
  }

  const normalizedTitle = normalizeHeadingText(title)
  if (!normalizedTitle) return null

  const headings = article.querySelectorAll('h1, h2, h3, h4, h5, h6')

  for (const heading of headings) {
    if (normalizeHeadingText(heading.textContent) === normalizedTitle) {
      return heading
    }
  }

  return null
}

function flashHeading(el) {
  el.classList.remove('heading-flash')
  void el.offsetWidth
  el.classList.add('heading-flash')
  setTimeout(() => {
    el.classList.remove('heading-flash')
  }, 1200)
}

function scrollToHeading(id, { updateHash = false, fallbackTitle = '', instant = false } = {}) {
  const el = findHeadingElement(id, fallbackTitle)
  if (!el) return false

  const targetId = el.id || normalizeHashTarget(id)

  if (tocScrollTimeout) clearTimeout(tocScrollTimeout)
  if (targetId && tocHeaders.value.some(header => header.id === targetId)) {
    activeTocId.value = targetId
  }

  const top = el.getBoundingClientRect().top + window.scrollY - 120
  const distance = Math.abs(top - window.scrollY)
  const duration = Math.min(Math.max(distance * 0.25, 300), 650)

  if (instant) {
    window.scrollTo(0, top)
    if (updateHash) {
      const url = new URL(window.location.href)
      url.hash = targetId
      window.history.replaceState(null, '', url)
    }
    flashHeading(el)
    tocScrollTimeout = setTimeout(() => {
      tocScrollTimeout = null
    }, 50)
    return true
  }

  smoothScrollTo(top, duration, () => {
    if (updateHash) {
      const url = new URL(window.location.href)
      url.hash = targetId
      window.history.replaceState(null, '', url)
    }
    flashHeading(el)
  })

  tocScrollTimeout = setTimeout(() => {
    tocScrollTimeout = null
  }, duration + 50)

  return true
}

function scrollToToc(id) {
  scrollToHeading(id, { updateHash: true })
}

const shouldShowTOC = computed(() => !isMobileView.value && shouldShowDesktopSidebar.value && tocHeaders.value.length > 0)
// --- Search Logic ---
const SEARCH_INDEX_PATH = '/search-index.json'
const searchQuery = ref('')
const searchInputRef = ref(null)
const globalSearchModalActive = ref(false)
const globalSearchInputRef = ref(null)
const isDarkMode = ref(false)
const searchIndex = ref([])
const searchIndexLoaded = ref(false)
const desktopSearchPlaceholders = [
  '搜索内容...',
  '搜索关键词...',
  '随便搜点...',
  '来搜点什么吧...',
  '寻找文案...'
]
const desktopSearchPlaceholder = ref(desktopSearchPlaceholders[0])
const desktopSearchPlaceholderAnimating = ref(false)
let desktopSearchPlaceholderIndex = 0
let desktopSearchPlaceholderCycleTimer = null
let desktopSearchPlaceholderSwapTimer = null
let desktopSearchPlaceholderResetTimer = null
let pendingSearchHeadingId = ''
let pendingSearchHeadingTitle = ''
let pendingSearchHeadingFrame = null
let searchIndexPromise = null

async function ensureSearchIndexLoaded() {
  if (searchIndexLoaded.value) return searchIndex.value
  if (typeof window === 'undefined') return []
  if (searchIndexPromise) return searchIndexPromise

  searchIndexPromise = fetch(withBase(SEARCH_INDEX_PATH), { cache: 'force-cache' })
    .then(async response => {
      if (!response.ok) {
        throw new Error(`search-index-http-${response.status}`)
      }

      const data = await response.json()
      searchIndex.value = Array.isArray(data) ? data : []
      searchIndexLoaded.value = true
      return searchIndex.value
    })
    .catch(error => {
      console.error('Failed to load search index:', error)
      searchIndex.value = []
      return searchIndex.value
    })
    .finally(() => {
      searchIndexPromise = null
    })

  return searchIndexPromise
}

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return []
  const query = searchQuery.value.toLowerCase()
  const results = []
  const docs = searchIndex.value

  if (docs.length === 0) return results
  
  for (let i = 0, len = docs.length; i < len; i++) {
    const doc = docs[i]
    const rawContent = doc.searchText
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
        docTitle: doc.docTitle,
        link: doc.link,
        headingId: doc.id,
        headingTitle: doc.headingTitle,
        snippetBefore,
        match: snippetMatch,
        snippetAfter
      })
      if (results.length >= 10) break // limit to top 10 results for better performance
    }
  }
  return results
})

watch(searchQuery, query => {
  if (!query.trim()) return
  void ensureSearchIndexLoaded()
})

function clearPendingSearchHeadingFrame() {
  if (pendingSearchHeadingFrame != null) {
    cancelAnimationFrame(pendingSearchHeadingFrame)
    pendingSearchHeadingFrame = null
  }
}

function setPendingSearchHeading(id, title = '') {
  pendingSearchHeadingId = normalizeHashTarget(id)
  pendingSearchHeadingTitle = normalizeHeadingText(title)
}

async function applyPendingSearchHeading(retries = 60) {
  clearPendingSearchHeadingFrame()
  if (!pendingSearchHeadingId && !pendingSearchHeadingTitle) return

  if (docPageEnterInProgress || !getActiveDocArticle()) {
    if (retries <= 0) {
      pendingSearchHeadingId = ''
      pendingSearchHeadingTitle = ''
      return
    }

    pendingSearchHeadingFrame = requestAnimationFrame(() => {
      void applyPendingSearchHeading(retries - 1)
    })
    return
  }

  const targetId = pendingSearchHeadingId
  const targetTitle = pendingSearchHeadingTitle
  await nextTick()

  if (scrollToHeading(targetId, { updateHash: true, fallbackTitle: targetTitle, instant: true })) {
    pendingSearchHeadingId = ''
    pendingSearchHeadingTitle = ''
    return
  }

  if (retries <= 0) {
    pendingSearchHeadingId = ''
    pendingSearchHeadingTitle = ''
    return
  }

  pendingSearchHeadingFrame = requestAnimationFrame(() => {
    void applyPendingSearchHeading(retries - 1)
  })
}

function handleResultClick(result, event) {
  searchQuery.value = ''
  closeMobileMenu()
  mobileSidebarOpen.value = false

  if (typeof window === 'undefined') return

  const targetHref = withBase(result.link)
  const currentRouteKey = routeNavComparableKey(window.location.href)
  const targetRouteKey = routeNavComparableKey(targetHref)

  setPendingSearchHeading(result.headingId, result.headingTitle)

  if (currentRouteKey !== targetRouteKey) return

  event.preventDefault()
  window.history.pushState(null, '', targetHref)

  if (result.headingId || result.headingTitle) {
    void applyPendingSearchHeading()
    return
  }

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function focusDesktopSearch() {
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function closeGlobalSearch() {
  globalSearchModalActive.value = false
  searchQuery.value = ''
}


const APPEARANCE_STORAGE_KEY = 'vitepress-theme-appearance'
const githubLink = {
  href: 'https://github.com/BingKKni/Huanmeng-Docs',
  label: 'Github',
  isExternal: true,
  isActive: () => false
}

const navLinks = [
  { href: '/', label: '首页', isActive: relativePath => relativePath === 'index.md' },
  {
    href: '/docs/',
    label: '使用文档',
    isActive: relativePath => relativePath === 'docs/index.md' || relativePath.startsWith('docs/')
  },
  {
    href: '/about/',
    label: '更多',
    isActive: relativePath => relativePath === 'about/index.md' || relativePath.startsWith('about/')
  },
  {
    label: '社区',
    isActive: () => false,
    children: [
      {
        href: 'https://qm.qq.com/q/6lmTZCS0SY',
        label: 'QQ群',
        isExternal: true,
        confirmTitle: '二次确认',
        confirmMessage: '即将跳转到QQ幻梦官方群，是否继续？',
        confirmLabel: '确认'
      },
      {
        href: 'https://pd.qq.com/s/13nxjzopi',
        label: 'QQ频道',
        isExternal: true,
        confirmTitle: '二次确认',
        confirmMessage: '即将跳转到QQ幻梦官方频道，是否继续？',
        confirmLabel: '确认'
      },
      {
        href: 'https://space.bilibili.com/454289878',
        label: 'BiliBili',
        isExternal: true,
        confirmTitle: '二次确认',
        confirmMessage: '即将跳转到QQ布丁开发者B站空间，是否继续？',
        confirmLabel: '确认'
      }
    ]
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
      { href: '/docs/entertainment/fortune', label: '今日运势', isActive: relativePath => relativePath === 'docs/entertainment/fortune.md' },
      {
        href: '/docs/entertainment/daily_wife/',
        label: '今日老婆',
        isActive: relativePath => relativePath === 'docs/entertainment/daily_wife/index.md',
        hasAnyActive: relativePath => relativePath.startsWith('docs/entertainment/daily_wife/'),
        children: [
          {
            href: '/docs/entertainment/daily_wife/preference',
            label: '喜欢/不喜欢',
            isActive: relativePath => relativePath === 'docs/entertainment/daily_wife/preference.md'
          },
          {
            href: '/docs/entertainment/daily_wife/item_definite_integral_usage',
            label: '定积分券核销',
            isActive: relativePath => relativePath === 'docs/entertainment/daily_wife/item_definite_integral_usage.md'
          },
          {
            href: '/docs/entertainment/daily_wife/item_indefinite_integral_usage',
            label: '不定积分券核销',
            isActive: relativePath => relativePath === 'docs/entertainment/daily_wife/item_indefinite_integral_usage.md'
          }
        ]
      },
      { href: '/docs/entertainment/sence', label: '好感度', isActive: relativePath => relativePath === 'docs/entertainment/sence.md' },
      {
        href: '/docs/entertainment/catch_the_cat/',
        label: '圈小猫',
        isActive: relativePath => relativePath === 'docs/entertainment/catch_the_cat/index.md',
        hasAnyActive: relativePath => relativePath.startsWith('docs/entertainment/catch_the_cat/'),
        children: [
          {
            href: '/docs/entertainment/catch_the_cat/multiplayer',
            label: '多人模式',
            isActive: relativePath => relativePath === 'docs/entertainment/catch_the_cat/multiplayer.md'
          }
        ]
      },
      { href: '/docs/entertainment/random_image', label: '随机图', isActive: relativePath => relativePath === 'docs/entertainment/random_image.md' },
      { href: '/docs/entertainment/flop', label: '翻牌', isActive: relativePath => relativePath === 'docs/entertainment/flop.md' },
      { href: '/docs/entertainment/fastmath', label: '速算', isActive: relativePath => relativePath === 'docs/entertainment/fastmath.md' },
      { href: '/docs/entertainment/minesweeper', label: '扫雷', isActive: relativePath => relativePath === 'docs/entertainment/minesweeper.md' },
      { href: '/docs/entertainment/password_cracker', label: '破译', isActive: relativePath => relativePath === 'docs/entertainment/password_cracker.md' },
      { href: '/docs/entertainment/twenty_four_points', label: '二十四点', isActive: relativePath => relativePath === 'docs/entertainment/twenty_four_points.md' },
      { href: '/docs/entertainment/paint_bomb', label: '油漆炸弹', isActive: relativePath => relativePath === 'docs/entertainment/paint_bomb.md' },
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

const aboutSidebarLinks = [
  {
    href: '/about/',
    label: '🏠 首页',
    isActive: relativePath => relativePath === 'about/index.md'
  },
  {
    href: '/about/contribution/',
    label: '📝 贡献指南',
    isActive: relativePath => relativePath === 'about/contribution/index.md',
    hasAnyActive: relativePath => relativePath.startsWith('about/contribution/'),
    children: [
      {
        href: '/about/contribution/custom_systax',
        label: '自定义语法',
        isActive: relativePath => relativePath === 'about/contribution/custom_systax.md'
      },
      {
        href: '/about/contribution/markdown_systax',
        label: 'Markdown语法',
        isActive: relativePath => relativePath === 'about/contribution/markdown_systax.md'
      }
    ]
  }
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
const isDocsSection = computed(() => page.value.relativePath.startsWith('docs/'))
const isAboutSection = computed(() => page.value.relativePath.startsWith('about/'))
const shouldShowDesktopSidebar = computed(() => isDocsSection.value || isAboutSection.value)
const currentSidebarLinks = computed(() => {
  if (isDocsSection.value) return desktopSidebarLinks
  if (isAboutSection.value) return aboutSidebarLinks
  return []
})

const mobileSidebarOpen = ref(false)
const desktopSidebarCollapsed = ref(false)
const menuOpen = ref(false)
const desktopCommunityMenuOpen = ref(false)
const mobileCommunityMenuOpen = ref(false)
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
const lightboxOffsetX = ref(0)
const lightboxOffsetY = ref(0)
const lightboxImageTransition = ref('transform 0.18s ease')
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
const infoDialogConfirmLabel = ref('确定')
let infoDialogOnConfirm = null
const infoDialogConfirmButton = ref(null)
const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)'
/** 与 style.css 中桌面侧栏媒体查询一致 */
const DESKTOP_SIDEBAR_MEDIA_QUERY = '(min-width: 992px)'
const DESKTOP_SIDEBAR_WIDTH_PX = 256
const DESKTOP_SIDEBAR_SHIFT_X = -30 // Not used anymore but kept to avoid breaking other things if any
const DESKTOP_SIDEBAR_GAP = 40
const DESKTOP_SIDEBAR_SHIFT_Y = 0
/** 与 style.css 中 .mobile-nav 的 grid-template-rows 时长一致 */
const MOBILE_NAV_PANEL_MS = 300
const MOBILE_NAV_CLOSE_FALLBACK_MS = MOBILE_NAV_PANEL_MS + 100
const MOBILE_HEADER_SCROLL_DELTA = 8
const LIGHTBOX_SCALE_MIN = 1
const MOBILE_LIGHTBOX_SCALE_MAX = 4
const MOBILE_LIGHTBOX_DOUBLE_TAP_SCALE = 2.5
const DESKTOP_LIGHTBOX_SCALE_MAX = 4
const DESKTOP_LIGHTBOX_SCALE_STEP = 0.2
const LIGHTBOX_DOUBLE_TAP_DELAY_MS = 280
const LIGHTBOX_GESTURE_CLICK_SUPPRESS_MS = 360
const LIGHTBOX_DRAG_START_THRESHOLD_PX = 4
/** 遮罩最深约 50% 黑 */
const LIGHTBOX_OVERLAY_MAX = 0.5
/** 灯箱打开：位移 + 遮罩淡入 */
const LIGHTBOX_OPEN_ANIM_MS = 300
/** 灯箱关闭：位移 + 遮罩淡出（可单独比打开更短） */
const LIGHTBOX_CLOSE_ANIM_MS = 150
/** 打开：略先快后慢，落地柔和 */
const LIGHTBOX_ANIM_EASE = 'cubic-bezier(0.22, 0.82, 0.24, 1)'
/**
 * 关闭：先快后更快（ease-in）。cubic-bezier(x1,y1,x2,y2)；
 */
const LIGHTBOX_CLOSE_ANIM_EASE = 'cubic-bezier(0.18, 0, 1, 1)'

/** flip 同时 transform + opacity，打开/关闭各自用各自的 ms 和 ease */
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

/** 非 FLIP 时仅淡入/淡出，仍共用对应 ms、ease */
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
const DESKTOP_SEARCH_PLACEHOLDER_IDLE_MS = 4000
const DESKTOP_SEARCH_PLACEHOLDER_ANIM_MS = 1200
const DESKTOP_SEARCH_PLACEHOLDER_SWAP_MS = DESKTOP_SEARCH_PLACEHOLDER_ANIM_MS / 2
const desktopSearchPlaceholderAnimationStyle = {
  '--hm-search-placeholder-anim-ms': `${DESKTOP_SEARCH_PLACEHOLDER_ANIM_MS}ms`
}
let lastScrollY = 0
let bodyScrollLocked = false
/** 点击打开时的文档内图片，关闭时优先用其最新 getBoundingClientRect */
let lightboxOriginImg = null
/** 打开瞬间的缩略图矩形，源节点已不在 DOM 时作为退路 */
let thumbRectSnapshot = { left: 0, top: 0, width: 0, height: 0 }
let lightboxPinching = false
let lightboxPinchLastDistance = 0
let lightboxPinchLastMidpoint = null
let lightboxLastTapAt = 0
let lightboxSuppressClickUntil = 0
let lightboxDragging = false
let lightboxDragMoved = false
let lightboxDragFromPinch = false
let lightboxDragStartX = 0
let lightboxDragStartY = 0
let lightboxDragStartOffsetX = 0
let lightboxDragStartOffsetY = 0
let previousBodyOverflow = ''
let imageRowProcessFrame = 0
let imageRowForceProcess = false
let docPageEnterInProgress = false
// -- 手势状态（侧边栏滑动 + 顶部过滑触发菜单）--------------------------
/** 手势触点起始位置 */
let swipeTouchStartX = 0
let swipeTouchStartY = 0
/** 是否正在追踪侧边栏手势 */
let swipeTracking = false
/** 是否已确认为侧边栏方向的水平滑动（锁轴后不再重判） */
let swipeAxisLocked = false
/** 手势已经确认为垂直方向（排除侧边栏手势） */
let swipeVerticalLocked = false
/** 侧边栏手势确认所需的最小水平位移（px） */
const SWIPE_AXIS_LOCK_THRESHOLD = 8
/** 侧边栏手势确认所需的最小水平位移（px） */
const SWIPE_SIDEBAR_THRESHOLD = 48
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
  if (isMobileViewport()) {
    navRoutePendingKey = null
    clearNavRouteProgressTimers()
    navRouteProgress.value = 0
    navRouteProgressVisible.value = false
    navRouteProgressFading.value = false
    navRouteProgressSmooth.value = false
    return
  }

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

function isNavDropdownLink(link) {
  return Array.isArray(link.children) && link.children.length > 0
}

function isExternalNavLink(link) {
  return link.isExternal === true
}

function getNavLinkHref(link) {
  return isExternalNavLink(link) ? link.href : withBase(link.href)
}

function closeDesktopCommunityMenu() {
  desktopCommunityMenuOpen.value = false
}

function closeMobileCommunityMenu() {
  mobileCommunityMenuOpen.value = false
}

function closeCommunityMenus() {
  closeDesktopCommunityMenu()
  closeMobileCommunityMenu()
}

function toggleDesktopCommunityMenu() {
  desktopCommunityMenuOpen.value = !desktopCommunityMenuOpen.value
}

function toggleMobileCommunityMenu() {
  mobileCommunityMenuOpen.value = !mobileCommunityMenuOpen.value
}

function handleDesktopCommunityMenuDocumentClick(event) {
  const target = event.target
  if (!(target instanceof Element)) {
    closeDesktopCommunityMenu()
    return
  }
  if (target.closest('.site-nav__item--dropdown')) return
  closeDesktopCommunityMenu()
}

function handleCommunityLinkClick(event, link) {
  event.preventDefault()
  closeCommunityMenus()
  closeMobileMenu()

  openInfoDialog(
    link.confirmMessage,
    link.confirmTitle || '二次确认',
    () => {
      openExternalLinkInNewTab(link.href)
    },
    true,
    link.confirmLabel || '确认'
  )
}

function isMobileViewport() {
  return isMobileView.value
}

function syncColorModeFromDocument() {
  if (typeof document === 'undefined') return
  isDarkMode.value = document.documentElement.classList.contains('dark')
}

function setColorMode(mode) {
  if (typeof document === 'undefined') return

  const shouldUseDark = mode === 'dark'
  document.documentElement.classList.toggle('dark', shouldUseDark)
  document.documentElement.style.colorScheme = shouldUseDark ? 'dark' : 'light'
  isDarkMode.value = shouldUseDark

  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, mode)
  } catch {
    /* ignore storage failures */
  }
}

function toggleColorMode() {
  setColorMode(isDarkMode.value ? 'light' : 'dark')
}

function syncViewportMode() {
  isMobileView.value = window.matchMedia(MOBILE_MEDIA_QUERY).matches
}

function clearDesktopSearchPlaceholderTimers() {
  if (desktopSearchPlaceholderCycleTimer != null) {
    clearTimeout(desktopSearchPlaceholderCycleTimer)
    desktopSearchPlaceholderCycleTimer = null
  }
  if (desktopSearchPlaceholderSwapTimer != null) {
    clearTimeout(desktopSearchPlaceholderSwapTimer)
    desktopSearchPlaceholderSwapTimer = null
  }
  if (desktopSearchPlaceholderResetTimer != null) {
    clearTimeout(desktopSearchPlaceholderResetTimer)
    desktopSearchPlaceholderResetTimer = null
  }
}

function scheduleDesktopSearchPlaceholderCycle() {
  if (typeof window === 'undefined') return
  clearDesktopSearchPlaceholderTimers()
  desktopSearchPlaceholderCycleTimer = window.setTimeout(runDesktopSearchPlaceholderCycle, DESKTOP_SEARCH_PLACEHOLDER_IDLE_MS)
}

function stopDesktopSearchPlaceholderCycle() {
  clearDesktopSearchPlaceholderTimers()
  desktopSearchPlaceholderAnimating.value = false
}

function runDesktopSearchPlaceholderCycle() {
  if (typeof window === 'undefined') return
  desktopSearchPlaceholderCycleTimer = null

  desktopSearchPlaceholderAnimating.value = true

  desktopSearchPlaceholderSwapTimer = window.setTimeout(() => {
    desktopSearchPlaceholderSwapTimer = null
    desktopSearchPlaceholderIndex = (desktopSearchPlaceholderIndex + 1) % desktopSearchPlaceholders.length
    desktopSearchPlaceholder.value = desktopSearchPlaceholders[desktopSearchPlaceholderIndex]
  }, DESKTOP_SEARCH_PLACEHOLDER_SWAP_MS)

  desktopSearchPlaceholderResetTimer = window.setTimeout(() => {
    desktopSearchPlaceholderAnimating.value = false
    desktopSearchPlaceholderResetTimer = null
    desktopSearchPlaceholderSwapTimer = null
    scheduleDesktopSearchPlaceholderCycle()
  }, DESKTOP_SEARCH_PLACEHOLDER_ANIM_MS)
}

/** 桌面侧栏定位：顶部对齐导航栏底边，左侧贴齐屏幕。 */
function syncDesktopSidebarLayout() {
  if (typeof document === 'undefined') return
  const headerEl = siteHeaderRef.value
  if (headerEl) {
    const headerRect = headerEl.getBoundingClientRect()
    const mobileHeaderHeight = Math.max(0, Math.round(headerRect.height))
    document.documentElement.style.setProperty('--hm-mobile-header-height', `${mobileHeaderHeight}px`)
  }

  if (!window.matchMedia(DESKTOP_SIDEBAR_MEDIA_QUERY).matches) {
    sidebarSpaceEnough.value = true
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-left')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-top')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-width')
    return
  }

  const containerEl = mainContainerRef.value
  if (!containerEl || !headerEl) return

  const cr = containerEl.getBoundingClientRect()

  sidebarSpaceEnough.value = true
  const headerRect = headerEl.getBoundingClientRect()
  const top = Math.max(0, Math.round(headerRect.bottom))
  document.documentElement.style.setProperty('--hm-desktop-sidebar-left', '0px')
  document.documentElement.style.setProperty('--hm-desktop-sidebar-top', `${top}px`)
  document.documentElement.style.setProperty('--hm-desktop-sidebar-width', `${DESKTOP_SIDEBAR_WIDTH_PX}px`)

  const tocLeft = Math.round(cr.right) + 24
  document.documentElement.style.setProperty('--hm-desktop-toc-left', `${tocLeft}px`)
  if (tocLeft + 220 > document.documentElement.clientWidth) {
    document.documentElement.style.setProperty('--hm-desktop-toc-display', `none`)
  } else {
    document.documentElement.style.setProperty('--hm-desktop-toc-display', `block`)
  }
}

function openSidebar() {
  if (isMobileViewport()) {
    closeMobileMenu()
    mobileSidebarOpen.value = true
    return
  }

  desktopSidebarCollapsed.value = false
}

function closeSidebar() {
  if (isMobileViewport()) {
    mobileSidebarOpen.value = false
    return
  }

  desktopSidebarCollapsed.value = true
}

function clampLightboxScale(scale) {
  const maxScale = isMobileViewport()
    ? MOBILE_LIGHTBOX_SCALE_MAX
    : DESKTOP_LIGHTBOX_SCALE_MAX

  return Math.min(Math.max(scale, LIGHTBOX_SCALE_MIN), maxScale)
}

function resetLightboxGestureState() {
  lightboxImageTransition.value = 'transform 0.18s ease'
  lightboxOffsetX.value = 0
  lightboxOffsetY.value = 0
  lightboxPinching = false
  lightboxPinchLastDistance = 0
  lightboxPinchLastMidpoint = null
  lightboxLastTapAt = 0
  lightboxSuppressClickUntil = 0
  lightboxDragging = false
  lightboxDragMoved = false
  lightboxDragFromPinch = false
  lightboxDragStartX = 0
  lightboxDragStartY = 0
  lightboxDragStartOffsetX = 0
  lightboxDragStartOffsetY = 0
}

function suppressLightboxClick() {
  lightboxSuppressClickUntil = Date.now() + LIGHTBOX_GESTURE_CLICK_SUPPRESS_MS
}

function getLightboxViewportSize() {
  const root = lightboxRootRef.value
  if (!root) {
    return {
      width: window.innerWidth,
      height: window.innerHeight
    }
  }

  const rect = root.getBoundingClientRect()
  const style = window.getComputedStyle(root)
  const horizontalPadding = (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0)
  const verticalPadding = (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)

  return {
    width: Math.max(rect.width - horizontalPadding, 0),
    height: Math.max(rect.height - verticalPadding, 0)
  }
}

function clampLightboxOffset(x, y, scale = lightboxScale.value) {
  const img = lightboxImgRef.value
  if (!img || scale <= LIGHTBOX_SCALE_MIN) {
    return { x: 0, y: 0 }
  }

  const baseWidth = img.offsetWidth || img.clientWidth
  const baseHeight = img.offsetHeight || img.clientHeight
  if (baseWidth < 2 || baseHeight < 2) {
    return { x, y }
  }

  const viewport = getLightboxViewportSize()
  const maxOffsetX = Math.max((baseWidth * scale - viewport.width) / 2, 0)
  const maxOffsetY = Math.max((baseHeight * scale - viewport.height) / 2, 0)

  return {
    x: Math.min(Math.max(x, -maxOffsetX), maxOffsetX),
    y: Math.min(Math.max(y, -maxOffsetY), maxOffsetY)
  }
}

function setLightboxOffset(x, y, scale = lightboxScale.value) {
  const next = clampLightboxOffset(x, y, scale)
  lightboxOffsetX.value = Number(next.x.toFixed(2))
  lightboxOffsetY.value = Number(next.y.toFixed(2))
}

function zoomLightboxAroundPoint(nextScale, clientX, clientY) {
  const previousScale = lightboxScale.value
  const clampedScale = clampLightboxScale(nextScale)

  if (Math.abs(clampedScale - previousScale) < 0.001) {
    if (clampedScale <= LIGHTBOX_SCALE_MIN) {
      setLightboxOffset(0, 0, LIGHTBOX_SCALE_MIN)
    }
    return
  }

  if (clampedScale <= LIGHTBOX_SCALE_MIN) {
    lightboxScale.value = LIGHTBOX_SCALE_MIN
    setLightboxOffset(0, 0, LIGHTBOX_SCALE_MIN)
    return
  }

  const img = lightboxImgRef.value
  if (!img) {
    lightboxScale.value = clampedScale
    return
  }

  const rect = img.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const ratio = clampedScale / previousScale
  const nextOffsetX = lightboxOffsetX.value + (1 - ratio) * (clientX - centerX)
  const nextOffsetY = lightboxOffsetY.value + (1 - ratio) * (clientY - centerY)

  lightboxScale.value = clampedScale
  setLightboxOffset(nextOffsetX, nextOffsetY, clampedScale)
}

function getTouchDistance(touches) {
  if (touches.length < 2) return 0

  const first = touches[0]
  const second = touches[1]
  return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY)
}

function getTouchesMidpoint(touches) {
  if (touches.length < 2) return null

  const first = touches[0]
  const second = touches[1]
  return {
    x: (first.clientX + second.clientX) / 2,
    y: (first.clientY + second.clientY) / 2
  }
}

function syncLightboxScale() {
  if (!lightboxVisible.value) return
  const nextScale = clampLightboxScale(lightboxScale.value)
  lightboxScale.value = nextScale
  if (nextScale <= LIGHTBOX_SCALE_MIN) {
    setLightboxOffset(0, 0, LIGHTBOX_SCALE_MIN)
    return
  }
  setLightboxOffset(lightboxOffsetX.value, lightboxOffsetY.value, nextScale)
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
  if (e.propertyName !== 'transform' && e.propertyName !== 'opacity') return
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
  closeMobileCommunityMenu()
}

function toggleMobileSidebar() {
  if (!isMobileViewport() || !shouldShowDesktopSidebar.value) return
  if (mobileSidebarOpen.value) {
    closeSidebar()
    return
  }

  openSidebar()
}

function toggleMobileMenu() {
  if (mobileSidebarOpen.value) {
    closeSidebar()
  }

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
  resetLightboxGestureState()
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
  resetLightboxGestureState()
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
  resetLightboxGestureState()
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
    if (isMobileViewport()) {
      handleMobileSearchClick()
    } else {
      if (shouldShowDesktopSidebar.value && desktopSidebarCollapsed.value) {
        desktopSidebarCollapsed.value = false
      }
      focusDesktopSearch()
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

  if (desktopCommunityMenuOpen.value) {
    closeDesktopCommunityMenu()
    return
  }

  if (mobileSidebarOpen.value) {
    mobileSidebarOpen.value = false
    return
  }

  if (menuOpen.value) closeMobileMenu()
}

function handleLightboxClick(e) {
  if (lightboxPhase.value !== 'open') return
  if (Date.now() < lightboxSuppressClickUntil) return
  if (!isMobileViewport() && e.target instanceof Element && e.target.closest('.hm-lightbox__content')) return
  startLightboxCloseAnimation()
}

function handleDesktopLightboxWheel(e) {
  if (isMobileViewport()) return
  if (lightboxPhase.value !== 'open') return

  const scaleDelta = e.deltaY < 0
    ? DESKTOP_LIGHTBOX_SCALE_STEP
    : -DESKTOP_LIGHTBOX_SCALE_STEP

  zoomLightboxAroundPoint(
    Number((lightboxScale.value + scaleDelta).toFixed(2)),
    e.clientX,
    e.clientY
  )
}

function handleLightboxTouchStart(e) {
  if (!isMobileViewport()) return
  if (lightboxPhase.value !== 'open') return

  if (e.touches.length === 2) {
    const distance = getTouchDistance(e.touches)
    const midpoint = getTouchesMidpoint(e.touches)
    if (distance < 2 || !midpoint) return

    lightboxDragging = false
    lightboxDragMoved = false
    lightboxPinching = true
    lightboxPinchLastDistance = distance
    lightboxPinchLastMidpoint = midpoint
    lightboxImageTransition.value = 'none'
    lightboxLastTapAt = 0
    suppressLightboxClick()
    e.preventDefault()
    return
  }

  if (e.touches.length !== 1) return
  if (lightboxScale.value <= LIGHTBOX_SCALE_MIN) return

  const touch = e.touches[0]
  lightboxDragging = true
  lightboxDragMoved = false
  lightboxDragFromPinch = false
  lightboxDragStartX = touch.clientX
  lightboxDragStartY = touch.clientY
  lightboxDragStartOffsetX = lightboxOffsetX.value
  lightboxDragStartOffsetY = lightboxOffsetY.value
  lightboxImageTransition.value = 'none'
  e.preventDefault()
}

function handleLightboxTouchMove(e) {
  if (!isMobileViewport()) return
  if (lightboxPhase.value !== 'open') return

  if (lightboxPinching && e.touches.length === 2) {
    const distance = getTouchDistance(e.touches)
    const midpoint = getTouchesMidpoint(e.touches)
    if (distance < 2 || !midpoint || lightboxPinchLastDistance < 2 || !lightboxPinchLastMidpoint) {
      return
    }

    const panDeltaX = midpoint.x - lightboxPinchLastMidpoint.x
    const panDeltaY = midpoint.y - lightboxPinchLastMidpoint.y
    setLightboxOffset(
      lightboxOffsetX.value + panDeltaX,
      lightboxOffsetY.value + panDeltaY,
      lightboxScale.value
    )
    zoomLightboxAroundPoint(
      Number((lightboxScale.value * distance / lightboxPinchLastDistance).toFixed(3)),
      midpoint.x,
      midpoint.y
    )
    lightboxPinchLastDistance = distance
    lightboxPinchLastMidpoint = midpoint
    suppressLightboxClick()
    e.preventDefault()
    return
  }

  if (!lightboxDragging || e.touches.length !== 1) return

  const touch = e.touches[0]
  const deltaX = touch.clientX - lightboxDragStartX
  const deltaY = touch.clientY - lightboxDragStartY
  if (
    !lightboxDragMoved &&
    (Math.abs(deltaX) >= LIGHTBOX_DRAG_START_THRESHOLD_PX || Math.abs(deltaY) >= LIGHTBOX_DRAG_START_THRESHOLD_PX)
  ) {
    lightboxDragMoved = true
  }

  setLightboxOffset(
    lightboxDragStartOffsetX + deltaX,
    lightboxDragStartOffsetY + deltaY,
    lightboxScale.value
  )
  if (lightboxDragMoved) suppressLightboxClick()
  e.preventDefault()
}

function handleLightboxTouchEnd(e) {
  if (!isMobileViewport()) return
  if (lightboxPhase.value !== 'open') return

  if (lightboxPinching) {
    if (e.touches.length < 2) {
      lightboxPinching = false
      lightboxPinchLastDistance = 0
      lightboxPinchLastMidpoint = null
      lightboxImageTransition.value = 'transform 0.18s ease'
      suppressLightboxClick()

      if (e.touches.length === 1 && lightboxScale.value > LIGHTBOX_SCALE_MIN) {
        const touch = e.touches[0]
        lightboxDragging = true
        lightboxDragMoved = false
        lightboxDragFromPinch = true
        lightboxDragStartX = touch.clientX
        lightboxDragStartY = touch.clientY
        lightboxDragStartOffsetX = lightboxOffsetX.value
        lightboxDragStartOffsetY = lightboxOffsetY.value
        lightboxImageTransition.value = 'none'
      }
    }
    return
  }

  if (lightboxDragging) {
    if (e.touches.length === 0) {
      lightboxDragging = false
      lightboxDragStartX = 0
      lightboxDragStartY = 0
      lightboxDragStartOffsetX = lightboxOffsetX.value
      lightboxDragStartOffsetY = lightboxOffsetY.value
      lightboxImageTransition.value = 'transform 0.18s ease'
      if (lightboxDragMoved) {
        suppressLightboxClick()
      } else if (isMobileViewport() && !lightboxDragFromPinch) {
        lightboxLastTapAt = 0
        suppressLightboxClick()
        startLightboxCloseAnimation()
      }
      lightboxDragFromPinch = false
    }
    return
  }

  if (e.touches.length !== 0 || e.changedTouches.length !== 1) return

  const now = Date.now()
  if (now - lightboxLastTapAt > 0 && now - lightboxLastTapAt <= LIGHTBOX_DOUBLE_TAP_DELAY_MS) {
    const touch = e.changedTouches[0]
    if (lightboxScale.value > LIGHTBOX_SCALE_MIN) {
      zoomLightboxAroundPoint(LIGHTBOX_SCALE_MIN, touch.clientX, touch.clientY)
    } else {
      zoomLightboxAroundPoint(MOBILE_LIGHTBOX_DOUBLE_TAP_SCALE, touch.clientX, touch.clientY)
    }
    lightboxLastTapAt = 0
    suppressLightboxClick()
    e.preventDefault()
    return
  }

  lightboxLastTapAt = now
}

function handleLightboxTouchCancel() {
  lightboxPinching = false
  lightboxPinchLastDistance = 0
  lightboxPinchLastMidpoint = null
  lightboxDragging = false
  lightboxDragMoved = false
  lightboxDragFromPinch = false
  lightboxImageTransition.value = 'transform 0.18s ease'
  lightboxLastTapAt = 0
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
    closeMobileCommunityMenu()
  } else {
    closeDesktopCommunityMenu()
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

watch(
  isMobileView,
  () => {
    syncTocScrollListener()
    if (isMobileViewport()) {
      navRoutePendingKey = null
      clearNavRouteProgressTimers()
      navRouteProgress.value = 0
      navRouteProgressVisible.value = false
      navRouteProgressFading.value = false
      navRouteProgressSmooth.value = false
    }

    scheduleDesktopSearchPlaceholderCycle()
  },
  { immediate: true }
)

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
  img.addEventListener('click', () => {
    const lightboxSrc = img.dataset.hmFullSrc || img.currentSrc || img.src
    openLightbox(lightboxSrc, img)
  })
}

function openInfoDialog(message, title = '信息', onConfirm = null, showCancel = false, confirmLabel = '确定') {
  infoDialogTitle.value = title
  infoDialogMessage.value = message
  infoDialogOnConfirm = onConfirm
  infoDialogShowCancel.value = !!(showCancel.value ?? showCancel)
  infoDialogConfirmLabel.value = confirmLabel
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
  infoDialogConfirmLabel.value = '确定'
  syncBodyScrollLock()
}

function openExternalLinkInNewTab(href) {
  const link = document.createElement('a')
  link.href = href
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function handleGithubClick(event) {
  event.preventDefault()

  openInfoDialog(
    '即将前往 GitHub（用于查看文档项目源码与更新记录）中的幻梦文档项目页面，是否继续？',
    '二次确认',
    () => {
      openExternalLinkInNewTab(githubLink.href)
    },
    true,
    '确认'
  )
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

function processCodeBlocks(root = null) {
  const container = root ?? docArticleRef.value
  if (!container) return
  container.querySelectorAll("div[class*='language-']").forEach(bindCodeBlockCopy)
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
        '即将跳转到幻梦QQ群主页，是否确认？',
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
  processCodeBlocks(root)
  bindJoinGroupButtons(root)
}

function bindLightboxTriggers(root = null) {
  const article = root ?? docArticleRef.value
  if (!article) return
  article.querySelectorAll('img').forEach(bindLightboxTrigger)
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

function nextRaf() {
  return new Promise(resolve => {
    requestAnimationFrame(resolve)
  })
}

function resetDocPageTransitionStyles(el) {
  el.style.transition = ''
  el.style.opacity = ''
  el.style.transform = ''
}

function finishDocPageTransitionNow(el) {
  resetDocPageTransitionStyles(el)
  if (el.classList.contains('doc-article') && !el.classList.contains('search-results-article')) {
    docPageEnterInProgress = false
  }
  docPageTransitionState.delete(el)
}

function prepareImageRows({ force = false, root = null } = {}) {
  const article = root ?? docArticleRef.value
  if (!article) return []

  bindLightboxTriggers(article)

  const preparedRows = []
  article.querySelectorAll('p').forEach(p => {
    if (!force && p.dataset.hmProcessedRow) return

    const imgs = Array.from(p.querySelectorAll('img'))
    if (imgs.length <= 1 || !isImageOnlyParagraph(p)) return

    p.dataset.hmProcessedRow = '1'
    p.classList.add('hm-img-row')
    preparedRows.push({ p, imgs })

    if (imgs.every(img => img.complete && img.naturalWidth > 0)) {
      applyMultiImageRowHeights(p, imgs)
    }
  })

  return preparedRows
}

function imgHasExplicitHeight(img) {
  const raw = img.getAttribute('height')
  if (raw == null || String(raw).trim() === '') return false
  const n = Number(raw)
  return Number.isFinite(n) && n > 0
}

function applyMultiImageRowHeights(p, imgs) {
  imgs.forEach(img => {
    bindLightboxTrigger(img)
  })

  /* 仅两张并排时 flush：尊重 HTML height + 小间距。≥3 张仍 flush 会按自然宽度换行成多排 */
  /* 带左/右对齐类时已明确布局意图，跳过 flush，走高度均衡裁剪逻辑 */
  const hasAlignClass = imgs.some(img => img.classList.contains('hm-left-img') || img.classList.contains('hm-right-img'))
  const allExplicitHeight = imgs.length > 0 && imgs.every(imgHasExplicitHeight)
  const useFlush = allExplicitHeight && imgs.length === 2 && !hasAlignClass

  if (useFlush) {
    p.classList.add('hm-img-row--flush')
    imgs.forEach(img => {
      img.style.removeProperty('height')
      img.style.removeProperty('object-fit')
    })
    return
  }

  p.classList.remove('hm-img-row--flush')

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

  // 1. 先同步准备多图行骨架，避免首帧布局跳动
  const preparedRows = prepareImageRows({ force, root: article })

  // 2. 然后处理「纯图片段落」的多图并排布局
  const pending = []
  preparedRows.forEach(({ p, imgs }) => {
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

// -- 手势处理函数 --------------------------------------------------------
function handleSwipeTouchStart(e) {
  if (!isMobileViewport()) return
  if (e.touches.length !== 1) return
  const touch = e.touches[0]
  swipeTouchStartX = touch.clientX
  swipeTouchStartY = touch.clientY
  swipeTracking = true
  swipeAxisLocked = false
  swipeVerticalLocked = false
}

function handleSwipeTouchMove(e) {
  if (!swipeTracking || e.touches.length !== 1) return

  const touch = e.touches[0]
  const dx = Math.abs(touch.clientX - swipeTouchStartX)
  const dy = Math.abs(touch.clientY - swipeTouchStartY)

  if (!swipeAxisLocked && !swipeVerticalLocked) {
    if (dx < SWIPE_AXIS_LOCK_THRESHOLD && dy < SWIPE_AXIS_LOCK_THRESHOLD) return
    if (dy > dx) { swipeVerticalLocked = true }
    else { swipeAxisLocked = true }
  }
}

function handleSwipeTouchEnd(e) {
  if (!swipeTracking) return
  swipeTracking = false
  if (!isMobileViewport()) return

  const changedTouch = e.changedTouches[0]
  if (!changedTouch) return

  const dx = changedTouch.clientX - swipeTouchStartX

  if (swipeVerticalLocked) return

  // 手势：任意位置左滑关闭已打开的侧边栏
  if (dx <= -SWIPE_SIDEBAR_THRESHOLD && mobileSidebarOpen.value) {
    closeSidebar()
    return
  }
}

function handleSwipeTouchCancel() {
  swipeTracking = false
}
onMounted(() => {
  syncColorModeFromDocument()
  syncViewportMode()
  resetMobileHeaderState()
  nextTick(() => {
    processContentActions()
    syncDesktopSidebarLayout()
    processImageRows({ force: true })
    setPendingSearchHeading(window.location.hash)
    void applyPendingSearchHeading()
  })
  document.addEventListener('keydown', handleDocumentKeydown)
  document.addEventListener('click', handleVitepressPluginTabClick)
  document.addEventListener('click', handleDesktopCommunityMenuDocumentClick)
  window.addEventListener('resize', handleWindowResize)
  window.addEventListener('scroll', handleMobileHeaderScroll, { passive: true })
  syncTocScrollListener()
  // 全局手势监听
  document.addEventListener('touchstart', handleSwipeTouchStart, { passive: true })
  document.addEventListener('touchmove', handleSwipeTouchMove, { passive: true })
  document.addEventListener('touchend', handleSwipeTouchEnd, { passive: true })
  document.addEventListener('touchcancel', handleSwipeTouchCancel, { passive: true })

  routerProgressPrevBefore = router.onBeforeRouteChange
  routerProgressPrevAfter = router.onAfterRouteChange ?? router.onAfterRouteChanged

  router.onBeforeRouteChange = async href => {
    const prev = await routerProgressPrevBefore?.(href)
    if (prev === false) return false
    beginRouteNavProgress(href)
  }

  router.onAfterRouteChange = async href => {
    setPendingSearchHeading(getHashTargetFromHref(href), pendingSearchHeadingTitle)
    await routerProgressPrevAfter?.(href)
    requestAnimationFrame(() => {
      completeRouteNavProgressByKey(routeNavComparableKey(href))
    })
  }
})

onBeforeUnmount(() => {
  if (typeof document !== 'undefined') {
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-left')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-top')
    document.documentElement.style.removeProperty('--hm-desktop-sidebar-width')
    document.documentElement.style.removeProperty('--hm-mobile-header-height')
  }
  stopDesktopSearchPlaceholderCycle()
  clearMobileNavCloseFallback()
  clearPendingSearchHeadingFrame()
  if (imageRowProcessFrame) window.cancelAnimationFrame(imageRowProcessFrame)
  copyButtonResetTimers.forEach(timer => clearTimeout(timer))
  copyButtonResetTimers.clear()
  clearNavRouteProgressTimers()
  stopTocScrollListener()
  navRoutePendingKey = null

  try {
    router.onBeforeRouteChange = routerProgressPrevBefore
    router.onAfterRouteChange = routerProgressPrevAfter
  } catch {
    /* HMR / teardown */
  }

  document.removeEventListener('keydown', handleDocumentKeydown)
  document.removeEventListener('click', handleVitepressPluginTabClick)
  document.removeEventListener('click', handleDesktopCommunityMenuDocumentClick)
  window.removeEventListener('resize', handleWindowResize)
  window.removeEventListener('scroll', handleMobileHeaderScroll)
  document.removeEventListener('touchstart', handleSwipeTouchStart)
  document.removeEventListener('touchmove', handleSwipeTouchMove)
  document.removeEventListener('touchend', handleSwipeTouchEnd)
  document.removeEventListener('touchcancel', handleSwipeTouchCancel)
  if (bodyScrollLocked) {
    document.body.style.overflow = previousBodyOverflow
  }
})

watch(
  () => page.value.relativePath,
  () => {
    searchQuery.value = ''
    closeMobileMenu()
    closeCommunityMenus()

    closeInfoDialog()
    forceCloseLightbox()
    resetMobileHeaderState()
    nextTick(() => {
      processContentActions()
      syncDesktopSidebarLayout()
      void applyPendingSearchHeading()
    })
  },
  { flush: 'post' }
)

function onDocPageBeforeEnter(el) {
  docPageEnterInProgress = el.classList.contains('doc-article') && !el.classList.contains('search-results-article')
  setDocPageTransitionState(el, {
    runId: ++docPageTransitionRunId,
    cancelled: false,
    cancelEnter: null
  })

  el.style.transition = 'none'

  if (isMobileViewport()) {
    el.style.opacity = '1'
    el.style.transform = 'translateY(0)'
    return
  }

  el.style.opacity = '0'
  el.style.transform = 'translateY(12px)'
}

async function onDocPageEnter(el, done) {
  const runId = docPageTransitionState.get(el)?.runId
  const finishInvalidEnter = () => {
    finishDocPageTransitionNow(el)
    done()
  }

  try {
    await nextTick()
    if (!isDocPageTransitionValid(el, runId)) {
      finishInvalidEnter()
      return
    }
    if (el.classList.contains('doc-article')) {
      prepareImageRows({ force: true, root: el })
      bindLightboxTriggers(el)
      processContentActions(el)
    }
  } catch (e) {
    console.error(e)
  }

  if (!isDocPageTransitionValid(el, runId)) {
    finishInvalidEnter()
    return
  }

  completeRouteNavProgressByKey(routeNavComparableKey(window.location.href))

  if (isMobileViewport()) {
    await nextRaf()
    if (!isDocPageTransitionValid(el, runId)) {
      finishInvalidEnter()
      return
    }

    finishDocPageTransitionNow(el)
    if (el.classList.contains('doc-article') && !el.classList.contains('search-results-article')) {
      requestAnimationFrame(() => {
        if (!el.isConnected) return
        void processImageRowsAsync({ force: true, root: el })
      })
      requestAnimationFrame(() => {
        void applyPendingSearchHeading()
      })
    }
    done()
    return
  }

  await nextDoubleRaf()
  if (!isDocPageTransitionValid(el, runId)) {
    finishInvalidEnter()
    return
  }

  const ms = isMobileViewport() || performance.now() < docPageDisableAnimUntil ? 0 : DOC_PAGE_TRANSITION_MS
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
    resetDocPageTransitionStyles(el)
    if (!cancelled) {
      if (el.classList.contains('doc-article') && !el.classList.contains('search-results-article')) {
        docPageEnterInProgress = false
        requestAnimationFrame(() => {
          if (!el.isConnected) return
          void processImageRowsAsync({ force: true, root: el })
        })
      }
      if (el.classList.contains('doc-article') && !el.classList.contains('search-results-article')) {
        requestAnimationFrame(() => {
          void applyPendingSearchHeading()
        })
      }
    } else if (el.classList.contains('doc-article') && !el.classList.contains('search-results-article')) {
      docPageEnterInProgress = false
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
    requestAnimationFrame(safeDone)
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
  const ms = isMobileViewport() || performance.now() < docPageDisableAnimUntil ? 0 : DOC_PAGE_TRANSITION_MS
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
    requestAnimationFrame(safeDone)
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
  <div
    class="site-shell"
    :class="{
      'sidebar-compact-mode': !sidebarSpaceEnough,
      'site-shell--doc-sidebar': shouldShowDesktopSidebar && !isMobileView && !desktopSidebarCollapsed
    }"
  >
    <header
      ref="siteHeaderRef"
      class="site-header"
      :class="{
        'mobile-header-hidden': mobileHeaderHidden && !menuOpen,
        'mobile-header-elevated': mobileHeaderElevated && !mobileHeaderHidden,
        'site-header--mobile-nav-open': siteHeaderMobileNavExpanded
      }"
    >
      <div class="site-container site-header-container">
        <div class="site-header-inner">
          <div class="site-branding">
            <a class="site-branding-link" :href="withBase('/')" aria-label="幻梦Bot 首页">
              <img class="site-branding-icon" :src="withBase('/img/hm_icon.png')" alt="" aria-hidden="true">
              <span class="site-branding-text">幻梦Bot</span>
            </a>
          </div>

          <div class="site-header-tools">
            <!-- 桌面端导航，仅 md 及以上可见 -->
            <nav class="site-nav site-nav--desktop">
              <template v-for="link in navLinks" :key="link.href || link.label">
                <a
                  v-if="!isNavDropdownLink(link)"
                  class="site-nav__link"
                  :class="{ active: isActiveLink(link) }"
                  :href="getNavLinkHref(link)"
                  :aria-current="isActiveLink(link) ? 'page' : undefined"
                >
                  {{ link.label }}
                </a>
                <div
                  v-else
                  class="site-nav__item site-nav__item--dropdown"
                  :class="{ open: desktopCommunityMenuOpen }"
                >
                  <button
                    type="button"
                    class="site-nav__link site-nav__link--trigger"
                    :aria-expanded="String(desktopCommunityMenuOpen)"
                    aria-haspopup="true"
                    @click.stop="toggleDesktopCommunityMenu"
                  >
                    <span>{{ link.label }}</span>
                    <svg class="site-nav__chevron" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="m5 7 5 5 5-5" />
                    </svg>
                  </button>
                  <div class="site-nav__dropdown" role="menu" aria-label="社区链接">
                    <a
                      v-for="child in link.children"
                      :key="child.href"
                      class="site-nav__dropdown-link"
                      :href="getNavLinkHref(child)"
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      @click="handleCommunityLinkClick($event, child)"
                    >
                      {{ child.label }}
                    </a>
                  </div>
                </div>
              </template>
            </nav>
          </div>

          <div class="site-header-search" role="search">
            <div class="site-header-search__actions" aria-label="快捷操作">
              <a
                class="site-header-icon-btn"
                :href="githubLink.href"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="打开 Github 仓库"
                title="Github"
                @click="handleGithubClick"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.426 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.866-.013-1.699-2.782.605-3.369-1.344-3.369-1.344-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.748-1.027 2.748-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.748 0 .269.18.58.688.481A10.019 10.019 0 0 0 22 12.017C22 6.484 17.523 2 12 2Z" />
                </svg>
              </a>
              <button
                type="button"
                class="site-header-icon-btn"
                :aria-label="isDarkMode ? '切换到日间模式' : '切换到夜间模式'"
                :title="isDarkMode ? '切换到日间模式' : '切换到夜间模式'"
                @click="toggleColorMode"
              >
                <svg v-if="isDarkMode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.5"></circle>
                  <path d="M12 2.5v2.25"></path>
                  <path d="M12 19.25v2.25"></path>
                  <path d="M4.93 4.93l1.59 1.59"></path>
                  <path d="M17.48 17.48l1.59 1.59"></path>
                  <path d="M2.5 12h2.25"></path>
                  <path d="M19.25 12h2.25"></path>
                  <path d="M4.93 19.07l1.59-1.59"></path>
                  <path d="M17.48 6.52l1.59-1.59"></path>
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.742 13.045A8.088 8.088 0 0 1 10.955 3.258a.75.75 0 0 0-.822-.984A9.5 9.5 0 1 0 21.726 13.867a.75.75 0 0 0-.984-.822Z" />
                </svg>
              </button>
            </div>
            <div class="site-header-search__field">
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                :placeholder="desktopSearchPlaceholder"
                aria-label="搜索内容"
              />
              <span
                v-show="!searchQuery"
                class="site-header-search__placeholder"
                :class="{ 'site-header-search__placeholder--animating': desktopSearchPlaceholderAnimating }"
                :style="desktopSearchPlaceholderAnimationStyle"
                aria-hidden="true"
              >
                {{ desktopSearchPlaceholder }}
              </span>
              <button type="button" class="site-header-search__icon" aria-label="聚焦搜索框" @click="focusDesktopSearch">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </button>
            </div>
          </div>

          <div class="mobile-header-primary">
            <!-- 移动端汉堡按钮，仅 md 以下可见 -->
            <button
              v-if="shouldShowDesktopSidebar"
              class="mobile-menu-btn"
              :class="{ open: mobileSidebarOpen }"
              type="button"
              aria-label="打开侧边栏"
              :aria-expanded="String(mobileSidebarOpen)"
              @click="toggleMobileSidebar"
            >
              <span class="mobile-menu-icon">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </button>

            <div class="site-branding mobile-site-branding">
              <a class="site-branding-link" :href="withBase('/')" aria-label="幻梦Bot 首页">
                <img class="site-branding-icon" :src="withBase('/img/hm_icon.png')" alt="" aria-hidden="true">
                <span class="site-branding-text">幻梦Bot</span>
              </a>
            </div>
          </div>

          <div class="mobile-header-search">
            <div class="mobile-nav-actions mobile-nav-actions--header" aria-label="移动端快捷操作">
              <a
                class="site-header-icon-btn mobile-nav-action-btn"
                :href="githubLink.href"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="打开 Github 仓库"
                title="Github"
                @click="handleGithubClick"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.426 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.866-.013-1.699-2.782.605-3.369-1.344-3.369-1.344-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.748-1.027 2.748-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.748 0 .269.18.58.688.481A10.019 10.019 0 0 0 22 12.017C22 6.484 17.523 2 12 2Z" />
                </svg>
              </a>
              <button
                type="button"
                class="site-header-icon-btn mobile-nav-action-btn"
                :aria-label="isDarkMode ? '切换到日间模式' : '切换到夜间模式'"
                :title="isDarkMode ? '切换到日间模式' : '切换到夜间模式'"
                @click="toggleColorMode"
              >
                <svg v-if="isDarkMode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="4.5"></circle>
                  <path d="M12 2.5v2.25"></path>
                  <path d="M12 19.25v2.25"></path>
                  <path d="M4.93 4.93l1.59 1.59"></path>
                  <path d="M17.48 17.48l1.59 1.59"></path>
                  <path d="M2.5 12h2.25"></path>
                  <path d="M19.25 12h2.25"></path>
                  <path d="M4.93 19.07l1.59-1.59"></path>
                  <path d="M17.48 6.52l1.59-1.59"></path>
                </svg>
                <svg v-else xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M20.742 13.045A8.088 8.088 0 0 1 10.955 3.258a.75.75 0 0 0-.822-.984A9.5 9.5 0 1 0 21.726 13.867a.75.75 0 0 0-.984-.822Z" />
                </svg>
              </button>
            </div>
            <button
              class="mobile-nav-menu-btn"
              :class="{ open: menuOpen }"
              type="button"
              aria-label="打开站点导航和搜索"
              aria-controls="mobile-site-nav"
              :aria-expanded="String(menuOpen)"
              @click="toggleMobileMenu"
            >
              <span class="mobile-nav-menu-icon" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </span>
            </button>
          </div>
        </div>

        <!-- 移动端下拉导航 -->
        <div
          class="mobile-nav"
          :class="{ open: menuOpen }"
          :aria-hidden="menuOpen ? 'false' : 'true'"
          @transitionend.self="onMobileNavTransitionEnd"
        >
          <div class="mobile-nav-inner">
            <div class="mobile-nav-search" role="search">
              <div class="mobile-search-box">
                <input
                  v-model="searchQuery"
                  type="text"
                  :placeholder="desktopSearchPlaceholder"
                  aria-label="搜索内容"
                />
                <span
                  v-show="!searchQuery"
                  class="site-header-search__placeholder mobile-search-box__placeholder"
                  :class="{ 'site-header-search__placeholder--animating': desktopSearchPlaceholderAnimating }"
                  :style="desktopSearchPlaceholderAnimationStyle"
                  aria-hidden="true"
                >
                  {{ desktopSearchPlaceholder }}
                </span>
                <svg class="mobile-search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </div>
            </div>
            <nav id="mobile-site-nav" class="site-nav mobile-nav-links" aria-label="移动端站点导航">
              <template v-for="link in navLinks" :key="link.href || link.label">
                <a
                  v-if="!isNavDropdownLink(link)"
                  class="site-nav__link"
                  :class="{ active: isActiveLink(link) }"
                  :href="getNavLinkHref(link)"
                  :aria-current="isActiveLink(link) ? 'page' : undefined"
                >
                  {{ link.label }}
                </a>
                <div
                  v-else
                  class="mobile-nav__section"
                  :class="{ open: mobileCommunityMenuOpen }"
                >
                  <button
                    type="button"
                    class="site-nav__link mobile-nav__submenu-trigger"
                    :aria-expanded="String(mobileCommunityMenuOpen)"
                    aria-controls="mobile-community-submenu"
                    @click="toggleMobileCommunityMenu"
                  >
                    <span>{{ link.label }}</span>
                  </button>
                  <div
                    id="mobile-community-submenu"
                    class="site-nav__dropdown mobile-nav__popup"
                    :class="{ open: mobileCommunityMenuOpen }"
                  >
                    <div class="mobile-nav__popup-inner">
                      <a
                        v-for="child in link.children"
                        :key="child.href"
                        class="site-nav__dropdown-link mobile-nav__popup-link"
                        :href="getNavLinkHref(child)"
                        target="_blank"
                        rel="noopener noreferrer"
                        @click="handleCommunityLinkClick($event, child)"
                      >
                        {{ child.label }}
                      </a>
                    </div>
                  </div>
                </div>
              </template>
            </nav>
          </div>
        </div>
      </div>

      <!-- 顶部导航加载进度条（移动端/桌面端统一） -->
      <div
        v-show="!isMobileView && (navRouteProgressVisible || navRouteProgressFading)"
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
      <div v-if="menuOpen && !searchQuery.trim()" class="mobile-nav-backdrop" @click="closeMobileMenu"></div>
    </Transition>

    <button
      v-if="shouldShowDesktopSidebar && !isMobileView && desktopSidebarCollapsed"
      class="desktop-sidebar-trigger"
      type="button"
      aria-label="展开侧边栏"
      @click="openSidebar"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m6 17 5-5-5-5"/>
        <path d="m13 17 5-5-5-5"/>
      </svg>
    </button>

    <!-- 侧边栏遮罩 -->
    <Transition name="sidebar-backdrop-fade">
      <div v-if="mobileSidebarOpen && shouldShowDesktopSidebar && isMobileView" class="sidebar-backdrop" @click="mobileSidebarOpen = false"></div>
    </Transition>

    <aside
      v-if="shouldShowDesktopSidebar"
      class="desktop-doc-sidebar"
      :class="{ 'mobile-open': mobileSidebarOpen, 'desktop-collapsed': !isMobileView && desktopSidebarCollapsed }"
      aria-label="页面快捷入口"
    >
      <nav class="desktop-doc-sidebar__panel">
        <div class="sidebar-search-header">
          <span class="desktop-doc-sidebar__heading">页面切换</span>
          <div class="sidebar-header-actions">
            <button class="sidebar-close-trigger" type="button" @click="closeSidebar" aria-label="收起侧边栏">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="11 17 6 12 11 7"></polyline><polyline points="18 17 13 12 18 7"></polyline></svg>
            </button>
          </div>
        </div>
        <hr class="desktop-doc-sidebar__divider" />
        <div class="desktop-doc-sidebar__body">
          <SidebarNavItem
            :items="currentSidebarLinks"
            :page-relative-path="page.relativePath"
          />
        </div>
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
      class="site-main"
      :class="{ 'hmdoc-index-main': !frontmatter.home && page.relativePath === 'hmdoc/index.md' }"
    >
      <div
        ref="mainContainerRef"
        class="site-container site-main__container"
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
            class="doc-article doc-article--padded"
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
            class="doc-article search-results-article doc-article--padded"
          >
            <h1 class="search-results-title">搜索结果（共{{ searchResults.length }}条）</h1>
            <hr class="search-results-divider"/>
            <div class="search-results-list">
              <a 
                v-for="(res, index) in searchResults" 
                :key="index" 
                :href="withBase(res.link)" 
                class="search-result-item"
                @click="handleResultClick(res, $event)"
              >
                <p v-if="res.docTitle !== res.title" class="search-result-context">{{ res.docTitle }}</p>
                <h3 class="search-result-title">{{ res.title }}</h3>
                <p class="search-result-snippet">
                  {{ res.snippetBefore }}<span class="search-highlight">{{ res.match }}</span>{{ res.snippetAfter }}
                </p>
              </a>
              <div v-if="searchResults.length === 0" class="search-results-empty">
                未找到包含 "{{ searchQuery }}" 的结果。
              </div>
            </div>
          </article>
        </Transition>
      </div>
    </main>

    <footer class="site-footer">
      <div class="site-container site-footer-inner">
        <span><a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" class="site-footer-link">浙ICP备2026018380号</a></span>
        <span>© 2024-{{ currentYear }} 幻梦，保留所有权利</span>
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
              {{ infoDialogConfirmLabel }}
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
            :style="{
              transform: `translate3d(${lightboxOffsetX}px, ${lightboxOffsetY}px, 0) scale(${lightboxScale})`,
              transition: lightboxImageTransition,
            }"
            @wheel.prevent="handleDesktopLightboxWheel"
            @touchstart="handleLightboxTouchStart"
            @touchmove="handleLightboxTouchMove"
            @touchend="handleLightboxTouchEnd"
            @touchcancel="handleLightboxTouchCancel"
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
