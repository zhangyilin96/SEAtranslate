import { describe, expect, it } from 'vitest'
import { translateDotaCall } from './glossary'
import { advanceOcrConsensus, createOcrConsensusState, type OcrConsensusState } from './ocrConsensus'
import type { OcrChatLine } from './chatOcr'

function line(message: string, top = 0, confidence = 80, speaker = 'Kiseki', speakerConfidence = 85): OcrChatLine {
  return {
    speaker,
    message,
    top,
    height: 16,
    confidence,
    speakerConfidence: speaker ? speakerConfidence : 0,
    words: [{ text: message, confidence, left: 80, top, width: Math.max(10, message.length * 7), height: 16 }],
  }
}

function prime(lines: OcrChatLine[]) {
  const decision = advanceOcrConsensus(createOcrConsensusState(), lines, 1_000)
  expect(decision.state.primed).toBe(true)
  expect(decision.publish).toEqual([])
  return decision.state
}

function feed(state: OcrConsensusState, lines: OcrChatLine[], at: number) {
  return advanceOcrConsensus(state, lines, at)
}

describe('multi-frame OCR consensus', () => {
  it('establishes the first OCR frame immediately so later chat is not absorbed into baseline', () => {
    let state = createOcrConsensusState()
    const baseline = feed(state, [], 1_000)
    expect(baseline.state).toMatchObject({ primed: true, committed: [], pendingAttempts: 0 })
    expect(baseline.needsFollowUp).toBe(false)

    state = baseline.state
    const firstNewFrame = feed(state, [line('gogogo', 10, 78)], 1_400)
    expect(firstNewFrame.publish).toEqual([])
    expect(firstNewFrame.needsFollowUp).toBe(true)

    const stableNewFrame = feed(firstNewFrame.state, [line('gogogo', 10, 78)], 1_800)
    expect(stableNewFrame.publish.map((candidate) => candidate.message)).toEqual(['gogogo'])
  })

  it.each([
    ['back', '撤'],
    ['back?', '撤'],
    ['farm', '刷钱'],
    ['need farm', '需要刷钱'],
    ['gogogo', '上上上'],
    ['stfu', '闭嘴'],
    ['no dam', '没伤害'],
    ['lets rs', '打肉山'],
    ['focus pa', '集火幻影刺客'],
    ['am missing', '敌法师不见了'],
  ])('publishes a stable %s candidate and keeps Dota semantics', (source, translated) => {
    let state = prime([])
    const first = feed(state, [line(source, 10, 78)], 2_000)
    expect(first.publish).toEqual([])
    expect(first.needsFollowUp).toBe(true)
    state = first.state
    const second = feed(state, [line(source, 10, 78)], 2_400)
    expect(second.publish.map((candidate) => candidate.message)).toEqual([source])
    expect(translateDotaCall(second.publish[0].message)).toBe(translated)
  })

  it('uses the fast path for a clearly appended high-confidence Dota call', () => {
    let state = prime([line('hold lane', 0, 90)])
    const decision = feed(state, [line('hold lane', 0, 90), line('back', 20, 88)], 2_000)
    expect(decision.fastPath).toBe(true)
    expect(decision.needsFollowUp).toBe(false)
    expect(decision.publish.map((candidate) => candidate.message)).toEqual(['back'])
  })

  it('publishes a strong Dota row from an empty window without publishing noisy batch neighbors', () => {
    const state = prime([])
    const decision = feed(state, [
      line('back?', 10, 96.8, 'Kiseki', 84.3),
      line('need far', 30, 93.7, 'Kiseki', 92.2),
      line('PEENEERG', 50, 32.2, 'Kiseld', 17.9),
    ], 2_000)
    expect(decision.fastPath).toBe(true)
    expect(decision.publish.map((candidate) => candidate.message)).toEqual(['back?'])
    expect(decision.state.committed).toEqual([])
    expect(decision.needsFollowUp).toBe(true)
  })

  it('publishes a multi-message burst progressively without losing rows behind one unstable candidate', () => {
    let state = prime([])
    const first = feed(state, [
      line('gogogo', 10, 55),
      line('we need back', 30, 95),
      line('we need farm first', 50, 89),
      line('wif', 70, 22),
    ], 2_000)
    expect(first.publish).toEqual([])
    expect(first.state.committed).toEqual([])
    expect(first.needsFollowUp).toBe(true)

    state = first.state
    const second = feed(state, [
      line('gogogo', 10, 58),
      line('we need back', 30, 94),
      line('we need farm first', 50, 88),
      line('wtf', 70, 18),
    ], 2_400)
    expect(second.publish.map((candidate) => candidate.message)).toEqual(['gogogo', 'we need back', 'we need farm first'])
    expect(second.needsFollowUp).toBe(true)

    const third = feed(second.state, [
      line('gogogo', 10, 57),
      line('we need back', 30, 96),
      line('we need farm first', 50, 90),
      line('wtf', 70, 20),
    ], 2_800)
    expect(third.publish.map((candidate) => candidate.message)).toEqual(['wtf'])
    expect(third.publish.map((candidate) => candidate.message)).not.toContain('gogogo')
  })

  it('keeps a high-confidence committed row when one character jitters', () => {
    const state = prime([line('push bottom now', 10, 96)])
    const decision = feed(state, [line('push bottorn now', 10, 38)], 2_000)
    expect(decision.publish).toEqual([])
    expect(decision.state.committed[0]).toMatchObject({ message: 'push bottom now', confidence: 96 })
  })

  it('does not let a single incompatible result replace a committed row', () => {
    const state = prime([line('why go', 10, 91)])
    const decision = feed(state, [line('fk u lc', 10, 95)], 2_000)
    expect(decision.publish).toEqual([])
    expect(decision.state.committed[0]).toMatchObject({ message: 'why go', confidence: 91 })
  })

  it('does not republish a row that disappears and later reappears', () => {
    let state = prime([line('back', 10, 88)])
    state = feed(state, [], 2_000).state
    const disappeared = feed(state, [], 2_400)
    expect(disappeared.state.committed).toEqual([])
    state = disappeared.state
    state = feed(state, [line('back', 10, 78)], 3_000).state
    const reappeared = feed(state, [line('back', 10, 78)], 3_400)
    expect(reappeared.publish).toEqual([])
  })

  it('allows a player to genuinely repeat back in ordered chat', () => {
    let state = prime([line('hold lane', 0, 90)])
    const firstBack = feed(state, [line('hold lane', 0, 90), line('back', 20, 88)], 2_000)
    expect(firstBack.publish.map((candidate) => candidate.message)).toEqual(['back'])
    state = firstBack.state
    const repeatedBack = feed(state, [line('back', 0, 88), line('back', 20, 88)], 2_500)
    expect(repeatedBack.publish.map((candidate) => candidate.message)).toEqual(['back'])
  })

  it('tracks a scrolling chat window before publishing the stable tail', () => {
    let state = prime([line('one', 0), line('two', 20), line('three', 40)])
    const scrolled = [line('two', 0, 79), line('three', 20, 79), line('farm', 40, 79)]
    const first = feed(state, scrolled, 2_000)
    expect(first.publish).toEqual([])
    state = first.state
    const second = feed(state, scrolled, 2_400)
    expect(second.publish.map((candidate) => candidate.message)).toEqual(['farm'])
  })

  it('drops a single-frame low-confidence error', () => {
    let state = prime([line('hold lane', 0, 92)])
    const noisy = feed(state, [line('hold lane', 0, 92), line('y go', 20, 31)], 2_000)
    expect(noisy.publish).toEqual([])
    state = noisy.state
    const recovered = feed(state, [line('hold lane', 0, 92)], 2_400)
    expect(recovered.publish).toEqual([])
    expect(recovered.needsFollowUp).toBe(false)
  })

  it('waits for a third frame when two near variants disagree, then takes the majority', () => {
    let state = prime([line('hold lane', 0, 92)])
    const first = feed(state, [line('hold lane', 0, 92), line('bark', 20, 92)], 2_000)
    expect(first.publish).toEqual([])
    state = first.state
    const second = feed(state, [line('hold lane', 0, 92), line('back', 20, 72)], 2_400)
    expect(second.publish).toEqual([])
    expect(second.needsFollowUp).toBe(true)
    state = second.state
    const third = feed(state, [line('hold lane', 0, 92), line('back', 20, 74)], 2_800)
    expect(third.publish.map((candidate) => candidate.message)).toEqual(['back'])
  })

  it('votes on near player names without mixing the player id into the message', () => {
    let state = prime([line('hold lane', 0, 90)])
    state = feed(state, [line('need farm', 20, 76, 'Kisek1', 70)], 2_000).state
    const second = feed(state, [line('need farm', 20, 76, 'Kiseki', 88)], 2_400)
    expect(second.publish[0]).toMatchObject({ speaker: 'Kiseki', message: 'need farm' })
  })
})
