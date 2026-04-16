import { existsSync, readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

export const rootDir = process.cwd()
export const srcDir = path.join(rootDir, 'src')
export const publicDir = path.join(srcDir, 'public')
export const publicImgDir = path.join(publicDir, 'img')
export const thumbPublicDir = path.join(publicDir, 'img-thumbs')
export const manifestPath = path.join(srcDir, '.vitepress', 'cache', 'image-thumbnails.manifest.json')

const IMAGE_EXT_RE = /\.(?:png|jpe?g|webp|gif|avif|svg)$/i
const DIMENSION_ATTR_RE = /\b(width|height)\s*=\s*(?:"(\d+)"|'(\d+)'|(\d+))/g
const MARKDOWN_IMAGE_RE = /!\[[^\]]*\]\((\/img\/[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\)(\{[^{}\n]*\})?/g
const SKIP_DIRS = new Set(['.vitepress', '.vscode', 'node_modules'])

export const RESPONSIVE_IMAGE_PRESETS = Object.freeze({
  'auto-single': Object.freeze({
    id: 'auto-single',
    fallbackWidth: 960,
    candidateWidths: Object.freeze([1080, 1440, 1600, 1920, 2160]),
    sizes: '(max-width: 767.98px) calc(100vw - 24px), min(68vw, 1080px)'
  }),
  'auto-double': Object.freeze({
    id: 'auto-double',
    fallbackWidth: 480,
    candidateWidths: Object.freeze([720, 960, 1080, 1200]),
    sizes: '(max-width: 767.98px) calc((100vw - 36px) / 2), 534px'
  }),
  'auto-dense': Object.freeze({
    id: 'auto-dense',
    fallbackWidth: 360,
    candidateWidths: Object.freeze([480, 640]),
    sizes: '(max-width: 767.98px) calc((100vw - 48px) / 3), 352px'
  })
})

export function normalizePublicImageUrl(url) {
  if (typeof url !== 'string') return null
  const normalized = url.trim().replace(/\\/g, '/')
  return normalized.startsWith('/img/') ? normalized : null
}

export function buildThumbnailKey(sourceSrc, width = null, height = null) {
  const normalizedSrc = normalizePublicImageUrl(sourceSrc)
  if (!normalizedSrc) return ''
  return `${normalizedSrc}|${width ?? ''}|${height ?? ''}`
}

export function buildResponsiveImageKey(sourceSrc, presetId = '') {
  const normalizedSrc = normalizePublicImageUrl(sourceSrc)
  if (!normalizedSrc || !presetId) return ''
  return `${normalizedSrc}|preset:${presetId}`
}

export function getResponsiveImagePreset(presetId) {
  return RESPONSIVE_IMAGE_PRESETS[presetId] ?? null
}

export function getResponsiveImagePresetIdForCount(count) {
  if (!Number.isFinite(count) || count <= 0) return null
  if (count === 1) return 'auto-single'
  if (count === 2) return 'auto-double'
  return 'auto-dense'
}

export function parseDimensionAttributes(attrBlock = '') {
  let width = null
  let height = null

  for (const match of attrBlock.matchAll(DIMENSION_ATTR_RE)) {
    const value = Number(match[2] ?? match[3] ?? match[4])
    if (!Number.isFinite(value) || value <= 0) continue
    if (match[1] === 'width') width = value
    if (match[1] === 'height') height = value
  }

  return { width, height }
}

function splitMarkdownBlocks(source = '') {
  return String(source)
    .split(/\r?\n\s*\r?\n+/)
    .map(block => block.trim())
    .filter(Boolean)
}

function isImageOnlyMarkdownBlock(block) {
  if (!block) return false
  const stripped = block.replace(MARKDOWN_IMAGE_RE, '').trim()
  return stripped === ''
}

export function extractMarkdownImageUsages(source, filePath = '') {
  const usages = []

  for (const block of splitMarkdownBlocks(source)) {
    const matches = [...block.matchAll(MARKDOWN_IMAGE_RE)]
    if (matches.length === 0) continue

    const responsivePresetId = isImageOnlyMarkdownBlock(block)
      ? getResponsiveImagePresetIdForCount(matches.length)
      : null

    for (const match of matches) {
      const sourceSrc = normalizePublicImageUrl(match[1])
      if (!sourceSrc) continue

      const { width, height } = parseDimensionAttributes(match[2] ?? '')
      if (width != null || height != null) {
        usages.push({
          kind: 'thumbnail',
          key: buildThumbnailKey(sourceSrc, width, height),
          sourceSrc,
          sourceFile: filePath,
          requestedWidth: width,
          requestedHeight: height,
          responsivePresetId: responsivePresetId || 'auto-single'
        })
        continue
      }

      if (!responsivePresetId) continue

      usages.push({
        kind: 'responsive',
        key: buildResponsiveImageKey(sourceSrc, responsivePresetId),
        sourceSrc,
        sourceFile: filePath,
        responsivePresetId
      })
    }
  }

  return usages
}

export async function collectMarkdownFiles(dir = srcDir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      files.push(...await collectMarkdownFiles(fullPath))
      continue
    }

    if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath)
    }
  }

  return files.sort()
}

export async function collectPublicImageFiles(dir = publicImgDir) {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await collectPublicImageFiles(fullPath))
      continue
    }

    if (entry.isFile() && IMAGE_EXT_RE.test(entry.name)) {
      files.push(fullPath)
    }
  }

  return files.sort()
}

export function publicImagePathToUrl(filePath) {
  const relativePath = path.relative(publicDir, filePath).replace(/\\/g, '/')
  return `/${relativePath}`
}

export function publicUrlToFilePath(publicUrl) {
  if (typeof publicUrl !== 'string' || !publicUrl.startsWith('/')) return null
  return path.join(publicDir, publicUrl.slice(1).replace(/\//g, path.sep))
}

export function buildThumbnailPublicUrl(sourceSrc, width = null, height = null) {
  const normalizedSrc = normalizePublicImageUrl(sourceSrc)
  if (!normalizedSrc) return null

  const relativePath = normalizedSrc.slice('/img/'.length).replace(/\.[^.]+$/, '')
  const suffix = [
    width != null ? `w${width}` : null,
    height != null ? `h${height}` : null
  ].filter(Boolean).join('_')

  return `/img-thumbs/${relativePath}__${suffix || 'auto'}.webp`
}

export function loadImageThumbnailManifest() {
  if (!existsSync(manifestPath)) {
    return { version: 2, thumbnails: {}, responsiveImages: {} }
  }

  try {
    const raw = readFileSync(manifestPath, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      version: parsed?.version ?? 2,
      thumbnails: parsed?.thumbnails ?? {},
      responsiveImages: parsed?.responsiveImages ?? {}
    }
  } catch {
    return { version: 2, thumbnails: {}, responsiveImages: {} }
  }
}
