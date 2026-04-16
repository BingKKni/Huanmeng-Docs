import { buildThumbnailKey, normalizePublicImageUrl } from '../image-thumbnail-utils.mjs'

function parsePositiveInt(value) {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function patchImageToken(token, manifest) {
  const sourceSrc = normalizePublicImageUrl(token.attrGet('src'))
  if (!sourceSrc) return

  const width = parsePositiveInt(token.attrGet('width'))
  const height = parsePositiveInt(token.attrGet('height'))
  const thumbnail = manifest.thumbnails?.[buildThumbnailKey(sourceSrc, width, height)]

  if (!token.attrGet('decoding')) token.attrSet('decoding', 'async')
  if (!token.attrGet('loading')) token.attrSet('loading', 'lazy')

  if (!thumbnail) return

  token.attrSet('src', thumbnail.outputSrc)
  token.attrSet('data-hm-full-src', sourceSrc)
  token.attrSet('data-hm-thumb-src', thumbnail.outputSrc)
}

function walkTokens(tokens, manifest) {
  for (const token of tokens) {
    if (token.type === 'image') {
      patchImageToken(token, manifest)
    }

    if (Array.isArray(token.children) && token.children.length > 0) {
      walkTokens(token.children, manifest)
    }
  }
}

export default function imageThumbnailPlugin(md, options = {}) {
  const manifest = options.manifest ?? { thumbnails: {} }

  md.core.ruler.push('hm_image_thumbnail', state => {
    walkTokens(state.tokens, manifest)
  })
}
