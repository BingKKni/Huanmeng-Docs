/**
 * markdown-it 插件：彩色文本 / 圆角徽章简写语法
 *
 * 语法 1（彩色字体）：{颜色名}文本内容{}
 * 语法 2（圆角背景徽章）：{bg-颜色名}文本内容{}
 *
 * 预设色名（自动适配日间/夜间模式）：
 *   auto, darkred, red, yellow, orange, green,
 *   darkgreen, pink, purple, cyan, blue, gray, gold, aqua
 *
 * 也支持自定义 HEX 色值：{#ff9800}文本{} 或 {bg-#fff3c7}文本{}
 *
 * 示例：
 *   {orange}5额度{}        → <span class="ct-orange">5额度</span>
 *   {#e91e63}自定义色{}     → <span style="color:#e91e63">自定义色</span>
 *   {bg-yellow}S+{}        → <span class="cb cb-yellow">S+</span>
 *   {bg-#fff3c7}S+{}       → <span class="cb" style="background:#fff3c7">S+</span>
 */

const PRESET_COLORS = new Set([
  'auto', 'darkred', 'red', 'yellow', 'orange',
  'green', 'darkgreen', 'pink', 'purple', 'cyan', 'blue', 'gray', 'gold', 'aqua'
])

// 匹配 {colorOrHex} 或 {bg-colorOrHex} 开头部分
const OPEN_RE = /^\{(bg-)?(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)\}/
// 匹配 {} 关闭标记
const CLOSE_RE = /^\{\}/

export default function colorTextPlugin(md) {
  md.inline.ruler.push('color_text', (state, silent) => {
    const src = state.src.slice(state.pos)

    // 1. 尝试匹配 {color} 或 {bg-color} 开头
    const openMatch = OPEN_RE.exec(src)
    if (!openMatch) return false

    const isBadge = !!openMatch[1]
    const colorKey = openMatch[2]

    // 校验：预设色名 or 合法 HEX
    const isPreset = PRESET_COLORS.has(colorKey)
    const isHex = colorKey.startsWith('#')
    if (!isPreset && !isHex) return false

    // 2. 找到 {} 关闭标记的位置
    const afterOpen = openMatch[0].length
    const rest = src.slice(afterOpen)
    const closeMatch = CLOSE_RE.exec(rest)

    // 如果 rest 开头就是 {}，说明内容为空，跳过
    if (!closeMatch && rest.indexOf('{}') === -1) return false

    const closeIdx = rest.indexOf('{}')
    if (closeIdx === -1) return false

    const innerText = rest.slice(0, closeIdx)
    if (!innerText) return false // 不处理空内容

    // silent 模式只检测是否匹配，不生成 token
    if (silent) return true

    // 3. 生成 token
    const tokenOpen = state.push('color_text_open', 'span', 1)
    if (isBadge) {
      if (isPreset) {
        tokenOpen.attrSet('class', `cb cb-${colorKey}`)
      } else {
        tokenOpen.attrSet('class', 'cb')
        tokenOpen.attrSet('style', `background:${colorKey}`)
      }
    } else {
      if (isPreset) {
        tokenOpen.attrSet('class', `ct-${colorKey}`)
      } else {
        tokenOpen.attrSet('style', `color:${colorKey}`)
      }
    }
    tokenOpen.markup = `{${isBadge ? 'bg-' : ''}${colorKey}}`

    // 内部文本直接作为 text token 输出
    const tokenText = state.push('text', '', 0)
    tokenText.content = innerText

    const tokenClose = state.push('color_text_close', 'span', -1)
    tokenClose.markup = '{}'

    // 移动 pos
    state.pos += afterOpen + closeIdx + 2 // 2 = '{}' 的长度
    return true
  })
}
