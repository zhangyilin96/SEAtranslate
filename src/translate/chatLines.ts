import { lineFingerprint, normalizeOcrLine } from './glossary'

export function normalizeChatLines(text: string) {
  return text.split(/\r?\n/).map((value) => {
    const line = normalizeOcrLine(value)
    const separator = Math.max(line.lastIndexOf(':'), line.lastIndexOf('：'))
    const message = separator >= 0 ? normalizeOcrLine(line.slice(separator + 1)) : line
    return message.length >= 2 ? message : line
  }).filter((line) => line.length >= 2).slice(-10)
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
  const leftKey = lineFingerprint(left).replace(/rn/g, 'm')
  const rightKey = lineFingerprint(right).replace(/rn/g, 'm')
  if (!leftKey || !rightKey) return false
  if (leftKey === rightKey) return true
  const longest = Math.max(leftKey.length, rightKey.length)
  const distance = editDistance(leftKey, rightKey)
  if (longest >= 4 && longest <= 5) return distance <= 1
  return longest >= 6 && distance / longest <= 0.22
}

export function diffNewChatLines(previous: string[], current: string[]) {
  if (current.length === 0) return []
  for (let overlap = Math.min(previous.length, current.length); overlap > 0; overlap -= 1) {
    const previousStart = previous.length - overlap
    if (current.slice(0, overlap).every((line, index) => isNearDuplicate(line, previous[previousStart + index]))) {
      return current.slice(overlap)
    }
  }
  return current.filter((line) => !previous.some((oldLine) => isNearDuplicate(oldLine, line)))
}

function recentNearDuplicateKey(line: string, seenAt: Map<string, number>, now: number, ttlMs: number) {
  let nearest = ''
  let nearestAt = 0
  for (const [key, at] of seenAt) {
    if (now - at < ttlMs && isNearDuplicate(key, line) && at >= nearestAt) {
      nearest = key
      nearestAt = at
    }
  }
  return nearest
}

export function filterTtlDuplicates(lines: string[], seenAt: Map<string, number>, now: number, ttlMs = 90_000) {
  for (const [key, at] of seenAt) if (now - at > ttlMs * 3) seenAt.delete(key)
  return lines.filter((line) => {
    const key = lineFingerprint(line)
    if (!key) return false
    const previousKey = recentNearDuplicateKey(key, seenAt, now, ttlMs)
    if (previousKey) seenAt.set(previousKey, now)
    seenAt.set(key, now)
    return !previousKey
  })
}

export function rememberObservedChatLines(lines: string[], seenAt: Map<string, number>, now: number) {
  for (const line of lines) {
    const key = lineFingerprint(line)
    if (!key) continue
    const previousKey = [...seenAt.keys()].find((candidate) => isNearDuplicate(candidate, key))
    if (previousKey) seenAt.set(previousKey, now)
    seenAt.set(key, now)
  }
}
