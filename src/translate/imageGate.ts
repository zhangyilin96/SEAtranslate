export type FrameGateOptions = {
  stabilityThreshold: number
  changeThreshold: number
  strongChangeThreshold: number
  requiredStableSamples: number
  heartbeatMs: number
  minOcrIntervalMs: number
}

export type FrameGateState = {
  previous: Uint8Array | null
  stableSamples: number
  lastOcr: Uint8Array | null
  lastOcrAt: number
}

export type FrameGateDecision = {
  state: FrameGateState
  trigger: boolean
  reason: 'waiting' | 'baseline' | 'changed' | 'heartbeat'
  previousDifference: number
  ocrDifference: number
}

export const DEFAULT_FRAME_GATE_OPTIONS: FrameGateOptions = {
  stabilityThreshold: 0.003,
  changeThreshold: 0.006,
  strongChangeThreshold: 0.025,
  requiredStableSamples: 1,
  heartbeatMs: 20_000,
  minOcrIntervalMs: 2_000,
}

export function createFrameGateState(): FrameGateState {
  return { previous: null, stableSamples: 0, lastOcr: null, lastOcrAt: 0 }
}

export function signatureDifference(left: Uint8Array | null, right: Uint8Array | null) {
  if (!left || !right || left.length !== right.length || left.length === 0) return 1
  let total = 0
  for (let index = 0; index < left.length; index += 1) total += Math.abs(left[index] - right[index]) / 255
  return total / left.length
}

export function evaluateFrame(
  current: FrameGateState,
  signature: Uint8Array,
  now: number,
  options: FrameGateOptions = DEFAULT_FRAME_GATE_OPTIONS,
): FrameGateDecision {
  const previousDifference = signatureDifference(current.previous, signature)
  const ocrDifference = signatureDifference(current.lastOcr, signature)
  const stableSamples = current.previous && previousDifference <= options.stabilityThreshold ? current.stableSamples + 1 : 0
  const intervalReady = !current.lastOcrAt || now - current.lastOcrAt >= options.minOcrIntervalMs
  const stable = stableSamples >= options.requiredStableSamples
  const heartbeat = Boolean(current.lastOcrAt && now - current.lastOcrAt >= options.heartbeatMs)
  const baseline = !current.lastOcr
  const changed = Boolean(current.lastOcr && ocrDifference >= options.changeThreshold)
  const strongChanged = Boolean(current.lastOcr && ocrDifference >= options.strongChangeThreshold)
  const trigger = intervalReady && (heartbeat || strongChanged || (stable && (baseline || changed)))
  const reason = !trigger ? 'waiting' : heartbeat ? 'heartbeat' : baseline ? 'baseline' : 'changed'
  return {
    state: { ...current, previous: signature, stableSamples },
    trigger,
    reason,
    previousDifference,
    ocrDifference,
  }
}

export function markFrameOcred(state: FrameGateState, signature: Uint8Array, now: number): FrameGateState {
  return { ...state, previous: signature, lastOcr: signature, lastOcrAt: now, stableSamples: 0 }
}
