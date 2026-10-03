import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { withBase } from 'vitepress'

const SKINS = [
  { id: 'buding', name: '小布丁' },
  { id: 'henglie', name: '恒烈' },
  { id: 'huanmeng', name: '幻梦' }
]

/** 页面级入口：只有 mcskin.md 挂载后才加载 Three.js；不修改全站主题或路由钩子。 */
export function useMcSkinGallery() {
  const gallery = ref(null)
  const skins = reactive(SKINS.map(skin => ({
    ...skin, url: withBase(`/img/mcskins/${skin.id}.png`),
    loading: true, ready: false, error: '', revision: 0,
    playing: false, zoom: 1
  })))
  const viewers = new Map()
  let lifetime

  async function start(skin) {
    if (!lifetime || lifetime.signal.aborted) return
    viewers.get(skin.id)?.dispose()
    viewers.delete(skin.id)
    Object.assign(skin, {
      loading: true, ready: false, error: '', playing: false,
      zoom: 1, revision: skin.revision + 1
    })
    try {
      // 重试时替换 canvas，避免复用已经丢失的 WebGL context。
      await nextTick()
      const { createSkinViewer } = await import('./mcskin-viewer.js')
      if (lifetime.signal.aborted) return
      const canvas = gallery.value?.querySelector(`canvas[data-skin="${skin.id}"]`)
      if (!canvas) return
      const viewer = await createSkinViewer(canvas, skin.url, {
        signal: lifetime.signal,
        onZoom: value => { skin.zoom = value },
        onError: message => {
          Object.assign(skin, { error: message, ready: false, loading: false, playing: false })
        }
      })
      if (lifetime.signal.aborted) {
        viewer.dispose()
        return
      }
      viewers.set(skin.id, viewer)
      skin.ready = true
    } catch (error) {
      if (lifetime.signal.aborted) return
      skin.error = /WebGL|context/i.test(error.message)
        ? '无法启动 3D 预览，请启用浏览器硬件加速后重试；仍可下载原始皮肤。'
        : (error.message || '3D 预览加载失败，请重试。')
    } finally {
      if (!lifetime.signal.aborted) skin.loading = false
    }
  }

  function toggleAnimation(skin) {
    if (!skin.ready) return
    skin.playing = !skin.playing
    viewers.get(skin.id).setPlaying(skin.playing)
  }

  function setZoom(skin, value) {
    if (skin.ready) viewers.get(skin.id).setZoom(value)
  }

  function reset(skin) {
    if (!skin.ready) return
    skin.playing = false
    viewers.get(skin.id).reset()
  }

  onMounted(() => {
    lifetime = new AbortController()
    skins.forEach(skin => { void start(skin) })
  })
  onBeforeUnmount(() => {
    lifetime?.abort()
    viewers.forEach(viewer => viewer.dispose())
    viewers.clear()
  })

  return { gallery, skins, start, toggleAnimation, setZoom, reset }
}
