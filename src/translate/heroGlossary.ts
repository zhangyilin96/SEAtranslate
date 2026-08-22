type HeroEntry = readonly [english: string, chinese: string, aliases?: readonly string[]]

// Valve's current 127-hero roster (2026-08-20). Community aliases are kept
// beside the canonical name so this table can be reviewed without touching
// OCR or provider code. Ambiguous acronyms such as ES/VS/BM are not guessed.
export const HERO_GLOSSARY: readonly HeroEntry[] = [
  ['Abaddon', '亚巴顿', ['aba']],
  ['Alchemist', '炼金术士', ['alch']],
  ['Ancient Apparition', '远古冰魄', ['aa']],
  ['Anti-Mage', '敌法师', ['am', 'antimage']],
  ['Arc Warden', '天穹守望者', ['aw', 'arc']],
  ['Axe', '斧王'],
  ['Bane', '祸乱之源'],
  ['Batrider', '蝙蝠骑士', ['bat']],
  ['Beastmaster', '兽王', ['beast']],
  ['Bloodseeker', '血魔', ['blood']],
  ['Bounty Hunter', '赏金猎人', ['bh', 'bounty']],
  ['Brewmaster', '酒仙', ['brew']],
  ['Bristleback', '钢背兽', ['bbk', 'bristle']],
  ['Broodmother', '育母蜘蛛', ['brood']],
  ['Centaur Warrunner', '半人马战行者', ['cent', 'centaur']],
  ['Chaos Knight', '混沌骑士', ['ck']],
  ['Chen', '陈'],
  ['Clinkz', '克林克兹', ['clinkz']],
  ['Clockwerk', '发条技师', ['clock']],
  ['Crystal Maiden', '水晶室女', ['cm']],
  ['Dark Seer', '黑暗贤者', ['ds']],
  ['Dark Willow', '邪影芳灵', ['dw', 'willow']],
  ['Dawnbreaker', '破晓辰星', ['dawn']],
  ['Dazzle', '戴泽'],
  ['Death Prophet', '死亡先知', ['dp']],
  ['Disruptor', '干扰者', ['dis']],
  ['Doom', '末日使者'],
  ['Dragon Knight', '龙骑士', ['dk']],
  ['Drow Ranger', '卓尔游侠', ['drow']],
  ['Earth Spirit', '大地之灵', ['earthspirit', 'earth spirit']],
  ['Earthshaker', '撼地者', ['shaker']],
  ['Elder Titan', '上古巨神', ['et']],
  ['Ember Spirit', '灰烬之灵', ['ember']],
  ['Enchantress', '魅惑魔女', ['ench']],
  ['Enigma', '谜团'],
  ['Faceless Void', '虚空假面', ['fv', 'faceless']],
  ['Grimstroke', '天涯墨客', ['grim']],
  ['Gyrocopter', '矮人直升机', ['gyro']],
  ['Hoodwink', '森海飞霞', ['hood']],
  ['Huskar', '哈斯卡'],
  ['Invoker', '祈求者', ['voker']],
  ['Io', '艾欧', ['wisp']],
  ['Jakiro', '杰奇洛'],
  ['Juggernaut', '主宰', ['jugg']],
  ['Keeper of the Light', '光之守卫', ['kotl']],
  ['Kez', '凯兹'],
  ['Kunkka', '昆卡'],
  ['Largo', '拉戈'],
  ['Legion Commander', '军团指挥官', ['lc', 'legion']],
  ['Leshrac', '拉席克', ['lesh']],
  ['Lich', '巫妖'],
  ['Lifestealer', '噬魂鬼', ['ls', 'naix']],
  ['Lina', '莉娜'],
  ['Lion', '莱恩'],
  ['Lone Druid', '德鲁伊', ['ld', 'druid']],
  ['Luna', '露娜'],
  ['Lycan', '狼人'],
  ['Magnus', '马格纳斯', ['mag']],
  ['Marci', '玛西'],
  ['Mars', '玛尔斯'],
  ['Medusa', '美杜莎', ['dusa']],
  ['Meepo', '米波'],
  ['Mirana', '米拉娜', ['potm']],
  ['Monkey King', '齐天大圣', ['mk']],
  ['Morphling', '变体精灵', ['morph']],
  ['Muerta', '琼英碧灵'],
  ['Naga Siren', '娜迦海妖', ['naga']],
  ["Nature's Prophet", '先知', ['np', 'furion', 'natures prophet']],
  ['Necrophos', '瘟疫法师', ['necro']],
  ['Night Stalker', '暗夜魔王', ['ns', 'nightstalker']],
  ['Nyx Assassin', '司夜刺客', ['nyx']],
  ['Ogre Magi', '食人魔魔法师', ['ogre']],
  ['Omniknight', '全能骑士', ['omni']],
  ['Oracle', '神谕者'],
  ['Outworld Destroyer', '殁境神蚀者', ['od', 'outworld']],
  ['Pangolier', '石鳞剑士', ['pango']],
  ['Phantom Assassin', '幻影刺客', ['pa']],
  ['Phantom Lancer', '幻影长矛手', ['pl']],
  ['Phoenix', '凤凰'],
  ['Primal Beast', '原始兽', ['pb', 'primal']],
  ['Puck', '帕克'],
  ['Pudge', '帕吉'],
  ['Pugna', '帕格纳'],
  ['Queen of Pain', '痛苦女王', ['qop', 'queen']],
  ['Razor', '剃刀'],
  ['Riki', '力丸'],
  ['Ringmaster', '百戏大王', ['rm']],
  ['Rubick', '拉比克'],
  ['Sand King', '沙王', ['sk']],
  ['Shadow Demon', '暗影恶魔', ['sd']],
  ['Shadow Fiend', '影魔', ['sf', 'nevermore']],
  ['Shadow Shaman', '暗影萨满', ['shaman', 'rhasta']],
  ['Silencer', '沉默术士', ['sil']],
  ['Skywrath Mage', '天怒法师', ['sky']],
  ['Slardar', '斯拉达'],
  ['Slark', '斯拉克'],
  ['Snapfire', '电炎绝手', ['snap']],
  ['Sniper', '狙击手'],
  ['Spectre', '幽鬼', ['spec']],
  ['Spirit Breaker', '裂魂人', ['sb', 'bara']],
  ['Storm Spirit', '风暴之灵', ['storm']],
  ['Sven', '斯温'],
  ['Techies', '工程师', ['tech']],
  ['Templar Assassin', '圣堂刺客', ['ta']],
  ['Terrorblade', '恐怖利刃', ['tb']],
  ['Tidehunter', '潮汐猎人', ['tide']],
  ['Timbersaw', '伐木机', ['timber']],
  ['Tinker', '修补匠'],
  ['Tiny', '小小'],
  ['Treant Protector', '树精卫士', ['treant']],
  ['Troll Warlord', '巨魔战将', ['troll']],
  ['Tusk', '巨牙海民'],
  ['Underlord', '孽主', ['ul']],
  ['Undying', '不朽尸王', ['undy']],
  ['Ursa', '熊战士'],
  ['Vengeful Spirit', '复仇之魂', ['venge']],
  ['Venomancer', '剧毒术士', ['veno']],
  ['Viper', '冥界亚龙'],
  ['Visage', '维萨吉'],
  ['Void Spirit', '虚无之灵', ['voidspirit']],
  ['Warlock', '术士', ['wl']],
  ['Weaver', '编织者'],
  ['Windranger', '风行者', ['wr', 'wind']],
  ['Winter Wyvern', '寒冬飞龙', ['ww', 'wyvern']],
  ['Witch Doctor', '巫医', ['wd']],
  ['Wraith King', '冥魂大帝', ['wk']],
  ['Zeus', '宙斯'],
]

function normalizeAlias(value: string) {
  return value.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '')
}

const explicitAliasCandidates = new Map<string, Set<string>>()
const acronymCandidates = new Map<string, Set<string>>()
for (const [english, chinese, aliases = []] of HERO_GLOSSARY) {
  const words = english.match(/[a-z0-9]+/gi) || []
  const acronym = words.length > 1 ? words.map((word) => word[0]).join('') : ''
  for (const alias of [english, ...aliases]) {
    const key = normalizeAlias(alias)
    if (!key || key.length < 2) continue
    const values = explicitAliasCandidates.get(key) || new Set<string>()
    values.add(chinese)
    explicitAliasCandidates.set(key, values)
  }
  const acronymKey = normalizeAlias(acronym)
  if (acronymKey.length >= 2) {
    const values = acronymCandidates.get(acronymKey) || new Set<string>()
    values.add(chinese)
    acronymCandidates.set(acronymKey, values)
  }
}

const heroAliases = new Map([...acronymCandidates]
  .filter(([, values]) => values.size === 1)
  .map(([alias, values]) => [alias, [...values][0]]))
for (const [alias, values] of explicitAliasCandidates) {
  if (values.size === 1) heroAliases.set(alias, [...values][0])
  else heroAliases.delete(alias)
}

export function translateHeroAlias(value: string) {
  return heroAliases.get(normalizeAlias(value)) || null
}

export function translateHeroCall(source: string) {
  const clean = source.toLocaleLowerCase().replace(/[!?.,]+$/g, '').replace(/\s+/g, ' ').trim()
  const question = /[?？]/.test(source) ? '？' : ''
  const exact = translateHeroAlias(clean)
  if (exact) return `${exact}${question}`
  const actionMatch = /^(focus|kill|jump|chase|catch)\s+(.+)$/.exec(clean)
  if (actionMatch) {
    const hero = translateHeroAlias(actionMatch[2])
    if (hero) return `${actionMatch[1] === 'focus' ? '集火' : actionMatch[1] === 'kill' ? '杀' : actionMatch[1] === 'jump' ? '先手' : actionMatch[1] === 'catch' ? '抓' : '追'}${hero}${question}`
  }
  const missingMatch = /^(.+)\s+(?:miss|missing|mia)$/.exec(clean)
  if (missingMatch) {
    const hero = translateHeroAlias(missingMatch[1])
    if (hero) return `${hero}不见了${question}`
  }
  return null
}

export function applyHeroGlossary(value: string) {
  return value.replace(/[a-z][a-z0-9' -]*/gi, (part) => {
    const direct = translateHeroAlias(part.trim())
    if (direct) return part.endsWith(' ') ? `${direct} ` : direct
    return part.replace(/\b[a-z][a-z0-9']*\b/gi, (token) => translateHeroAlias(token) || token)
  })
}
