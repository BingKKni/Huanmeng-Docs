/**
 * 按相对路径前缀匹配。
 * @type {readonly string[]}
 */
const DESKTOP_SIDEBAR_PREFIXES = Object.freeze(['docs/', 'about/', 'changelog/'])

/**
 * 除上述前缀外，再允许显示右侧 TOC 的页面（`page.relativePath` 全名）。
 * @type {readonly string[]}
 */
const TOC_EXTRA_RELATIVE_PATHS = Object.freeze(['start.md'])

/**
 * @param {string} relativePath
 * @param {{ prefixes?: string[], exact?: string[] }} spec
 * @returns {boolean}
 */
function routeMatches(relativePath, { prefixes = [], exact = [] }) {
  if (!relativePath) return false
  if (exact.length > 0 && exact.includes(relativePath)) return true
  if (prefixes.length > 0 && prefixes.some(p => relativePath.startsWith(p))) return true
  return false
}

/**
 * @param {string} relativePath VitePress `useData().page.relativePath`
 * @returns {boolean}
 */
export function supportsDesktopSidebar(relativePath) {
  return routeMatches(relativePath, { prefixes: DESKTOP_SIDEBAR_PREFIXES })
}

/**
 * 文档式布局下是否启用右侧「本页内容」TOC（仍受 `useDocToc` 中是否有标题等条件约束）。
 * @param {string} relativePath
 * @returns {boolean}
 */
export function supportsTocSidebar(relativePath) {
  return routeMatches(relativePath, {
    prefixes: DESKTOP_SIDEBAR_PREFIXES,
    exact: TOC_EXTRA_RELATIVE_PATHS
  })
}
