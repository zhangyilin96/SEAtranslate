import type { ScreenCaptureResult } from '../desktop'

export const REGION_KEY = 'dota-scout:chat-region-v2'
export const LEGACY_REGION_KEY = 'dota-scout:chat-region-v1'

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
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  if (!preview && !preserveColor) context.filter = 'contrast(1.35) saturate(.15)'
  context.drawImage(
    image,
    image.naturalWidth * region.x,
    image.naturalHeight * region.y,
    sourceWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    canvas.height,
  )
  return canvas.toDataURL(preview ? 'image/jpeg' : 'image/png', preview ? .78 : undefined)
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

export async function createRegionFingerprint(imageUrl: string, region: CaptureRegion) {
  const image = await loadImage(imageUrl)
  const width = 96
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
  const luminance = new Uint8Array(width * height)
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4
    luminance[index] = Math.round(pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722)
  }
  const signature = new Uint8Array(width * height)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      const value = luminance[index]
      const horizontal = x > 0 ? Math.abs(value - luminance[index - 1]) : 0
      const vertical = y > 0 ? Math.abs(value - luminance[index - width]) : 0
      const offset = index * 4
      const maxChannel = Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2])
      const minChannel = Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2])
      const textLike = value >= 140 || (maxChannel - minChannel >= 55 && value >= 85)
      signature[index] = textLike && Math.max(horizontal, vertical) >= 24 ? 255 : 0
    }
  }
  return signature
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
