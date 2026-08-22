import { describe, expect, it } from 'vitest'
import { applyHeroGlossary, HERO_GLOSSARY, translateHeroAlias, translateHeroCall } from './heroGlossary'

describe('Dota hero glossary', () => {
  it('tracks the current complete Valve hero roster', () => {
    expect(HERO_GLOSSARY).toHaveLength(127)
  })

  it('resolves common SEA aliases and canonical names', () => {
    expect(translateHeroAlias('AM')).toBe('敌法师')
    expect(translateHeroAlias('qop')).toBe('痛苦女王')
    expect(translateHeroAlias('kotl')).toBe('光之守卫')
    expect(translateHeroAlias('Ringmaster')).toBe('百戏大王')
    expect(translateHeroAlias('largo')).toBe('拉戈')
  })

  it('does not guess acronyms that identify multiple heroes', () => {
    expect(translateHeroAlias('es')).toBeNull()
    expect(translateHeroAlias('vs')).toBeNull()
  })

  it('translates common hero calls locally', () => {
    expect(translateHeroCall('focus pa')).toBe('集火幻影刺客')
    expect(translateHeroCall('catch pa?')).toBe('抓幻影刺客？')
    expect(translateHeroCall('catch ns?')).toBe('抓暗夜魔王？')
    expect(translateHeroCall('AM missing')).toBe('敌法师不见了')
    expect(applyHeroGlossary('kill qop then rosh')).toBe('kill 痛苦女王 then rosh')
  })
})
