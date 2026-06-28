import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const NEWS_DATE_REGEX = /^\d{4}-\d{2}-\d{2}/
const currentDir = path.dirname(fileURLToPath(import.meta.url))
const newsDir = path.resolve(currentDir, '..', '..', 'news')

function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeDate(value, url) {
  const text = normalizeText(value)
  const frontmatterDate = text.match(NEWS_DATE_REGEX)?.[0]
  if (frontmatterDate) return frontmatterDate

  return url.match(/\/news\/(\d{4}-\d{2}-\d{2})/)?.[1] || ''
}

function urlToRelativePath(url) {
  return `${url.replace(/^\//, '').replace(/\/$/, '')}.md`
}

function stripYamlQuote(value) {
  const text = normalizeText(value)
  const quote = text[0]

  if ((quote === '"' || quote === "'") && text.endsWith(quote)) {
    return text.slice(1, -1)
  }

  return text
}

function parseFrontmatter(source) {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!match) return {}

  return Object.fromEntries(
    match[1]
      .split(/\r?\n/)
      .map(line => line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/))
      .filter(Boolean)
      .map(([, key, value]) => [key, stripYamlQuote(value)])
  )
}

async function loadNewsItem(filename) {
  const filePath = path.join(newsDir, filename)
  const source = await readFile(filePath, 'utf8')
  const frontmatter = parseFrontmatter(source)
  const slug = filename.replace(/\.md$/, '')
  const url = `/news/${slug}`

  return {
    url,
    relativePath: urlToRelativePath(url),
    title: normalizeText(frontmatter.title) || slug,
    date: normalizeDate(frontmatter.date, url),
    emoji: normalizeText(frontmatter.emoji) || '📣',
    description: normalizeText(frontmatter.description)
  }
}

export default {
  watch: ['../../news/*.md'],
  async load() {
    const filenames = await readdir(newsDir)
    const newsFilenames = filenames.filter(filename => filename.endsWith('.md') && filename !== 'index.md')
    const items = await Promise.all(newsFilenames.map(loadNewsItem))

    return items.sort((a, b) => b.date.localeCompare(a.date) || b.url.localeCompare(a.url))
  }
}
