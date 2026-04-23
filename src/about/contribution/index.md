# 贡献指南

---

如果你准备补充、修改或整理幻梦Bot文档，建议先看完这几页再开始写。这样可以让新内容和站内现有页面保持一致，不会出现语气、排版、语法混用的问题。

::: info
这份指南更关注“怎么把站内文档写得自然、清楚、统一”，而不是教科书式的 Markdown 全语法。
:::

## 先看这两页

<div class="app-card-grid">
    <div class="app-card">
        <div class="app-card-left">
            <div class="app-card-avatar emoji-avatar">📝</div>
            <div class="app-card-info">
                <div class="app-card-title">Markdown 语法指南</div>
                <div class="app-card-desc">站内常用的 Markdown 写法与推荐示例</div>
            </div>
        </div>
        <a href="/about/contribution/markdown_systax" class="app-action-btn">前往</a>
    </div>
    <div class="app-card">
        <div class="app-card-left">
            <div class="app-card-avatar emoji-avatar">✨</div>
            <div class="app-card-info">
                <div class="app-card-title">自有语法指南</div>
                <div class="app-card-desc">本站启用的彩色文本、标签页、表格增强等扩展写法</div>
            </div>
        </div>
        <a href="/about/contribution/custom_systax" class="app-action-btn">前往</a>
    </div>
</div>

## 站内文案风格

幻梦Bot现有文档整体上偏向 {blue}友好、直接、说明式{} 的写法，重点是让读者快速看懂要点，而不是把句子写得很“官方”或者很“学术”。

- 先给结论，再补充解释。
- 一段只讲一个重点，尽量不要一大段塞太多信息。
- 能用列表说清楚的内容，就不要硬写成长段落。
- 标题层级尽量控制在 `#`、`##`、`###` 这 3 层内。
- 需要操作说明时，优先写成步骤。
- 需要强调重点时，优先使用加粗、提示块或少量颜色强调。

::: tip
帮助页、玩法页可以保留一点站内原有的亲和语气；但贡献文档更推荐克制一点，保持清楚、稳定、好维护。
:::

## 中文排版建议

下面这些规则很简单，但对统一观感很有帮助。

### 中文与英文、数字之间留空格

```diff
- 在Python中，我们使用class关键字来声明类。
+ 在 Python 中，我们使用 class 关键字来声明类。

- 这个功能需要3天完成。
+ 这个功能需要 3 天完成。
```

### 中文语境下优先使用全角标点

```diff
- 你好,请先阅读贡献指南.
+ 你好，请先阅读贡献指南。

- 你可以查看"Markdown 语法指南"。
+ 你可以查看“Markdown 语法指南”。
```

### 链接与前后文本之间留空格

```diff
- 详细说明可以参考[Markdown 语法指南](/about/contribution/markdown_systax)。
+ 详细说明可以参考 [Markdown 语法指南](/about/contribution/markdown_systax)。
```

### 命令、路径、参数使用行内代码

像 `/娱乐功能设置`、`src/about/contribution/index.md`、`width="400"` 这种内容，推荐使用行内代码包起来，读起来会更清楚。

## 推荐写法

写新页面时，推荐使用下面这种组织方式：

1. 先用一两句话说明这页是做什么的。
2. 再按主题拆成几个 `##` 小节。
3. 每个小节里先说“什么时候用”，再给示例。
4. 如果有误区或限制，放到 `::: warning` 或 `::: info` 里。

一个常见结构大概像这样：

```md
# 页面标题

---

一句话说明这页适合谁看。

::: info
这里放最重要的提醒。
:::

## 基本写法

先解释，再给示例。

## 使用场景

- 场景 1
- 场景 2

## 注意事项

- 注意点 1
- 注意点 2
```

## 提交前检查

提交前，建议至少检查下面这些内容：

1. 标题层级是否清楚，是否没有跳级。
2. 文案语气是否和站内页面一致。
3. 图片、链接、代码块是否能正常显示。
4. 是否优先使用了站内已有写法，而不是临时造新格式。
5. 颜色强调、HTML 混排、自定义语法是否用得克制。

::: warning
如果普通 Markdown 已经能表达清楚，就不要为了排版效果额外堆很多 HTML。保持简单，通常就是最好的写法。
:::
