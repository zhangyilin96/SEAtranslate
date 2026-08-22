import { describe, expect, it } from 'vitest'
import { createOutlinedTextFingerprint, regionToPixels } from './region'

describe('capture region geometry', () => {
  it('converts normalized selection to exact capture pixels', () => {
    expect(regionToPixels({ x: .1, y: .25, width: .4, height: .2 }, 3840, 2160)).toEqual({
      pixelX: 384,
      pixelY: 540,
      pixelWidth: 1536,
      pixelHeight: 432,
    })
  })

  it('ignores saturated scene animation but keeps bright outlined chat text', () => {
    const width = 5
    const height = 3
    const pixels = new Uint8ClampedArray(width * height * 4)
    for (let index = 0; index < width * height; index += 1) {
      const offset = index * 4
      pixels[offset] = 220
      pixels[offset + 1] = 40
      pixels[offset + 2] = 40
      pixels[offset + 3] = 255
    }
    expect(createOutlinedTextFingerprint(pixels, width, height).every((value) => value === 0)).toBe(true)

    const darkOffset = (1 * width + 1) * 4
    pixels.set([20, 20, 20, 255], darkOffset)
    const textOffset = (1 * width + 2) * 4
    pixels.set([235, 225, 210, 255], textOffset)
    expect(createOutlinedTextFingerprint(pixels, width, height)[1 * width + 2]).toBe(255)
  })
})
