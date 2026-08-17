import { describe, expect, it } from 'vitest'
import { conciseDotaEnglish, exactDotaEnglish } from './outgoing'
import { quickComms } from './quickComms'

describe('outgoing Dota English', () => {
  it('produces the required concise BKB phrase', () => {
    expect(exactDotaEnglish('我还有20秒BKB，不要打')).toBe("Don't fight. BKB in 20s.")
  })

  it('normalizes common long translations', () => {
    expect(conciseDotaEnglish('Do not fight Roshan without a teleportation scroll.')).toBe("Don't fight Rosh without a TP.")
  })

  it('keeps a stable quick comms model', () => {
    expect(quickComms.find((item) => item.id === 'rosh')?.english).toBe('Rosh!')
    expect(quickComms).toHaveLength(10)
  })
})
