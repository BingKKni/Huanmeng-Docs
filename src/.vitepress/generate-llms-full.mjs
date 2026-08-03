import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const siteUrl = 'https://xbdqwq.com'
const rootDir = process.cwd()
const srcDir = path.join(rootDir, 'src')
const outputPath = path.join(srcDir, 'public', 'llms-full.txt')
const excludedTopLevelDirs = new Set(['.vitepress', 'public', 'search', '0.0.0.0'])

async function collectMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      const isTopLevel = path.dirname(filePath) === srcDir
      if (!isTopLevel || !excludedTopLevelDirs.has(entry.name)) {
        files.push(...await collectMarkdownFiles(filePath))
      }
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(filePath)
    }
  }

  return files.sort()
}

function stripFrontmatter(content) {
  return content.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*(?:\r?\n|$)/, '')
}

function removeImages(content) {
  return stripFrontmatter(content)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<picture\b[^>]*>[\s\S]*?<\/picture>/gi, '')
    .replace(/<img\b[^>]*\/?\s*>/gi, '')
    .replace(/!\[[^\]]*\]\([^\n)]*\)(?:\{[^\n}]*\})?/g, '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function filePathToUrl(filePath) {
  let route = path.relative(srcDir, filePath).replace(/\\/g, '/').replace(/\.md$/, '')
  route = route.replace(/(^|\/)index$/, '$1')
  return `${siteUrl}/${route}`.replace(/\/$/, route ? '/' : '')
}

async function main() {
  const files = await collectMarkdownFiles(srcDir)
  const documents = []

  for (const filePath of files) {
    const content = removeImages(await readFile(filePath, 'utf8'))
    if (!content) continue
    documents.push(`Source: ${filePathToUrl(filePath)}\n\n${content}`)
  }

  const output = [
    '# 幻梦Bot 文档全集',
    '',
    '> 本文件汇总本站全部公开静态文档文本，供搜索引擎、AI 爬虫与检索程序读取；图片及图片引用未包含在内。',
    '',
    `Site: ${siteUrl}`,
    `Documents: ${documents.length}`,
    '',
    documents.join('\n\n---\n\n'),
    ''
  ].join('\n')

  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, output, 'utf8')
  console.log(`AI 全文索引生成完成，共 ${documents.length} 篇文档。`)
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
