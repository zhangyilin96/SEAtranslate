const exactPhrases: Array<[RegExp, string]> = [
  [/^我还有\s*(\d+)\s*秒\s*bkb[，, ]*不要打$/i, "Don't fight. BKB in $1s."],
  [/^去打肉山[，, ]*他们没视野$/, 'Rosh. They have no vision.'],
  [/^斧王你先上[，, ]*我们跟$/, "Axe go first. We'll follow."],
  [/^别追[，, ]*他们可能买活$/, "Don't chase. They may buyback."],
  [/^我没\s*tp[，, ]*等等我$/i, 'No TP. Wait for me.'],
]

export function exactDotaEnglish(source: string) {
  const normalized = source.trim().replace(/[。.!！]+$/, '')
  for (const [pattern, output] of exactPhrases) {
    if (pattern.test(normalized)) return normalized.replace(pattern, output)
  }
  return null
}

export function conciseDotaEnglish(translated: string) {
  return translated
    .replace(/Roshan/gi, 'Rosh')
    .replace(/buy back/gi, 'buyback')
    .replace(/teleportation scroll/gi, 'TP')
    .replace(/black king bar/gi, 'BKB')
    .replace(/do not/gi, "Don't")
    .replace(/we will/gi, "We'll")
    .replace(/\s+/g, ' ')
    .trim()
}
