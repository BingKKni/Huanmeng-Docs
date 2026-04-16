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

export function extractMarkdownImageUsages(source, filePath = '') {
  const usages = []

  for (const match of source.matchAll(MARKDOWN_IMAGE_RE)) {
    const sourceSrc = normalizePublicImageUrl(match[1])
    if (!sourceSrc) continue

    const { width, height } = parseDimensionAttributes(match[2] ?? '')
    if (width == null && height == null) continue

    usages.push({
      key: buildThumbnailKey(sourceSrc, width, height),
      sourceSrc,
      sourceFile: filePath,
      requestedWidth: width,
      requestedHeight: height
    })
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
    return { version: 1, thumbnails: {} }
  }

  try {
    const raw = readFileSync(manifestPath, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      version: parsed?.version ?? 1,
      thumbnails: parsed?.thumbnails ?? {}
    }
  } catch {
    return { version: 1, thumbnails: {} }
  }
}
