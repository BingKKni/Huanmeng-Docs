<script setup>
import { ref } from 'vue'

const props = defineProps({
  visible: Boolean,
  title: {
    type: String,
    default: '信息'
  },
  message: {
    type: String,
    default: ''
  },
  showCancel: Boolean,
  confirmLabel: {
    type: String,
    default: '确定'
  }
})

const emit = defineEmits(['close', 'confirm'])

const confirmButtonRef = ref(null)

function focusConfirmButton() {
  confirmButtonRef.value?.focus()
}

defineExpose({
  focusConfirmButton
})
</script>

<template>
  <Transition name="hm-dialog">
    <div v-if="visible" class="hm-dialog" role="presentation">
      <div class="hm-dialog__backdrop" @click="emit('close')"></div>
      <div
        class="hm-dialog__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hm-dialog-title"
        aria-describedby="hm-dialog-message"
      >
        <button type="button" class="hm-dialog__close" aria-label="关闭" @click="emit('close')">&times;</button>
        <div class="hm-dialog__header">
          <h2 id="hm-dialog-title" class="hm-dialog__title">{{ title }}</h2>
        </div>
        <div class="hm-dialog__body">
          <p id="hm-dialog-message" class="hm-dialog__message">{{ message }}</p>
        </div>
        <div class="hm-dialog__footer">
          <button
            ref="confirmButtonRef"
            type="button"
            class="hm-dialog__confirm"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </button>
          <button
            v-if="showCancel"
            type="button"
            class="hm-dialog__cancel"
            @click="emit('close')"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
