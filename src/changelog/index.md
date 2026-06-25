---
title: 更新日志
---

# 更新日志

这里记录幻梦文档站的历史更新。新增日志时，只需在 `src/changelog/` 下新增一个按日期命名的 Markdown 文件（如 `2026-07-01.md`），下面的列表会自动更新，无需手动维护。

## 历史记录

<script setup>
import { withBase } from 'vitepress'
import { changelogDays } from '../.vitepress/theme/changelog-days.js'
</script>

<ol class="changelog-history-list">
  <li v-for="day in changelogDays" :key="day">
    <a :href="withBase(`/changelog/${day}`)">{{ day }}</a>
  </li>
</ol>
