import { diffChatLines, filterTtlDuplicates, isNearDuplicate, rememberObservedChatLines } from './chatLines'
import type { OcrChatLine } from './chatOcr'
import { lineFingerprint, translateDotaCall } from './glossary'

type ConsensusFrame = { at: number; lines: OcrChatLine[] }

export type OcrConsensusState = {
  primed: boolean
  frames: ConsensusFrame[]
  committed: OcrChatLine[]
  seenAt: Map<string, number>
  pendingAttempts: number
  pendingAnchor: OcrChatLine | null
  pendingWindowLength: number
}

export type OcrConsensusDecision = {
  state: OcrConsensusState
  publish: OcrChatLine[]
  needsFollowUp: boolean
  fastPath: boolean
  stableLineCount: number
}

type ResolvedLine = { line: OcrChatLine; stable: boolean; support: number }

const MAX_CONSENSUS_FRAMES = 3

export function createOcrConsensusState(): OcrConsensusState {
  return {
    primed: false,
    frames: [],
    committed: [],
    seenAt: new Map(),
    pendingAttempts: 0,
    pendingAnchor: null,
    pendingWindowLength: -1,
  }
}

function rowCenter(line: OcrChatLine) {
  return line.top + line.height / 2
}

function speakersLikelySame(left: string, right: string) {
  if (!left || !right) return !left && !right
  const leftKey = lineFingerprint(left)
  const rightKey = lineFingerprint(right)
  return isNearDuplicate(left, right)
    || (leftKey.length >= 5 && rightKey.length >= 5 && leftKey.slice(-4) === rightKey.slice(-4))
}

function samePositionAndSpeaker(left: OcrChatLine, right: OcrChatLine) {
  const tolerance = Math.max(10, Math.min(left.height, right.height) * 0.8)
  return Math.abs(rowCenter(left) - rowCenter(right)) <= tolerance && speakersLikelySame(left.speaker, right.speaker)
}

function sameLineTrack(left: OcrChatLine, right: OcrChatLine) {
  return samePositionAndSpeaker(left, right) && isNearDuplicate(left.message, right.message)
}

function evidenceQuality(line: OcrChatLine) {
  const dotaCandidate = translateDotaCall(line.message) ? 6 : 0
  const speakerEvidence = line.speaker ? Math.min(3, Math.max(0, line.speakerConfidence - 60) / 12) : 0
  return line.confidence + dotaCandidate + speakerEvidence
}

function bestVariant(lines: OcrChatLine[]) {
  const variants = new Map<string, OcrChatLine[]>()
  for (const line of lines) {
    const key = lineFingerprint(line.message)
    variants.set(key, [...(variants.get(key) || []), line])
  }
  const winning = [...variants.values()].sort((left, right) => {
    if (right.length !== left.length) return right.length - left.length
    const rightQuality = Math.max(...right.map(evidenceQuality))
    const leftQuality = Math.max(...left.map(evidenceQuality))
    return rightQuality - leftQuality
  })[0] || lines
  return {
    line: [...winning].sort((left, right) => evidenceQuality(right) - evidenceQuality(left))[0],
    variantCount: variants.size,
  }
}

function canonicalSpeaker(lines: OcrChatLine[], fallback: OcrChatLine) {
  const speakers = lines.filter((line) => line.speaker)
  if (!speakers.length) return { speaker: '', speakerConfidence: 0 }
  const groups: OcrChatLine[][] = []
  for (const line of speakers) {
    const group = groups.find((items) => speakersLikelySame(items[0].speaker, line.speaker))
    if (group) group.push(line)
    else groups.push([line])
  }
  const winning = groups.sort((left, right) => right.length - left.length
    || Math.max(...right.map((line) => line.speakerConfidence)) - Math.max(...left.map((line) => line.speakerConfidence)))[0]
  const best = [...winning].sort((left, right) => right.speakerConfidence - left.speakerConfidence)[0] || fallback
  return { speaker: best.speaker, speakerConfidence: best.speakerConfidence }
}

function resolveLine(candidate: OcrChatLine, frames: ConsensusFrame[]): ResolvedLine {
  const support = frames.flatMap((frame) => {
    const match = frame.lines
      .filter((line) => sameLineTrack(candidate, line))
      .sort((left, right) => Math.abs(rowCenter(candidate) - rowCenter(left)) - Math.abs(rowCenter(candidate) - rowCenter(right)))[0]
    return match ? [match] : []
  })
  const { line: voted, variantCount } = bestVariant(support.length ? support : [candidate])
  const speaker = canonicalSpeaker(support, voted)
  return {
    line: { ...voted, ...speaker, top: candidate.top, height: candidate.height },
    stable: support.length >= 2 && (variantCount === 1 || support.length >= 3),
    support: support.length,
  }
}

export function isFastOcrCandidate(line: OcrChatLine) {
  const speakerReady = !line.speaker || line.speakerConfidence >= 70
  if (!speakerReady) return false
  return line.confidence >= 96 || (line.confidence >= 84 && Boolean(translateDotaCall(line.message)))
}

function canonicalizeCurrent(current: OcrChatLine[], resolved: ResolvedLine[], committed: OcrChatLine[]) {
  return current.map((line, index) => {
    if (resolved[index]?.stable) return resolved[index].line
    const previous = committed.find((candidate) => sameLineTrack(candidate, line))
    if (previous) return { ...previous, top: line.top, height: line.height }
    return line
  })
}

function resetPending(state: OcrConsensusState): OcrConsensusState {
  return { ...state, pendingAttempts: 0, pendingAnchor: null, pendingWindowLength: -1 }
}

function markPending(state: OcrConsensusState, current: OcrChatLine[]) {
  const anchor = current.at(-1) || null
  const sameBurst = state.pendingWindowLength === current.length
    && ((!anchor && !state.pendingAnchor) || (anchor && state.pendingAnchor && samePositionAndSpeaker(anchor, state.pendingAnchor)))
  const pendingAttempts = sameBurst ? state.pendingAttempts + 1 : 1
  return {
    state: { ...state, pendingAttempts, pendingAnchor: anchor, pendingWindowLength: current.length },
    needsFollowUp: pendingAttempts < MAX_CONSENSUS_FRAMES,
  }
}

function commitFrame(state: OcrConsensusState, lines: OcrChatLine[], now: number) {
  const seenAt = new Map(state.seenAt)
  rememberObservedChatLines(lines.map((line) => line.message), seenAt, now)
  return resetPending({ ...state, primed: true, committed: lines, seenAt })
}

function sameWindowSlots(previous: OcrChatLine[], current: OcrChatLine[]) {
  return previous.length === current.length
    && previous.length > 0
    && current.every((line, index) => samePositionAndSpeaker(previous[index], line))
}

function mergePositionCorrections(previous: OcrChatLine[], current: OcrChatLine[], resolved: ResolvedLine[]) {
  return current.map((line, index) => resolved[index]?.stable && evidenceQuality(line) >= evidenceQuality(previous[index]) ? line : previous[index])
}

function filterFallbackDuplicates(state: OcrConsensusState, candidates: OcrChatLine[], now: number) {
  const seenAt = new Map(state.seenAt)
  const freshMessages = filterTtlDuplicates(candidates.map((line) => line.message), seenAt, now)
  const publish = candidates.filter((line) => {
    const index = freshMessages.findIndex((message) => message === line.message)
    if (index < 0) return false
    freshMessages.splice(index, 1)
    return true
  })
  return { seenAt, publish }
}

export function advanceOcrConsensus(
  currentState: OcrConsensusState,
  current: OcrChatLine[],
  now: number,
): OcrConsensusDecision {
  const frames = [...currentState.frames, { at: now, lines: current }].slice(-MAX_CONSENSUS_FRAMES)
  let state = { ...currentState, frames }
  const resolved = current.map((line) => resolveLine(line, frames))
  const stableLineCount = resolved.filter((line) => line.stable).length
  const canonical = canonicalizeCurrent(current, resolved, state.committed)

  if (!state.primed) {
    // Baseline exactly the first completed OCR frame. Waiting for the baseline
    // itself to reach consensus can absorb real messages sent while Tesseract's
    // detected row count jitters. Consensus starts with the next changed frame.
    const seenAt = new Map(state.seenAt)
    rememberObservedChatLines(current.map((line) => line.message), seenAt, now)
    state = resetPending({ ...state, primed: true, committed: current, seenAt })
    return { state, publish: [], needsFollowUp: false, fastPath: false, stableLineCount }
  }

  if (current.length === 0 && state.committed.length > 0) {
    const consecutiveEmpty = frames.length >= 2 && frames.at(-2)?.lines.length === 0
    if (consecutiveEmpty) {
      state = commitFrame(state, [], now)
      return { state, publish: [], needsFollowUp: false, fastPath: false, stableLineCount }
    }
    const pending = markPending(state, current)
    return { state: pending.state, publish: [], needsFollowUp: pending.needsFollowUp, fastPath: false, stableLineCount }
  }

  const previousMessages = state.committed.map((line) => line.message)
  const currentMessages = current.map((line) => line.message)
  const difference = diffChatLines(previousMessages, currentMessages)
  const clearAppend = difference.orderedAppend || state.committed.length === 0

  if (difference.lines.length === 0) {
    state = commitFrame(state, canonical, now)
    return { state, publish: [], needsFollowUp: false, fastPath: false, stableLineCount }
  }

  if (clearAppend) {
    const appendedCount = difference.lines.length
    const appendedRaw = current.slice(-appendedCount)
    const fastIndices = appendedRaw.flatMap((line, index) => isFastOcrCandidate(line) ? [index] : [])
    const allFast = appendedRaw.length > 0 && fastIndices.length === appendedRaw.length
    // When the committed window is empty, scene noise can arrive in the same
    // OCR frame as a clear new Dota call. Publish only the strong rows instead
    // of making one low-confidence tree/UI fragment block the whole batch.
    const partialEmptyWindowFastPath = state.committed.length === 0 && fastIndices.length > 0
    if (allFast) {
      const appendedCanonical = canonical.slice(-appendedCount)
      let publish = fastIndices.map((index) => appendedCanonical[index]).filter(Boolean).slice(-3)
      if (!difference.orderedAppend) {
        const filtered = filterFallbackDuplicates(state, publish, now)
        state = { ...state, seenAt: filtered.seenAt }
        publish = filtered.publish
      }
      state = commitFrame(state, canonical, now)
      return { state, publish, needsFollowUp: false, fastPath: true, stableLineCount }
    }
    const appendedResolved = resolved.slice(-appendedCount)
    if (partialEmptyWindowFastPath || state.committed.length === 0 && appendedResolved.some((line) => line.stable)) {
      const acceptedIndices = appendedResolved.flatMap((line, index) => line.stable || fastIndices.includes(index) ? [index] : [])
      const acceptedCandidates = acceptedIndices.map((index) => appendedResolved[index].stable
        ? appendedResolved[index].line
        : canonical.slice(-appendedCount)[index])
      const filtered = filterFallbackDuplicates(state, acceptedCandidates, now)
      state = { ...state, seenAt: filtered.seenAt }
      const pending = markPending(state, current)
      // Do not commit the entire OCR window when only some rows are trustworthy.
      // Otherwise the noisy neighbours become "old chat" and later stable rows
      // can never be published from the same burst.
      return {
        state: pending.state,
        publish: filtered.publish.slice(-3),
        needsFollowUp: pending.needsFollowUp,
        fastPath: fastIndices.length > 0,
        stableLineCount,
      }
    }
    if (appendedResolved.length && appendedResolved.every((line) => line.stable)) {
      const accepted = [...canonical.slice(0, -appendedCount), ...appendedResolved.map((line) => line.line)]
      let publish = accepted.slice(-appendedCount).slice(-3)
      if (!difference.orderedAppend) {
        const filtered = filterFallbackDuplicates(state, publish, now)
        state = { ...state, seenAt: filtered.seenAt }
        publish = filtered.publish
      }
      state = commitFrame(state, accepted, now)
      return { state, publish, needsFollowUp: false, fastPath: false, stableLineCount }
    }
    const pending = markPending(state, current)
    return { state: pending.state, publish: [], needsFollowUp: pending.needsFollowUp, fastPath: false, stableLineCount }
  }

  if (sameWindowSlots(state.committed, current)) {
    state = commitFrame(state, mergePositionCorrections(state.committed, canonical, resolved), now)
    return { state, publish: [], needsFollowUp: false, fastPath: false, stableLineCount }
  }

  const newIndices = current.flatMap((line, index) => state.committed.some((oldLine) => isNearDuplicate(oldLine.message, line.message)) ? [] : [index])
  if (newIndices.length && newIndices.every((index) => resolved[index].stable)) {
    const acceptedCandidates = newIndices.map((index) => resolved[index].line)
    const filtered = filterFallbackDuplicates(state, acceptedCandidates, now)
    const seenAt = filtered.seenAt
    const publish = filtered.publish.slice(-3)
    rememberObservedChatLines(canonical.map((line) => line.message), seenAt, now)
    state = resetPending({ ...state, committed: canonical, seenAt })
    return { state, publish, needsFollowUp: false, fastPath: false, stableLineCount }
  }

  const pending = markPending(state, current)
  return { state: pending.state, publish: [], needsFollowUp: pending.needsFollowUp, fastPath: false, stableLineCount }
}
