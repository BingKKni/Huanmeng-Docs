import { changelogDays, latestChangelogHref } from './changelog-days.js'

export const changelogSidebarLinks = [
  {
    href: latestChangelogHref,
    label: '🗓️ 日志',
    navigable: false,
    isActive: () => false,
    hasAnyActive: relativePath => relativePath === 'changelog/index.md' || changelogDays.some(day => relativePath === `changelog/${day}.md`),
    children: changelogDays.map(day => ({
      href: `/changelog/${day}`,
      label: day,
      isActive: relativePath => relativePath === `changelog/${day}.md`
    }))
  }
]

export const githubLink = {
  href: 'https://github.com/BingKKni/Huanmeng-Docs',
  label: 'Github',
  isExternal: true,
  isActive: () => false
}

export const navLinks = [
  { href: '/', label: '首页', isActive: relativePath => relativePath === 'index.md' },
  {
    href: '/docs/',
    label: '使用文档',
    isActive: relativePath => relativePath === 'docs/index.md' || relativePath.startsWith('docs/')
  },
  {
    href: '/news/',
    label: '动态',
    isActive: relativePath => relativePath === 'news/index.md' || relativePath.startsWith('news/')
  },
  {
    href: '/about/',
    label: '更多',
    isActive: relativePath => relativePath === 'about/index.md' || relativePath.startsWith('about/') || relativePath.startsWith('changelog/')
  },
  {
    label: '社区',
    isActive: () => false,
    children: [
      {
        href: 'https://qm.qq.com/q/6lmTZCS0SY',
        label: 'QQ群',
        isExternal: true,
        confirmTitle: '二次确认',
        confirmMessage: '即将跳转到QQ幻梦官方群，是否继续？',
        confirmLabel: '确认'
      },
      {
        href: 'https://pd.qq.com/s/13nxjzopi',
        label: 'QQ频道',
        isExternal: true,
        confirmTitle: '二次确认',
        confirmMessage: '即将跳转到QQ幻梦官方频道，是否继续？',
        confirmLabel: '确认'
      },
      {
        href: 'https://space.bilibili.com/454289878',
        label: 'BiliBili',
        isExternal: true,
        confirmTitle: '二次确认',
        confirmMessage: '即将跳转到QQ布丁开发者B站空间，是否继续？',
        confirmLabel: '确认'
      }
    ]
  }
]

export const desktopSidebarLinks = [
  { href: '/docs/', label: '🏠 首页', isActive: relativePath => relativePath === 'docs/index.md' },
  {
    href: '/docs/entertainment/',
    label: '✨ 娱乐功能',
    navigable: false,
    isActive: () => false,
    hasAnyActive: relativePath => relativePath.startsWith('docs/entertainment/'),
    children: [
      { href: '/docs/entertainment/signin', label: '打卡', isActive: relativePath => relativePath === 'docs/entertainment/signin.md' },
      { href: '/docs/entertainment/fortune', label: '今日运势', isActive: relativePath => relativePath === 'docs/entertainment/fortune.md' },
      {
        href: '/docs/entertainment/daily_wife/',
        label: '今日老婆',
        isActive: relativePath => relativePath === 'docs/entertainment/daily_wife/index.md',
        hasAnyActive: relativePath => relativePath.startsWith('docs/entertainment/daily_wife/'),
        children: [
          {
            href: '/docs/entertainment/daily_wife/preference',
            label: '喜欢/不喜欢',
            isActive: relativePath => relativePath === 'docs/entertainment/daily_wife/preference.md'
          },
          {
            href: '/docs/entertainment/daily_wife/item_definite_integral_usage',
            label: '定积分券核销',
            isActive: relativePath => relativePath === 'docs/entertainment/daily_wife/item_definite_integral_usage.md'
          },
          {
            href: '/docs/entertainment/daily_wife/item_indefinite_integral_usage',
            label: '不定积分券核销',
            isActive: relativePath => relativePath === 'docs/entertainment/daily_wife/item_indefinite_integral_usage.md'
          }
        ]
      },
      {
        href: '/docs/entertainment/exceptional_function/',
        label: '今日超能力',
        isActive: relativePath => relativePath === 'docs/entertainment/exceptional_function/index.md',
        hasAnyActive: relativePath => relativePath.startsWith('docs/entertainment/exceptional_function/'),
        children: [
          {
            href: '/docs/entertainment/exceptional_function/post_theme',
            label: '投稿超能力主题',
            isActive: relativePath => relativePath === 'docs/entertainment/exceptional_function/post_theme.md'
          }
        ]
      },
      { href: '/docs/entertainment/sence', label: '好感度', isActive: relativePath => relativePath === 'docs/entertainment/sence.md' },
      { href: '/docs/entertainment/stamina', label: '体力', isActive: relativePath => relativePath === 'docs/entertainment/stamina.md' },
      {
        href: '/docs/entertainment/backpack/',
        label: '保险箱',
        isActive: relativePath => relativePath === 'docs/entertainment/backpack/index.md',
        hasAnyActive: relativePath => relativePath.startsWith('docs/entertainment/backpack/'),
        children: [
          {
            href: '/docs/entertainment/backpack/level',
            label: '背包等级特权',
            isActive: relativePath => relativePath === 'docs/entertainment/backpack/level.md'
          }
        ]
      },
      {
        href: '/docs/entertainment/catch_the_cat/',
        label: '圈小猫',
        isActive: relativePath => relativePath === 'docs/entertainment/catch_the_cat/index.md',
        hasAnyActive: relativePath => relativePath.startsWith('docs/entertainment/catch_the_cat/'),
        children: [
          {
            href: '/docs/entertainment/catch_the_cat/multiplayer',
            label: '多人模式',
            isActive: relativePath => relativePath === 'docs/entertainment/catch_the_cat/multiplayer.md'
          }
        ]
      },
      { href: '/docs/entertainment/random_image', label: '随机图', isActive: relativePath => relativePath === 'docs/entertainment/random_image.md' },
      { href: '/docs/entertainment/flop', label: '翻牌', isActive: relativePath => relativePath === 'docs/entertainment/flop.md' },
      { href: '/docs/entertainment/fast_math', label: '速算', isActive: relativePath => relativePath === 'docs/entertainment/fast_math.md' },
      { href: '/docs/entertainment/minesweeper', label: '扫雷', isActive: relativePath => relativePath === 'docs/entertainment/minesweeper.md' },
      { href: '/docs/entertainment/password_cracker', label: '破译', isActive: relativePath => relativePath === 'docs/entertainment/password_cracker.md' },
      { href: '/docs/entertainment/twenty_four_points', label: '二十四点', isActive: relativePath => relativePath === 'docs/entertainment/twenty_four_points.md' },
      { href: '/docs/entertainment/paint_bomb', label: '油漆炸弹', isActive: relativePath => relativePath === 'docs/entertainment/paint_bomb.md' },
      { href: '/docs/entertainment/word_chain', label: '词汇接龙', isActive: relativePath => relativePath === 'docs/entertainment/word_chain.md' },
      { href: '/docs/entertainment/people_set_generation', label: '人设生成', isActive: relativePath => relativePath === 'docs/entertainment/people_set_generation.md' },
      { href: '/docs/entertainment/homo', label: '恶臭数字论证器', isActive: relativePath => relativePath === 'docs/entertainment/homo.md' }
    ]
  },
  {
    href: '/docs/delta_force/',
    label: '🗺️ 三角洲行动攻略',
    isActive: relativePath => relativePath === 'docs/delta_force/index.md',
    hasAnyActive: relativePath => relativePath === 'docs/delta_force/index.md' || relativePath.startsWith('docs/delta_force/'),
    children: [
      { href: '/docs/delta_force/password', label: '每日密码门位置', isActive: relativePath => relativePath === 'docs/delta_force/password.md' }
    ]
  }
]

export const aboutSidebarLinks = [
  {
    href: '/about/',
    label: '🏠 首页',
    isActive: relativePath => relativePath === 'about/index.md'
  },
  {
    href: '/about/rule/',
    label: '✅ 规则中心',
    isActive: relativePath => relativePath === 'about/rule/index.md',
    hasAnyActive: relativePath => relativePath.startsWith('about/rule/'),
    children: [
      {
        href: '/about/rule/user',
        label: '用户准则',
        isActive: relativePath => relativePath === 'about/rule/user.md'
      },
      {
        href: '/about/rule/image',
        label: '图片使用声明',
        isActive: relativePath => relativePath === 'about/rule/image.md'
      },
      {
        href: '/about/rule/official_group',
        label: '幻梦群群规',
        isActive: relativePath => relativePath === 'about/rule/official_group.md'
      }
    ]
  },
  {
    href: '/about/contribution/',
    label: '📝 贡献指南',
    isActive: relativePath => relativePath === 'about/contribution/index.md',
    hasAnyActive: relativePath => relativePath.startsWith('about/contribution/'),
    children: [
      {
        href: '/about/contribution/custom_systax',
        label: '自定义语法',
        isActive: relativePath => relativePath === 'about/contribution/custom_systax.md'
      },
      {
        href: '/about/contribution/markdown_systax',
        label: 'Markdown语法',
        isActive: relativePath => relativePath === 'about/contribution/markdown_systax.md'
      }
    ]
  },
  {
    href: latestChangelogHref,
    label: '🗓️ 更新日志',
    isActive: relativePath => relativePath === 'changelog/index.md',
    hasAnyActive: relativePath => relativePath === 'changelog/index.md' || relativePath.startsWith('changelog/'),
    children: changelogDays.map(day => ({
      href: `/changelog/${day}`,
      label: day,
      isActive: relativePath => relativePath === `changelog/${day}.md`
    }))
  },
  {
    href: '/about/faq/',
    label: '❓ 常见问题FAQ',
    isActive: relativePath => relativePath === 'about/faq/index.md',
    hasAnyActive: relativePath => relativePath === 'about/faq/index.md' || relativePath.startsWith('about/faq/'),
    children: [
      { href: '/about/faq/appeal', label: '封禁申诉', isActive: relativePath => relativePath === 'about/faq/appeal.md' },
      { href: '/about/faq/bugland', label: '布吉岛查询', isActive: relativePath => relativePath === 'about/faq/bugland.md' }
    ]
  },
  { href: '/about/support', label: '🧋 支持幻梦', isActive: relativePath => relativePath === 'about/support.md' }
]

export function getCurrentSidebarLinks(relativePath) {
  if (relativePath.startsWith('docs/')) return desktopSidebarLinks
  if (relativePath.startsWith('about/') || relativePath.startsWith('changelog/')) return aboutSidebarLinks
  return []
}
