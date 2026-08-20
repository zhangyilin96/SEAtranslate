import { describe, expect, it } from 'vitest'
import { diffNewChatLines, filterTtlDuplicates, isNearDuplicate, normalizeChatLines } from './chatLines'

describe('ordered chat line diff', () => {
  it('emits only appended lines from a scrolling chat window', () => {
    expect(diffNewChatLines(['one', 'two', 'three'], ['two', 'three', 'four'])).toEqual(['four'])
  })

  it('suppresses small OCR jitter in existing longer lines', () => {
    expect(isNearDuplicate('push bottom now', 'push bottorn now')).toBe(true)
    expect(diffNewChatLines(['push bottom now'], ['push bottorn now', 'new line'])).toEqual(['new line'])
  })

  it('allows a legitimate repeated call after the TTL', () => {
    const seen = new Map<string, number>()
    expect(filterTtlDuplicates(['back'], seen, 1_000)).toEqual(['back'])
    expect(filterTtlDuplicates(['back'], seen, 5_000)).toEqual([])
    expect(filterTtlDuplicates(['back'], seen, 26_000)).toEqual(['back'])
  })

  it('normalizes OCR output into a bounded ordered list', () => {
    expect(normalizeChatLines('  | smoke  rosh!!\n\n go mid ')).toEqual(['I smoke rosh!!', 'go mid'])
  })
})
