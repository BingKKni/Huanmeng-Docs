import { ref, computed } from 'vue'

const FROM_PAGE_MAP = {
  start: { label: '开始使用', url: '/start' },
  docs_index: { label: '使用主页', url: '/docs/' },
  ef_post_theme: { label: '投稿超能力主题', url: '/docs/entertainment/exceptional_function/post_theme' },
  stamina: { label: '体力', url: '/docs/entertainment/stamina' },
  bugland: { label: '布吉岛帮助', url: '/about/faq/bugland' }
}

export function useBackNavigation() {
  const fromParam = ref('')

  const backLinkInfo = computed(() => {
    if (!fromParam.value) return null
    return FROM_PAGE_MAP[fromParam.value] ?? null
  })

  function syncFromParam() {
    if (typeof window === 'undefined') return
    fromParam.value = new URLSearchParams(window.location.search).get('from') ?? ''
  }

  return { backLinkInfo, syncFromParam }
}
