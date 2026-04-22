export const changelogSidebarLinks = [
  {
    href: '/changelog/logs/',
    label: '🗓️ 日志',
    navigable: false,
    isActive: () => false,
    hasAnyActive: relativePath => relativePath === 'changelog/latest.md' || relativePath === 'changelog/2026-04-21.md' || relativePath === 'changelog/2026-04-20.md' || relativePath === 'changelog/2026-04-19.md' || relativePath === 'changelog/2026-04-18.md' || relativePath === 'changelog/2026-04-17.md' || relativePath === 'changelog/2026-04-16.md' || relativePath === 'changelog/2026-04-15.md' || relativePath === 'changelog/2026-04-14.md' || relativePath === 'changelog/2026-04-13.md' || relativePath === 'changelog/2026-04-12.md' || relativePath === 'changelog/2026-04-11.md' || relativePath === 'changelog/2026-04-10.md' || relativePath === 'changelog/2026-04-09.md',
    children: [
      {
        href: '/changelog/2026-04-21',
        label: '2026-04-21',
        isActive: relativePath => relativePath === 'changelog/2026-04-21.md' || relativePath === 'changelog/latest.md'
      },
      {
        href: '/changelog/2026-04-20',
        label: '2026-04-20',
        isActive: relativePath => relativePath === 'changelog/2026-04-20.md'
      },
      {
        href: '/changelog/2026-04-19',
        label: '2026-04-19',
        isActive: relativePath => relativePath === 'changelog/2026-04-19.md'
      },
      {
        href: '/changelog/2026-04-18',
        label: '2026-04-18',
        isActive: relativePath => relativePath === 'changelog/2026-04-18.md'
      },
      {
        href: '/changelog/2026-04-17',
        label: '2026-04-17',
        isActive: relativePath => relativePath === 'changelog/2026-04-17.md'
      },
      {
        href: '/changelog/2026-04-16',
        label: '2026-04-16',
        isActive: relativePath => relativePath === 'changelog/2026-04-16.md'
      },
      {
        href: '/changelog/2026-04-15',
        label: '2026-04-15',
        isActive: relativePath => relativePath === 'changelog/2026-04-15.md'
      },
      {
        href: '/changelog/2026-04-14',
        label: '2026-04-14',
        isActive: relativePath => relativePath === 'changelog/2026-04-14.md'
      },
      {
        href: '/changelog/2026-04-13',
        label: '2026-04-13',
        isActive: relativePath => relativePath === 'changelog/2026-04-13.md'
      },
      {
        href: '/changelog/2026-04-12',
        label: '2026-04-12',
        isActive: relativePath => relativePath === 'changelog/2026-04-12.md'
      },
      {
        href: '/changelog/2026-04-11',
        label: '2026-04-11',
        isActive: relativePath => relativePath === 'changelog/2026-04-11.md'
      },
      {
        href: '/changelog/2026-04-10',
        label: '2026-04-10',
        isActive: relativePath => relativePath === 'changelog/2026-04-10.md'
      },
      {
        href: '/changelog/2026-04-09',
        label: '2026-04-09',
        isActive: relativePath => relativePath === 'changelog/2026-04-09.md'
      }
    ]
  }
]
