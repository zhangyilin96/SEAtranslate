import { describe, expect, it } from 'vitest'
import { applyDotaGlossary, lineFingerprint, normalizeOcrLine, translateDotaCall } from './glossary'

describe('translate helpers', () => {
  it('normalizes OCR noise and produces stable duplicate keys', () => {
    expect(normalizeOcrLine('  | smoke   rosh!!  ')).toBe('I smoke rosh!!')
    expect(normalizeOcrLine(' ?? ')).toBe('??')
    expect(lineFingerprint('Go   Roshan!')).toBe(lineFingerprint('go roshan'))
  })

  it('corrects common Dota terms after translation', () => {
    expect(applyDotaGlossary('smoke then roshan', 'smoke rosh')).toBe('开雾 then 肉山')
    expect(applyDotaGlossary('buyback and BKB')).toBe('买活 and BKB')
  })

  it('translates short Dota calls locally without waiting for a provider', () => {
    expect(translateDotaCall('back')).toBe('撤')
    expect(translateDotaCall('w8')).toBe('等一下')
    expect(translateDotaCall('go')).toBe('上')
    expect(translateDotaCall('gogo')).toBe('上上')
    expect(translateDotaCall('gogogo')).toBe('上上上')
    expect(translateDotaCall('gogogge.')).toBe('上上上')
    expect(translateDotaCall('wes')).toBe('等一下')
    expect(translateDotaCall('rs?')).toBe('肉山？')
    expect(translateDotaCall('cant')).toBe('不能')
    expect(translateDotaCall('scant')).toBe('不能')
    expect(translateDotaCall('no dam')).toBe('没伤害')
    expect(translateDotaCall('stfu')).toBe('闭嘴')
    expect(translateDotaCall('wtf')).toBe('什么鬼？')
    expect(translateDotaCall('asssho')).toBe('蠢货')
    expect(translateDotaCall("let's rs")).toBe('打肉山')
    expect(translateDotaCall('push mid')).toBe('推中路')
    expect(translateDotaCall('def top')).toBe('守上路')
    expect(translateDotaCall('BKB in 20s')).toBe('BKB还有20秒')
    expect(translateDotaCall('need farm')).toBe('需要刷钱')
    expect(translateDotaCall('farm now')).toBe('去刷钱')
    expect(translateDotaCall('cant back')).toBe('撤不了')
    expect(translateDotaCall('we need back')).toBe('我们得撤')
    expect(translateDotaCall('we need farm first')).toBe('我们得先刷钱')
    expect(translateDotaCall('focus PA')).toBe('集火幻影刺客')
    expect(translateDotaCall('catch PA?')).toBe('抓幻影刺客？')
    expect(translateDotaCall('catch ns?')).toBe('抓暗夜魔王？')
    expect(translateDotaCall('y u go')).toBe('你为什么走？')
    expect(translateDotaCall('??')).toBe('？？')
    expect(translateDotaCall('background')).toBeNull()
  })
})
