import { nextTick } from 'vue'

const COPY_BUTTON_RESET_DELAY = 4000

export function useDocContentEnhancements({ docArticleRef, openLightbox, openInfoDialog }) {
  let imageRowProcessFrame = 0
  let imageRowForceProcess = false
  const copyButtonResetTimers = new Map()

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
    } catch {
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

  function handleVitepressPluginTabClick(ev) {
    const article = docArticleRef.value
    if (!article) return
    const tab = ev.target?.closest?.('button.plugin-tabs--tab')
    if (!tab || !article.contains(tab)) return
    nextTick(() => scheduleImageRowProcessing(true))
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

  async function processImageRowsAsync({ force = false, root = null } = {}) {
    const article = root ?? docArticleRef.value
    if (!article) return

    const preparedRows = prepareImageRows({ force, root: article })
    const pending = []
    preparedRows.forEach(({ p, imgs }) => {
      const loadPromises = imgs.map(img => {
        if (img.complete && img.naturalHeight > 0) return Promise.resolve()
        return new Promise(resolve => {
          img.addEventListener('load', resolve, { once: true })
          img.addEventListener('error', resolve, { once: true })
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

  function cleanupDocContentEnhancements() {
    if (imageRowProcessFrame) window.cancelAnimationFrame(imageRowProcessFrame)
    imageRowProcessFrame = 0
    copyButtonResetTimers.forEach(timer => clearTimeout(timer))
    copyButtonResetTimers.clear()
  }

  return {
    processContentActions,
    bindLightboxTriggers,
    scheduleImageRowProcessing,
    handleVitepressPluginTabClick,
    prepareImageRows,
    processImageRows,
    processImageRowsAsync,
    cleanupDocContentEnhancements
  }
}
