export type SupportedChatLanguage = 'EN' | 'TH' | 'MS' | 'ID' | 'AUTO'

export function chatLanguageLabel(providerLanguage: string | undefined, text: string): SupportedChatLanguage {
  if (/\p{Script=Thai}/u.test(text)) return 'TH'
  const tag = String(providerLanguage || '').toLowerCase().split(/[-_]/)[0]
  if (tag === 'th') return 'TH'
  if (tag === 'ms' || tag === 'msa' || tag === 'may') return 'MS'
  if (tag === 'id' || tag === 'ind') return 'ID'
  if (tag === 'en') return 'EN'
  return 'AUTO'
}
