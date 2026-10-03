const rotationControls = ['x', 'y', 'z'].map(axis => ({
  key: axis, label: axis.toUpperCase(), min: -360, max: 360, step: 0.1, default: 0, unit: '°'
}))
const bendControl = { key: 'bend', label: '弯曲', min: 0, max: 200, step: 0.1, default: 0, unit: '°' }

export const poseGroups = [
  { id: 'model', label: '模型', controls: rotationControls },
  { id: 'head', label: '头部', controls: rotationControls },
  { id: 'body', label: '躯干', controls: rotationControls },
  ...[['leftArm', '左臂'], ['rightArm', '右臂'], ['leftLeg', '左腿'], ['rightLeg', '右腿']]
    .map(([id, label]) => ({ id, label, controls: [...rotationControls, bendControl] })),
  { id: 'light', label: '光照', controls: [
    { key: 'ambient', label: '环境光', min: 0, max: 100, step: 1, default: 70, unit: '%' },
    { key: 'sun', label: '阳光', min: 0, max: 100, step: 1, default: 30, unit: '%' }
  ] },
  { id: 'sun', label: '太阳', controls: [
    { key: 'x', label: 'X', min: -1, max: 1, step: 0.01, default: 1, unit: '' },
    { key: 'z', label: 'Z', min: -1, max: 1, step: 0.01, default: 1, unit: '' }
  ] }
]

export function createPoseSettings() {
  return Object.fromEntries(poseGroups.map(group => [group.id, {
    ...Object.fromEntries(group.controls.map(control => [control.key, control.default])),
    ...(group.id === 'light' ? { color: '#ffffff' } : {})
  }]))
}

/** 留空或输入负号时不覆盖旧值；提交时才归一化，允许完整输入负数与小数。 */
export function normalizePoseValue(groupId, key, raw) {
  const group = poseGroups.find(item => item.id === groupId)
  if (groupId === 'light' && key === 'color') {
    return /^#[\da-f]{6}$/i.test(String(raw)) ? String(raw).toLowerCase() : null
  }
  const control = group?.controls.find(item => item.key === key)
  if (!control || String(raw).trim() === '') return null
  const value = Number(raw)
  if (!Number.isFinite(value)) return null
  const bounded = Math.max(control.min, Math.min(control.max, value))
  return Number((Math.round(bounded / control.step) * control.step).toFixed(2))
}

export function copyPoseSettings(settings) {
  return Object.fromEntries(Object.entries(settings).map(([key, values]) => [key, { ...values }]))
}

export function walkingPose(settings, phase) {
  const pose = copyPoseSettings(settings)
  const swing = Math.sin(phase)
  for (const [id, amplitude] of [['rightArm', -18], ['leftArm', 18], ['rightLeg', 20], ['leftLeg', -20]]) {
    pose[id].x = normalizePoseValue(id, 'x', pose[id].x + amplitude * swing)
  }
  return pose
}
