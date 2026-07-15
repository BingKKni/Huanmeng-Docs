import {
  buildResponsiveImageKey,
  buildThumbnailKey,
  getResponsiveImagePreset,
  getResponsiveImagePresetIdForCount,
  normalizePublicImageUrl
} from '../image-thumbnail-utils.mjs'

function parsePositiveInt(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function patchSharedAttrs(token, sourceSrc, thumbSrc) {
  const width = parsePositiveInt(token.attrGet('width'))
  const height = parsePositiveInt(token.attrGet('height'))

  if (!token.attrGet('decoding')) token.attrSet('decoding', 'async')
  if (!token.attrGet('loading')) token.attrSet('loading', 'lazy')

  token.attrSet('data-hm-full-src', sourceSrc)
  if (thumbSrc) token.attrSet('data-hm-thumb-src', thumbSrc)

  return { width, height }
}

/* 图片是懒加载的：加载前没有固有尺寸就无法预留空间，进入视口后会把
   下方内容顶开，造成布局抖动、锚点跳转落点漂移。这里在构建期补齐
   width/height（浏览器据此推出 aspect-ratio 预留空间）：
   - 作者只写了一边：按原图比例补另一边，渲染尺寸不变；
   - 两边都没写：注入原图宽高并打上 data-hm-auto-size 标记，
     配合 CSS height:auto 保证被 max-width 压缩时高度按比例跟随。 */
function applyIntrinsicSize(token, authorWidth, authorHeight, dims) {
  if (authorWidth != null && authorHeight != null) return

  const naturalWidth = dims?.width
  const naturalHeight = dims?.height
  if (!naturalWidth || !naturalHeight) return

  if (authorWidth != null) {
    token.attrSet('height', String(Math.max(1, Math.round(authorWidth * naturalHeight / naturalWidth))))
    return
  }

  if (authorHeight != null) {
    token.attrSet('width', String(Math.max(1, Math.round(authorHeight * naturalWidth / naturalHeight))))
    return
  }

  token.attrSet('width', String(naturalWidth))
  token.attrSet('height', String(naturalHeight))
  token.attrSet('data-hm-auto-size', '1')
}

function patchSourceDimensions(token, dims) {
  if (!dims?.width || !dims?.height) return
  token.attrSet('data-hm-full-width', String(dims.width))
  token.attrSet('data-hm-full-height', String(dims.height))
}

function patchExplicitImageToken(token, manifest) {
  const sourceSrc = normalizePublicImageUrl(token.attrGet('src'))
  if (!sourceSrc) return

  const { width, height } = patchSharedAttrs(token, sourceSrc)
  const thumbnail = manifest.thumbnails?.[buildThumbnailKey(sourceSrc, width, height)]
  const dims = manifest.sourceDimensions?.[sourceSrc]
    ?? (thumbnail ? { width: thumbnail.originalWidth, height: thumbnail.originalHeight } : null)
  patchSourceDimensions(token, dims)
  applyIntrinsicSize(token, width, height, dims)

  if (!thumbnail) return

  token.attrSet('src', thumbnail.outputSrc)
  token.attrSet('data-hm-thumb-src', thumbnail.outputSrc)
}

function patchResponsiveImageToken(token, manifest, responsivePresetId, rowRatio = null) {
  const sourceSrc = normalizePublicImageUrl(token.attrGet('src'))
  if (!sourceSrc || !responsivePresetId) return

  patchSharedAttrs(token, sourceSrc)

  const dims = manifest.sourceDimensions?.[sourceSrc]
  patchSourceDimensions(token, dims)

  if (rowRatio) {
    /* 多图行：客户端 JS 会把整行统一到「最宽图片」决定的高度并 cover 裁切，
       这里按同一比例注入，让加载前的预留高度与加载后完全一致。
       行内宽度由 flex: 1 1 0% 决定，width 属性只参与比例推导，不影响布局 */
    if (dims?.width && dims?.height) {
      token.attrSet('width', String(dims.width))
      token.attrSet('height', String(Math.max(1, Math.round(dims.width / rowRatio))))
      token.attrSet('data-hm-auto-size', '1')
    }
    const rowResponsiveImage = manifest.responsiveImages?.[buildResponsiveImageKey(sourceSrc, responsivePresetId)]
    applyResponsiveSources(token, rowResponsiveImage)
    return
  }

  /* 单图：srcset+sizes 图片的渲染宽度由 sizes 推导；只有原图不小于 sizes
     的上限（maxRenderWidth）时，注入原图宽高才不会改变现有渲染尺寸 */
  const preset = getResponsiveImagePreset(responsivePresetId)
  if (dims && preset?.maxRenderWidth && dims.width >= preset.maxRenderWidth) {
    applyIntrinsicSize(token, null, null, dims)
  }

  const responsiveImage = manifest.responsiveImages?.[buildResponsiveImageKey(sourceSrc, responsivePresetId)]
  applyResponsiveSources(token, responsiveImage)
}

function applyResponsiveSources(token, responsiveImage) {
  if (!responsiveImage || !Array.isArray(responsiveImage.sources) || responsiveImage.sources.length === 0) return

  const srcset = responsiveImage.sources
    .map(source => `${source.outputSrc} ${source.outputWidth}w`)
    .join(', ')

  token.attrSet('src', responsiveImage.fallbackSrc)
  token.attrSet('srcset', srcset)
  token.attrSet('sizes', responsiveImage.sizes)
  token.attrSet('data-hm-thumb-src', responsiveImage.fallbackSrc)
}

function isWhitespaceInlineToken(token) {
  if (token.type === 'text') return token.content.trim() === ''
  return token.type === 'softbreak' || token.type === 'hardbreak'
}

function getInlineResponsivePresetId(children) {
  let imageCount = 0

  for (const child of children) {
    if (child.type === 'image') {
      imageCount += 1
      continue
    }

    if (!isWhitespaceInlineToken(child)) return null
  }

  return getResponsiveImagePresetIdForCount(imageCount)
}

/* 多图行的统一裁切比例（宽/高）：与客户端 applyMultiImageRowHeights 的
   min-height 算法一致，行高由最宽（宽高比最大）的图片决定。
   行内有对齐类（左/右浮动，宽度不受 flex 均分控制）或作者显式宽高、
   或任一图片缺少尺寸信息时返回 null，保持原有行为不注入。 */
function getRowUniformRatio(children, manifest) {
  let maxRatio = 0

  for (const child of children) {
    if (child.type !== 'image') continue

    const cls = child.attrGet('class') || ''
    if (/\bhm-(?:left|right)-img\b/.test(cls)) return null

    const hasExplicitSize = parsePositiveInt(child.attrGet('width')) != null || parsePositiveInt(child.attrGet('height')) != null
    if (hasExplicitSize) return null

    const sourceSrc = normalizePublicImageUrl(child.attrGet('src'))
    const dims = sourceSrc ? manifest.sourceDimensions?.[sourceSrc] : null
    if (!dims?.width || !dims?.height) return null

    maxRatio = Math.max(maxRatio, dims.width / dims.height)
  }

  return maxRatio > 0 ? maxRatio : null
}

function patchInlineChildren(children, manifest) {
  const responsivePresetId = getInlineResponsivePresetId(children)
  const imageCount = children.filter(child => child.type === 'image').length
  const rowRatio = responsivePresetId && imageCount >= 2 ? getRowUniformRatio(children, manifest) : null

  for (const child of children) {
    if (child.type !== 'image') continue

    const hasExplicitSize = parsePositiveInt(child.attrGet('width')) != null || parsePositiveInt(child.attrGet('height')) != null
    if (hasExplicitSize) {
      patchExplicitImageToken(child, manifest)
      continue
    }

    if (responsivePresetId) {
      patchResponsiveImageToken(child, manifest, responsivePresetId, rowRatio)
      continue
    }

    patchExplicitImageToken(child, manifest)
  }
}

function walkTokens(tokens, manifest) {
  for (const token of tokens) {
    if (token.type === 'inline' && Array.isArray(token.children) && token.children.length > 0) {
      patchInlineChildren(token.children, manifest)
      continue
    }

    if (token.type === 'image') {
      patchExplicitImageToken(token, manifest)
    }

    if (Array.isArray(token.children) && token.children.length > 0) {
      walkTokens(token.children, manifest)
    }
  }
}

export default function imageThumbnailPlugin(md, options = {}) {
  const manifest = options.manifest ?? { thumbnails: {}, responsiveImages: {} }

  md.core.ruler.push('hm_image_thumbnail', state => {
    walkTokens(state.tokens, manifest)
  })
}
