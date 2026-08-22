import type { ScreenCaptureResult } from '../desktop'

export const REGION_KEY = 'dota-scout:chat-region-v2'
export const LEGACY_REGION_KEY = 'dota-scout:chat-region-v1'
const OCR_SCALE = 2

export type CaptureRegion = { x: number; y: number; width: number; height: number }
export type SavedCaptureRegion = CaptureRegion & {
  displayId: string
  displayName: string
  captureWidth: number
  captureHeight: number
  pixelX: number
  pixelY: number
  pixelWidth: number
  pixelHeight: number
  preview: string
  savedAt: number
}

export function regionToPixels(region: CaptureRegion, width: number, height: number) {
  return {
    pixelX: Math.round(region.x * width),
    pixelY: Math.round(region.y * height),
    pixelWidth: Math.round(region.width * width),
    pixelHeight: Math.round(region.height * height),
  }
}

export function readSavedRegion(): SavedCaptureRegion | null {
  try {
    const value = JSON.parse(localStorage.getItem(REGION_KEY) || 'null')
    return value?.width > 0 && value?.height > 0 ? value : null
  } catch { return null }
}

export function clearSavedRegion() {
  localStorage.removeItem(REGION_KEY)
  localStorage.removeItem(LEGACY_REGION_KEY)
}

async function loadImage(imageUrl: string) {
  const image = new Image()
  image.src = imageUrl
  await image.decode()
  return image
}

export async function cropCapture(imageUrl: string, region: CaptureRegion, preview = false, preserveColor = false) {
  const image = await loadImage(imageUrl)
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * region.width))
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * region.height))
  const scale = preview ? Math.min(1, 480 / sourceWidth, 180 / sourceHeight) : 1
  const sampled = document.createElement('canvas')
  sampled.width = Math.max(1, Math.round(sourceWidth * scale))
  sampled.height = Math.max(1, Math.round(sourceHeight * scale))
  const sampledContext = sampled.getContext('2d', { willReadFrequently: true })!
  sampledContext.drawImage(
    image,
    image.naturalWidth * region.x,
    image.naturalHeight * region.y,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sampled.width,
    sampled.height,
  )
  if (preview) return sampled.toDataURL('image/jpeg', .78)

  if (!preserveColor) {
    const pixels = sampledContext.getImageData(0, 0, sampled.width, sampled.height)
    const source = pixels.data
    const outlinedText = new Uint8ClampedArray(source.length)
    for (let y = 0; y < sampled.height; y += 1) {
      for (let x = 0; x < sampled.width; x += 1) {
        const offset = (y * sampled.width + x) * 4
        const red = source[offset]
        const green = source[offset + 1]
        const blue = source[offset + 2]
        const maximum = Math.max(red, green, blue)
        const minimum = Math.min(red, green, blue)
        const brightText = (maximum >= 155 && maximum - minimum <= 75)
          || (maximum >= 135 && maximum - minimum >= 45)
        let nearDarkOutline = false
        for (let nearY = Math.max(0, y - 2); nearY < Math.min(sampled.height, y + 3) && !nearDarkOutline; nearY += 1) {
          for (let nearX = Math.max(0, x - 2); nearX < Math.min(sampled.width, x + 3); nearX += 1) {
            const nearOffset = (nearY * sampled.width + nearX) * 4
            if ((source[nearOffset] + source[nearOffset + 1] + source[nearOffset + 2]) / 3 <= 85) {
              nearDarkOutline = true
              break
            }
          }
        }
        const value = brightText && nearDarkOutline ? 255 : 0
        outlinedText[offset] = value
        outlinedText[offset + 1] = value
        outlinedText[offset + 2] = value
        outlinedText[offset + 3] = 255
      }
    }
    sampledContext.putImageData(new ImageData(outlinedText, sampled.width, sampled.height), 0, 0)
  }

  const canvas = document.createElement('canvas')
  canvas.width = sampled.width * OCR_SCALE
  canvas.height = sampled.height * OCR_SCALE
  const context = canvas.getContext('2d')!
  context.imageSmoothingEnabled = false
  context.drawImage(sampled, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/png')
}

export async function readImagePixels(imageUrl: string) {
  const image = await loadImage(imageUrl)
  const canvas = document.createElement('canvas')
  canvas.width = image.naturalWidth
  canvas.height = image.naturalHeight
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0)
  return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }
}

export function createOutlinedTextFingerprint(pixels: Uint8ClampedArray, width: number, height: number) {
  const luminance = new Uint8Array(width * height)
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4
    luminance[index] = Math.round(pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722)
  }
  const signature = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const offset = index * 4
      const maximum = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2])
      const minimum = Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2])
      if (maximum < 155 || maximum - minimum > 75) continue
      let nearDarkOutline = false
      for (let nearY = Math.max(0, y - 2); nearY < Math.min(height, y + 3) && !nearDarkOutline; nearY += 1) {
        for (let nearX = Math.max(0, x - 2); nearX < Math.min(width, x + 3); nearX += 1) {
          if (luminance[nearY * width + nearX] <= 85) {
            nearDarkOutline = true
            break
          }
        }
      }
      if (nearDarkOutline) signature[index] = 255
    }
  }
  return signature
}

export async function createRegionFingerprint(imageUrl: string, region: CaptureRegion) {
  const image = await loadImage(imageUrl)
  const width = 160
  const height = 32
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  context.drawImage(
    image,
    image.naturalWidth * region.x,
    image.naturalHeight * region.y,
    image.naturalWidth * region.width,
    image.naturalHeight * region.height,
    0,
    0,
    width,
    height,
  )
  const pixels = context.getImageData(0, 0, width, height).data
  return createOutlinedTextFingerprint(pixels, width, height)
}

export async function saveCaptureRegion(region: CaptureRegion, capture: Extract<ScreenCaptureResult, { ok: true }>) {
  const pixels = regionToPixels(region, capture.width, capture.height)
  const saved: SavedCaptureRegion = {
    ...region,
    displayId: capture.displayId,
    displayName: capture.displayName,
    captureWidth: capture.width,
    captureHeight: capture.height,
    ...pixels,
    preview: await cropCapture(capture.image, region, true),
    savedAt: Date.now(),
  }
  localStorage.setItem(REGION_KEY, JSON.stringify(saved))
  localStorage.removeItem(LEGACY_REGION_KEY)
  return saved
}
