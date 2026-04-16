import {
  buildResponsiveImageKey,
  buildThumbnailKey,
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

function patchExplicitImageToken(token, manifest) {
  const sourceSrc = normalizePublicImageUrl(token.attrGet('src'))
  if (!sourceSrc) return

  const { width, height } = patchSharedAttrs(token, sourceSrc)
  const thumbnail = manifest.thumbnails?.[buildThumbnailKey(sourceSrc, width, height)]

  if (!thumbnail) return

  token.attrSet('src', thumbnail.outputSrc)
  token.attrSet('data-hm-thumb-src', thumbnail.outputSrc)
}

function patchResponsiveImageToken(token, manifest, responsivePresetId) {
  const sourceSrc = normalizePublicImageUrl(token.attrGet('src'))
  if (!sourceSrc || !responsivePresetId) return

  patchSharedAttrs(token, sourceSrc)
  const responsiveImage = manifest.responsiveImages?.[buildResponsiveImageKey(sourceSrc, responsivePresetId)]
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

function patchInlineChildren(children, manifest) {
  const responsivePresetId = getInlineResponsivePresetId(children)

  for (const child of children) {
    if (child.type !== 'image') continue

    const hasExplicitSize = parsePositiveInt(child.attrGet('width')) != null || parsePositiveInt(child.attrGet('height')) != null
    if (hasExplicitSize) {
      patchExplicitImageToken(child, manifest)
      continue
    }

    if (responsivePresetId) {
      patchResponsiveImageToken(child, manifest, responsivePresetId)
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
