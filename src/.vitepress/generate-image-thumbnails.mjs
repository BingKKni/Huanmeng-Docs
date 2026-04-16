import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import {
  buildResponsiveImageKey,
  buildThumbnailPublicUrl,
  buildThumbnailKey,
  collectMarkdownFiles,
  collectPublicImageFiles,
  extractMarkdownImageUsages,
  getResponsiveImagePreset,
  manifestPath,
  publicImagePathToUrl,
  publicUrlToFilePath,
  thumbPublicDir
} from './image-thumbnail-utils.mjs'

const WEBP_QUALITY = 76
const WEBP_EFFORT = 4

async function collectImageCandidates() {
  const markdownFiles = await collectMarkdownFiles()
  const thumbnailCandidates = new Map()
  const responsiveCandidates = new Map()

  for (const filePath of markdownFiles) {
    const rawContent = await readFile(filePath, 'utf8')

    for (const usage of extractMarkdownImageUsages(rawContent, filePath)) {
      if (usage.kind === 'thumbnail') {
        const existing = thumbnailCandidates.get(usage.key)
        if (existing) {
          existing.sourceFiles.push(filePath)
          continue
        }

        thumbnailCandidates.set(usage.key, {
          ...usage,
          sourceFiles: [filePath]
        })
        continue
      }

      if (usage.kind !== 'responsive') continue

      const preset = getResponsiveImagePreset(usage.responsivePresetId)
      if (!preset) continue

      const existingResponsive = responsiveCandidates.get(usage.key)
      if (existingResponsive) {
        existingResponsive.sourceFiles.push(filePath)
      } else {
        responsiveCandidates.set(usage.key, {
          ...usage,
          sizes: preset.sizes,
          fallbackWidth: preset.fallbackWidth,
          candidateWidths: [...preset.candidateWidths],
          sourceFiles: [filePath]
        })
      }

      for (const width of preset.candidateWidths) {
        const thumbKey = buildThumbnailKey(usage.sourceSrc, width, null)
        const existingThumbnail = thumbnailCandidates.get(thumbKey)
        if (existingThumbnail) {
          existingThumbnail.sourceFiles.push(filePath)
          continue
        }

        thumbnailCandidates.set(thumbKey, {
          kind: 'thumbnail',
          key: thumbKey,
          sourceSrc: usage.sourceSrc,
          sourceFile: filePath,
          requestedWidth: width,
          requestedHeight: null,
          sourceFiles: [filePath]
        })
      }
    }
  }

  return {
    thumbnailCandidates: [...thumbnailCandidates.values()],
    responsiveCandidates: [...responsiveCandidates.values()]
  }
}

function pickResponsiveFallbackSource(sources, fallbackWidth) {
  if (sources.length === 0) return null
  if (!Number.isFinite(fallbackWidth) || fallbackWidth <= 0) return sources[sources.length - 1]

  return sources.reduce((best, current) => {
    if (!best) return current
    const currentDelta = Math.abs(current.outputWidth - fallbackWidth)
    const bestDelta = Math.abs(best.outputWidth - fallbackWidth)
    if (currentDelta !== bestDelta) return currentDelta < bestDelta ? current : best
    return current.outputWidth > best.outputWidth ? current : best
  }, null)
}

async function main() {
  const publicImages = await collectPublicImageFiles()
  const publicImageSet = new Set(publicImages.map(publicImagePathToUrl))
  const { thumbnailCandidates, responsiveCandidates } = await collectImageCandidates()
  const thumbnails = {}
  const responsiveImages = {}
  const warnings = []
  const metadataCache = new Map()
  const outputInfoCache = new Map()

  await rm(thumbPublicDir, { recursive: true, force: true })
  await mkdir(thumbPublicDir, { recursive: true })
  await mkdir(path.dirname(manifestPath), { recursive: true })

  for (const candidate of thumbnailCandidates) {
    if (!publicImageSet.has(candidate.sourceSrc)) {
      warnings.push(`Missing source image: ${candidate.sourceSrc} (${candidate.sourceFiles[0]})`)
      continue
    }

    const sourcePath = publicUrlToFilePath(candidate.sourceSrc)
    if (!sourcePath) continue

    let metadata = metadataCache.get(sourcePath)
    if (!metadata) {
      metadata = await sharp(sourcePath, { animated: false }).rotate().metadata()
      metadataCache.set(sourcePath, metadata)
    }

    if (!metadata.width || !metadata.height) {
      warnings.push(`Unreadable image size: ${candidate.sourceSrc} (${candidate.sourceFiles[0]})`)
      continue
    }

    const actualRequestedWidth = candidate.requestedWidth == null
      ? null
      : Math.min(candidate.requestedWidth, metadata.width)
    const actualRequestedHeight = candidate.requestedHeight == null
      ? null
      : Math.min(candidate.requestedHeight, metadata.height)
    const outputSrc = buildThumbnailPublicUrl(
      candidate.sourceSrc,
      actualRequestedWidth,
      actualRequestedHeight
    )
    const outputPath = publicUrlToFilePath(outputSrc)

    if (!sourcePath || !outputPath) continue

    await mkdir(path.dirname(outputPath), { recursive: true })

    let info = outputInfoCache.get(outputPath)
    if (!info) {
      info = await sharp(sourcePath, { animated: false })
        .rotate()
        .resize({
          width: actualRequestedWidth ?? undefined,
          height: actualRequestedHeight ?? undefined,
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: WEBP_QUALITY, effort: WEBP_EFFORT })
        .toFile(outputPath)
      outputInfoCache.set(outputPath, info)
    }

    thumbnails[candidate.key] = {
      key: buildThumbnailKey(candidate.sourceSrc, candidate.requestedWidth, candidate.requestedHeight),
      sourceSrc: candidate.sourceSrc,
      outputSrc,
      requestedWidth: candidate.requestedWidth,
      requestedHeight: candidate.requestedHeight,
      actualRequestedWidth,
      actualRequestedHeight,
      originalWidth: metadata.width,
      originalHeight: metadata.height,
      outputWidth: info.width,
      outputHeight: info.height
    }
  }

  for (const responsiveCandidate of responsiveCandidates) {
    if (!publicImageSet.has(responsiveCandidate.sourceSrc)) {
      warnings.push(`Missing source image: ${responsiveCandidate.sourceSrc} (${responsiveCandidate.sourceFiles[0]})`)
      continue
    }

    const seenSrc = new Set()
    const sources = responsiveCandidate.candidateWidths
      .map(width => thumbnails[buildThumbnailKey(responsiveCandidate.sourceSrc, width, null)])
      .filter(Boolean)
      .filter(source => {
        if (seenSrc.has(source.outputSrc)) return false
        seenSrc.add(source.outputSrc)
        return true
      })
      .sort((a, b) => a.outputWidth - b.outputWidth)

    if (sources.length === 0) continue

    const fallback = pickResponsiveFallbackSource(sources, responsiveCandidate.fallbackWidth)
    if (!fallback) continue

    responsiveImages[buildResponsiveImageKey(
      responsiveCandidate.sourceSrc,
      responsiveCandidate.responsivePresetId
    )] = {
      key: buildResponsiveImageKey(
        responsiveCandidate.sourceSrc,
        responsiveCandidate.responsivePresetId
      ),
      sourceSrc: responsiveCandidate.sourceSrc,
      presetId: responsiveCandidate.responsivePresetId,
      sizes: responsiveCandidate.sizes,
      fallbackSrc: fallback.outputSrc,
      fallbackWidth: fallback.outputWidth,
      fallbackHeight: fallback.outputHeight,
      sources: sources.map(source => ({
        thumbnailKey: source.key,
        outputSrc: source.outputSrc,
        outputWidth: source.outputWidth,
        outputHeight: source.outputHeight
      }))
    }
  }

  await writeFile(
    manifestPath,
    JSON.stringify({
      version: 2,
      generatedAt: new Date().toISOString(),
      thumbnails,
      responsiveImages
    }, null, 2),
    'utf8'
  )

  console.log(
    `Generated ${Object.keys(thumbnails).length} thumbnails from ${thumbnailCandidates.length} markdown variants and ${Object.keys(responsiveImages).length} responsive image sets.`
  )
  if (warnings.length > 0) {
    console.warn(warnings.join('\n'))
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
