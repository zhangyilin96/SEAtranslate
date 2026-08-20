import { normalizeOcrLine } from './glossary'

export type PixelImage = { data: Uint8ClampedArray; width: number; height: number }
export type OcrChatLine = { speaker: string; message: string }

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
    const text = normalizeOcrLine(rawText)
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
  let blue = 0
  let light = 0
  let pixels = 0
  let lastBlueX = -1
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * image.width + x) * 4
      const red = image.data[offset]
      const green = image.data[offset + 1]
      const blueChannel = image.data[offset + 2]
      const maximum = Math.max(red, green, blueChannel)
      const minimum = Math.min(red, green, blueChannel)
      if (blueChannel > 130 && blueChannel > red * 1.35 && blueChannel > green * 1.12) {
        blue += 1
        lastBlueX = Math.max(lastBlueX, x)
      }
      if (maximum > 170 && maximum - minimum < 55) light += 1
      pixels += 1
    }
  }
  return { blue: pixels ? blue / pixels : 0, light: pixels ? light / pixels : 0, lastBlueX }
}

function cleanSpeaker(value: string) {
  return normalizeOcrLine(value).replace(/^[\[({<]+|[\])}>:：]+$/g, '').trim()
}

export function extractChatLinesFromTsv(tsv: string, image: PixelImage): OcrChatLine[] {
  const groups = new Map<string, OcrWord[]>()
  for (const word of parseTsvWords(tsv)) groups.set(word.lineKey, [...(groups.get(word.lineKey) || []), word])

  const measuredGroups = [...groups.values()].map((words) => words
    .sort((left, right) => left.left - right.left)
    .map((word) => ({ word, ...colorRatios(image, word) })))
  const hasBlueSpeakerText = measuredGroups.some((measured) => measured.some((item) => item.blue >= 0.035))
  const lines: OcrChatLine[] = []
  for (const measured of measuredGroups) {
    const ordered = measured.map(({ word }) => word)
    const blueWords = measured.filter((item) => item.blue >= 0.035)
    const lastBlueX = Math.max(-1, ...blueWords.map((item) => item.lastBlueX))
    const speaker = blueWords
      .map((item) => ({ text: cleanSpeaker(item.word.text), rawText: item.word.rawText, confidence: item.word.confidence, left: item.word.left }))
      .filter((item) => /[\p{L}\p{N}]/u.test(item.text))
      .filter((item) => !/^[\[({<]/.test(item.rawText))
      .sort((left, right) => right.left - left.left || right.confidence - left.confidence)[0]?.text || ''

    let message = ''
    if (lastBlueX >= 0) {
      message = normalizeOcrLine(measured
        .filter((item) => item.word.left + item.word.width / 2 > lastBlueX + 2 && item.light >= 0.025 && item.blue < 0.035 && item.word.confidence >= 8)
        .map((item) => item.word.text)
        .join(' '))
    } else if (!hasBlueSpeakerText) {
      const wholeLine = normalizeOcrLine(ordered.map((word) => word.text).join(' '))
      const separator = Math.max(wholeLine.lastIndexOf(':'), wholeLine.lastIndexOf('：'))
      message = separator >= 0
        ? normalizeOcrLine(wholeLine.slice(separator + 1))
        : normalizeOcrLine(measured.filter((item) => item.light >= 0.025 && item.word.confidence >= 8).map((item) => item.word.text).join(' '))
    }
    if (message.length >= 2) lines.push({ speaker, message })
  }
  return lines.slice(-10)
}
