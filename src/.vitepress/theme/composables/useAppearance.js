import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const APPEARANCE_MODE_SEQUENCE = ['auto', 'light', 'dark']
const APPEARANCE_MODE_LABELS = {
  auto: '跟随设备',
  light: '浅色模式',
  dark: '深色模式'
}
const APPEARANCE_STORAGE_KEY = 'vitepress-theme-appearance'

export function useAppearance() {
  const isDarkMode = ref(false)
  const appearanceMode = ref('auto')
  let appearanceSchemeMediaQuery = null

  function normalizeAppearanceMode(mode) {
    return APPEARANCE_MODE_SEQUENCE.includes(mode) ? mode : 'auto'
  }

  const nextAppearanceMode = computed(() => {
    const currentIndex = APPEARANCE_MODE_SEQUENCE.indexOf(appearanceMode.value)
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % APPEARANCE_MODE_SEQUENCE.length
    return APPEARANCE_MODE_SEQUENCE[nextIndex]
  })

  const appearanceButtonLabel = computed(() => {
    const currentLabel = APPEARANCE_MODE_LABELS[appearanceMode.value]
    const nextLabel = APPEARANCE_MODE_LABELS[nextAppearanceMode.value]
    return `当前${currentLabel}，点击切换到${nextLabel}`
  })

  function getStoredAppearanceMode() {
    if (typeof window === 'undefined') return null
    try {
      const stored = window.localStorage.getItem(APPEARANCE_STORAGE_KEY)
      return stored == null ? null : normalizeAppearanceMode(stored)
    } catch {
      return null
    }
  }

  function shouldFollowSystemAppearance() {
    return normalizeAppearanceMode(getStoredAppearanceMode() ?? 'auto') === 'auto'
  }

  function applyResolvedColorMode(shouldUseDark) {
    if (typeof document === 'undefined') return
    document.documentElement.classList.toggle('dark', shouldUseDark)
    document.documentElement.style.colorScheme = shouldUseDark ? 'dark' : 'light'
    isDarkMode.value = shouldUseDark
  }

  function syncColorModeFromDocument() {
    if (typeof document === 'undefined') return
    appearanceMode.value = normalizeAppearanceMode(getStoredAppearanceMode() ?? 'auto')
    const dark = document.documentElement.classList.contains('dark')
    isDarkMode.value = dark
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
  }

  function applySystemAppearanceToDocument() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return
    if (!shouldFollowSystemAppearance()) return
    appearanceMode.value = 'auto'
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    applyResolvedColorMode(prefersDark)
  }

  function handlePreferredColorSchemeChange() {
    applySystemAppearanceToDocument()
  }

  function setColorMode(mode, { persist = true } = {}) {
    if (typeof document === 'undefined') return

    const normalizedMode = normalizeAppearanceMode(mode)
    appearanceMode.value = normalizedMode

    if (normalizedMode === 'auto') {
      const prefersDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)').matches
        : false
      applyResolvedColorMode(prefersDark)

      if (!persist) return
      try {
        window.localStorage.setItem(APPEARANCE_STORAGE_KEY, normalizedMode)
      } catch {
        /* ignore storage failures */
      }
      return
    }

    applyResolvedColorMode(normalizedMode === 'dark')

    if (!persist) return
    try {
      window.localStorage.setItem(APPEARANCE_STORAGE_KEY, normalizedMode)
    } catch {
      /* ignore storage failures */
    }
  }

  function toggleColorMode() {
    setColorMode(nextAppearanceMode.value)
  }

  function addAppearanceSchemeChangeListener(mediaQueryList, listener) {
    if (!mediaQueryList) return
    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', listener)
      return
    }
    if (typeof mediaQueryList.addListener === 'function') {
      mediaQueryList.addListener(listener)
    }
  }

  function removeAppearanceSchemeChangeListener(mediaQueryList, listener) {
    if (!mediaQueryList) return
    if (typeof mediaQueryList.removeEventListener === 'function') {
      mediaQueryList.removeEventListener('change', listener)
      return
    }
    if (typeof mediaQueryList.removeListener === 'function') {
      mediaQueryList.removeListener(listener)
    }
  }

  onMounted(() => {
    syncColorModeFromDocument()
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      appearanceSchemeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      addAppearanceSchemeChangeListener(appearanceSchemeMediaQuery, handlePreferredColorSchemeChange)
    }
  })

  onBeforeUnmount(() => {
    if (appearanceSchemeMediaQuery) {
      removeAppearanceSchemeChangeListener(appearanceSchemeMediaQuery, handlePreferredColorSchemeChange)
      appearanceSchemeMediaQuery = null
    }
  })

  return {
    isDarkMode,
    appearanceMode,
    appearanceButtonLabel,
    toggleColorMode
  }
}
