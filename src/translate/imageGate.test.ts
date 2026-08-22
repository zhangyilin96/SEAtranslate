import { describe, expect, it } from 'vitest'
import { createFrameGateState, evaluateFrame, markFrameOcred, signatureDifference } from './imageGate'

const frame = (...values: number[]) => new Uint8Array(values)

describe('OCR image gate', () => {
  it('requires a stable second sample before the baseline OCR', () => {
    const first = evaluateFrame(createFrameGateState(), frame(0, 0, 255, 255), 100)
    expect(first.trigger).toBe(false)
    const stable = evaluateFrame(first.state, frame(0, 0, 255, 255), 450)
    expect(stable).toMatchObject({ trigger: true, reason: 'baseline' })
  })

  it('ignores unchanged frames and triggers after a stable meaningful change', () => {
    const baseline = frame(...Array.from({ length: 128 }, () => 0))
    const changedFrame = baseline.slice()
    changedFrame[40] = 255
    let state = markFrameOcred(createFrameGateState(), baseline, 1_000)
    const changed = evaluateFrame(state, changedFrame, 3_100)
    expect(changed.trigger).toBe(false)
    const stable = evaluateFrame(changed.state, changedFrame, 3_500)
    expect(stable).toMatchObject({ trigger: true, reason: 'changed' })
  })

  it('does not let one high-change animation frame bypass stability', () => {
    const baseline = frame(...Array.from({ length: 128 }, () => 0))
    const changedFrame = baseline.slice()
    changedFrame.fill(255, 60, 64)
    const state = markFrameOcred(createFrameGateState(), baseline, 1_000)
    const changed = evaluateFrame(state, changedFrame, 3_100)
    expect(changed.trigger).toBe(false)
    const stable = evaluateFrame(changed.state, changedFrame, 3_500)
    expect(stable).toMatchObject({ trigger: true, reason: 'changed' })
  })

  it('uses a slow heartbeat to recover from a missed threshold', () => {
    const state = markFrameOcred(createFrameGateState(), frame(0, 0), 1_000)
    const decision = evaluateFrame(state, frame(0, 255), 21_100)
    expect(decision).toMatchObject({ trigger: true, reason: 'heartbeat' })
    expect(signatureDifference(frame(0, 0), frame(0, 255))).toBe(0.5)
  })

  it('detects a small chat-line change inside a large region', () => {
    const baseline = frame(...Array.from({ length: 128 }, () => 0))
    const changedFrame = baseline.slice()
    changedFrame[63] = 255
    let state = markFrameOcred(createFrameGateState(), baseline, 1_000)
    const changed = evaluateFrame(state, changedFrame, 3_100)
    expect(changed.trigger).toBe(false)
    const stable = evaluateFrame(changed.state, changedFrame, 3_500)
    expect(stable).toMatchObject({ trigger: true, reason: 'changed' })
  })
})
