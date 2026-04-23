<script setup>
import { useData, useRouter, withBase } from 'vitepress'
import { computed, onBeforeUnmount, onMounted, nextTick, ref, watch } from 'vue'
import SidebarNavItem from './components/SidebarNavItem.vue'
import InfoDialog from './components/InfoDialog.vue'
import LightboxOverlay from './components/LightboxOverlay.vue'
import { supportsDesktopSidebar, supportsTocSidebar } from './page-capabilities.js'
import { githubLink, getCurrentSidebarLinks, navLinks } from './navigation.js'
import { useAppearance } from './composables/useAppearance.js'
import { useDocContentEnhancements } from './composables/useDocContentEnhancements.js'
import { useDocToc } from './composables/useDocToc.js'
import { useInfoDialog } from './composables/useInfoDialog.js'
import { useLightbox } from './composables/useLightbox.js'
import { useBackNavigation } from './composables/useBackNavigation.js'

const { frontmatter, page } = useData()
const router = useRouter()

// --- Back Navigation (from= param) ---
const { backLinkInfo, syncFromParam } = useBackNavigation()

// --- Search Logic ---
const SEARCH_INDEX_PATH = '/search-index.json'
const SEARCH_HISTORY_STORAGE_KEY = 'hm-search-history'
const MAX_SEARCH_HISTORY_ITEMS = 5
const searchQuery = ref('')
const searchInputRef = ref(null)
const searchPageInputRef = ref(null)
const globalSearchModalActive = ref(false)
const { isDarkMode, appearanceMode, appearanceButtonLabel, toggleColorMode } = useAppearance()
const searchIndex = ref([])
const searchIndexLoaded = ref(false)
const searchHistoryItems = ref([])
const desktopSearchHistoryOpen = ref(false)
const desktopSearchHistoryForceOpen = ref(false)
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
let pendingSearchHeadingFlash = true
let pendingSearchHeadingFrame = null
let searchIndexPromise = null
let searchPageFocusPending = false

const isSearchPage = computed(() => page.value.relativePath === 'search/index.md')

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

const shouldShowSearchResults = computed(() => {
  const hasQuery = searchQuery.value.trim().length > 0
  if (!hasQuery) return false
  if (!isMobileView.value) return true
  return isSearchPage.value
})

const shouldShowDesktopSearchHistory = computed(() => {
  if (!desktopSearchHistoryOpen.value || searchHistoryItems.value.length === 0) return false
  return !searchQuery.value.trim() || desktopSearchHistoryForceOpen.value
})

const searchResults = computed(() => {
  if (!shouldShowSearchResults.value) return []
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
  desktopSearchHistoryForceOpen.value = false

  if (!query.trim()) return

  void ensureSearchIndexLoaded()
})

function normalizeSearchKeyword(query) {
  return String(query || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function parseStoredSearchHistory(raw) {
  if (!Array.isArray(raw)) return []

  const seen = new Set()

  return raw
    .map(item => ({
      query: normalizeSearchKeyword(item?.query),
      updatedAt: Number(item?.updatedAt) || 0
    }))
    .filter(item => item.query)
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .filter(item => {
      const key = item.query.toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, MAX_SEARCH_HISTORY_ITEMS)
}

function syncSearchHistoryFromStorage() {
  if (typeof window === 'undefined') return

  try {
    const raw = JSON.parse(window.localStorage.getItem(SEARCH_HISTORY_STORAGE_KEY) || '[]')
    searchHistoryItems.value = parseStoredSearchHistory(raw)
  } catch {
    searchHistoryItems.value = []
  }
}

function persistSearchHistory(items) {
  searchHistoryItems.value = items
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(items))
  } catch {
    /* ignore storage failures */
  }
}

function recordSearchHistory(query) {
  const normalizedQuery = normalizeSearchKeyword(query)
  if (!normalizedQuery) return

  const queryKey = normalizedQuery.toLocaleLowerCase()
  const nextItems = [
    {
      query: normalizedQuery,
      updatedAt: Date.now()
    },
    ...searchHistoryItems.value.filter(item => normalizeSearchKeyword(item.query).toLocaleLowerCase() !== queryKey)
  ].slice(0, MAX_SEARCH_HISTORY_ITEMS)

  persistSearchHistory(nextItems)
}

function removeSearchHistory(query) {
  const normalizedQuery = normalizeSearchKeyword(query)
  if (!normalizedQuery) return

  const queryKey = normalizedQuery.toLocaleLowerCase()
  const nextItems = searchHistoryItems.value.filter(item => normalizeSearchKeyword(item.query).toLocaleLowerCase() !== queryKey)
  persistSearchHistory(nextItems)
}

function reuseSearchHistory(query) {
  const normalizedQuery = normalizeSearchKeyword(query)
  if (!normalizedQuery) return

  searchQuery.value = normalizedQuery

  if (isSearchPage.value) {
    focusSearchPageInput()
    return
  }

  focusDesktopSearch()
}

function clearPendingSearchHeading() {
  pendingSearchHeadingId = ''
  pendingSearchHeadingTitle = ''
  pendingSearchHeadingFlash = true
}

function clearPendingSearchHeadingFrame() {
  if (pendingSearchHeadingFrame != null) {
    cancelAnimationFrame(pendingSearchHeadingFrame)
    pendingSearchHeadingFrame = null
  }
}

function normalizeConfiguredHeading(text) {
  return normalizeHeadingText(String(text || '').replace(/^#+\s*/, ''))
}

function setPendingSearchHeading(id, title = '', flash = true) {
  pendingSearchHeadingId = normalizeHashTarget(id)
  pendingSearchHeadingTitle = normalizeConfiguredHeading(title)
  pendingSearchHeadingFlash = flash
}

async function applyPendingSearchHeading(retries = 60) {
  clearPendingSearchHeadingFrame()
  if (!pendingSearchHeadingId && !pendingSearchHeadingTitle) return

  if (docPageEnterInProgress || !getActiveDocArticle()) {
    if (retries <= 0) {
      clearPendingSearchHeading()
      return
    }

    pendingSearchHeadingFrame = requestAnimationFrame(() => {
      void applyPendingSearchHeading(retries - 1)
    })
    return
  }

  const targetId = pendingSearchHeadingId
  const targetTitle = pendingSearchHeadingTitle
  const shouldFlash = pendingSearchHeadingFlash
  await nextTick()

  if (scrollToHeading(targetId, { updateHash: true, fallbackTitle: targetTitle, instant: true, flash: shouldFlash })) {
    clearPendingSearchHeading()
    return
  }

  if (retries <= 0) {
    clearPendingSearchHeading()
    return
  }

  pendingSearchHeadingFrame = requestAnimationFrame(() => {
    void applyPendingSearchHeading(retries - 1)
  })
}

function focusSearchPageInput() {
  nextTick(() => {
    searchPageInputRef.value?.focus()
  })
}

async function navigateToInternalPage(href) {
  if (typeof router.go === 'function') {
    await router.go(href)
    return
  }

  window.location.href = href
}

async function handleMobileSearchClick(event = null) {
  searchPageFocusPending = true
  closeMobileMenu()
  closeCommunityMenus()
  mobileSidebarOpen.value = false
  globalSearchModalActive.value = false

  if (isSearchPage.value) {
    event?.preventDefault?.()
    focusSearchPageInput()
    return
  }

  if (event) return
  await navigateToInternalPage(withBase('/search/'))
}

function handleSearchNavigation(target, event) {
  closeMobileMenu()
  closeCommunityMenus()
  mobileSidebarOpen.value = false
  globalSearchModalActive.value = false

  if (typeof window === 'undefined') return

  const targetHref = withBase(target.href)
  const currentRouteKey = routeNavComparableKey(window.location.href)
  const targetRouteKey = routeNavComparableKey(targetHref)
  const headingId = normalizeHashTarget(target.headingId || getHashTargetFromHref(targetHref))
  const headingTitle = normalizeConfiguredHeading(target.headingTitle)

  if (headingId || headingTitle) {
    setPendingSearchHeading(headingId, headingTitle, target.flashHeading !== false)
  } else {
    clearPendingSearchHeading()
  }

  if (currentRouteKey !== targetRouteKey) return

  event?.preventDefault?.()
  window.history.pushState(null, '', targetHref)

  if (headingId || headingTitle) {
    void applyPendingSearchHeading()
    return
  }

  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function handleResultClick(result, event) {
  recordSearchHistory(searchQuery.value)
  searchQuery.value = ''
  handleSearchNavigation(
    {
      href: result.link,
      headingId: result.headingId,
      headingTitle: result.headingTitle,
      flashHeading: true
    },
    event
  )
}

function focusDesktopSearch() {
  desktopSearchHistoryOpen.value = true
  desktopSearchHistoryForceOpen.value = false
  nextTick(() => {
    searchInputRef.value?.focus()
  })
}

function handleDesktopSearchInputClick() {
  if (
    document.activeElement !== searchInputRef.value
    || !searchQuery.value.trim()
    || searchHistoryItems.value.length === 0
  ) {
    return
  }

  desktopSearchHistoryOpen.value = true
  desktopSearchHistoryForceOpen.value = true
}

function handleDesktopSearchHistoryRemovePointerDown(event) {
  event.preventDefault()
}

function handleDesktopSearchFieldFocusOut(event) {
  const nextFocused = event.relatedTarget
  if (nextFocused instanceof Element && nextFocused.closest('.site-header-search__field')) return
  desktopSearchHistoryOpen.value = false
  desktopSearchHistoryForceOpen.value = false
}

function closeGlobalSearch() {
  globalSearchModalActive.value = false
  searchQuery.value = ''
}
const currentYear = new Date().getFullYear()
const shouldShowDesktopSidebar = computed(() => supportsDesktopSidebar(page.value.relativePath))
const supportsCurrentPageTocSidebar = computed(() => supportsTocSidebar(page.value.relativePath))
const currentSidebarLinks = computed(() => getCurrentSidebarLinks(page.value.relativePath))

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

/** 文档页 `<article class="doc-article">`，避免 `querySelector` 命中过渡中错误的节点 */
const docArticleRef = ref(null)
const siteHeaderRef = ref(null)
const mainContainerRef = ref(null)
const infoDialogRef = ref(null)
const {
  infoDialogVisible,
  infoDialogTitle,
  infoDialogMessage,
  infoDialogShowCancel,
  infoDialogConfirmLabel,
  openInfoDialog,
  closeInfoDialog,
  handleInfoDialogConfirm
} = useInfoDialog()

function isMobileViewport() {
  return isMobileView.value
}

const {
  lightboxSrc,
  lightboxVisible,
  lightboxScale,
  lightboxOffsetX,
  lightboxOffsetY,
  lightboxImageTransition,
  lightboxPhase,
  lightboxBackdropOpacity,
  lightboxRootRef,
  lightboxFlipRef,
  lightboxImgRef,
  syncLightboxScale,
  openLightbox,
  forceCloseLightbox,
  startLightboxCloseAnimation,
  handleLightboxClick,
  handleDesktopLightboxWheel,
  handleLightboxTouchStart,
  handleLightboxTouchMove,
  handleLightboxTouchEnd,
  handleLightboxTouchCancel
} = useLightbox({ isMobileViewport })
const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)'
/** 与 style.css 中桌面侧栏媒体查询一致 */
const DESKTOP_SIDEBAR_MEDIA_QUERY = '(min-width: 992px)'
const DESKTOP_SIDEBAR_WIDTH_PX = 256
/** 与 style.css 中 .mobile-nav 的 grid-template-rows 时长一致 */
const MOBILE_NAV_PANEL_MS = 300
const MOBILE_NAV_CLOSE_FALLBACK_MS = MOBILE_NAV_PANEL_MS + 100
const MOBILE_HEADER_SCROLL_DELTA = 8
const NAV_ROUTE_PROGRESS_START_MS = 0
const NAV_ROUTE_PROGRESS_PER_SECOND = 60
const NAV_ROUTE_PROGRESS_CAP = 90
const NAV_ROUTE_PROGRESS_TO_100_MS = 320
const NAV_ROUTE_PROGRESS_FADE_MS = 360
const DOC_PAGE_TRANSITION_MS = 240
const MOBILE_DOC_PAGE_TRANSITION_MS = 180
const DOC_PAGE_FAST_SWITCH_WINDOW_MS = 180
const DOC_PAGE_FAST_SWITCH_DISABLE_ANIM_MS = 420
const DESKTOP_SEARCH_PLACEHOLDER_IDLE_MS = 4000
const DESKTOP_SEARCH_PLACEHOLDER_ANIM_MS = 1200
const DESKTOP_SEARCH_PLACEHOLDER_SWAP_MS = DESKTOP_SEARCH_PLACEHOLDER_ANIM_MS / 2
const FAST_TAP_ZOOM_GUARD_WINDOW_MS = 320
const FAST_TAP_ZOOM_GUARD_MOVE_PX = 24
const FAST_TAP_ZOOM_GUARD_SELECTOR = [
  'button',
  '[role="button"]',
  'a[href]',
  'summary',
  'label[for]',
  '.VPButton',
  '.plugin-tabs--tab'
].join(', ')
const desktopSearchPlaceholderAnimationStyle = {
  '--hm-search-placeholder-anim-ms': `${DESKTOP_SEARCH_PLACEHOLDER_ANIM_MS}ms`
}
let lastScrollY = 0
let bodyScrollLocked = false
let previousBodyOverflow = ''
let docPageEnterInProgress = false
const {
  processContentActions,
  bindLightboxTriggers,
  scheduleImageRowProcessing,
  handleVitepressPluginTabClick,
  prepareImageRows,
  processImageRows,
  processImageRowsAsync,
  cleanupDocContentEnhancements
} = useDocContentEnhancements({
  docArticleRef,
  openLightbox,
  openInfoDialog
})

const {
  tocHeaders,
  activeTocId,
  tocIndicatorStyle,
  shouldShowTOC,
  syncTocScrollListener,
  stopTocScrollListener,
  cleanupToc,
  scrollToHeading,
  scrollToToc,
  normalizeHashTarget,
  getHashTargetFromHref,
  normalizeHeadingText
} = useDocToc({
  docArticleRef,
  isMobileView,
  supportsCurrentPageTocSidebar,
  onContentReady: () => applyPendingSearchHeading()
})

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
let lastFastTapZoomGuardAt = 0
let lastFastTapZoomGuardX = 0
let lastFastTapZoomGuardY = 0
let lastFastTapZoomGuardControl = null

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
    desktopSearchHistoryOpen.value = false
    desktopSearchHistoryForceOpen.value = false
    return
  }
  if (target.closest('.site-nav__item--dropdown')) return
  if (target.closest('.site-header-search__field')) return
  closeDesktopCommunityMenu()
  desktopSearchHistoryOpen.value = false
  desktopSearchHistoryForceOpen.value = false
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

function isIOSWebKitZoomSurface() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /iP(ad|hone|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function findFastTapZoomGuardControl(target) {
  if (!(target instanceof Element)) return null
  const control = target.closest(FAST_TAP_ZOOM_GUARD_SELECTOR)
  if (!(control instanceof HTMLElement)) return null
  if (control.matches(':disabled, [aria-disabled="true"]')) return null
  return control
}

function shouldPreventBrowserGestureZoom(target) {
  return !(target instanceof Element && target.closest('.hm-lightbox__content'))
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

function handleFastTapZoomGuardTouchEnd(e) {
  if (!isIOSWebKitZoomSurface()) return
  if (e.touches.length > 0 || e.changedTouches.length !== 1) return

  const control = findFastTapZoomGuardControl(e.target)
  if (!control) return

  const touch = e.changedTouches[0]
  const now = e.timeStamp || performance.now()
  const repeatedQuickly = now - lastFastTapZoomGuardAt <= FAST_TAP_ZOOM_GUARD_WINDOW_MS
  const tappedSameControl = control === lastFastTapZoomGuardControl
  const tappedNearby = Math.abs(touch.clientX - lastFastTapZoomGuardX) <= FAST_TAP_ZOOM_GUARD_MOVE_PX
    && Math.abs(touch.clientY - lastFastTapZoomGuardY) <= FAST_TAP_ZOOM_GUARD_MOVE_PX

  if (repeatedQuickly && (tappedSameControl || tappedNearby)) {
    e.preventDefault()
    control.click()
  }

  lastFastTapZoomGuardAt = now
  lastFastTapZoomGuardX = touch.clientX
  lastFastTapZoomGuardY = touch.clientY
  lastFastTapZoomGuardControl = control
}

function handleBrowserGestureZoomGuard(e) {
  if (!isIOSWebKitZoomSurface()) return
  if (!shouldPreventBrowserGestureZoom(e.target)) return
  e.preventDefault()
}

onMounted(() => {
  syncFromParam()
  syncSearchHistoryFromStorage()
  syncViewportMode()
  resetMobileHeaderState()
  nextTick(() => {
    processContentActions()
    syncDesktopSidebarLayout()
    processImageRows({ force: true })
    setPendingSearchHeading(window.location.hash)
    void applyPendingSearchHeading()

    if (isSearchPage.value) {
      focusSearchPageInput()
    }
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
  document.addEventListener('touchend', handleFastTapZoomGuardTouchEnd, { passive: false })
  document.addEventListener('gesturestart', handleBrowserGestureZoomGuard, { passive: false })
  document.addEventListener('gesturechange', handleBrowserGestureZoomGuard, { passive: false })
  document.addEventListener('gestureend', handleBrowserGestureZoomGuard, { passive: false })

  routerProgressPrevBefore = router.onBeforeRouteChange
  routerProgressPrevAfter = router.onAfterRouteChange ?? router.onAfterRouteChanged

  router.onBeforeRouteChange = async href => {
    const prev = await routerProgressPrevBefore?.(href)
    if (prev === false) return false
    beginRouteNavProgress(href)
  }

  router.onAfterRouteChange = async href => {
    syncFromParam()
    setPendingSearchHeading(getHashTargetFromHref(href), pendingSearchHeadingTitle, pendingSearchHeadingFlash)
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
  cleanupDocContentEnhancements()
  clearNavRouteProgressTimers()
  cleanupToc()
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
  document.removeEventListener('touchend', handleFastTapZoomGuardTouchEnd)
  document.removeEventListener('gesturestart', handleBrowserGestureZoomGuard)
  document.removeEventListener('gesturechange', handleBrowserGestureZoomGuard)
  document.removeEventListener('gestureend', handleBrowserGestureZoomGuard)
  if (bodyScrollLocked) {
    document.body.style.overflow = previousBodyOverflow
  }
})

watch(
  () => page.value.relativePath,
  () => {
    searchQuery.value = ''
    desktopSearchHistoryOpen.value = false
    closeMobileMenu()
    closeCommunityMenus()

    closeInfoDialog()
    forceCloseLightbox()
    resetMobileHeaderState()
    nextTick(() => {
      processContentActions()
      syncDesktopSidebarLayout()
      void applyPendingSearchHeading()

      if (searchPageFocusPending && isSearchPage.value) {
        searchPageFocusPending = false
        focusSearchPageInput()
      }
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
  el.style.opacity = '0'

  if (!isMobileViewport()) {
    el.style.transform = 'translateY(12px)'
  }
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

  await nextDoubleRaf()
  if (!isDocPageTransitionValid(el, runId)) {
    finishInvalidEnter()
    return
  }

  const mobile = isMobileViewport()
  const ms = performance.now() < docPageDisableAnimUntil ? 0 : (mobile ? MOBILE_DOC_PAGE_TRANSITION_MS : DOC_PAGE_TRANSITION_MS)
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
    if (!mobile) el.style.transform = 'translateY(0)'
    requestAnimationFrame(safeDone)
    return
  }

  el.style.transition = mobile
    ? `opacity ${ms}ms ease`
    : `opacity ${ms}ms ease, transform ${ms}ms ease`
  rafOuter = requestAnimationFrame(() => {
    rafInner = requestAnimationFrame(() => {
      if (!isDocPageTransitionValid(el, runId)) {
        safeDone({ cancelled: true })
        return
      }
      el.style.opacity = '1'
      if (!mobile) el.style.transform = 'translateY(0)'
    })
  })
}

function onDocPageLeave(el, done) {
  const state = docPageTransitionState.get(el)
  if (state) state.cancelled = true
  cancelDocPageEnterTransition(el)
  const mobile = isMobileViewport()
  const ms = performance.now() < docPageDisableAnimUntil ? 0 : (mobile ? MOBILE_DOC_PAGE_TRANSITION_MS : DOC_PAGE_TRANSITION_MS)
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

  el.style.transition = mobile
    ? `opacity ${ms}ms ease`
    : `opacity ${ms}ms ease, transform ${ms}ms ease`
  requestAnimationFrame(() => {
    el.style.opacity = '0'
    if (!mobile) el.style.transform = 'translateY(12px)'
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
  infoDialogRef.value?.focusConfirmButton?.()
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
                :aria-label="appearanceButtonLabel"
                :title="appearanceButtonLabel"
                @click="toggleColorMode"
              >
                <svg v-if="appearanceMode === 'auto'" class="appearance-auto-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.25"></circle>
                  <path d="M12 3.75A8.25 8.25 0 0 1 12 20.25Z" fill="currentColor" stroke="none"></path>
                </svg>
                <svg v-else-if="isDarkMode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
            <div
              class="site-header-search__field"
              :class="{ 'site-header-search__field--history-open': shouldShowDesktopSearchHistory }"
              @focusin="desktopSearchHistoryOpen = true"
              @focusout="handleDesktopSearchFieldFocusOut"
            >
              <input
                ref="searchInputRef"
                v-model="searchQuery"
                type="text"
                :placeholder="desktopSearchPlaceholder"
                aria-label="搜索内容"
                @click="handleDesktopSearchInputClick"
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
              <div v-if="shouldShowDesktopSearchHistory" class="desktop-search-tip-dropdown" aria-label="搜索历史记录">
                <!-- <div class="desktop-search-tip-dropdown__title">搜索历史记录</div> -->
                <div
                  v-for="item in searchHistoryItems"
                  :key="item.query"
                  class="desktop-search-history-item"
                >
                  <button type="button" class="site-nav__dropdown-link desktop-search-history-item__query" @click="reuseSearchHistory(item.query)">
                    {{ item.query }}
                  </button>
                  <button type="button" class="desktop-search-history-item__remove" aria-label="删除搜索历史记录" @mousedown="handleDesktopSearchHistoryRemovePointerDown" @click.stop="removeSearchHistory(item.query)">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                  </button>
                </div>
              </div>
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
                :aria-label="appearanceButtonLabel"
                :title="appearanceButtonLabel"
                @click="toggleColorMode"
              >
                <svg v-if="appearanceMode === 'auto'" class="appearance-auto-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.25"></circle>
                  <path d="M12 3.75A8.25 8.25 0 0 1 12 20.25Z" fill="currentColor" stroke="none"></path>
                </svg>
                <svg v-else-if="isDarkMode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
              <a
                class="site-nav__link mobile-nav__search-link"
                :class="{ active: isSearchPage }"
                :href="withBase('/search/')"
                :aria-current="isSearchPage ? 'page' : undefined"
                @click="handleMobileSearchClick($event)"
              >
                <span>搜索</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              </a>
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
      <div v-if="menuOpen" class="mobile-nav-backdrop" @click="closeMobileMenu"></div>
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
          <div v-if="frontmatter.home && !shouldShowSearchResults" key="vp-route-home">
            <Content />
          </div>
          <article
            v-else-if="isSearchPage"
            ref="docArticleRef"
            key="vp-route-search-page"
            class="doc-article search-page-article doc-article--padded"
          >
            <div class="search-page-search">
              <h1 class="search-page-heading">搜索</h1>
              <div class="search-page-search__box">
                <div class="search-page-search__field">
                  <input
                    ref="searchPageInputRef"
                    v-model="searchQuery"
                    type="text"
                    :placeholder="desktopSearchPlaceholder"
                    aria-label="搜索内容"
                  />
                  <span
                    v-show="!searchQuery"
                    class="site-header-search__placeholder search-page-search__placeholder"
                    :class="{ 'site-header-search__placeholder--animating': desktopSearchPlaceholderAnimating }"
                    :style="desktopSearchPlaceholderAnimationStyle"
                    aria-hidden="true"
                  >
                    {{ desktopSearchPlaceholder }}
                  </span>
                </div>
                <button type="button" class="search-page-search__icon" aria-label="聚焦搜索框" @click="focusSearchPageInput">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                </button>
              </div>
            </div>

            <section v-if="!searchQuery.trim()" class="search-page-tips">
              <p class="search-page-tips__title">搜索历史记录</p>
              <ol v-if="searchHistoryItems.length" class="search-page-tips__list">
                <li v-for="item in searchHistoryItems" :key="item.query" class="search-page-tips__item">
                  <button type="button" class="search-page-tips__link" @click="reuseSearchHistory(item.query)">
                    {{ item.query }}
                  </button>
                </li>
              </ol>
              <p v-else class="search-results-empty">还没有搜索历史记录。</p>
            </section>

            <section v-else>
              <h2 class="search-results-title">搜索结果（共{{ searchResults.length }}条）</h2>
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
            </section>
          </article>
          <article
            v-else-if="!shouldShowSearchResults"
            ref="docArticleRef"
            :key="page.relativePath"
            class="doc-article doc-article--padded"
            :class="{
              'docs-index-article': page.relativePath === 'docs/index.md',
              'docs-support-article': page.relativePath === 'about/support.md'
            }"
          >
            <a v-if="backLinkInfo" :href="withBase(backLinkInfo.url)" class="doc-back-btn">
              <span class="doc-back-btn__icon" aria-hidden="true">
                <svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M11.5 3.5L7.5 8L11.5 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                  <path d="M7.5 3.5L3.5 8L7.5 12.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </span>
              <span>返回到"{{ backLinkInfo.label }}"</span>
            </a>
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

    <InfoDialog
      ref="infoDialogRef"
      :visible="infoDialogVisible"
      :title="infoDialogTitle"
      :message="infoDialogMessage"
      :show-cancel="infoDialogShowCancel"
      :confirm-label="infoDialogConfirmLabel"
      @close="closeInfoDialog"
      @confirm="handleInfoDialogConfirm"
    />

    <LightboxOverlay
      v-model:lightbox-root-ref="lightboxRootRef"
      v-model:lightbox-flip-ref="lightboxFlipRef"
      v-model:lightbox-img-ref="lightboxImgRef"
      :visible="lightboxVisible"
      :phase="lightboxPhase"
      :backdrop-opacity="lightboxBackdropOpacity"
      :src="lightboxSrc"
      :offset-x="lightboxOffsetX"
      :offset-y="lightboxOffsetY"
      :scale="lightboxScale"
      :image-transition="lightboxImageTransition"
      @click="handleLightboxClick"
      @wheel="handleDesktopLightboxWheel"
      @touchstart="handleLightboxTouchStart"
      @touchmove="handleLightboxTouchMove"
      @touchend="handleLightboxTouchEnd"
      @touchcancel="handleLightboxTouchCancel"
    />

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
