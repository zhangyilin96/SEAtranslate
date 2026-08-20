import { describe, expect, it } from 'vitest'
import { extractChatLinesFromTsv, type PixelImage } from './chatOcr'

function wordTsv(word: string, wordNumber: number, left: number, width: number, confidence = 90, lineNumber = 1, top = 2) {
  return `5\t1\t1\t1\t${lineNumber}\t${wordNumber}\t${left}\t${top}\t${width}\t12\t${confidence}\t${word}`
}

function imageWithWords(colors: Array<{ left: number; width: number; rgb: [number, number, number]; top?: number }>): PixelImage {
  const width = Math.max(120, ...colors.map(({ left, width: wordWidth }) => left + wordWidth + 4))
  const height = Math.max(18, ...colors.map(({ top = 2 }) => top + 16))
  const data = new Uint8ClampedArray(width * height * 4)
  for (const { left, width: wordWidth, rgb, top = 2 } of colors) {
    for (let y = top; y < top + 12; y += 1) {
      for (let x = left; x < left + wordWidth; x += 1) {
        const offset = (y * width + x) * 4
        data[offset] = rgb[0]
        data[offset + 1] = rgb[1]
        data[offset + 2] = rgb[2]
        data[offset + 3] = 255
      }
    }
  }
  return { data, width, height }
}

describe('Dota chat color-aware OCR extraction', () => {
  it('keeps a colored player id but translates only the white message', () => {
    const tsv = [
      wordTsv('[ALLY]', 1, 2, 14),
      wordTsv('Kiseki', 2, 22, 24),
      wordTsv('[TAG]:', 3, 50, 18, 99),
      wordTsv('back', 4, 76, 18),
    ].join('\n')
    const image = imageWithWords([
      { left: 2, width: 14, rgb: [230, 230, 220] },
      { left: 22, width: 24, rgb: [35, 125, 245] },
      { left: 50, width: 18, rgb: [35, 125, 245] },
      { left: 76, width: 18, rgb: [245, 245, 235] },
    ])
    expect(extractChatLinesFromTsv(tsv, image)).toEqual([{ speaker: 'Kiseki', message: 'back' }])
  })

  it.each([
    [35, 125, 245],
    [235, 70, 205],
    [240, 205, 35],
    [225, 85, 35],
    [30, 185, 85],
    [165, 180, 176],
    [145, 95, 45],
  ] as Array<[number, number, number]>)('supports Dota player color %j', (...rgb: [number, number, number]) => {
    const tsv = [wordTsv('Player', 1, 22, 24), wordTsv('[TAG]:', 2, 50, 18), wordTsv('back', 3, 76, 18)].join('\n')
    const image = imageWithWords([
      { left: 22, width: 24, rgb },
      { left: 50, width: 18, rgb },
      { left: 76, width: 18, rgb: [245, 245, 235] },
    ])
    expect(extractChatLinesFromTsv(tsv, image)).toEqual([{ speaker: 'Player', message: 'back' }])
  })

  it('supports a message-only crop without inventing a speaker', () => {
    const tsv = [wordTsv('wait', 1, 5, 20), wordTsv('rosh', 2, 30, 22)].join('\n')
    const image = imageWithWords([
      { left: 5, width: 20, rgb: [245, 245, 235] },
      { left: 30, width: 22, rgb: [245, 245, 235] },
    ])
    expect(extractChatLinesFromTsv(tsv, image)).toEqual([{ speaker: '', message: 'wait rosh' }])
  })

  it('uses repeated rows to correct a one-character OCR error in the player id', () => {
    const rows = [
      { speaker: 'Iaseki', message: 'go', top: 2 },
      { speaker: 'Kiseki', message: 'back', top: 18 },
      { speaker: 'Kiseki', message: 'cant', top: 34 },
    ]
    const tsv = rows.flatMap((row, index) => [
      wordTsv(row.speaker, 1, 20, 25, 80, index + 1, row.top),
      wordTsv('[TAG]:', 2, 50, 18, 80, index + 1, row.top),
      wordTsv(row.message, 3, 75, 20, 80, index + 1, row.top),
    ]).join('\n')
    const image = imageWithWords(rows.flatMap((row) => [
      { left: 20, width: 25, rgb: [225, 85, 35] as [number, number, number], top: row.top },
      { left: 50, width: 18, rgb: [225, 85, 35] as [number, number, number], top: row.top },
      { left: 75, width: 20, rgb: [245, 245, 235] as [number, number, number], top: row.top },
    ]))
    expect(extractChatLinesFromTsv(tsv, image).map(({ speaker }) => speaker)).toEqual(['Kiseki', 'Kiseki', 'Kiseki'])
  })

  it('keeps a standalone separator and stops before distant scene noise', () => {
    const tsv = [
      wordTsv('kiseki', 1, 2, 46),
      wordTsv('[TAG]', 2, 58, 42),
      wordTsv(':', 3, 107, 3),
      wordTsv('wtf', 4, 119, 24),
      wordTsv('TREE', 5, 283, 40),
    ].join('\n')
    const image = imageWithWords([
      { left: 2, width: 46, rgb: [35, 125, 245] },
      { left: 58, width: 42, rgb: [35, 125, 245] },
      { left: 107, width: 3, rgb: [245, 245, 235] },
      { left: 119, width: 24, rgb: [245, 245, 235] },
      { left: 283, width: 40, rgb: [245, 245, 235] },
    ])
    expect(extractChatLinesFromTsv(tsv, image)).toEqual([{ speaker: 'kiseki', message: 'wtf' }])
  })

  it('does not mistake a colored tag with a missing bracket for the player id', () => {
    const tsv = [
      wordTsv('kiseki', 1, 2, 46),
      wordTsv('X/F', 2, 58, 28),
      wordTsv(':', 3, 93, 3),
      wordTsv('stfu', 4, 105, 30),
    ].join('\n')
    const image = imageWithWords([
      { left: 2, width: 46, rgb: [35, 125, 245] },
      { left: 58, width: 28, rgb: [35, 125, 245] },
      { left: 93, width: 3, rgb: [245, 245, 235] },
      { left: 105, width: 30, rgb: [245, 245, 235] },
    ])
    expect(extractChatLinesFromTsv(tsv, image)).toEqual([{ speaker: 'kiseki', message: 'stfu' }])
  })
})
