import type { Analysis, Metric, PlayerMatch, ProfileResponse } from '../types'

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const scale = (value: number, low: number, high: number) => clamp(((value - low) / (high - low)) * 100)
const round = (value: number, digits = 1) => Number(value.toFixed(digits))
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const present = (value: number | null | undefined): value is number => Number.isFinite(value)

function playerWon(match: PlayerMatch) {
  const isRadiant = match.player_slot < 128
  return isRadiant === match.radiant_win
}

function confidence(matchCount: number, coverage: number): Metric['confidence'] {
  if (matchCount >= 30 && coverage >= 0.8) return 'high'
  if (matchCount >= 15 && coverage >= 0.6) return 'medium'
  return 'low'
}

function metric(
  key: Metric['key'],
  label: string,
  englishLabel: string,
  score: number,
  matchCount: number,
  coverage: number,
  explanation: string,
  evidence: string[],
): Metric {
  return {
    key,
    label,
    englishLabel,
    score: Math.round(clamp(score)),
    confidence: confidence(matchCount, coverage),
    explanation,
    evidence,
  }
}

export function analyzePlayer(accountId: number, profile: ProfileResponse, inputMatches: PlayerMatch[]): Analysis {
  const matches = inputMatches.filter((match) => match.duration >= 300 && match.leaver_status !== 2)
  if (matches.length === 0) throw new Error('没有时长足够、可用于分析的正常比赛。')

  const per10 = (value: number, duration: number) => (value / duration) * 600
  const kills = matches.map((m) => m.kills ?? 0)
  const deaths = matches.map((m) => m.deaths ?? 0)
  const assists = matches.map((m) => m.assists ?? 0)
  const killsPer10 = average(matches.map((m) => per10(m.kills ?? 0, m.duration)))
  const deathsPer10 = average(matches.map((m) => per10(m.deaths ?? 0, m.duration)))
  const assistsPer10 = average(matches.map((m) => per10(m.assists ?? 0, m.duration)))
  const actionsPer10 = killsPer10 + assistsPer10
  const kda = (average(kills) + average(assists)) / Math.max(1, average(deaths))

  const gpmValues = matches.map((m) => m.gold_per_min).filter(present)
  const xpmValues = matches.map((m) => m.xp_per_min).filter(present)
  const lhPerMinValues = matches
    .filter((m) => present(m.last_hits))
    .map((m) => (m.last_hits! / m.duration) * 60)
  const damagePerMinValues = matches
    .filter((m) => present(m.hero_damage))
    .map((m) => (m.hero_damage! / m.duration) * 60)

  const gpm = gpmValues.length ? average(gpmValues) : null
  const xpm = xpmValues.length ? average(xpmValues) : null
  const lastHitsPerMin = lhPerMinValues.length ? average(lhPerMinValues) : null
  const heroDamagePerMin = damagePerMinValues.length ? average(damagePerMinValues) : null
  const fieldCoverage = Math.min(gpmValues.length, damagePerMinValues.length) / matches.length

  const aggressionScore = heroDamagePerMin === null
    ? scale(killsPer10, 0.5, 3)
    : scale(killsPer10, 0.5, 3) * 0.4 + scale(heroDamagePerMin, 250, 900) * 0.6
  const farmScore = gpm === null || lastHitsPerMin === null
    ? 0
    : scale(gpm, 280, 750) * 0.6 + scale(lastHitsPerMin, 1.5, 10) * 0.4
  const fightScore = heroDamagePerMin === null
    ? scale(actionsPer10, 2.5, 9)
    : scale(actionsPer10, 2.5, 9) * 0.55 + scale(heroDamagePerMin, 250, 900) * 0.45
  const survivalScore = (100 - scale(deathsPer10, 1.2, 4.2)) * 0.7 + scale(kda, 1.2, 5) * 0.3
  const teamfightScore = scale(assistsPer10, 1.2, 6.5) * 0.65 + scale(actionsPer10, 2.5, 9) * 0.35

  const metrics: Metric[] = [
    metric('aggression', '侵略性', 'Aggression', aggressionScore, matches.length, damagePerMinValues.length / matches.length,
      '用击杀频率与英雄伤害速率衡量主动施压，不代表操作水平。',
      [`每 10 分钟 ${round(killsPer10)} 次击杀`, heroDamagePerMin === null ? '英雄伤害字段缺失' : `每分钟 ${Math.round(heroDamagePerMin)} 英雄伤害`]),
    metric('farm', '发育倾向', 'Farm', farmScore, matches.length, Math.min(gpmValues.length, lhPerMinValues.length) / matches.length,
      '用 GPM 与每分钟补刀衡量资源获取强度。',
      [gpm === null ? 'GPM 字段缺失' : `平均 ${Math.round(gpm)} GPM`, lastHitsPerMin === null ? '补刀字段缺失' : `每分钟 ${round(lastHitsPerMin)} 补刀`]),
    metric('fight', '打架倾向', 'Fight', fightScore, matches.length, damagePerMinValues.length / matches.length,
      '用击杀助攻频率和英雄伤害速率估算参与战斗的强度。',
      [`每 10 分钟 ${round(actionsPer10)} 次击杀或助攻`, heroDamagePerMin === null ? '英雄伤害字段缺失' : `每分钟 ${Math.round(heroDamagePerMin)} 英雄伤害`]),
    metric('survival', '生存倾向', 'Survival', survivalScore, matches.length, 1,
      '用死亡频率与 KDA 估算生存稳定性；高分不等于打法一定正确。',
      [`每 10 分钟 ${round(deathsPer10)} 次死亡`, `平均 KDA ${round(kda, 2)}`]),
    metric('teamfight', '团战参与', 'Teamfight', teamfightScore, matches.length, 1,
      '基础接口没有全队击杀，当前使用助攻与战斗事件频率作为参战代理值。',
      [`每 10 分钟 ${round(assistsPer10)} 次助攻`, `每 10 分钟 ${round(actionsPer10)} 次击杀或助攻`]),
    {
      key: 'initiation',
      label: '先手倾向',
      englishLabel: 'Initiation',
      score: null,
      confidence: 'unavailable',
      explanation: '需要逐场解析团战时间线，基础历史列表无法判断谁先进入战斗。',
      evidence: ['未用击杀、死亡或英雄类型伪造先手能力'],
    },
  ]

  const scoreOf = (key: Metric['key']) => metrics.find((item) => item.key === key)?.score ?? 50
  const labels: string[] = []
  if (scoreOf('farm') >= 68 && scoreOf('fight') < 62) labels.push('资源优先型')
  if (scoreOf('fight') >= 68) labels.push('高频打架型')
  if (scoreOf('aggression') >= 68) labels.push('主动施压型')
  if (scoreOf('survival') >= 70) labels.push('稳健生存型')
  if (scoreOf('survival') <= 35) labels.push('高风险型')
  if (scoreOf('teamfight') >= 68) labels.push('团战活跃型')
  if (!labels.length) labels.push('均衡型')

  const ranked = metrics.filter((item) => item.score !== null).sort((a, b) => b.score! - a.score!)
  const strongest = ranked[0]
  const weakest = ranked.at(-1)!
  const summary = `最近 ${matches.length} 场公开比赛里，${strongest.label}最突出，${weakest.label}相对克制。这个结论描述习惯，不评价输赢责任。`

  return {
    accountId,
    generatedAt: new Date().toISOString(),
    profile,
    metrics,
    labels,
    summary,
    matchCount: inputMatches.length,
    validMatchCount: matches.length,
    coverage: round(fieldCoverage * 100, 0),
    record: {
      wins: matches.filter(playerWon).length,
      losses: matches.filter((match) => !playerWon(match)).length,
    },
    averages: {
      kills: round(average(kills)),
      deaths: round(average(deaths)),
      assists: round(average(assists)),
      gpm: gpm === null ? null : Math.round(gpm),
      xpm: xpm === null ? null : Math.round(xpm),
      lastHitsPerMin: lastHitsPerMin === null ? null : round(lastHitsPerMin),
      heroDamagePerMin: heroDamagePerMin === null ? null : Math.round(heroDamagePerMin),
    },
    matches: matches.slice(0, 8),
  }
}
