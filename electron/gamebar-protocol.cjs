const TEST_MESSAGES = Object.freeze([
  Object.freeze({ language: 'TH', text: '别打，等我。' }),
  Object.freeze({ language: 'ID', text: '先去肉山。' }),
  Object.freeze({ language: 'MS', text: '推完中路再打。' }),
  Object.freeze({ language: 'EN', text: '我有买活。' }),
])

function clampOpacity(value) {
  const number = Number(value)
  return Math.max(0.2, Math.min(1, Number.isFinite(number) ? number : 0.9))
}

function normalizeLine(line) {
  const language = String(line?.language || 'AUTO').trim().toUpperCase().slice(0, 8) || 'AUTO'
  const text = String(line?.text || '').trim().slice(0, 240)
  return text ? { language, text } : null
}

function createGameBarState() {
  return { type: 'state', version: 1, sequence: 0, sentAt: 0, visible: true, opacity: 0.9, lines: [] }
}

function applyGameBarCommand(current, command, value, now = Date.now()) {
  const state = {
    ...createGameBarState(),
    ...current,
    lines: Array.isArray(current?.lines) ? current.lines.map(normalizeLine).filter(Boolean).slice(-3) : [],
  }
  if (command === 'append') {
    const line = normalizeLine(value)
    if (!line) throw new Error('Game Bar message text is empty.')
    state.lines = [...state.lines, line].slice(-3)
  } else if (command === 'replace') {
    state.lines = Array.isArray(value) ? value.map(normalizeLine).filter(Boolean).slice(-3) : []
  } else if (command === 'visible') {
    state.visible = Boolean(value)
  } else if (command === 'opacity') {
    state.opacity = clampOpacity(value)
  } else if (command !== 'refresh') {
    throw new Error(`Unsupported Game Bar command: ${command}`)
  }
  return { ...state, type: 'state', version: 1, sequence: state.sequence + 1, sentAt: now }
}

module.exports = { TEST_MESSAGES, applyGameBarCommand, clampOpacity, createGameBarState, normalizeLine }
