import { nextTick, ref } from 'vue'

/* 最小缩放 0.5：允许把图片缩小到适配尺寸的一半查看全貌；
   FIT(=1) 是"刚好适配视口"的基准，平移/关闭等交互仍以它为界。 */
const LIGHTBOX_SCALE_MIN = 0.5
const LIGHTBOX_FIT_SCALE = 1
const MOBILE_LIGHTBOX_SCALE_MAX = 4
const MOBILE_LIGHTBOX_DOUBLE_TAP_SCALE = 2.5
const DESKTOP_LIGHTBOX_SCALE_MAX = 4
const DESKTOP_LIGHTBOX_SCALE_STEP = 0.4
const LIGHTBOX_DOUBLE_TAP_DELAY_MS = 280
const DESKTOP_LIGHTBOX_DOUBLE_CLICK_DELAY_MS = 360
const DESKTOP_LIGHTBOX_DOUBLE_CLICK_DISTANCE_PX = 14
const DESKTOP_LIGHTBOX_DOUBLE_CLICK_ANIM_MS = 280
const LIGHTBOX_GESTURE_CLICK_SUPPRESS_MS = 360
const LIGHTBOX_DRAG_START_THRESHOLD_PX = 4
const LIGHTBOX_OVERLAY_MAX = 0.5
const LIGHTBOX_OPEN_ANIM_MS = 300
const LIGHTBOX_CLOSE_ANIM_MS = 150
const LIGHTBOX_ANIM_EASE = 'cubic-bezier(0.22, 0.82, 0.24, 1)'
const LIGHTBOX_CLOSE_ANIM_EASE = 'cubic-bezier(0.18, 0, 1, 1)'

/* 缩放条按钮的步进：以 25% 为单位；不在整倍数上时优先补齐到相邻整倍数 */
const LIGHTBOX_ZOOM_STEP = 0.25

export function useLightbox({ isMobileViewport }) {
  const lightboxSrc = ref('')
  /* 原图地址：可能与当前显示的 lightboxSrc 不同（打开初期先显示缩略图），
     下载与体积统计都以原图为准 */
  const lightboxFullSrc = ref('')
  const lightboxFileSize = ref(null)
  const lightboxIntrinsicWidth = ref(0)
  const lightboxIntrinsicHeight = ref(0)
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

  let lightboxOriginImg = null
  let lightboxRequestId = 0
  let thumbRectSnapshot = { left: 0, top: 0, width: 0, height: 0 }
  let lightboxPinching = false
  let lightboxPinchLastDistance = 0
  let lightboxPinchLastMidpoint = null
  let lightboxLastTapAt = 0
  let lightboxSuppressClickUntil = 0
  /* 拖拽结束后置位：吞掉紧随其后的那一次 click。浏览器在 mousedown/mouseup
     落在不同元素时，会把 click 合成派发到二者的公共祖先（灯箱根节点），
     仅靠时间窗口判定不够稳（拖拽后停顿再松手会漏判），故用一次性标志兜底。 */
  let lightboxConsumeNextClick = false
  /* 记录本次按下是否落在图片上：只要按在图片起手（无论是否放大、无论在何处松开），
     随后合成到根节点的 click 都不该触发关闭——关闭只保留给真正落在背景的点击 */
  let lightboxPointerDownOnImage = false
  let lightboxDragging = false
  let lightboxDragMoved = false
  let lightboxDragFromPinch = false
  let lightboxDragStartX = 0
  let lightboxDragStartY = 0
  let lightboxDragStartOffsetX = 0
  let lightboxDragStartOffsetY = 0
  let lightboxLastMouseDownAt = 0
  let lightboxLastMouseDownX = 0
  let lightboxLastMouseDownY = 0
  let lightboxDoubleClickTransitionTimer = 0
  let lightboxFileSizeRequestId = 0

  function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return ''
    if (bytes < 1024) return `${bytes} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let value = bytes / 1024
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex += 1
    }
    /* 小于 10 保留一位小数，其余取整，避免出现「1023.9 KB」这类冗长数字 */
    const rounded = value >= 10 ? Math.round(value) : Math.round(value * 10) / 10
    return `${rounded} ${units[unitIndex]}`
  }

  async function fetchLightboxFileSize(src, requestId) {
    if (!src) return

    /* 优先用轻量的 HEAD 拿 Content-Length；失败再退回 GET（部分静态服务
       不返回 HEAD 的 Content-Length）。整个过程失败则不显示体积。 */
    const readSize = async method => {
      const response = await fetch(src, { method })
      if (!response.ok) return null
      const length = response.headers.get('content-length')
      if (length != null && length !== '') {
        const parsed = Number(length)
        if (Number.isFinite(parsed) && parsed >= 0) return parsed
      }
      if (method === 'GET') {
        const blob = await response.blob()
        return blob.size
      }
      return null
    }

    try {
      let size = await readSize('HEAD')
      if (size == null) size = await readSize('GET')
      if (requestId !== lightboxFileSizeRequestId) return
      if (size != null) lightboxFileSize.value = size
    } catch {
      /* 网络/CORS 失败时静默：下载按钮仍可用，只是不显示体积 */
    }
  }

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

  function lightboxOpenOpacityOnlyTransition() {
    return `opacity ${LIGHTBOX_OPEN_ANIM_MS}ms ${LIGHTBOX_ANIM_EASE}`
  }

  function lightboxCloseOpacityOnlyTransition() {
    return `opacity ${LIGHTBOX_CLOSE_ANIM_MS}ms ${LIGHTBOX_CLOSE_ANIM_EASE}`
  }

  function clampLightboxScale(scale) {
    const maxScale = isMobileViewport()
      ? MOBILE_LIGHTBOX_SCALE_MAX
      : DESKTOP_LIGHTBOX_SCALE_MAX

    return Math.min(Math.max(scale, LIGHTBOX_SCALE_MIN), maxScale)
  }

  function resetLightboxGestureState() {
    removeDesktopLightboxMouseListeners()
    if (lightboxDoubleClickTransitionTimer) {
      window.clearTimeout(lightboxDoubleClickTransitionTimer)
      lightboxDoubleClickTransitionTimer = 0
    }
    lightboxImageTransition.value = 'transform 0.18s ease'
    lightboxOffsetX.value = 0
    lightboxOffsetY.value = 0
    lightboxPinching = false
    lightboxPinchLastDistance = 0
    lightboxPinchLastMidpoint = null
    lightboxLastTapAt = 0
    lightboxSuppressClickUntil = 0
    lightboxConsumeNextClick = false
    lightboxPointerDownOnImage = false
    lightboxDragging = false
    lightboxDragMoved = false
    lightboxDragFromPinch = false
    lightboxDragStartX = 0
    lightboxDragStartY = 0
    lightboxDragStartOffsetX = 0
    lightboxDragStartOffsetY = 0
    lightboxLastMouseDownAt = 0
    lightboxLastMouseDownX = 0
    lightboxLastMouseDownY = 0
  }

  function suppressLightboxClick() {
    lightboxSuppressClickUntil = Date.now() + LIGHTBOX_GESTURE_CLICK_SUPPRESS_MS
  }

  function addDesktopLightboxMouseListeners() {
    window.addEventListener('mousemove', handleDesktopLightboxMouseMove)
    window.addEventListener('mouseup', handleDesktopLightboxMouseUp)
  }

  function removeDesktopLightboxMouseListeners() {
    window.removeEventListener('mousemove', handleDesktopLightboxMouseMove)
    window.removeEventListener('mouseup', handleDesktopLightboxMouseUp)
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
    /* 不超过适配尺寸（含缩小状态）时图片必然完整可见，保持居中不可平移 */
    if (!img || scale <= LIGHTBOX_FIT_SCALE) {
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
      if (clampedScale <= LIGHTBOX_FIT_SCALE) {
        setLightboxOffset(0, 0, clampedScale)
      }
      return
    }

    /* 适配尺寸及以下：缩放围绕中心进行，不产生平移 */
    if (clampedScale <= LIGHTBOX_FIT_SCALE) {
      lightboxScale.value = clampedScale
      setLightboxOffset(0, 0, clampedScale)
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
    if (nextScale <= LIGHTBOX_FIT_SCALE) {
      setLightboxOffset(0, 0, nextScale)
      return
    }
    setLightboxOffset(lightboxOffsetX.value, lightboxOffsetY.value, nextScale)
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
    if (fromRect.width < 2 || fromRect.height < 2 || toRect.width < 2 || toRect.height < 2) {
      return null
    }

    const fromCenter = getRectCenter(fromRect)
    const toCenter = getRectCenter(toRect)
    const widthRatio = fromRect.width / toRect.width
    const heightRatio = fromRect.height / toRect.height
    const scale = Number(((widthRatio + heightRatio) / 2).toFixed(6))

    return {
      x: fromCenter.x - toCenter.x,
      y: fromCenter.y - toCenter.y,
      scale
    }
  }

  function setLightboxIntrinsicSize(originEl) {
    lightboxIntrinsicWidth.value = 0
    lightboxIntrinsicHeight.value = 0

    const width = Number(originEl?.dataset.hmFullWidth)
    const height = Number(originEl?.dataset.hmFullHeight)
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) return

    lightboxIntrinsicWidth.value = width
    lightboxIntrinsicHeight.value = height
  }

  async function replacePreviewWithFullImage(fullSrc, previewSrc, requestId) {
    if (!fullSrc || fullSrc === previewSrc) return

    const fullImage = new Image()
    fullImage.decoding = 'async'
    fullImage.src = fullSrc

    if (!fullImage.complete) {
      await new Promise(resolve => {
        fullImage.addEventListener('load', resolve, { once: true })
        fullImage.addEventListener('error', resolve, { once: true })
      })
    }
    if (fullImage.naturalWidth < 1) return

    try {
      await fullImage.decode()
    } catch {
      /* 已完成加载的图片即使 decode() 失败也可交给浏览器显示。 */
    }

    if (requestId !== lightboxRequestId || !lightboxVisible.value || lightboxPhase.value === 'closing') return
    lightboxSrc.value = fullSrc
  }

  function startLightboxFileSizeProbe(src) {
    lightboxFileSize.value = null
    const requestId = ++lightboxFileSizeRequestId
    if (!src) return
    void fetchLightboxFileSize(src, requestId)
  }

  function openLightboxWithoutFlyAnimation(src) {
    if (!src) return
    lightboxRequestId += 1
    lightboxOriginImg = null
    thumbRectSnapshot = { left: 0, top: 0, width: 0, height: 0 }
    lightboxSrc.value = src
    lightboxFullSrc.value = src
    startLightboxFileSizeProbe(src)
    lightboxIntrinsicWidth.value = 0
    lightboxIntrinsicHeight.value = 0
    lightboxScale.value = 1
    resetLightboxGestureState()
    lightboxPhase.value = 'open'
    lightboxBackdropOpacity.value = LIGHTBOX_OVERLAY_MAX
    lightboxVisible.value = true
  }

  async function openLightbox(fullSrc, originEl, previewSrc = fullSrc) {
    if (!fullSrc) return
    if (!(originEl instanceof HTMLImageElement)) {
      openLightboxWithoutFlyAnimation(fullSrc)
      return
    }

    const requestId = ++lightboxRequestId
    lightboxOriginImg = originEl
    thumbRectSnapshot = snapshotRect(originEl.getBoundingClientRect())

    lightboxSrc.value = previewSrc || fullSrc
    lightboxFullSrc.value = fullSrc
    startLightboxFileSizeProbe(fullSrc)
    setLightboxIntrinsicSize(originEl)
    lightboxScale.value = 1
    resetLightboxGestureState()
    lightboxPhase.value = 'opening'
    lightboxBackdropOpacity.value = 0
    lightboxVisible.value = true
    void replacePreviewWithFullImage(fullSrc, previewSrc, requestId)

    await nextTick()

    const root = lightboxRootRef.value
    const flip = lightboxFlipRef.value
    const img = lightboxImgRef.value

    if (!root || !flip || !img) {
      lightboxPhase.value = 'open'
      lightboxBackdropOpacity.value = LIGHTBOX_OVERLAY_MAX
      return
    }

    root.style.visibility = 'hidden'

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
    lightboxRequestId += 1
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
    lightboxFullSrc.value = ''
    lightboxFileSize.value = null
    lightboxFileSizeRequestId += 1
    lightboxIntrinsicWidth.value = 0
    lightboxIntrinsicHeight.value = 0
    lightboxScale.value = 1
    resetLightboxGestureState()
    lightboxPhase.value = 'closed'
    lightboxBackdropOpacity.value = 0
    lightboxOriginImg = null
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

  function handleLightboxClick(e) {
    if (lightboxPhase.value !== 'open') return
    /* 拖拽结束后紧跟的一次 click 一律吞掉（含在图片外松开的情形），消费即复位 */
    if (lightboxConsumeNextClick) {
      lightboxConsumeNextClick = false
      return
    }
    /* 按下起手落在图片上：无论是否放大、无论在何处松开，随后合成到根节点的
       click 都不关闭（消费即复位）。关闭只保留给真正从背景起手的点击。 */
    if (!isMobileViewport() && lightboxPointerDownOnImage) {
      lightboxPointerDownOnImage = false
      return
    }
    if (Date.now() < lightboxSuppressClickUntil) return
    if (!isMobileViewport() && e.target === lightboxImgRef.value) return
    startLightboxCloseAnimation()
  }

  function zoomDesktopLightboxOnDoubleClick(e) {
    let nextScale = LIGHTBOX_FIT_SCALE
    if (lightboxScale.value >= LIGHTBOX_FIT_SCALE && lightboxScale.value < 2) {
      nextScale = 2
    }

    if (lightboxDoubleClickTransitionTimer) {
      window.clearTimeout(lightboxDoubleClickTransitionTimer)
    }
    lightboxImageTransition.value = `transform ${DESKTOP_LIGHTBOX_DOUBLE_CLICK_ANIM_MS}ms ease`
    zoomLightboxAroundPoint(nextScale, e.clientX, e.clientY)
    lightboxDoubleClickTransitionTimer = window.setTimeout(() => {
      lightboxDoubleClickTransitionTimer = 0
      lightboxImageTransition.value = 'transform 0.18s ease'
    }, DESKTOP_LIGHTBOX_DOUBLE_CLICK_ANIM_MS)
  }

  /* 开始一次拖拽（桌面鼠标 / 移动端单指共用）：记录起点坐标与起始偏移，
     关闭过渡以便实时跟手。fromPinch 标记该拖拽是否由双指结束顺延而来。 */
  function beginLightboxDrag(clientX, clientY, fromPinch = false) {
    lightboxDragging = true
    lightboxDragMoved = false
    lightboxDragFromPinch = fromPinch
    lightboxDragStartX = clientX
    lightboxDragStartY = clientY
    lightboxDragStartOffsetX = lightboxOffsetX.value
    lightboxDragStartOffsetY = lightboxOffsetY.value
    lightboxImageTransition.value = 'none'
  }

  /* 应用一次拖拽位移：按起点算增量、越过阈值即标记为「已移动」（用于区分
     拖拽与点击/轻触），写入受夹取约束的新偏移。 */
  function applyLightboxDragDelta(clientX, clientY) {
    const deltaX = clientX - lightboxDragStartX
    const deltaY = clientY - lightboxDragStartY
    if (!lightboxDragMoved && (Math.abs(deltaX) >= LIGHTBOX_DRAG_START_THRESHOLD_PX || Math.abs(deltaY) >= LIGHTBOX_DRAG_START_THRESHOLD_PX)) {
      lightboxDragMoved = true
    }
    setLightboxOffset(lightboxDragStartOffsetX + deltaX, lightboxDragStartOffsetY + deltaY, lightboxScale.value)
    if (lightboxDragMoved) suppressLightboxClick()
  }

  function handleDesktopLightboxWheel(e) {
    if (isMobileViewport()) return
    if (lightboxPhase.value !== 'open') return

    if (lightboxDoubleClickTransitionTimer) {
      window.clearTimeout(lightboxDoubleClickTransitionTimer)
      lightboxDoubleClickTransitionTimer = 0
      lightboxImageTransition.value = 'transform 0.18s ease'
    }
    const scaleDelta = e.deltaY < 0 ? DESKTOP_LIGHTBOX_SCALE_STEP : -DESKTOP_LIGHTBOX_SCALE_STEP
    zoomLightboxAroundPoint(Number((lightboxScale.value + scaleDelta).toFixed(2)), e.clientX, e.clientY)
  }

  function handleDesktopLightboxMouseDown(e) {
    if (isMobileViewport()) return
    if (lightboxPhase.value !== 'open') return
    if (e.button !== 0) return

    /* 新一次按下即清除上一次拖拽可能残留的「消费 click」标志：
       若上次在窗口外松开，click 不会派发，标志会滞留并误吞这次的正常点击 */
    lightboxConsumeNextClick = false
    /* 记录按下是否落在图片上。要放在下面「未放大直接 return」之前，
       这样即便图片未放大（不会进入拖拽分支），按图起手→移出→松开
       合成到根节点的 click 也能据此判定为「非背景点击」而不关闭。 */
    lightboxPointerDownOnImage = e.target === lightboxImgRef.value
    const now = Date.now()
    const isDoubleClick = now - lightboxLastMouseDownAt > 0
      && now - lightboxLastMouseDownAt <= DESKTOP_LIGHTBOX_DOUBLE_CLICK_DELAY_MS
      && Math.hypot(e.clientX - lightboxLastMouseDownX, e.clientY - lightboxLastMouseDownY) <= DESKTOP_LIGHTBOX_DOUBLE_CLICK_DISTANCE_PX
    lightboxLastMouseDownAt = isDoubleClick ? 0 : now
    lightboxLastMouseDownX = e.clientX
    lightboxLastMouseDownY = e.clientY

    if (isDoubleClick) {
      zoomDesktopLightboxOnDoubleClick(e)
      e.preventDefault()
      return
    }
    if (lightboxScale.value <= LIGHTBOX_FIT_SCALE) return

    if (lightboxDoubleClickTransitionTimer) {
      window.clearTimeout(lightboxDoubleClickTransitionTimer)
      lightboxDoubleClickTransitionTimer = 0
    }
    beginLightboxDrag(e.clientX, e.clientY)
    addDesktopLightboxMouseListeners()
    e.preventDefault()
  }

  function handleDesktopLightboxMouseMove(e) {
    if (isMobileViewport()) return
    if (!lightboxDragging || lightboxPhase.value !== 'open') return

    applyLightboxDragDelta(e.clientX, e.clientY)
    e.preventDefault()
  }

  function handleDesktopLightboxMouseUp(e) {
    if (!lightboxDragging) return

    removeDesktopLightboxMouseListeners()
    lightboxDragging = false
    lightboxDragStartX = 0
    lightboxDragStartY = 0
    lightboxDragStartOffsetX = lightboxOffsetX.value
    lightboxDragStartOffsetY = lightboxOffsetY.value
    lightboxImageTransition.value = 'transform 0.18s ease'
    if (lightboxDragMoved) {
      suppressLightboxClick()
      /* mouseup 落在图片外时，浏览器会把合成的 click 派发到 mousedown/mouseup
         的公共祖先（灯箱根节点），仅靠时间窗口不够稳妥；用一次性标志确保
         这次拖拽结束后紧跟的 click 一定被吞掉，不触发关闭。 */
      lightboxConsumeNextClick = true
      e.preventDefault()
    }
    lightboxDragMoved = false
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
    if (lightboxScale.value <= LIGHTBOX_FIT_SCALE) return

    const touch = e.touches[0]
    beginLightboxDrag(touch.clientX, touch.clientY, false)
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
      setLightboxOffset(lightboxOffsetX.value + panDeltaX, lightboxOffsetY.value + panDeltaY, lightboxScale.value)
      zoomLightboxAroundPoint(Number((lightboxScale.value * distance / lightboxPinchLastDistance).toFixed(3)), midpoint.x, midpoint.y)
      lightboxPinchLastDistance = distance
      lightboxPinchLastMidpoint = midpoint
      suppressLightboxClick()
      e.preventDefault()
      return
    }

    if (!lightboxDragging || e.touches.length !== 1) return

    const touch = e.touches[0]
    applyLightboxDragDelta(touch.clientX, touch.clientY)
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

        if (e.touches.length === 1 && lightboxScale.value > LIGHTBOX_FIT_SCALE) {
          const touch = e.touches[0]
          beginLightboxDrag(touch.clientX, touch.clientY, true)
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
      /* 双击：偏离适配尺寸（放大或缩小状态）时回到适配，否则放大 */
      if (Math.abs(lightboxScale.value - LIGHTBOX_FIT_SCALE) > 0.01) {
        zoomLightboxAroundPoint(LIGHTBOX_FIT_SCALE, touch.clientX, touch.clientY)
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

  /* 缩放条围绕视口中心缩放：拿灯箱根节点的可视区域中心作为焦点，
     保证不满屏时图片依旧居中，放大后视觉焦点稳定。 */
  function getLightboxViewportCenter() {
    const root = lightboxRootRef.value
    if (!root) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    }
    const rect = root.getBoundingClientRect()
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    }
  }

  /* 计算按步进后的目标缩放：已在 25% 网格上则直接进/退一格；
     否则先向对应方向补齐到相邻网格（如 67% 放大到 75%、缩小到 50%）。 */
  function nextSteppedScale(current, direction) {
    const step = LIGHTBOX_ZOOM_STEP
    const ratio = current / step
    const onGrid = Math.abs(ratio - Math.round(ratio)) < 0.001

    if (direction > 0) {
      return onGrid ? current + step : Math.ceil(ratio) * step
    }
    return onGrid ? current - step : Math.floor(ratio) * step
  }

  function stepLightboxZoom(direction) {
    if (lightboxPhase.value !== 'open') return
    const target = clampLightboxScale(Number(nextSteppedScale(lightboxScale.value, direction).toFixed(4)))
    if (Math.abs(target - lightboxScale.value) < 0.001) return

    if (lightboxDoubleClickTransitionTimer) {
      window.clearTimeout(lightboxDoubleClickTransitionTimer)
      lightboxDoubleClickTransitionTimer = 0
    }
    lightboxImageTransition.value = 'transform 0.18s ease'
    const center = getLightboxViewportCenter()
    zoomLightboxAroundPoint(target, center.x, center.y)
  }

  function zoomInLightbox() {
    stepLightboxZoom(1)
  }

  function zoomOutLightbox() {
    stepLightboxZoom(-1)
  }

  /* 下载原图：优先用 fetch + blob 触发浏览器"另存为"，保证跨路径也能下到
     真正的原图而非当前显示的缩略图；失败（CORS 等）时退回 <a download> 直链。 */
  async function downloadLightboxImage() {
    const src = lightboxFullSrc.value || lightboxSrc.value
    if (!src) return

    const filename = deriveDownloadFilename(src)

    try {
      const response = await fetch(src)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      triggerAnchorDownload(objectUrl, filename)
      /* 稍后回收对象 URL，给浏览器留出发起下载的时间 */
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 4000)
    } catch {
      triggerAnchorDownload(src, filename)
    }
  }

  function deriveDownloadFilename(src) {
    try {
      const url = new URL(src, window.location.href)
      const last = url.pathname.split('/').pop()
      if (last) return decodeURIComponent(last)
    } catch {
      /* 非法 URL 时退回默认名 */
    }
    return 'image'
  }

  function triggerAnchorDownload(href, filename) {
    const anchor = document.createElement('a')
    anchor.href = href
    anchor.download = filename
    anchor.rel = 'noopener'
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
  }

  return {
    lightboxSrc,
    lightboxFullSrc,
    lightboxFileSize,
    lightboxIntrinsicWidth,
    lightboxIntrinsicHeight,
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
    formatFileSize,
    syncLightboxScale,
    openLightbox,
    forceCloseLightbox,
    startLightboxCloseAnimation,
    handleLightboxClick,
    handleDesktopLightboxWheel,
    handleDesktopLightboxMouseDown,
    handleLightboxTouchStart,
    handleLightboxTouchMove,
    handleLightboxTouchEnd,
    handleLightboxTouchCancel,
    zoomInLightbox,
    zoomOutLightbox,
    downloadLightboxImage
  }
}
