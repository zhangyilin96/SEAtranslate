import { describe, expect, it } from 'vitest'
import { normalizeAccountId } from './identity'

describe('normalizeAccountId', () => {
  it('keeps a Dota account id', () => {
    expect(normalizeAccountId('86745912')).toBe(86745912)
  })

  it('converts a Steam64 id', () => {
    expect(normalizeAccountId('76561198047011640')).toBe(86745912)
  })

  it('reads a profiles URL', () => {
    expect(normalizeAccountId('https://steamcommunity.com/profiles/76561198047011640/')).toBe(86745912)
  })

  it('rejects vanity URLs with a useful error', () => {
    expect(() => normalizeAccountId('https://steamcommunity.com/id/player')).toThrow('自定义链接')
  })
})
