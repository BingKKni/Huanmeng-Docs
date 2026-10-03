---
title: Minecraft 皮肤
description: 小布丁、恒烈与幻梦的 Minecraft 皮肤，支持 Slim 细臂 3D 旋转、动画、缩放和下载。
---

<script setup>
import { useMcSkinGallery } from '../.vitepress/plugins/mcskin.js'
import '../.vitepress/plugins/mcskin.css'

const {
  gallery, skins, start, toggleAnimation, setZoom, reset
} = useMcSkinGallery()
</script>

# Minecraft 皮肤

---

小布丁、恒烈和幻梦的 Minecraft 皮肤展示。

<div ref="gallery" class="mcskin-gallery">
  <section v-for="skin in skins" :key="skin.id" class="mcskin-card" :data-skin="skin.id" :data-state="skin.loading ? 'loading' : skin.ready ? 'ready' : 'error'" :aria-labelledby="`mcskin-title-${skin.id}`">
    <header class="mcskin-card-header">
      <h2 :id="`mcskin-title-${skin.id}`">{{ skin.name }}</h2>
      <span class="mcskin-model">Slim</span>
    </header>
    <div class="mcskin-stage" :aria-busy="skin.loading">
      <canvas :key="skin.revision" :data-skin="skin.id" data-model="slim" :tabindex="skin.ready ? 0 : -1" role="img" :aria-label="`${skin.name}的 3D 皮肤，可拖拽或使用方向键旋转`" :aria-hidden="!skin.ready">当前浏览器不支持 3D 预览，请使用 Chrome、Edge、Firefox 等浏览器。</canvas>
      <div v-if="!skin.ready" class="mcskin-placeholder" role="status">
        <span v-if="skin.loading" class="mcskin-loader" aria-hidden="true"></span>
        <span>{{ skin.loading ? '拉取皮肤…' : skin.error }}</span>
        <button v-if="!skin.loading" type="button" class="mcskin-button" @click="start(skin)">重试</button>
      </div>
      <div class="mcskin-toolbar" role="group" :aria-label="`${skin.name}的预览工具`">
        <button type="button" class="mcskin-icon-button" :disabled="!skin.ready" :aria-pressed="skin.playing" :aria-label="`${skin.playing ? '暂停' : '播放'}${skin.name}的行走动画`" :title="skin.playing ? '暂停动画' : '播放动画'" @click="toggleAnimation(skin)">
          <svg v-if="skin.playing" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke-width="3" /></svg>
          <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z" /></svg>
        </button>
        <a class="mcskin-icon-button" :href="skin.url" :download="`${skin.name}.png`" :aria-label="`下载${skin.name}的皮肤`" title="下载原始皮肤 PNG">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" /></svg>
        </a>
        <button type="button" class="mcskin-icon-button" :disabled="!skin.ready" :aria-label="`重置${skin.name}的预览`" title="重置视角和缩放" @click="reset(skin)">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10a8 8 0 1 1 2 8M4 4v6h6" /></svg>
        </button>
      </div>
    </div>
    <div class="mcskin-controls">
      <div class="mcskin-view-controls" role="group" :aria-label="`${skin.name}的缩放`">
        <label class="mcskin-zoom">
          <span class="mcskin-sr-only">{{ skin.name }}的缩放</span>
          <input type="range" min="0.65" max="2.5" step="0.01" :value="skin.zoom" :disabled="!skin.ready" :aria-valuetext="`${Math.round(skin.zoom * 100)}%`" @input="setZoom(skin, $event.target.value)">
        </label>
        <output class="mcskin-zoom-value">{{ Math.round(skin.zoom * 100) }}%</output>
      </div>
    </div>
  </section>
</div>

### 使用范围
你可以下载皮肤用于：
- 作为自己正版ID的皮肤形象
- 录制视频（可以开平台激励）
- 地图/服务器内的非商业性使用

未经幻梦开发组和皮肤作者的同意，你不能将皮肤用于：
- 商业利用
- 声明这个皮肤所有者是你

你可以将我们的皮肤进行二次加工，但加工必须以正面修改{gray}（如加一个鞋子、改衣服为泳装等）{}为前提。
抽象、猎奇化{gray}（如改肤色为黑色、让皮肤变的血腥）{}等负面修改一律禁止。
你可以将皮肤上传到例如 LittleSkin 等皮肤站，但务必注明出处。

### 作者
原作: 悠萩
皮肤二创: llibrary