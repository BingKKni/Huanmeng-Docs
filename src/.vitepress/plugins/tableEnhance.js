function parseHmTableDirective(content) {
  const match = content.match(/^\s*<!--\s*hm-table(?::)?\s*([\s\S]*?)\s*-->\s*$/i)
  if (!match) return null

  const raw = match[1].trim()
  if (!raw) return { smart: false, widths: null, minWidth: null }

  const result = {
    smart: false,
    widths: null,
    minWidth: null
  }

  raw.split(';').forEach(part => {
    const item = part.trim()
    if (!item) return

    if (/^smart$/i.test(item)) {
      result.smart = true
      return
    }

    const widthsMatch = item.match(/^widths\s*=\s*(.+)$/i)
    if (widthsMatch) {
      result.widths = widthsMatch[1]
        .split(',')
        .map(width => width.trim())
        .filter(Boolean)
      if (result.widths.length > 0) result.smart = true
      return
    }

    const minMatch = item.match(/^min\s*=\s*(.+)$/i)
    if (minMatch) {
      result.minWidth = minMatch[1].trim()
      return
    }
  })

  return result
}

function appendAttr(token, name, value) {
  const existing = token.attrGet(name)
  if (name === 'class') {
    const merged = [existing, value].filter(Boolean).join(' ').trim()
    if (merged) token.attrSet(name, merged)
    return
  }

  if (name === 'style') {
    const merged = [existing, value].filter(Boolean).join('; ').trim()
    if (merged) token.attrSet(name, merged)
    return
  }

  token.attrSet(name, value)
}

function createHtmlBlockToken(Token, content) {
  const token = new Token('html_block', '', 0)
  token.content = `${content}\n`
  token.block = true
  return token
}

function buildColgroup(widths) {
  if (!Array.isArray(widths) || widths.length === 0) return ''

  const cols = widths.map(width => {
    if (/^auto$/i.test(width)) return '<col>'
    return `<col style="width: ${width};">`
  })

  return `<colgroup>${cols.join('')}</colgroup>`
}

export default function tableEnhancePlugin(md) {
  md.core.ruler.push('hm_table_enhance', state => {
    const nextTokens = []
    let pendingDirective = null

    for (let i = 0; i < state.tokens.length; i += 1) {
      const token = state.tokens[i]

      if (token.type === 'html_block') {
        const directive = parseHmTableDirective(token.content)
        if (directive) {
          pendingDirective = directive
          continue
        }
      }

      if (token.type === 'table_open') {
        nextTokens.push(createHtmlBlockToken(state.Token, '<div class="hm-table-wrap">'))

        appendAttr(token, 'class', 'hm-table')

        if (pendingDirective?.smart) {
          appendAttr(token, 'class', 'hm-table--smart')
        }

        if (pendingDirective?.minWidth) {
          appendAttr(token, 'style', `--hm-table-min-width: ${pendingDirective.minWidth}`)
        }

        nextTokens.push(token)

        if (pendingDirective?.widths?.length) {
          nextTokens.push(createHtmlBlockToken(state.Token, buildColgroup(pendingDirective.widths)))
        }

        pendingDirective = null
        continue
      }

      nextTokens.push(token)

      if (token.type === 'table_close') {
        nextTokens.push(createHtmlBlockToken(state.Token, '</div>'))
      }
    }

    state.tokens = nextTokens
  })
}
