import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  buildThumbnailPublicUrl,
  buildThumbnailKey,
  collectMarkdownFiles,
  collectPublicImageFiles,
  extractMarkdownImageUsages,
  manifestPath,
  publicImagePathToUrl,
  publicUrlToFilePath,
  thumbPublicDir
} from './image-thumbnail-utils.mjs'

const WEBP_QUALITY = 76
const WEBP_EFFORT = 4

async function collectThumbnailCandidates() {
  const markdownFiles = await collectMarkdownFiles()
  const candidates = new Map()

  for (const filePath of markdownFiles) {
    const rawContent = await readFile(filePath, 'utf8')
    for (const usage of extractMarkdownImageUsages(rawContent, filePath)) {
      const existing = candidates.get(usage.key)
      if (existing) {
        existing.sourceFiles.push(filePath)
        continue
      }

      candidates.set(usage.key, {
        ...usage,
        sourceFiles: [filePath]
      })
    }
  }

  return [...candidates.values()]
}

async function main() {
  const publicImages = await collectPublicImageFiles()
  const publicImageSet = new Set(publicImages.map(publicImagePathToUrl))
  const candidates = await collectThumbnailCandidates()
  const thumbnails = {}
  const warnings = []

  await rm(thumbPublicDir, { recursive: true, force: true })
  await mkdir(thumbPublicDir, { recursive: true })
  await mkdir(path.dirname(manifestPath), { recursive: true })

  for (const candidate of candidates) {
    if (!publicImageSet.has(candidate.sourceSrc)) {
      warnings.push(`Missing source image: ${candidate.sourceSrc} (${candidate.sourceFiles[0]})`)
      continue
    }

    const sourcePath = publicUrlToFilePath(candidate.sourceSrc)
    const outputSrc = buildThumbnailPublicUrl(
      candidate.sourceSrc,
      candidate.requestedWidth,
      candidate.requestedHeight
    )
    const outputPath = publicUrlToFilePath(outputSrc)

    if (!sourcePath || !outputPath) continue

    await mkdir(path.dirname(outputPath), { recursive: true })

    const image = sharp(sourcePath, { animated: false }).rotate()
    const metadata = await image.metadata()

    if (!metadata.width || !metadata.height) {
      warnings.push(`Unreadable image size: ${candidate.sourceSrc} (${candidate.sourceFiles[0]})`)
      continue
    }

    const info = await image
      .clone()
      .resize({
        width: candidate.requestedWidth ?? undefined,
        height: candidate.requestedHeight ?? undefined,
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
      .toFile(outputPath)

    thumbnails[candidate.key] = {
      key: buildThumbnailKey(candidate.sourceSrc, candidate.requestedWidth, candidate.requestedHeight),
      sourceSrc: candidate.sourceSrc,
      outputSrc,
      requestedWidth: candidate.requestedWidth,
      requestedHeight: candidate.requestedHeight,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      outputWidth: info.width,
      outputHeight: info.height
    }
  }

  await writeFile(
    manifestPath,
    JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      thumbnails
    }, null, 2),
    'utf8'
  )

  console.log(`Generated ${Object.keys(thumbnails).length} thumbnails from ${candidates.length} markdown image variants.`)
  if (warnings.length > 0) {
    console.warn(warnings.join('\n'))
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
