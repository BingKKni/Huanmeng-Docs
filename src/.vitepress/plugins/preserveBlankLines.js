function createHtmlBlockToken(Token, content, level) {
  const token = new Token('html_block', '', 0)
  token.content = `${content}\n`
  token.block = true
  token.level = level
  return token
}

function createExtraBreakToken(Token, extraBlankLines, level) {
  return createHtmlBlockToken(
    Token,
    `<div class="hm-extra-break" style="--hm-extra-break-lines: ${extraBlankLines}" aria-hidden="true"></div>`,
    level
  )
}

function getEntryEndIndex(tokens, startIndex, endIndex) {
  const startToken = tokens[startIndex]

  if (startToken.nesting !== 1) {
    return startIndex
  }

  let depth = 1

  for (let i = startIndex + 1; i < endIndex; i += 1) {
    depth += tokens[i].nesting
    if (depth === 0) {
      return i
    }
  }

  return startIndex
}

function getEntryEndLine(tokens, startIndex, endIndex) {
  let endLine = null

  for (let i = startIndex; i <= endIndex; i += 1) {
    const mappedEndLine = tokens[i].map?.[1] ?? null
    if (mappedEndLine !== null) {
      endLine = mappedEndLine
    }
  }

  return endLine
}

function processTokenRange(tokens, startIndex, endIndex, level, Token, parentType = null) {
  const nextTokens = []
  let previousEndLine = null
  let i = startIndex

  const canInsertGap = parentType !== 'bullet_list_open' && parentType !== 'ordered_list_open'

  while (i < endIndex) {
    const token = tokens[i]

    if (token.level !== level || token.nesting === -1) {
      nextTokens.push(token)
      i += 1
      continue
    }

    const entryStartToken = token
    const entryEndIndex = getEntryEndIndex(tokens, i, endIndex)
    const startLine = entryStartToken.map?.[0] ?? null
    const endLine = getEntryEndLine(tokens, i, entryEndIndex)

    if (canInsertGap && previousEndLine !== null && startLine !== null) {
      const extraBlankLines = startLine - previousEndLine - 1
      if (extraBlankLines > 0) {
        nextTokens.push(createExtraBreakToken(Token, extraBlankLines, level))
      }
    }

    if (entryStartToken.nesting === 1 && entryEndIndex > i) {
      nextTokens.push(entryStartToken)
      nextTokens.push(...processTokenRange(tokens, i + 1, entryEndIndex, level + 1, Token, entryStartToken.type))
      nextTokens.push(tokens[entryEndIndex])
    } else {
      for (let cursor = i; cursor <= entryEndIndex; cursor += 1) {
        nextTokens.push(tokens[cursor])
      }
    }

    if (endLine !== null) {
      previousEndLine = endLine
    }

    i = entryEndIndex + 1
  }

  return nextTokens
}

export default function preserveBlankLinesPlugin(md) {
  md.core.ruler.after('block', 'hm_preserve_blank_lines', state => {
    state.tokens = processTokenRange(state.tokens, 0, state.tokens.length, 0, state.Token)
  })
}
