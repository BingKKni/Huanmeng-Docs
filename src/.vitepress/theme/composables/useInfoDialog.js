import { ref } from 'vue'

export function useInfoDialog() {
  const infoDialogVisible = ref(false)
  const infoDialogTitle = ref('信息')
  const infoDialogMessage = ref('')
  const infoDialogShowCancel = ref(false)
  const infoDialogConfirmLabel = ref('确定')
  let infoDialogOnConfirm = null

  function openInfoDialog(message, title = '信息', onConfirm = null, showCancel = false, confirmLabel = '确定') {
    infoDialogTitle.value = title
    infoDialogMessage.value = message
    infoDialogOnConfirm = onConfirm
    infoDialogShowCancel.value = Boolean(showCancel)
    infoDialogConfirmLabel.value = confirmLabel
    infoDialogVisible.value = true
  }

  function closeInfoDialog() {
    infoDialogVisible.value = false
    infoDialogOnConfirm = null
    infoDialogShowCancel.value = false
    infoDialogConfirmLabel.value = '确定'
  }

  function handleInfoDialogConfirm() {
    const onConfirm = infoDialogOnConfirm
    if (typeof onConfirm === 'function') {
      onConfirm()
    }
    closeInfoDialog()
  }

  return {
    infoDialogVisible,
    infoDialogTitle,
    infoDialogMessage,
    infoDialogShowCancel,
    infoDialogConfirmLabel,
    openInfoDialog,
    closeInfoDialog,
    handleInfoDialogConfirm
  }
}
