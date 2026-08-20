import { describe, expect, it } from 'vitest'
import { chatLanguageLabel } from './language'

describe('SEA chat language labels', () => {
  it('detects Thai script before provider fallback', () => {
    expect(chatLanguageLabel('auto', 'อย่าเพิ่งสู้')).toBe('TH')
  })

  it('normalizes provider language tags for the supported set', () => {
    expect(chatLanguageLabel('en-US', 'wait')).toBe('EN')
    expect(chatLanguageLabel('ms', 'tunggu')).toBe('MS')
    expect(chatLanguageLabel('id', 'jangan fight')).toBe('ID')
    expect(chatLanguageLabel('vi', 'unknown')).toBe('AUTO')
  })
})
