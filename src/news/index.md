---
title: 动态
---

<script setup>
import { withBase } from 'vitepress'
import { data as newsItems } from '../.vitepress/theme/news.data.js'
</script>

# 动态

这里会收集幻梦 Bot 的版本进展、功能预告、活动记录和文档站维护说明。

## 全部动态

<div class="app-card-grid">
    <div v-for="item in newsItems" :key="item.url" class="app-card">
        <div class="app-card-left">
            <div class="app-card-avatar emoji-avatar">{{ item.emoji }}</div>
            <div class="app-card-info">
                <div class="app-card-title">{{ item.title }}</div>
                <div class="app-card-desc">{{ [item.date, item.description].filter(Boolean).join(' · ') }}</div>
            </div>
        </div>
        <a :href="withBase(item.url)" class="app-action-btn">前往</a>
    </div>
</div>
