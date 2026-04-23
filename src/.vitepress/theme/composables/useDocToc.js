import { onContentUpdated } from 'vitepress'
import { computed, nextTick, ref, watch } from 'vue'

export function useDocToc({ docArticleRef, isMobileView, supportsCurrentPageTocSidebar, onContentReady = null }) {
  const tocHeaders = ref([])
  const activeTocId = ref('')
  const tocIndicatorStyle = ref({ transform: 'translateY(0)', height: '0', opacity: '0' })
  let tocScrollTimeout = null
  let tocScrollListening = false

  function isMobileViewport() {
    return isMobileView.value
  }

  watch(activeTocId, async newId => {
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
    } catch {
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
        if (top <= 120) {
          currentId = headers[i].id
        } else {
          break
        }
      }
    }
    activeTocId.value = currentId
  }

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
        title
      }
    })
    nextTick(() => {
      syncTocScrollListener()
      void onContentReady?.()
    })
  })

  function easeInOutQuint(t) {
    return t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2
  }

  function smoothScrollTo(endY, duration, callback) {
    const startY = window.scrollY
    const distanceY = endY - startY
    const startTime = performance.now()

    function step(time) {
      const elapsed = time - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = easeInOutQuint(progress)

      window.scrollTo(0, startY + distanceY * ease)

      if (progress < 1) {
        requestAnimationFrame(step)
      } else if (callback) {
        callback()
      }
    }

    requestAnimationFrame(step)
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

  function scrollToHeading(id, { updateHash = false, fallbackTitle = '', instant = false, flash = true } = {}) {
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
      if (flash) {
        flashHeading(el)
      }
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
      if (flash) {
        flashHeading(el)
      }
    })

    tocScrollTimeout = setTimeout(() => {
      tocScrollTimeout = null
    }, duration + 50)

    return true
  }

  function scrollToToc(id) {
    scrollToHeading(id, { updateHash: true })
  }

  function cleanupToc() {
    stopTocScrollListener()
    if (tocScrollTimeout) {
      clearTimeout(tocScrollTimeout)
      tocScrollTimeout = null
    }
  }

  const shouldShowTOC = computed(() => !isMobileView.value && supportsCurrentPageTocSidebar.value && tocHeaders.value.length > 0)

  return {
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
  }
}
