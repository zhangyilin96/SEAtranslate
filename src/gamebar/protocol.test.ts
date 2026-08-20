import { describe, expect, it } from 'vitest'
// @ts-expect-error The production protocol is a CommonJS module shared with Electron.
import protocol from '../../electron/gamebar-protocol.cjs'

const { applyGameBarCommand, createGameBarState } = protocol

describe('Game Bar bridge protocol', () => {
  it('retains only the most recent three messages', () => {
    let state = createGameBarState()
    for (const text of ['one', 'two', 'three', 'four']) {
      state = applyGameBarCommand(state, 'append', { language: 'th', text }, 100 + state.sequence)
    }
    expect(state.lines).toEqual([
      { language: 'TH', text: 'two' },
      { language: 'TH', text: 'three' },
      { language: 'TH', text: 'four' },
    ])
    expect(state.sequence).toBe(4)
  })

  it('clamps opacity and toggles visibility in a full state snapshot', () => {
    const hidden = applyGameBarCommand(createGameBarState(), 'visible', false, 200)
    const translucent = applyGameBarCommand(hidden, 'opacity', 0.1, 201)
    expect(translucent).toMatchObject({ type: 'state', version: 1, visible: false, opacity: 0.2, sequence: 2, sentAt: 201 })
  })
})
