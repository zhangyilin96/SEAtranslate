const glossary: Array<[RegExp, string]> = [
  [/\b(?:rosh(?:an)?|rs)\b/gi, '肉山'],
  [/\b(?:buyback|bb)\b/gi, '买活'],
  [/\btp\b/gi, 'TP / 传送'],
  [/\b(?:high ground|hg)\b/gi, '高地'],
  [/\bsmoke\b/gi, '开雾'],
  [/\bback\b/gi, '撤'],
  [/\bpush\b/gi, '推'],
  [/\bward(?:s)?\b/gi, '眼'],
  [/\bdeward\b/gi, '排眼'],
  [/\bsentry\b/gi, '真眼'],
  [/\bkite\b/gi, '拉扯'],
  [/\bburst\b/gi, '集火爆发'],
  [/\bfarm\b/gi, '刷'],
  [/\bgank\b/gi, '抓人'],
  [/\btormentor\b/gi, '魔方'],
  [/\bbkb\b/gi, 'BKB'],
  [/\bult(?:imate)?\b/gi, '大招'],
  [/\bmid\b/gi, '中路'],
  [/\bbot(?:tom)?\b/gi, '下路'],
  [/\btop\b/gi, '上路'],
  [/\bmissing|\bmiss\b/gi, '不见了'],
  [/\bgg\b/gi, 'GG'],
]

export function normalizeOcrLine(value: string) {
  return value.replace(/[|¦]/g, 'I').replace(/\s+/g, ' ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}!?.,]+$/gu, '').trim()
}

export function lineFingerprint(value: string) {
  return normalizeOcrLine(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

export function applyDotaGlossary(translated: string, source = '') {
  let output = translated
  for (const [pattern, replacement] of glossary) {
    if (pattern.test(source) || pattern.test(output)) output = output.replace(pattern, replacement)
    pattern.lastIndex = 0
  }
  return output.trim()
}
