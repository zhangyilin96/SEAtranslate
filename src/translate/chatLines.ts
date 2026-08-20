import { lineFingerprint, normalizeOcrLine } from './glossary'

export function normalizeChatLines(text: string) {
  return text.split(/\r?\n/).map(normalizeOcrLine).filter((line) => line.length >= 2).slice(-10)
}

function editDistance(left: string, right: string) {
  const row = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    let diagonal = row[0]
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const above = row[rightIndex]
      row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal, above, row[rightIndex - 1]) + 1
      diagonal = above
    }
  }
  return row[right.length]
}

export function isNearDuplicate(left: string, right: string) {
  const leftKey = lineFingerprint(left)
  const rightKey = lineFingerprint(right)
  if (!leftKey || !rightKey) return false
  if (leftKey === rightKey) return true
  const longest = Math.max(leftKey.length, rightKey.length)
  return longest >= 6 && editDistance(leftKey, rightKey) / longest <= 0.18
}

export function diffNewChatLines(previous: string[], current: string[]) {
  if (current.length === 0) return []
  const previousKeys = previous.map(lineFingerprint)
  const currentKeys = current.map(lineFingerprint)
  for (let overlap = Math.min(previousKeys.length, currentKeys.length); overlap > 0; overlap -= 1) {
    const previousStart = previousKeys.length - overlap
    if (currentKeys.slice(0, overlap).every((key, index) => key && key === previousKeys[previousStart + index])) {
      return current.slice(overlap)
    }
  }
  return current.filter((line) => !previous.some((oldLine) => isNearDuplicate(oldLine, line)))
}

export function filterTtlDuplicates(lines: string[], seenAt: Map<string, number>, now: number, ttlMs = 20_000) {
  for (const [key, at] of seenAt) if (now - at > ttlMs * 3) seenAt.delete(key)
  return lines.filter((line) => {
    const key = lineFingerprint(line)
    if (!key) return false
    const previousAt = seenAt.get(key) || 0
    seenAt.set(key, now)
    return !previousAt || now - previousAt >= ttlMs
  })
}
