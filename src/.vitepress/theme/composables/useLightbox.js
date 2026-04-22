import { nextTick, ref } from 'vue'

const LIGHTBOX_SCALE_MIN = 1
const MOBILE_LIGHTBOX_SCALE_MAX = 4
const MOBILE_LIGHTBOX_DOUBLE_TAP_SCALE = 2.5
const DESKTOP_LIGHTBOX_SCALE_MAX = 4
const DESKTOP_LIGHTBOX_SCALE_STEP = 0.2
const LIGHTBOX_DOUBLE_TAP_DELAY_MS = 280
const LIGHTBOX_GESTURE_CLICK_SUPPRESS_MS = 360
const LIGHTBOX_DRAG_START_THRESHOLD_PX = 4
const LIGHTBOX_OVERLAY_MAX = 0.5
const LIGHTBOX_OPEN_ANIM_MS = 300
const LIGHTBOX_CLOSE_ANIM_MS = 150
const LIGHTBOX_ANIM_EASE = 'cubic-bezier(0.22, 0.82, 0.24, 1)'
const LIGHTBOX_CLOSE_ANIM_EASE = 'cubic-bezier(0.18, 0, 1, 1)'

export function useLightbox({ isMobileViewport }) {
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

  let lightboxOriginImg = null
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

    if (!img.complete) {
      await new Promise(resolve => {
        img.addEventListener('load', resolve, { once: true })
        img.addEventListener('error', resolve, { once: true })
      })
    }
    try {
      await img.decode()
    } catch {
      /* ignore decode failure */
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
    if (Date.now() < lightboxSuppressClickUntil) return
    if (!isMobileViewport() && e.target instanceof Element && e.target.closest('.hm-lightbox__content')) return
    startLightboxCloseAnimation()
  }

  function handleDesktopLightboxWheel(e) {
    if (isMobileViewport()) return
    if (lightboxPhase.value !== 'open') return

    const scaleDelta = e.deltaY < 0 ? DESKTOP_LIGHTBOX_SCALE_STEP : -DESKTOP_LIGHTBOX_SCALE_STEP
    zoomLightboxAroundPoint(Number((lightboxScale.value + scaleDelta).toFixed(2)), e.clientX, e.clientY)
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
    const deltaX = touch.clientX - lightboxDragStartX
    const deltaY = touch.clientY - lightboxDragStartY
    if (!lightboxDragMoved && (Math.abs(deltaX) >= LIGHTBOX_DRAG_START_THRESHOLD_PX || Math.abs(deltaY) >= LIGHTBOX_DRAG_START_THRESHOLD_PX)) {
      lightboxDragMoved = true
    }

    setLightboxOffset(lightboxDragStartOffsetX + deltaX, lightboxDragStartOffsetY + deltaY, lightboxScale.value)
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

  return {
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
  }
}
