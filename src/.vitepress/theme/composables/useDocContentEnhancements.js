import { nextTick } from 'vue'

const COPY_BUTTON_RESET_DELAY = 4000
const TABLE_COLLAPSED_ROW_LIMIT = 8
/* 与 style.css 中 .hm-table-wrap--height-animating 的 height 过渡时长
   （0.2s）对齐，略加余量保证过渡完成后再摘除动画类 */
const TABLE_EXPAND_ANIMATION_DURATION = 220
const TABLE_COLLAPSE_ANIMATION_DURATION = 220

export function useDocContentEnhancements({ docArticleRef, openLightbox, openInfoDialog, isMobileViewport }) {
  let imageRowProcessFrame = 0
  let imageRowForceProcess = false
  let tableIdCounter = 0
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
        if (!isMobileViewport()) return

        e.preventDefault()
        const href = btn.href
        const target = btn.target || '_blank'
        const title = btn.dataset.confirmTitle || '提示'
        const message = btn.dataset.confirmMessage || '即将跳转到幻梦QQ群主页，是否确认？'
        const confirmLabel = btn.dataset.confirmLabel || '确定'
        openInfoDialog(
          message,
          title,
          () => {
            window.open(href, target)
          },
          true,
          confirmLabel
        )
      })
    })
  }

  function ensureTableId(table) {
    if (table.id) return table.id
    tableIdCounter += 1
    table.id = `hm-table-${tableIdCounter}`
    return table.id
  }

  function getTableToggle(wrap) {
    const next = wrap.nextElementSibling
    if (next?.classList?.contains('hm-table-toggle')) return next

    const toggle = document.createElement('div')
    toggle.className = 'hm-table-toggle'

    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'hm-table-toggle__button'
    toggle.appendChild(button)
    wrap.insertAdjacentElement('afterend', toggle)

    return toggle
  }

  function removeTableToggle(wrap) {
    const next = wrap.nextElementSibling
    if (next?.classList?.contains('hm-table-toggle')) next.remove()
  }

  function clearTableAnimationTimer(wrap) {
    const timer = Number(wrap.dataset.hmTableAnimationTimer)
    if (timer) window.clearTimeout(timer)
    delete wrap.dataset.hmTableAnimationTimer
  }

  function setTableRowsCollapsedState(rows, collapsed) {
    rows.forEach((row, index) => {
      row.hidden = false

      /* 溢出行/折叠边界行用类标记，CSS 不再硬编码 nth-child 行号，
         行数阈值只需改 TABLE_COLLAPSED_ROW_LIMIT 一处 */
      row.classList.toggle('hm-table-row--overflow', index >= TABLE_COLLAPSED_ROW_LIMIT)
      row.classList.toggle('hm-table-row--collapse-edge', index === TABLE_COLLAPSED_ROW_LIMIT - 1)

      if (collapsed && index >= TABLE_COLLAPSED_ROW_LIMIT) {
        row.setAttribute('aria-hidden', 'true')
      } else {
        row.removeAttribute('aria-hidden')
      }
    })
  }

  function setTableExpandedClasses(wrap, rows, collapsed, { collapsing = false } = {}) {
    wrap.classList.toggle('hm-table-wrap--collapsible', rows.length > TABLE_COLLAPSED_ROW_LIMIT)
    wrap.classList.toggle('hm-table-wrap--collapsed', collapsed)
    wrap.classList.toggle('hm-table-wrap--expanded', !collapsed)
    wrap.classList.toggle('hm-table-wrap--collapsing', collapsing)
  }

  /* 折叠/展开时对 wrap 高度做 FLIP 过渡：先量起点高度，套用终态后量
     终点高度，再用一段短过渡从起点滑到终点——表格下方的内容随之
     平滑移动，而不是在行显隐瞬间硬生生跳位 */
  function animateTableWrapHeight(wrap, startHeight, endHeight) {
    if (Math.round(startHeight) === Math.round(endHeight)) return
    wrap.classList.add('hm-table-wrap--height-animating')
    wrap.style.height = `${startHeight}px`
    void wrap.offsetHeight
    wrap.style.height = `${endHeight}px`
  }

  function clearTableWrapHeightAnimation(wrap) {
    wrap.classList.remove('hm-table-wrap--height-animating')
    wrap.style.removeProperty('height')
  }

  function finishTableAnimation(wrap, rows, collapsed) {
    const expectedExpanded = collapsed ? 'false' : 'true'
    if (wrap.dataset.hmTableExpanded !== expectedExpanded) return

    setTableRowsCollapsedState(rows, collapsed)
    clearTableWrapHeightAnimation(wrap)
    wrap.classList.remove('hm-table-wrap--animating', 'hm-table-wrap--collapsing')
    delete wrap.dataset.hmTableAnimationTimer
  }

  function scheduleTableAnimationFinish(wrap, rows, collapsed) {
    const timer = window.setTimeout(() => {
      finishTableAnimation(wrap, rows, collapsed)
    }, collapsed ? TABLE_COLLAPSE_ANIMATION_DURATION : TABLE_EXPAND_ANIMATION_DURATION)

    wrap.dataset.hmTableAnimationTimer = String(timer)
  }

  function applyTableCollapsedState(wrap, rows, collapsed, { animate = false } = {}) {
    clearTableAnimationTimer(wrap)
    wrap.dataset.hmTableExpanded = collapsed ? 'false' : 'true'

    if (!animate) {
      setTableExpandedClasses(wrap, rows, collapsed)
      setTableRowsCollapsedState(rows, collapsed)
      clearTableWrapHeightAnimation(wrap)
      wrap.classList.remove('hm-table-wrap--animating', 'hm-table-wrap--collapsing')
      return
    }

    /* 起点高度用 getBoundingClientRect 取当前视觉值：连点切换时
       可能正处于上一段高度过渡中，从中断点继续而不是跳变 */
    const startHeight = wrap.getBoundingClientRect().height
    clearTableWrapHeightAnimation(wrap)

    if (collapsed) {
      /* 先摘掉 --animating 套用折叠终态（溢出行高度归零）量出终点高度，
         再加回 --animating 恢复行高，让行内容在高度过渡期间淡出 */
      wrap.classList.remove('hm-table-wrap--animating')
      setTableRowsCollapsedState(rows, true)
      setTableExpandedClasses(wrap, rows, true, { collapsing: true })
      const endHeight = wrap.getBoundingClientRect().height
      wrap.classList.add('hm-table-wrap--animating')
      animateTableWrapHeight(wrap, startHeight, endHeight)
      scheduleTableAnimationFinish(wrap, rows, true)
      return
    }

    wrap.classList.add('hm-table-wrap--animating')
    setTableRowsCollapsedState(rows, false)
    const endHeight = wrap.getBoundingClientRect().height
    animateTableWrapHeight(wrap, startHeight, endHeight)
    window.requestAnimationFrame(() => {
      if (wrap.dataset.hmTableExpanded !== 'true') return
      setTableExpandedClasses(wrap, rows, false)
      scheduleTableAnimationFinish(wrap, rows, false)
    })
  }

  function updateTableToggle(wrap, table, rows) {
    const toggle = getTableToggle(wrap)
    const button = toggle.querySelector('button')
    const tableId = ensureTableId(table)
    const isExpanded = wrap.dataset.hmTableExpanded === 'true'

    button.setAttribute('aria-controls', tableId)
    button.setAttribute('aria-expanded', String(isExpanded))
    button.textContent = isExpanded ? '收起表格' : '展开表格'
    button.setAttribute(
      'aria-label',
      isExpanded
        ? `收起表格，只显示前 ${TABLE_COLLAPSED_ROW_LIMIT} 行`
        : `展开表格，显示全部 ${rows.length} 行`
    )

    if (button.dataset.hmTableToggleBound === '1') return
    button.dataset.hmTableToggleBound = '1'
    button.addEventListener('click', () => {
      const nextExpanded = wrap.dataset.hmTableExpanded !== 'true'
      applyTableCollapsedState(wrap, rows, !nextExpanded, { animate: true })
      updateTableToggle(wrap, table, rows)
    })
  }

  function processCollapsibleTables(root = null) {
    const container = root ?? docArticleRef.value
    if (!container) return

    container.querySelectorAll('.hm-table-wrap').forEach(wrap => {
      const table = wrap.querySelector(':scope > table')
      const rows = Array.from(table?.querySelectorAll(':scope > tbody > tr') || [])

      if (!table || rows.length <= TABLE_COLLAPSED_ROW_LIMIT) {
        clearTableAnimationTimer(wrap)
        clearTableWrapHeightAnimation(wrap)
        rows.forEach(row => {
          row.hidden = false
          row.removeAttribute('aria-hidden')
          row.classList.remove('hm-table-row--overflow', 'hm-table-row--collapse-edge')
        })
        wrap.classList.remove(
          'hm-table-wrap--collapsible',
          'hm-table-wrap--collapsed',
          'hm-table-wrap--expanded',
          'hm-table-wrap--animating',
          'hm-table-wrap--collapsing'
        )
        delete wrap.dataset.hmTableExpanded
        removeTableToggle(wrap)
        return
      }

      const shouldCollapse = wrap.dataset.hmTableExpanded !== 'true'
      applyTableCollapsedState(wrap, rows, shouldCollapse)
      updateTableToggle(wrap, table, rows)
    })
  }

  function processContentActions(root = null) {
    processCodeBlocks(root)
    bindJoinGroupButtons(root)
    processCollapsibleTables(root)
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

  function imgHasExplicitDimension(img) {
    /* 构建期自动注入的宽高（data-hm-auto-size）不算作者显式声明 */
    if (img.dataset.hmAutoSize === '1') return false
    for (const attr of ['width', 'height']) {
      const raw = img.getAttribute(attr)
      if (raw == null || String(raw).trim() === '') continue
      const n = Number(raw)
      if (Number.isFinite(n) && n > 0) return true
    }
    return false
  }

  function applyMultiImageRowHeights(p, imgs) {
    imgs.forEach(img => {
      bindLightboxTrigger(img)
    })

    const hasAlignClass = imgs.some(img => img.classList.contains('hm-left-img') || img.classList.contains('hm-right-img'))
    const allExplicitDimension = imgs.length > 0 && imgs.every(imgHasExplicitDimension)
    const useFlush = allExplicitDimension && imgs.length === 2 && !hasAlignClass

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
