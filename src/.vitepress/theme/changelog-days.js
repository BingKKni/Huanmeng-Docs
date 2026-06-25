// 自动扫描 src/changelog/ 下按日期命名的 Markdown 文件，生成降序（最新在前）的日期列表。
// 借助 Vite 的 import.meta.glob，在构建期解析文件名，无需任何手动维护的数组。
// 新增一条更新日志时，只需在 src/changelog/ 下放一个 YYYY-MM-DD.md 文件即可，
// 侧边栏、顶部「更新日志」入口、以及 changelog/index.md 的列表都会自动更新。
const changelogModules = import.meta.glob('../../changelog/*.md')

const DATE_FILENAME_REGEX = /(\d{4}-\d{2}-\d{2})\.md$/

export const changelogDays = Object.keys(changelogModules)
  .map(filePath => filePath.match(DATE_FILENAME_REGEX)?.[1])
  .filter(Boolean)
  // 日期为定长 YYYY-MM-DD 字符串，按字典序倒序即等价于按时间倒序（最新在前）。
  .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))

export const latestChangelogHref = changelogDays.length
  ? `/changelog/${changelogDays[0]}`
  : '/changelog/'
