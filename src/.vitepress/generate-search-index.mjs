import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const docsDir = path.join(rootDir, 'src', 'docs')
const outputPath = path.join(rootDir, 'src', 'public', 'search-index.json')

const mdStripRegexes = [
  { pattern: /```[\s\S]*?```/g, replace: '' },
  { pattern: /`([^`]+)`/g, replace: '$1' },
  { pattern: /<br\s*\/?>/gi, replace: '\n' },
  { pattern: /<[^>]*>/g, replace: ' ' },
  { pattern: /!\[[^\]]*\]\([^)]*\)/g, replace: ' ' },
  { pattern: /\[([^\]]+)\]\([^)]+\)/g, replace: '$1' },
  { pattern: /^#{1,6}\s+/gm, replace: '' },
  { pattern: /^==\s+/gm, replace: '' },
  { pattern: /(?:\*\*|__)(.*?)(?:\*\*|__)/g, replace: '$1' },
  { pattern: /(?:\*|_)(.*?)(?:\*|_)/g, replace: '$1' },
  { pattern: /^\s*>\s+/gm, replace: '' },
  { pattern: /^\s*[-*+]\s+/gm, replace: '' },
  { pattern: /^\s*\d+\.\s+/gm, replace: '' },
  { pattern: /^:::\s*\w*.*$/gm, replace: '' },
  { pattern: /:::/g, replace: '' }
]

const markdownStyleTokenRegex = /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z][\w-]*)$/
const markdownAttributePartRegex = /^(?:[#.][\w-]+|[\w:-]+(?:=(?:"[^"]*"|'[^']*'|[^\s]+))?)$/
const markdownTableDividerRegex = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/
const markdownTableRowRegex = /^\s*\|.*\|\s*$/

function stripFrontmatter(source) {
  if (!source.startsWith('---')) return source
  const end = source.indexOf('\n---', 3)
  if (end === -1) return source
  const nextLine = source.indexOf('\n', end + 4)
  return nextLine === -1 ? '' : source.slice(nextLine + 1)
}

function isMarkdownAttributeBlock(token) {
  const parts = token.trim().split(/\s+/).filter(Boolean)
  return parts.length > 0 && parts.every(part => markdownAttributePartRegex.test(part))
}

function stripMarkdownStyleWrappers(str) {
  return str.replace(/\{(#[0-9a-fA-F]{3,8}|[a-zA-Z][\w-]*)\}([^{}]*?)\{\s*\}/g, (match, token, content) => {
    if (!markdownStyleTokenRegex.test(token)) return match
    return content
  })
}

function stripMarkdownAttributeBlocks(str) {
  return str.replace(/\{([^{}\n]+)\}/g, (match, token, offset, source) => {
    if (!isMarkdownAttributeBlock(token)) return match

    let prevIndex = offset - 1
    while (prevIndex >= 0 && /\s/.test(source[prevIndex])) {
      prevIndex -= 1
    }

    return prevIndex >= 0 && [')', ']', '>'].includes(source[prevIndex]) ? '' : match
  })
}

function normalizeMarkdownTableLine(line) {
  if (markdownTableDividerRegex.test(line)) return ''
  if (!markdownTableRowRegex.test(line)) return line

  return line
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map(cell => cell.trim())
    .filter(Boolean)
    .join(' ')
}

function stripMarkdown(str) {
  let result = stripFrontmatter(str)
  result = stripMarkdownStyleWrappers(result)
  result = stripMarkdownAttributeBlocks(result)

  for (const { pattern, replace } of mdStripRegexes) {
    result = result.replace(pattern, replace)
  }

  return result
    .split(/\r?\n/)
    .map(normalizeMarkdownTableLine)
    .filter(Boolean)
    .join('\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function slugifyHeading(text) {
  return text
    .trim()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s!-/:-@\[-`{-~]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function createHeadingSlugger() {
  const seen = new Map()

  return title => {
    const base = slugifyHeading(title) || 'section'
    const count = seen.get(base) || 0
    seen.set(base, count + 1)
    return count === 0 ? base : `${base}-${count}`
  }
}

function docPathToLink(filePath) {
  const relativePath = path.relative(docsDir, filePath).replace(/\\/g, '/')
  let link = `/docs/${relativePath}`.replace(/\.md$/, '.html')
  if (link.endsWith('/index.html')) {
    link = link.replace('/index.html', '/')
  }
  return link
}

function deriveDocTitle(rawContent, filePath) {
  const titleMatch = stripFrontmatter(rawContent).match(/^#\s+(.*)/m)
  if (titleMatch) return stripMarkdown(titleMatch[1])

  const h2Match = stripFrontmatter(rawContent).match(/^##\s+(.*)/m)
  if (h2Match) return stripMarkdown(h2Match[1])

  const filename = path.basename(filePath, '.md')
  if (filename === 'index') {
    return path.basename(path.dirname(filePath)) || '首页'
  }

  return filename
}

function buildDocSearchSections(rawContent, docTitle) {
  const lines = stripFrontmatter(rawContent).split(/\r?\n/)
  const slug = createHeadingSlugger()
  const sections = []
  let inFence = false
  let current = {
    title: docTitle,
    id: '',
    lines: [],
    isRoot: true
  }

  function pushCurrentSection() {
    const content = stripMarkdown(current.lines.join('\n'))
    if (!content && current.isRoot) return

    sections.push({
      title: current.title,
      docTitle,
      id: current.id,
      headingTitle: current.isRoot ? docTitle : current.title,
      searchText: [current.title, content].filter(Boolean).join(' ').trim()
    })
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      inFence = !inFence
      current.lines.push(line)
      continue
    }

    if (!inFence) {
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/)
      if (headingMatch) {
        pushCurrentSection()
        const title = stripMarkdown(headingMatch[2]).replace(/\s+/g, ' ').trim() || docTitle
        current = {
          title,
          id: slug(title),
          lines: [],
          isRoot: false
        }
        continue
      }
    }

    current.lines.push(line)
  }

  pushCurrentSection()
  return sections
}

async function collectMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectMarkdownFiles(fullPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }

  return files.sort()
}

async function main() {
  const markdownFiles = await collectMarkdownFiles(docsDir)
  const index = []

  for (const filePath of markdownFiles) {
    const rawContent = await readFile(filePath, 'utf8')
    const docTitle = deriveDocTitle(rawContent, filePath)
    const link = docPathToLink(filePath)
    const sections = buildDocSearchSections(rawContent, docTitle)

    for (const section of sections) {
      index.push({
        ...section,
        link: section.id ? `${link}#${section.id}` : link
      })
    }
  }

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, JSON.stringify(index), 'utf8')
  console.log(`Generated search index with ${index.length} sections.`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
