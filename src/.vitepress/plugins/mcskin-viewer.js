import {
  AmbientLight, DirectionalLight, Group, LinearSRGBColorSpace,
  PerspectiveCamera, Scene, WebGLRenderer
} from 'three'
import { applySkinPose, buildSlimSkin } from './mcskin-model.js'
import { createPoseSettings, walkingPose } from './mcskin-pose.js'
import { prepareSkinWebGLContext } from './mcskin-webgl.js'

const radians = degrees => degrees * Math.PI / 180
const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function loadPixels(url, signal) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const cleanup = () => {
      image.onload = image.onerror = null
      signal.removeEventListener('abort', abort)
    }
    const abort = () => {
      cleanup()
      image.src = ''
      reject(new DOMException('Aborted', 'AbortError'))
    }
    image.onload = () => {
      cleanup()
      try {
        if (image.naturalWidth !== 64 || image.naturalHeight !== 64) {
          throw new Error('皮肤文件必须是 64 × 64 的 PNG 图片。')
        }
        const buffer = document.createElement('canvas')
        buffer.width = buffer.height = 64
        const context = buffer.getContext('2d', { willReadFrequently: true })
        context.drawImage(image, 0, 0)
        resolve(context.getImageData(0, 0, 64, 64))
      } catch (error) {
        reject(error)
      }
    }
    image.onerror = () => {
      cleanup()
      reject(new Error('皮肤图片加载失败，请检查文件是否存在后重试。'))
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else image.src = url
  })
}

export async function createSkinViewer(canvas, url, options) {
  const pixels = await loadPixels(url, options.signal)
  if (options.signal.aborted) throw new DOMException('Aborted', 'AbortError')
  return new SkinViewer(canvas, pixels, options)
}

export class SkinViewer {
  constructor(canvas, pixels, { onZoom, onError }) {
    this.canvas = canvas
    this.onZoom = onZoom
    this.events = new AbortController()
    this.pointers = new Map()
    this.theta = 30
    this.phi = 21
    this.phase = 0
    this.zoom = 1
    this.pose = createPoseSettings()
    this.playing = false
    this.visible = true
    this.frame = 0
    this.lastFrame = 0
    this.disposed = false
    this.lost = false
    try {
      const context = canvas.getContext('webgl2', { antialias: true, alpha: true })
      if (!context) throw new Error('无法创建 WebGL2 context。')
      prepareSkinWebGLContext(context)
      this.renderer = new WebGLRenderer({ canvas, context, antialias: true, alpha: true })
      // 沿用参考页的像素 RGB / Lambert 明暗，不对原皮肤做额外色调映射。
      this.renderer.outputColorSpace = LinearSRGBColorSpace
      this.scene = new Scene()
      this.ambientLight = new AmbientLight(0xffffff)
      this.sunLight = new DirectionalLight(0xffffff)
      this.scene.add(this.ambientLight, this.sunLight)
      this.applyLighting()
      this.camera = new PerspectiveCamera(38, 1, 0.1, 200)
      this.camera.position.z = 60
      this.skin = buildSlimSkin(pixels)
      this.root = new Group()
      this.root.add(this.skin.object)
      this.scene.add(this.root)
      this.bindInput()
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault()
        this.lost = true
        this.playing = false
        cancelAnimationFrame(this.frame)
        this.frame = 0
        onError('3D 显示已中断，请点击重试；也可以直接下载皮肤。')
      }, { signal: this.events.signal })
      document.addEventListener('visibilitychange', () => this.syncLoop(), { signal: this.events.signal })
      this.resizeObserver = new ResizeObserver(() => this.resize())
      this.resizeObserver.observe(canvas.parentElement)
      this.intersectionObserver = new IntersectionObserver(entries => {
        this.visible = entries[0].isIntersecting
        this.syncLoop()
      })
      this.intersectionObserver.observe(canvas)
      this.resize()
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  resize() {
    if (this.disposed || this.lost) return
    const box = this.canvas.parentElement.getBoundingClientRect()
    this.width = Math.max(1, Math.round(box.width))
    this.height = Math.max(1, Math.round(box.height))
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(this.width, this.height, false)
    this.camera.aspect = this.width / this.height
    this.camera.updateProjectionMatrix()
    this.render()
  }

  render() {
    if (this.disposed || this.lost) return
    this.root.rotation.set(radians(this.phi), radians(this.theta), 0)
    // 基础姿势不随播放状态改变；暂停时固定进度，继续时从同一帧接着播放。
    const pose = walkingPose(this.pose, this.phase)
    applySkinPose(this.skin, pose)
    this.camera.zoom = this.zoom
    this.camera.updateProjectionMatrix()
    this.renderer.render(this.scene, this.camera)
    Object.assign(this.canvas.dataset, {
      model: 'slim', theta: this.theta.toFixed(2), phi: this.phi.toFixed(2),
      phase: this.phase.toFixed(4), zoom: this.zoom.toFixed(2),
      pose: JSON.stringify(pose), playing: String(this.playing)
    })
  }

  syncLoop() {
    cancelAnimationFrame(this.frame)
    this.frame = 0
    this.lastFrame = 0
    if (this.disposed || this.lost) return
    this.render()
    if (!this.playing || !this.visible || document.hidden) return
    const tick = time => {
      if (this.disposed || this.lost) return
      if (this.lastFrame) this.phase = (this.phase + Math.min(time - this.lastFrame, 100) * Math.PI * 2 / 1500) % (Math.PI * 2)
      this.lastFrame = time
      this.render()
      this.frame = requestAnimationFrame(tick)
    }
    this.frame = requestAnimationFrame(tick)
  }

  setPlaying(value) {
    this.playing = Boolean(value)
    this.syncLoop()
  }

  setZoom(value) {
    this.zoom = clamp(Number(value) || 1, 0.65, 2.5)
    this.onZoom(this.zoom)
    this.render()
  }

  applyLighting() {
    this.ambientLight.intensity = this.pose.light.ambient / 100 * Math.PI
    this.sunLight.intensity = this.pose.light.sun / 100 * Math.PI
    this.sunLight.color.set(this.pose.light.color)
    // 顶视太阳位置；固定高度保留原预览默认的光照方向。
    this.sunLight.position.set(this.pose.sun.x, 0.419, this.pose.sun.z).normalize().multiplyScalar(60)
  }

  reset() {
    this.theta = 30
    this.phi = 21
    this.phase = 0
    this.pose = createPoseSettings()
    this.setPlaying(false)
    this.setZoom(1)
  }

  bindInput() {
    const { signal } = this.events
    const canvas = this.canvas
    canvas.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.lost) return
      canvas.focus({ preventScroll: true })
      canvas.setPointerCapture(event.pointerId)
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      canvas.classList.add('is-dragging')
    }, { signal })
    canvas.addEventListener('pointermove', event => {
      const previous = this.pointers.get(event.pointerId)
      if (!previous) return
      const points = [...this.pointers.values()]
      const distance = points.length === 2 ? Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y) : 0
      this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
      if (points.length === 1) {
        this.theta = (this.theta + event.clientX - previous.x) % 360
        this.phi = clamp(this.phi + event.clientY - previous.y, -90, 90)
        this.render()
      } else if (distance > 0) {
        const [a, b] = [...this.pointers.values()]
        this.setZoom(this.zoom * Math.hypot(a.x - b.x, a.y - b.y) / distance)
      }
    }, { signal })
    const release = event => {
      this.pointers.delete(event.pointerId)
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId)
      if (!this.pointers.size) canvas.classList.remove('is-dragging')
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      canvas.addEventListener(type, release, { signal })
    }
    canvas.addEventListener('wheel', event => {
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1)
      this.setZoom(this.zoom * Math.exp(-clamp(delta, -300, 300) * 0.002))
    }, { signal, passive: false })
    canvas.addEventListener('keydown', event => {
      const steps = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }
      if (steps[event.key]) {
        event.preventDefault()
        this.theta = (this.theta + steps[event.key][0]) % 360
        this.phi = clamp(this.phi + steps[event.key][1], -90, 90)
        this.render()
      } else if (['+', '=', '-'].includes(event.key)) {
        event.preventDefault()
        this.setZoom(this.zoom + (event.key === '-' ? -0.1 : 0.1))
      }
    }, { signal })
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.frame)
    this.events.abort()
    this.resizeObserver?.disconnect()
    this.intersectionObserver?.disconnect()
    for (const id of this.pointers.keys()) {
      if (this.canvas.hasPointerCapture(id)) this.canvas.releasePointerCapture(id)
    }
    this.pointers.clear()
    this.skin?.dispose()
    this.scene?.clear()
    this.renderer?.dispose()
    this.renderer?.forceContextLoss()
  }
}
