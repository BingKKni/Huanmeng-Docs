import {
  Bone, BoxGeometry, Float32BufferAttribute, Group, Mesh, MeshLambertMaterial,
  Skeleton, SkinnedMesh, Uint16BufferAttribute, FrontSide, DoubleSide
} from 'three'

// Minecraft 64×64 UV 展开图；手臂始终为 3×12×4，不做 Steve / auto 检测。
export const SKIN_PARTS = [
  { id: 'head', label: '头部', size: [8, 8, 8], base: [0, 0], outer: [32, 0], pivot: [0, 12, 0], offset: 0, padding: 1 },
  { id: 'body', label: '躯干', size: [8, 12, 4], base: [16, 16], outer: [16, 32], pivot: [0, 2, 0], offset: 0, padding: 0.502 },
  { id: 'rightArm', label: '右臂', size: [3, 12, 4], base: [40, 16], outer: [40, 32], pivot: [-5.5, 6, 0], offset: -4, padding: 0.508 },
  { id: 'leftArm', label: '左臂', size: [3, 12, 4], base: [32, 48], outer: [48, 48], pivot: [5.5, 6, 0], offset: -4, padding: 0.508 },
  { id: 'rightLeg', label: '右腿', size: [4, 12, 4], base: [0, 16], outer: [0, 32], pivot: [-2, -4, 0], offset: -6, padding: 0.504 },
  { id: 'leftLeg', label: '左腿', size: [4, 12, 4], base: [16, 48], outer: [0, 48], pivot: [2, -4, 0], offset: -6, padding: 0.506 }
]

// BoxGeometry 面顺序：+X、-X、+Y、-Y、+Z、-Z。底面 UV 垂直翻转。
export function skinFaceRects([u, v], [w, h, d]) {
  return [
    [u + d + w, v + d, d, h], [u, v + d, d, h],
    [u + d, v, w, d], [u + d + w, v + d - 1, w, -d],
    [u + d, v + d, w, h], [u + 2 * d + w, v + d, w, h]
  ]
}

/** 按像素着色、剔除全透明面，避免图集插值、透明外层黑边和 UV 串色。 */
function createLayer(pixels, spec, outer, materials) {
  const [w, h, d] = spec.size
  const padding = outer ? spec.padding : (spec.id === 'body' ? 0.002 : 0)
  const box = new BoxGeometry(w + padding, h + padding, d + padding, w, h, d)
  const geometry = box.toNonIndexed()
  box.dispose()
  geometry.translate(0, spec.offset, 0)
  const colors = new Float32Array(geometry.getAttribute('position').count * 3)
  const buckets = new Map()
  const rects = skinFaceRects(outer ? spec.outer : spec.base, spec.size)

  geometry.groups.forEach((face, index) => {
    const [x, y, width, height] = rects[index]
    for (let row = 0; row < Math.abs(height); row++) {
      for (let col = 0; col < width; col++) {
        const pixel = ((y + row * Math.sign(height)) * 64 + x + col) * 4
        // 基础层不透明，只有帽子 / 衣服 / 袖口 / 裤腿外层使用 PNG alpha。
        const alpha = outer ? pixels.data[pixel + 3] : 255
        if (alpha === 0) continue
        if (!buckets.has(alpha)) buckets.set(alpha, [])
        const vertices = buckets.get(alpha)
        const first = face.start + (row * width + col) * 6
        for (let vertex = first; vertex < first + 6; vertex++) {
          vertices.push(vertex)
          for (let channel = 0; channel < 3; channel++) {
            colors[vertex * 3 + channel] = pixels.data[pixel + channel] / 255
          }
        }
      }
    }
  })

  if (buckets.size === 0) {
    geometry.dispose()
    return null
  }

  const indices = []
  const layerMaterials = []
  geometry.clearGroups()
  for (const [alpha, vertices] of buckets) {
    const key = `${outer}:${alpha}`
    if (!materials.has(key)) {
      materials.set(key, new MeshLambertMaterial({
        vertexColors: true, side: outer ? DoubleSide : FrontSide,
        transparent: alpha < 255, opacity: alpha / 255,
        toneMapped: false, forceSinglePass: true
      }))
    }
    geometry.addGroup(indices.length, vertices.length, layerMaterials.length)
    indices.push(...vertices)
    layerMaterials.push(materials.get(key))
  }
  geometry.setIndex(indices)
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.deleteAttribute('uv')
  let mesh
  if (/Arm|Leg/.test(spec.id)) {
    // 同一张皮肤连续蒙皮，基础层与外层共用弯曲角，不拆出肘／膝接缝。
    const jointY = spec.offset
    const positions = geometry.getAttribute('position')
    const indices = new Uint16Array(positions.count * 4)
    const weights = new Float32Array(positions.count * 4)
    for (let i = 0; i < positions.count; i++) {
      const lowerWeight = Math.max(0, Math.min(1, (jointY + 0.5 - positions.getY(i))))
      indices[i * 4 + 1] = 1
      weights[i * 4] = 1 - lowerWeight
      weights[i * 4 + 1] = lowerWeight
    }
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(indices, 4))
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(weights, 4))
    const upper = new Bone()
    const lower = new Bone()
    lower.position.y = jointY
    upper.add(lower)
    mesh = new SkinnedMesh(geometry, layerMaterials)
    mesh.add(upper)
    mesh.bind(new Skeleton([upper, lower]))
    // 姿势改变后静态包围球不再适用，模型很小，直接避免错误裁切。
    mesh.frustumCulled = false
  } else {
    mesh = new Mesh(geometry, layerMaterials)
  }
  mesh.name = `${spec.id}:${outer ? 'outer' : 'base'}`
  return mesh
}

export function buildSlimSkin(pixels) {
  if (pixels.width !== 64 || pixels.height !== 64 || pixels.data.length !== 64 * 64 * 4) {
    throw new Error('皮肤文件必须是 64 × 64 的 PNG 图片。')
  }
  const object = new Group()
  object.name = 'minecraft-slim'
  const parts = new Map()
  const overlays = []
  const materials = new Map()
  for (const spec of SKIN_PARTS) {
    const part = new Group()
    part.name = spec.id
    part.position.set(...spec.pivot)
    part.add(createLayer(pixels, spec, false, materials))
    const overlay = createLayer(pixels, spec, true, materials)
    if (overlay) {
      part.add(overlay)
      overlays.push(overlay)
    }
    object.add(part)
    parts.set(spec.id, part)
  }
  return {
    object, parts, overlays,
    dispose() {
      object.traverse(node => {
        node.geometry?.dispose()
        node.skeleton?.dispose()
      })
      materials.forEach(material => material.dispose())
      object.clear()
    }
  }
}

/** 相机视角由 viewer 的 root 管理；模型与各个关节的姿势独立。 */
export function applySkinPose(skin, pose) {
  const radians = degrees => degrees * Math.PI / 180
  const rotate = (object, values) => object.rotation.set(radians(values.x), radians(values.y), radians(values.z))
  rotate(skin.object, pose.model)
  skin.parts.forEach((part, id) => {
    rotate(part, pose[id])
    for (const mesh of part.children) {
      if (!mesh.isSkinnedMesh) continue
      mesh.skeleton.bones[1].rotation.x = radians(pose[id].bend) * (id.endsWith('Arm') ? -1 : 1)
    }
  })
}
