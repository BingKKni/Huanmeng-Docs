<script setup>
defineProps({
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
  imageTransition: {
    type: String,
    default: 'transform 0.18s ease'
  }
})

const emit = defineEmits([
  'click',
  'wheel',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel'
])

const lightboxRootRef = defineModel('lightboxRootRef')
const lightboxFlipRef = defineModel('lightboxFlipRef')
const lightboxImgRef = defineModel('lightboxImgRef')
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
  >
    <div class="hm-lightbox__backdrop" :style="{ opacity: backdropOpacity }" />
    <div class="hm-lightbox__content">
      <div ref="lightboxFlipRef" class="hm-lightbox__flip">
        <img
          ref="lightboxImgRef"
          :src="src"
          alt=""
          :style="{
            transform: `translate3d(${offsetX}px, ${offsetY}px, 0) scale(${scale})`,
            transition: imageTransition,
          }"
          @wheel.prevent="emit('wheel', $event)"
          @touchstart="emit('touchstart', $event)"
          @touchmove="emit('touchmove', $event)"
          @touchend="emit('touchend', $event)"
          @touchcancel="emit('touchcancel', $event)"
        >
      </div>
    </div>
  </div>
</template>
