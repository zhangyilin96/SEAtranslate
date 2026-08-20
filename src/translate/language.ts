export type SupportedChatLanguage = 'EN' | 'TH' | 'MS' | 'ID' | 'AUTO'

const indonesianMarkers = new Set(['nggak', 'gak', 'enggak', 'gue', 'gua', 'lu', 'lo', 'aja', 'banget', 'udah', 'ayo', 'cepet', 'bisa'])
const malayMarkers = new Set(['tak', 'korang', 'awak', 'jom', 'dah', 'boleh', 'sangat', 'kejap'])
const englishMarkers = new Set([
  'back', 'go', 'wait', 'fight', 'push', 'help', 'cant', 'cannot', 'dont', 'need', 'come', 'stop', 'yes', 'no', 'now',
  'rosh', 'roshan', 'rs', 'buyback', 'bb', 'lets', 'let', 'take', 'kill', 'dam', 'dmg', 'damage', 'mana', 'oom', 'heal',
  'stun', 'disable', 'vision', 'ward', 'tp', 'stfu', 'wtf', 'shit', 'slow', 'asshole', 'def', 'defend', 'group', 'missing',
  'miss', 'mia', 'smoke', 'deward', 'sentry', 'farm', 'top', 'mid', 'bot', 'bottom', 'bkb', 'in', 'sec', 'seconds',
])

export function detectChatLanguage(text: string): SupportedChatLanguage {
  if (/\p{Script=Thai}/u.test(text)) return 'TH'
  const tokens = text.toLocaleLowerCase().match(/[a-z]+/g) || []
  const indonesianScore = tokens.filter((token) => indonesianMarkers.has(token)).length
  const malayScore = tokens.filter((token) => malayMarkers.has(token)).length
  if (indonesianScore > malayScore) return 'ID'
  if (malayScore > indonesianScore) return 'MS'
  if ((tokens.length > 0 && tokens.every((token) => englishMarkers.has(token))) || /^(?:w8|rs|bb|gg|go)+[!?.,]*$/i.test(text.trim())) return 'EN'
  return 'AUTO'
}

export function languageCodeForProvider(language: SupportedChatLanguage) {
  return language === 'AUTO' ? undefined : language.toLocaleLowerCase()
}

export function chatLanguageLabel(providerLanguage: string | undefined, text: string): SupportedChatLanguage {
  const tag = String(providerLanguage || '').toLowerCase().split(/[-_]/)[0]
  if (tag === 'th') return 'TH'
  if (tag === 'ms' || tag === 'msa' || tag === 'may') return 'MS'
  if (tag === 'id' || tag === 'ind') return 'ID'
  if (tag === 'en') return 'EN'
  return detectChatLanguage(text)
}
