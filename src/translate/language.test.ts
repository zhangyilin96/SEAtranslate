import { describe, expect, it } from 'vitest'
import { chatLanguageLabel, detectChatLanguage, languageCodeForProvider } from './language'

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

  it('detects supported chat language before provider translation when signals are clear', () => {
    expect(detectChatLanguage('อย่าเพิ่งสู้')).toBe('TH')
    expect(detectChatLanguage('nggak bisa fight')).toBe('ID')
    expect(detectChatLanguage('korang tunggu kejap')).toBe('MS')
    expect(detectChatLanguage('back now')).toBe('EN')
    expect(detectChatLanguage('no dam')).toBe('EN')
    expect(detectChatLanguage('lets rs')).toBe('EN')
    expect(detectChatLanguage('stfu')).toBe('EN')
    expect(detectChatLanguage('mid')).toBe('EN')
    expect(languageCodeForProvider('ID')).toBe('id')
    expect(languageCodeForProvider('AUTO')).toBeUndefined()
  })
})
