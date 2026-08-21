import { normalizeOcrLine } from './glossary'
import { isNearDuplicate } from './chatLines'

export type PixelImage = { data: Uint8ClampedArray; width: number; height: number }
export type OcrWordEvidence = { text: string; confidence: number; left: number; top: number; width: number; height: number }
export type OcrChatLine = {
  speaker: string
  message: string
  top: number
  height: number
  confidence: number
  speakerConfidence: number
  words: OcrWordEvidence[]
}

type MeasuredWord = OcrWord & { playerColor: number; light: number; lastPlayerColorX: number }

type OcrWord = {
  text: string
  rawText: string
  confidence: number
  left: number
  top: number
  width: number
  height: number
  lineKey: string
}

function parseTsvWords(tsv: string) {
  return tsv.split(/\r?\n/).flatMap((row): OcrWord[] => {
    const columns = row.split('\t')
    if (columns.length < 12 || Number(columns[0]) !== 5) return []
    const rawText = columns.slice(11).join('\t').trim()
    const text = normalizeOcrLine(rawText) || (/[:：]/.test(rawText) ? rawText : '')
    const width = Number(columns[8])
    const height = Number(columns[9])
    if (!text || width <= 0 || height <= 0) return []
    return [{
      text,
      rawText,
      confidence: Number(columns[10]) || 0,
      left: Number(columns[6]) || 0,
      top: Number(columns[7]) || 0,
      width,
      height,
      lineKey: columns.slice(1, 5).join(':'),
    }]
  })
}

function colorRatios(image: PixelImage, word: OcrWord) {
  const left = Math.max(0, Math.floor(word.left))
  const top = Math.max(0, Math.floor(word.top))
  const right = Math.min(image.width, Math.ceil(word.left + word.width))
  const bottom = Math.min(image.height, Math.ceil(word.top + word.height))
  let playerColor = 0
  let light = 0
  let pixels = 0
  let lastPlayerColorX = -1
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 4
      const red = image.data[offset]
      const green = image.data[offset + 1]
      const blueChannel = image.data[offset + 2]
      const maximum = Math.max(red, green, blueChannel)
      const minimum = Math.min(red, green, blueChannel)
      if (maximum > 165 && maximum - minimum > 55) {
        playerColor += 1
        lastPlayerColorX = Math.max(lastPlayerColorX, x)
      }
      if (maximum > 170 && maximum - minimum < 55) light += 1
      pixels += 1
    }
  }
  return { playerColor: pixels ? playerColor / pixels : 0, light: pixels ? light / pixels : 0, lastPlayerColorX }
}

function cleanSpeaker(value: string) {
  return normalizeOcrLine(value).replace(/^[\[({<]+|[\])}>:：]+$/g, '').trim()
}

function speakersLikelySame(left: string, right: string) {
  const leftKey = left.toLocaleLowerCase()
  const rightKey = right.toLocaleLowerCase()
  return isNearDuplicate(left, right) || (leftKey.length >= 5 && rightKey.length >= 5 && leftKey.slice(-4) === rightKey.slice(-4))
}

function contiguousMessageWords(words: MeasuredWord[], initialRight: number) {
  const accepted: MeasuredWord[] = []
  let previousRight = initialRight
  let previousHeight = words[0]?.height || 0
  for (const item of words) {
    const gap = item.left - previousRight
    const maximumGap = Math.max(24, Math.min(90, Math.max(previousHeight, item.height) * 2.2))
    if (gap > maximumGap) break
    if (item.light >= 0.06) accepted.push(item)
    previousRight = Math.max(previousRight, item.left + item.width)
    previousHeight = item.height
  }
  return accepted
}

function wordEvidence(word: OcrWord, text = word.text): OcrWordEvidence {
  return { text, confidence: word.confidence, left: word.left, top: word.top, width: word.width, height: word.height }
}

function weightedConfidence(words: OcrWordEvidence[]) {
  const totalWeight = words.reduce((total, word) => total + Math.max(1, [...word.text].length), 0)
  if (!totalWeight) return 0
  return Number((words.reduce((total, word) => total + word.confidence * Math.max(1, [...word.text].length), 0) / totalWeight).toFixed(1))
}

export function extractChatLinesFromTsv(tsv: string, image: PixelImage): OcrChatLine[] {
  const groups = new Map<string, OcrWord[]>()
  for (const word of parseTsvWords(tsv)) groups.set(word.lineKey, [...(groups.get(word.lineKey) || []), word])

  const measuredGroups: MeasuredWord[][] = [...groups.values()].map((words) => words
    .sort((left, right) => left.left - right.left)
    .map((word) => ({ ...word, ...colorRatios(image, word) })))
  const hasPlayerColorText = measuredGroups.some((measured) => measured.some((item) => item.playerColor >= 0.035))
  const lines: OcrChatLine[] = []
  for (const measured of measuredGroups) {
    const playerWords = measured.filter((item) => item.playerColor >= 0.035)
    const lastPlayerColorX = Math.max(-1, ...playerWords.map((item) => item.lastPlayerColorX))
    let separatorIndex = -1
    for (let index = 0; index < measured.length; index += 1) if (/[:：]/.test(measured[index].rawText)) separatorIndex = index
    const colorSpeaker = playerWords
      .map((item) => ({ text: cleanSpeaker(item.text), rawText: item.rawText, confidence: item.confidence, left: item.left }))
      .filter((item) => /[\p{L}\p{N}]/u.test(item.text))
      .filter((item) => !/^[\[({<]/.test(item.rawText))
      .filter((item) => item.left <= image.width * .45)
      .sort((left, right) => left.left - right.left || right.confidence - left.confidence)[0]
    const structuralSpeaker = separatorIndex > 0
      ? [...measured.slice(0, separatorIndex)]
        .reverse()
        .map((word) => ({ text: cleanSpeaker(word.text), rawText: word.rawText, confidence: word.confidence }))
        .find((item) => /[\p{L}\p{N}]/u.test(item.text) && !/^[\[({<]/.test(item.rawText) && !/[:：]/.test(item.rawText))
      : ''
    // The first colored token is the player id. Dota's colored clan/location
    // tag can lose its opening bracket in OCR (for example "X/F"), so it must
    // not override the earlier player id merely because it sits by the colon.
    const speakerCandidate = colorSpeaker || structuralSpeaker
    const speaker = speakerCandidate?.text || ''

    let message = ''
    let messageWords: OcrWordEvidence[] = []
    if (separatorIndex >= 0) {
      const separatorWord = measured[separatorIndex]
      const suffix = normalizeOcrLine(separatorWord.rawText.split(/[:：]/).at(-1) || '')
      messageWords = [
        ...(suffix ? [wordEvidence(separatorWord, suffix)] : []),
        ...contiguousMessageWords(measured.slice(separatorIndex + 1), separatorWord.left + separatorWord.width).map((word) => wordEvidence(word)),
      ]
      message = normalizeOcrLine(messageWords.map((word) => word.text).join(' '))
    } else if (lastPlayerColorX >= 0) {
      const selected = measured
        .filter((item) => item.left + item.width / 2 > lastPlayerColorX + 2 && item.light >= 0.06 && item.playerColor < 0.035)
      messageWords = selected.map((word) => wordEvidence(word))
      message = normalizeOcrLine(messageWords.map((word) => word.text).join(' '))
    } else if (!hasPlayerColorText) {
      const wholeLine = normalizeOcrLine(measured.map((word) => word.text).join(' '))
      const separator = Math.max(wholeLine.lastIndexOf(':'), wholeLine.lastIndexOf('：'))
      const selected = measured.filter((item) => item.light >= 0.025 && item.confidence >= 25)
      message = separator >= 0 ? normalizeOcrLine(wholeLine.slice(separator + 1)) : normalizeOcrLine(selected.map((item) => item.text).join(' '))
      messageWords = selected
        .filter((item) => message.includes(item.text))
        .map((word) => wordEvidence(word))
    }
    const speakerLength = [...speaker].length
    const plausibleSpeaker = /^[a-z0-9]+$/i.test(speaker) ? speakerLength >= 3 : speakerLength >= 2
    const top = Math.min(...measured.map((word) => word.top))
    const bottom = Math.max(...measured.map((word) => word.top + word.height))
    const evidence = {
      message,
      top,
      height: Math.max(1, bottom - top),
      confidence: weightedConfidence(messageWords),
      words: messageWords,
    }
    if (plausibleSpeaker && message.length >= 2) lines.push({ speaker, speakerConfidence: speakerCandidate?.confidence || 0, ...evidence })
    else if (!hasPlayerColorText && message.length >= 2) lines.push({ speaker: '', speakerConfidence: 0, ...evidence })
  }
  const speakerFrequency = new Map<string, number>()
  for (const { speaker } of lines) if (speaker) speakerFrequency.set(speaker, (speakerFrequency.get(speaker) || 0) + 1)
  return lines.slice(-10).map((line) => {
    if (!line.speaker) return line
    const canonical = [...speakerFrequency.keys()]
      .filter((candidate) => speakersLikelySame(candidate, line.speaker))
      .sort((left, right) => (speakerFrequency.get(right) || 0) - (speakerFrequency.get(left) || 0) || right.length - left.length)[0]
    return canonical ? { ...line, speaker: canonical } : line
  })
}
