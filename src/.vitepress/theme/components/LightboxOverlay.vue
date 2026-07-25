<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: Boolean,
  phase: {
    type: String,
    default: 'closed'
  },
  backdropOpacity: {
    type: Number,
    default: 0
  },
  src: {
    type: String,
    default: ''
  },
  intrinsicWidth: {
    type: Number,
    default: 0
  },
  intrinsicHeight: {
    type: Number,
    default: 0
  },
  offsetX: {
    type: Number,
    default: 0
  },
  offsetY: {
    type: Number,
    default: 0
  },
  scale: {
    type: Number,
    default: 1
  },
  scaleMin: {
    type: Number,
    default: 0.5
  },
  scaleMax: {
    type: Number,
    default: 4
  },
  imageTransition: {
    type: String,
    default: 'transform 0.18s ease'
  },
  fileSizeLabel: {
    type: String,
    default: ''
  },
  galleryLength: {
    type: Number,
    default: 0
  },
  hasPrevious: Boolean,
  hasNext: Boolean
})

const emit = defineEmits([
  'click',
  'wheel',
  'mousedown',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
  'zoom-in',
  'zoom-out',
  'previous',
  'next',
  'download'
])

const lightboxRootRef = defineModel('lightboxRootRef')
const lightboxFlipRef = defineModel('lightboxFlipRef')
const lightboxImgRef = defineModel('lightboxImgRef')

/* 显示宽度 = min(原图宽, 最大宽, 最大高 × 宽高比)：让 <img> 盒子的宽高比
   恒等于图片宽高比，从源头消除 object-fit: contain 的信箱留白，鼠标移出
   图片可见范围即离开元素，光标与关闭判定都准确。同时保留 aspect-ratio
   以便加载前预留空间、供 FLIP 测量。 */
const displayWidth = computed(() => {
  if (!props.intrinsicWidth || !props.intrinsicHeight) return undefined
  const ratio = props.intrinsicWidth / props.intrinsicHeight
  return `min(${props.intrinsicWidth}px, var(--hm-lightbox-max-w), calc(var(--hm-lightbox-max-h) * ${ratio}))`
})

const zoomPercent = computed(() => Math.round(props.scale * 100))
const zoomOutDisabled = computed(() => props.scale <= props.scaleMin + 0.001)
const zoomInDisabled = computed(() => props.scale >= props.scaleMax - 0.001)

/* 仅在完全打开后展示工具栏：避免 FLIP 飞入 / 关闭过程中控件闪动 */
const toolbarVisible = computed(() => props.phase === 'open')
</script>

<template>
  <div
    v-show="visible"
    ref="lightboxRootRef"
    class="hm-lightbox"
    :class="{
      'hm-lightbox--busy': phase === 'opening' || phase === 'closing',
      'hm-lightbox--opening': phase === 'opening',
      'hm-lightbox--closing': phase === 'closing'
    }"
    @click="emit('click', $event)"
    @wheel.prevent="emit('wheel', $event)"
  >
    <div class="hm-lightbox__backdrop" :style="{ opacity: backdropOpacity }" />
    <div class="hm-lightbox__content">
      <div ref="lightboxFlipRef" class="hm-lightbox__flip">
        <img
          ref="lightboxImgRef"
          :class="{
            'hm-lightbox__image--zoomed': scale > 1,
            'hm-lightbox__image--zoom-out': scale >= 2
          }"
          :src="src"
          alt=""
          :style="{
            width: displayWidth,
            height: displayWidth ? 'auto' : undefined,
            aspectRatio: intrinsicWidth && intrinsicHeight ? `${intrinsicWidth} / ${intrinsicHeight}` : undefined,
            transform: `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`,
            transition: imageTransition,
          }"
          @mousedown="emit('mousedown', $event)"
          @touchstart="emit('touchstart', $event)"
          @touchmove="emit('touchmove', $event)"
          @touchend="emit('touchend', $event)"
          @touchcancel="emit('touchcancel', $event)"
        >
      </div>

      <div
        class="hm-lightbox__toolbar"
        :class="{ 'hm-lightbox__toolbar--visible': toolbarVisible }"
        :aria-hidden="!toolbarVisible"
        @click.stop
        @mousedown.stop
        @wheel.stop
        @touchstart.stop
        @touchmove.stop
        @touchend.stop
      >
        <div v-if="galleryLength > 1" class="hm-lightbox__navigation" role="group" aria-label="切换图片">
          <button
            type="button"
            class="hm-lightbox__navigation-btn"
            :disabled="!hasPrevious"
            aria-label="上一张"
            title="上一张"
            @click="emit('previous')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
          <button
            type="button"
            class="hm-lightbox__navigation-btn"
            :disabled="!hasNext"
            aria-label="下一张"
            title="下一张"
            @click="emit('next')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m9 18 6-6-6-6" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          class="hm-lightbox__tool-btn hm-lightbox__download"
          @click="emit('download')"
        >
          <svg
            class="hm-lightbox__tool-icon"
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M12 4.5v10" />
            <path d="m8 11 4 4 4-4" />
            <path d="M5.5 18.5h13" />
          </svg>
          <span>下载原图<template v-if="fileSizeLabel"> ({{ fileSizeLabel }})</template></span>
        </button>

        <div class="hm-lightbox__zoom" role="group" aria-label="缩放">
          <button
            type="button"
            class="hm-lightbox__zoom-btn"
            :disabled="zoomOutDisabled"
            aria-label="缩小"
            @click="emit('zoom-out')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M6 12h12" />
            </svg>
          </button>
          <span class="hm-lightbox__zoom-value">{{ zoomPercent }}%</span>
          <button
            type="button"
            class="hm-lightbox__zoom-btn"
            :disabled="zoomInDisabled"
            aria-label="放大"
            @click="emit('zoom-in')"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M12 6v12" />
              <path d="M6 12h12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
