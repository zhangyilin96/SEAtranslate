import { describe, expect, it } from 'vitest'
import { applyDotaGlossary, lineFingerprint, normalizeOcrLine } from './glossary'

describe('translate helpers', () => {
  it('normalizes OCR noise and produces stable duplicate keys', () => {
    expect(normalizeOcrLine('  | smoke   rosh!!  ')).toBe('I smoke rosh!!')
    expect(lineFingerprint('Go   Roshan!')).toBe(lineFingerprint('go roshan'))
  })

  it('corrects common Dota terms after translation', () => {
    expect(applyDotaGlossary('smoke then roshan', 'smoke rosh')).toBe('开雾 then 肉山')
    expect(applyDotaGlossary('buyback and BKB')).toBe('买活 and BKB')
  })
})
