import { describe, expect, it } from 'vitest'
import { regionToPixels } from './region'

describe('capture region geometry', () => {
  it('converts normalized selection to exact capture pixels', () => {
    expect(regionToPixels({ x: .1, y: .25, width: .4, height: .2 }, 3840, 2160)).toEqual({
      pixelX: 384,
      pixelY: 540,
      pixelWidth: 1536,
      pixelHeight: 432,
    })
  })
})
