import { describe, expect, it } from 'vitest'
import { diffNewChatLines, filterTtlDuplicates, isNearDuplicate, normalizeChatLines, rememberObservedChatLines } from './chatLines'

describe('ordered chat line diff', () => {
  it('emits only appended lines from a scrolling chat window', () => {
    expect(diffNewChatLines(['one', 'two', 'three'], ['two', 'three', 'four'])).toEqual(['four'])
  })

  it('suppresses small OCR jitter in existing longer lines', () => {
    expect(isNearDuplicate('push bottom now', 'push bottorn now')).toBe(true)
    expect(diffNewChatLines(['push bottom now'], ['push bottorn now', 'new line'])).toEqual(['new line'])
  })

  it('suppresses one-character OCR jitter in short Dota calls and ordered overlap', () => {
    expect(isNearDuplicate('stfu', 'sifu')).toBe(true)
    expect(isNearDuplicate('go', 'no')).toBe(false)
    expect(diffNewChatLines(['no dam', 'stfu'], ['no darn', 'sifu', 'lets rs'])).toEqual(['lets rs'])
  })

  it('allows a legitimate repeated call after the TTL', () => {
    const seen = new Map<string, number>()
    expect(filterTtlDuplicates(['back'], seen, 1_000, 20_000)).toEqual(['back'])
    expect(filterTtlDuplicates(['back'], seen, 5_000, 20_000)).toEqual([])
    expect(filterTtlDuplicates(['back'], seen, 26_000, 20_000)).toEqual(['back'])
  })

  it('keeps a visible baseline and its OCR variants from being republished', () => {
    const seen = new Map<string, number>()
    rememberObservedChatLines(['no dam', 'stfu'], seen, 1_000)
    expect(filterTtlDuplicates(['no darn', 'sifu'], seen, 40_000)).toEqual([])
    rememberObservedChatLines(['no darn', 'sifu'], seen, 40_000)
    expect(filterTtlDuplicates(['no dam', 'stfu'], seen, 100_000)).toEqual([])
  })

  it('normalizes OCR output into a bounded ordered list', () => {
    expect(normalizeChatLines('  | smoke  rosh!!\n\n go mid ')).toEqual(['I smoke rosh!!', 'go mid'])
  })

  it('removes the OCR player prefix before translating a Dota chat line', () => {
    expect(normalizeChatLines('[ALLY] Kiseki [Tag] : back\n[ALLY] Kiseki [Tag]: gogogo')).toEqual(['back', 'gogogo'])
  })
})
