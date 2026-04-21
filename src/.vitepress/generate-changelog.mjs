import { mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const rootDir = process.cwd()
const changelogDir = path.join(rootDir, 'src', 'changelog')
const generatedDir = path.join(rootDir, 'src', '.vitepress', 'generated')
const cacheFilePath = path.join(changelogDir, 'changelog-cache.json')
const latestPagePath = path.join(changelogDir, 'latest.md')
const sidebarModulePath = path.join(generatedDir, 'changelog-sidebar.mjs')
const owner = 'BingKKni'
const repo = 'Huanmeng-Docs'
const commitsApiBase = `https://api.github.com/repos/${owner}/${repo}/commits`
const pullRequestBaseUrl = `https://github.com/${owner}/${repo}/pull`
const cacheVersion = 3
const perPage = 100
const requestTimeoutMs = 30000
const maxFetchRetries = 3
const changelogSections = [
  { key: 'updates', title: '更新' },
  { key: 'docs', title: '文档变动' },
  { key: 'others', title: '其他' }
]

function getTodayDay() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getRequestHeaders() {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Huanmeng-Docs-Changelog-Generator'
  }

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }

  return headers
}

async function fetchCommitsPage(page) {
  let lastError = null

  for (let attempt = 1; attempt <= maxFetchRetries; attempt += 1) {
    try {
      const response = await fetch(`${commitsApiBase}?per_page=${perPage}&page=${page}`, {
        headers: getRequestHeaders(),
        signal: AbortSignal.timeout(requestTimeoutMs)
      })

      if (!response.ok) {
        throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return Array.isArray(data) ? data : []
    } catch (error) {
      lastError = error

      if (attempt < maxFetchRetries) {
        await wait(attempt * 1000)
      }
    }
  }

  throw lastError
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchAllCommits() {
  const commits = []

  for (let page = 1; ; page += 1) {
    const pageCommits = await fetchCommitsPage(page)
    commits.push(...pageCommits)

    if (pageCommits.length < perPage) {
      break
    }
  }

  return commits
}

async function fetchRecentCommits(todayDay) {
  const commits = []

  for (let page = 1; ; page += 1) {
    const pageCommits = await fetchCommitsPage(page)
    commits.push(...pageCommits)

    if (pageCommits.length === 0) {
      break
    }

    const oldestCommitDay = getCommitDayFromCommit(pageCommits[pageCommits.length - 1])
    if (oldestCommitDay < todayDay || pageCommits.length < perPage) {
      break
    }
  }

  return commits.filter(commit => getCommitDayFromCommit(commit) >= todayDay)
}

function splitCommitMessage(message) {
  return String(message || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function normalizeCommitLine(line) {
  return String(line || '').trim()
}

function getCommitTimestamp(commit) {
  return commit?.commit?.committer?.date || commit?.commit?.author?.date || `${getTodayDay()}T00:00:00.000Z`
}

function getCommitDayFromTimestamp(timestamp) {
  return String(timestamp || '').slice(0, 10) || getTodayDay()
}

function getCommitDayFromCommit(commit) {
  return getCommitDayFromTimestamp(getCommitTimestamp(commit))
}

function parseCategory(line) {
  const normalizedLine = normalizeCommitLine(line)
  const updateMatch = normalizedLine.match(/^(?:feat|refactor)(?:\([^()\r\n]+\))?\s*[:：]\s*(.+)$/i)
  if (updateMatch) {
    return { type: 'updates', text: updateMatch[1].trim() }
  }

  const docsMatch = normalizedLine.match(/^docs(?:\([^()\r\n]+\))?\s*[:：]\s*(.+)$/i)
  if (docsMatch) {
    return { type: 'docs', text: docsMatch[1].trim() }
  }

  return { type: 'others', text: normalizedLine }
}

function parseRollback(line) {
  const rollbackMatch = normalizeCommitLine(line).match(/^rollback\s*[:：]\s*(\d{4}-\d{2}-\d{2})\s+([0-9a-f]{7,40})\s+(\d+)$/i)
  if (!rollbackMatch) return null

  return {
    day: rollbackMatch[1],
    commitId: rollbackMatch[2].toLowerCase(),
    lineNumber: Number(rollbackMatch[3])
  }
}

function isRollbackLine(line) {
  return /^rollback\s*[:：]/i.test(normalizeCommitLine(line))
}

function matchesCommitId(sourceCommitId, targetCommitId) {
  return sourceCommitId === targetCommitId || sourceCommitId.startsWith(targetCommitId) || targetCommitId.startsWith(sourceCommitId)
}

function applyRollback(entries, rollback) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (entry.removed) continue

    if (
      entry.day === rollback.day &&
      matchesCommitId(entry.commitId, rollback.commitId) &&
      entry.lineNumber === rollback.lineNumber
    ) {
      entry.removed = true
      return true
    }
  }

  return false
}

function buildChangelogEntries(commits, initialEntries = []) {
  const entries = initialEntries.map(entry => ({ ...entry, removed: false }))
  const orderedCommits = [...commits].reverse()

  orderedCommits.forEach((commit, commitOrder) => {
    const commitId = String(commit.sha || '').toLowerCase()
    const committedAt = getCommitTimestamp(commit)
    const day = getCommitDayFromTimestamp(committedAt)
    const lines = splitCommitMessage(commit?.commit?.message)

    lines.forEach((line, index) => {
      const lineNumber = index + 1
      const rollback = parseRollback(line)

      if (rollback) {
        const removed = applyRollback(entries, rollback)
        if (!removed) {
          console.warn(`Rollback target not found: ${line}`)
        }
        return
      }

      if (isRollbackLine(line)) {
        console.warn(`Invalid rollback format ignored: ${line}`)
        return
      }

      const category = parseCategory(line)
      if (!category.text || !day || !commitId || !committedAt) {
        return
      }

      entries.push({
        day,
        commitId,
        committedAt,
        commitOrder,
        lineNumber,
        type: category.type,
        text: category.text,
        removed: false
      })
    })
  })

  return entries.filter(entry => !entry.removed)
}

function getHistoricalEntries(entries, todayDay) {
  return entries
    .filter(entry => entry.day < todayDay)
    .map(entry => ({ ...entry }))
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const timeDiff = Date.parse(right.committedAt) - Date.parse(left.committedAt)
    if (timeDiff !== 0) return timeDiff

    const commitOrderDiff = right.commitOrder - left.commitOrder
    if (commitOrderDiff !== 0) return commitOrderDiff

    return left.lineNumber - right.lineNumber
  })
}

function createEmptySections() {
  return {
    updates: [],
    docs: [],
    others: []
  }
}

function groupEntriesByDay(entries) {
  const grouped = new Map()

  for (const entry of sortEntries(entries)) {
    if (!grouped.has(entry.day)) {
      grouped.set(entry.day, createEmptySections())
    }

    grouped.get(entry.day)[entry.type].push(entry.text)
  }

  const todayDay = getTodayDay()
  if (!grouped.has(todayDay)) {
    grouped.set(todayDay, createEmptySections())
  }

  return [...grouped.entries()].sort((left, right) => right[0].localeCompare(left[0]))
}

function renderNumberedList(items) {
  return items.map((item, index) => `${index + 1}. ${linkPullRequestReferences(item)}`).join('\n')
}

function linkPullRequestReferences(text) {
  return String(text).replace(/\(#(\d+)\)/g, (_, pullNumber) => `([#${pullNumber}](${pullRequestBaseUrl}/${pullNumber}))`)
}

function renderDayMarkdown(day, sections) {
  const lines = [
    '---',
    `title: ${day}`,
    '---',
    '',
    `# ${day}`,
    ''
  ]

  let hasContent = false

  for (const section of changelogSections) {
    const items = sections[section.key]
    if (items.length === 0) continue

    hasContent = true
    lines.push(`## ${section.title}`)
    lines.push(renderNumberedList(items))
    lines.push('')
  }

  if (!hasContent) {
    lines.push('今日暂无更新。')
  } else if (lines[lines.length - 1] === '') {
    lines.pop()
  }

  return `${lines.join('\n')}\n`
}

function renderSidebarModule(days) {
  const todayDay = getTodayDay()
  const changelogRelativePaths = ['changelog/latest.md', ...days.map(day => `changelog/${day}.md`)]
  const children = days.map(day => {
    const conditions = [`relativePath === 'changelog/${day}.md'`]
    if (day === todayDay) {
      conditions.push(`relativePath === 'changelog/latest.md'`)
    }

    return `      {
        href: '/changelog/${day}',
        label: '${day}',
        isActive: relativePath => ${conditions.join(' || ')}
      }`
  }).join(',\n')

  return `export const changelogSidebarLinks = [
  {
    href: '/changelog/',
    label: '🏠 首页',
    isActive: relativePath => relativePath === 'changelog/index.md'
  },
  {
    href: '/changelog/logs/',
    label: '🗓️ 日志',
    navigable: false,
    isActive: () => false,
    hasAnyActive: relativePath => ${changelogRelativePaths.map(item => `relativePath === '${item}'`).join(' || ')},
    children: [
${children}
    ]
  }
]
`
}

async function cleanupGeneratedPages() {
  let entries = []

  try {
    entries = await readdir(changelogDir, { withFileTypes: true })
  } catch {
    return
  }

  const generatedFiles = entries
    .filter(entry => entry.isFile() && /^(?:latest|\d{4}-\d{2}-\d{2})\.md$/i.test(entry.name))
    .map(entry => unlink(path.join(changelogDir, entry.name)))

  await Promise.all(generatedFiles)
}

async function readCache() {
  try {
    const raw = await readFile(cacheFilePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed?.version !== cacheVersion || !Array.isArray(parsed.entries)) {
      return null
    }

    return parsed.entries
  } catch {
    return null
  }
}

async function writeCache(entries) {
  const payload = {
    version: cacheVersion,
    owner,
    repo,
    updatedAt: new Date().toISOString(),
    entries
  }

  await mkdir(changelogDir, { recursive: true })
  await writeFile(cacheFilePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
}

async function writeGeneratedArtifacts(daysWithSections) {
  const days = daysWithSections.map(([day]) => day)
  const todayDay = getTodayDay()
  const todaySections = daysWithSections.find(([day]) => day === todayDay)?.[1] ?? createEmptySections()

  await mkdir(changelogDir, { recursive: true })
  await mkdir(generatedDir, { recursive: true })
  await cleanupGeneratedPages()

  await Promise.all(daysWithSections.map(([day, sections]) => {
    const markdown = renderDayMarkdown(day, sections)
    return writeFile(path.join(changelogDir, `${day}.md`), markdown, 'utf8')
  }))

  await writeFile(latestPagePath, renderDayMarkdown(todayDay, todaySections), 'utf8')
  await writeFile(sidebarModulePath, renderSidebarModule(days), 'utf8')
}

async function main() {
  const todayDay = getTodayDay()
  const cachedEntries = await readCache()

  try {
    const isIncrementalBuild = Array.isArray(cachedEntries)
    const commits = isIncrementalBuild ? await fetchRecentCommits(todayDay) : await fetchAllCommits()
    const entries = isIncrementalBuild
      ? buildChangelogEntries(commits, getHistoricalEntries(cachedEntries, todayDay))
      : buildChangelogEntries(commits)

    await writeCache(entries)
    const daysWithSections = groupEntriesByDay(entries)
    await writeGeneratedArtifacts(daysWithSections)
    const fetchModeText = isIncrementalBuild ? 'incremental' : 'full'
    console.log(`Generated ${daysWithSections.length + 1} changelog pages from ${entries.length} items and ${commits.length} commits (${fetchModeText}).`)
  } catch (error) {
    if (Array.isArray(cachedEntries)) {
      console.warn('Failed to refresh changelog from GitHub, using local changelog cache.')
      console.warn(error)
      const daysWithSections = groupEntriesByDay(cachedEntries)
      await writeGeneratedArtifacts(daysWithSections)
      return
    }

    throw error
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
