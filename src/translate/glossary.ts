import { applyHeroGlossary, translateHeroCall } from './heroGlossary'

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
  const compact = value.replace(/[|¦]/g, 'I').replace(/\s+/g, ' ').trim()
  if (/^[!?.,]+$/.test(compact)) return compact
  return compact.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}!?.,]+$/gu, '').trim()
}

export function lineFingerprint(value: string) {
  return normalizeOcrLine(value).toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

const quickCalls: Array<[RegExp, string]> = [
  [/^(?:back|b|retreat)$/i, '撤'],
  [/^(?:w8|wait|waitme|hold)$/i, '等一下'],
  [/^(?:rs|rosh|roshan)$/i, '肉山'],
  [/^(?:bb|buyback)$/i, '买活'],
  [/^(?:cant|cannot)$/i, '不能'],
  [/^scant$/i, '不能'],
  [/^(?:nodam|nodmg|nodamage)$/i, '没伤害'],
  [/^(?:nomana|oom)$/i, '没蓝'],
  [/^(?:noheal|noheals)$/i, '没治疗'],
  [/^(?:nostun|nodisable)$/i, '没控制'],
  [/^novision$/i, '没视野'],
  [/^(?:noward|nowards)$/i, '没眼'],
  [/^notp$/i, '没TP'],
  [/^(?:nobb|nobuyback)$/i, '没买活'],
  [/^(?:stfu|shutup)$/i, '闭嘴'],
  [/^wtf$/i, '什么鬼？'],
  [/^what$/i, '什么？'],
  [/^(?:tooslow|2slow)$/i, '太慢了'],
  [/^as+h[o0]+(?:le)?$/i, '蠢货'],
  [/^shit$/i, '靠'],
  [/^(?:dontfight|nofight)$/i, '别打'],
  [/^(?:def|defend)$/i, '防守'],
  [/^group$/i, '集合'],
  [/^help$/i, '帮我'],
  [/^(?:miss|missing|mia)$/i, '人不见了'],
  [/^smoke$/i, '开雾'],
  [/^(?:ward|wards)$/i, '插眼'],
  [/^deward$/i, '排眼'],
  [/^sentry$/i, '真眼'],
  [/^push$/i, '推'],
  [/^fight$/i, '打'],
  [/^farm$/i, '刷钱'],
  [/^no$/i, '不'],
  [/^(?:yes|yep)$/i, '好'],
  [/^gg$/i, 'GG'],
]

export function translateDotaCall(source: string) {
  const punctuation = normalizeOcrLine(source)
  if (/^[?？]{1,4}$/.test(punctuation)) return '？'.repeat([...punctuation].length)
  const normalized = lineFingerprint(source)
  const question = /[?？]/.test(source) ? '？' : ''
  if (/^(?:go){1,5}$/i.test(normalized)) return '上'.repeat(normalized.length / 2)
  const exact = quickCalls.find(([pattern]) => pattern.test(normalized))?.[1]
  if (exact) return question && /^(?:rs|rosh|roshan)$/i.test(normalized) ? `${exact}${question}` : exact
  if (/^g[go0e]{1,9}$/i.test(normalized) && /[o0]/i.test(normalized)) return '上'.repeat(Math.max(1, Math.min(5, Math.floor(normalized.length / 2))))
  if (/^w(?:8+|ait|a1t|es)$/i.test(normalized)) return '等一下'
  if (/^y(?:u|you)go$/i.test(normalized)) return '你为什么走？'
  if (/^(?:need|needto|gonna|gotta)farm$/i.test(normalized)) return '需要刷钱'
  if (/^(?:gofarm|farmnow)$/i.test(normalized)) return '去刷钱'
  if (/^(?:cant|cannot)back$/i.test(normalized)) return '撤不了'
  if (/^(?:we|i)?(?:need|needto|gotta)back$/i.test(normalized)) return normalized.startsWith('we') ? '我们得撤' : '得撤'
  if (/^(?:we|i)?(?:need|needto|gotta)farmfirst$/i.test(normalized)) return normalized.startsWith('we') ? '我们得先刷钱' : '得先刷钱'
  if (/^(?:we|i)?needtohide$/i.test(normalized)) return normalized.startsWith('we') ? '我们需要躲起来' : '需要躲起来'
  if (/^(?:lets|letus|go|do|take|kill)(?:rs|rosh|roshan)$/i.test(normalized)) return `打肉山${question}`
  const laneCall = /^(push|go|def|defend)(top|mid|bot|bottom)$/i.exec(normalized)
  if (laneCall) {
    const action = laneCall[1].toLocaleLowerCase()
    const lane = ({ top: '上路', mid: '中路', bot: '下路', bottom: '下路' } as const)[laneCall[2].toLocaleLowerCase() as 'top' | 'mid' | 'bot' | 'bottom']
    return `${action === 'push' ? '推' : action === 'go' ? '去' : '守'}${lane}${question}`
  }
  const bkbTiming = /^bkb(?:in)?(\d{1,3})(?:s|sec|seconds)?$/i.exec(normalized)
  if (bkbTiming) return `BKB还有${bkbTiming[1]}秒${question}`
  const heroCall = translateHeroCall(source)
  if (heroCall) return heroCall
  return null
}

export function applyDotaGlossary(translated: string, source = '') {
  let output = applyHeroGlossary(translated)
  for (const [pattern, replacement] of glossary) {
    if (pattern.test(source) || pattern.test(output)) output = output.replace(pattern, replacement)
    pattern.lastIndex = 0
  }
  return output.trim()
}
