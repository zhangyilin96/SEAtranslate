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

export async function cropCapture(imageUrl: string, region: CaptureRegion, preview = false) {
  const image = await loadImage(imageUrl)
  const sourceWidth = Math.max(1, Math.round(image.naturalWidth * region.width))
  const sourceHeight = Math.max(1, Math.round(image.naturalHeight * region.height))
  const scale = preview ? Math.min(1, 480 / sourceWidth, 180 / sourceHeight) : 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(sourceWidth * scale))
  canvas.height = Math.max(1, Math.round(sourceHeight * scale))
  const context = canvas.getContext('2d', { willReadFrequently: true })!
  if (!preview) context.filter = 'contrast(1.35) saturate(.15)'
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
