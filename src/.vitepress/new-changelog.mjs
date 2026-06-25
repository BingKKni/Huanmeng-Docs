// 快速创建一条更新日志：在 src/changelog/ 下按日期生成 YYYY-MM-DD.md，
// frontmatter 的 title、一级标题、以及「更新 / 文档变动」骨架都会自动填好。
//
// 用法：
//   npm run changelog              使用「运行命令当天」的本地日期
//   npm run changelog -- 2026-07-01   指定日期（补录历史时使用）
//
// 生成后，侧边栏、顶部「更新日志」入口、changelog/index.md 历史列表都会
// 通过 import.meta.glob 自动收录，无需任何额外手动维护。
import { access, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'

const rootDir = process.cwd()
const changelogDir = path.join(rootDir, 'src', 'changelog')

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/

function todayLocalISODate() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// 既校验格式，也校验是否为真实存在的日期（拒绝 2026-13-40 这类非法值）。
function isValidDate(value) {
  if (!DATE_REGEX.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function buildTemplate(date) {
  return `---
title: ${date}
---

# ${date}

## 更新
1. 

## 文档变动
1. 
`
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function main() {
  const input = process.argv[2]?.trim()
  const date = input || todayLocalISODate()

  if (input && !isValidDate(date)) {
    console.error(`✗ 日期格式不正确：「${input}」`)
    console.error('  请使用 YYYY-MM-DD，例如：npm run changelog -- 2026-07-01')
    process.exitCode = 1
    return
  }

  const filePath = path.join(changelogDir, `${date}.md`)
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, '/')

  if (await fileExists(filePath)) {
    console.error(`✗ 该日期的日志已存在：${relativePath}`)
    console.error('  如需补录其它日期，请用：npm run changelog -- YYYY-MM-DD')
    process.exitCode = 1
    return
  }

  await writeFile(filePath, buildTemplate(date), 'utf8')
  console.log(`✓ 已创建更新日志：${relativePath}`)
  console.log('  现在直接编辑该文件填写正文即可，侧边栏与历史列表会自动收录。')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
