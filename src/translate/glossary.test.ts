import { describe, expect, it } from 'vitest'
import { applyDotaGlossary, lineFingerprint, normalizeOcrLine, translateDotaCall } from './glossary'

describe('translate helpers', () => {
  it('normalizes OCR noise and produces stable duplicate keys', () => {
    expect(normalizeOcrLine('  | smoke   rosh!!  ')).toBe('I smoke rosh!!')
    expect(lineFingerprint('Go   Roshan!')).toBe(lineFingerprint('go roshan'))
  })

  it('corrects common Dota terms after translation', () => {
    expect(applyDotaGlossary('smoke then roshan', 'smoke rosh')).toBe('开雾 then 肉山')
    expect(applyDotaGlossary('buyback and BKB')).toBe('买活 and BKB')
  })

  it('translates short Dota calls locally without waiting for a provider', () => {
    expect(translateDotaCall('back')).toBe('撤')
    expect(translateDotaCall('w8')).toBe('等一下')
    expect(translateDotaCall('gogogo')).toBe('上')
    expect(translateDotaCall('gogogge.')).toBe('上')
    expect(translateDotaCall('wes')).toBe('等一下')
    expect(translateDotaCall('background')).toBeNull()
  })
})
