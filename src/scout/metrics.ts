import type { HeroHistory, HeroMetadata, PlayerMatch, ProfileResponse } from '../types'
import type {
  HeroMasteryMetric,
  MetricConfidence,
  RosterPlayer,
  SampleMetric,
  ScoutReport,
  ScoutRole,
  ScoutTag,
} from './types'

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const scale = (value: number, low: number, high: number) => clamp(((value - low) / (high - low)) * 100)
const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length
const round = (value: number, digits = 0) => Number(value.toFixed(digits))
const numberValue = (value: number | null | undefined): value is number => Number.isFinite(value)

export function didPlayerWin(match: PlayerMatch) {
  return (match.player_slot < 128) === match.radiant_win
}

function record(matches: PlayerMatch[]) {
  const wins = matches.filter(didPlayerWin).length
  return { wins, losses: matches.length - wins, percent: Math.round((wins / matches.length) * 100) }
}

function sampleConfidence(sample: number, high = 10, medium = 5): MetricConfidence {
  if (sample >= high) return 'high'
  if (sample >= medium) return 'medium'
  if (sample > 0) return 'low'
  return 'none'
}

function lastHitsPerMinute(match: PlayerMatch) {
  return ((match.last_hits ?? 0) / Math.max(match.duration, 1)) * 60
}

export function matchesRole(match: PlayerMatch, role: ScoutRole) {
  const laneRole = match.lane_role
  const lhPerMin = lastHitsPerMinute(match)
  if (role === 'MID') return laneRole === 2
  if (role === 'POS1') return laneRole === 1 && lhPerMin >= 3.5
  if (role === 'POS5') return laneRole === 1 && lhPerMin < 3.5
  if (role === 'POS3') return laneRole === 3 && lhPerMin >= 3
  return Boolean(match.is_roaming) || (laneRole === 3 && lhPerMin < 3)
}

export function calculateRecentForm(matches: PlayerMatch[]): SampleMetric {
  const sampleMatches = matches.filter((match) => match.duration >= 300).slice(0, 10)
  if (!sampleMatches.length) {
    return { state: 'unavailable', confidence: 'none', sample: 0, label: '无公开比赛', explanation: '没有可用的最近比赛。', evidence: [] }
  }
  const result = record(sampleMatches)
  return {
    state: 'available',
    confidence: sampleConfidence(sampleMatches.length, 10, 8),
    sample: sampleMatches.length,
    ...result,
    label: `${result.wins}W ${result.losses}L / ${result.percent}%`,
    explanation: `直接统计最近 ${sampleMatches.length} 场公开比赛，不做段位或英雄修正。`,
    evidence: [`样本 ${sampleMatches.length}/10 场`],
  }
}

export function calculateLanePerformance(matches: PlayerMatch[], role: ScoutRole): SampleMetric {
  const roleMatches = matches.filter((match) => match.duration >= 300 && matchesRole(match, role)).slice(0, 20)
  if (roleMatches.length < 5) {
    return {
      state: 'insufficient',
      confidence: sampleConfidence(roleMatches.length),
      sample: roleMatches.length,
      label: roleMatches.length ? `${roleMatches.length} 场 · 样本不足` : '无可识别样本',
      explanation: '分路由 lane_role、is_roaming 与补刀速率共同推断；少于 5 场不输出精确胜率。',
      evidence: [`识别到 ${roleMatches.length} 场 ${role}`],
    }
  }
  const result = record(roleMatches)
  return {
    state: 'available',
    confidence: sampleConfidence(roleMatches.length, 12, 5),
    sample: roleMatches.length,
    ...result,
    label: `${result.wins}W ${result.losses}L / ${result.percent}%`,
    explanation: `最近 50 场中筛选最多 20 场 ${role} 样本；位置为公开字段加资源分配启发式。`,
    evidence: [`${roleMatches.length} 场 ${role}`, 'lane_role + is_roaming + 每分钟补刀'],
  }
}

export function calculateHeroMastery(matches: PlayerMatch[], history: HeroHistory[], heroId: number): HeroMasteryMetric {
  const historical = history.find((item) => item.hero_id === heroId)
  const recent = matches.filter((match) => match.hero_id === heroId).slice(0, 20)
  const recentRecord = recent.length ? record(recent) : { wins: 0, losses: 0, percent: 0 }
  const historicalGames = historical?.games ?? 0
  const state = historicalGames > 0 ? 'available' : 'unavailable'
  return {
    state,
    confidence: historicalGames >= 50 ? 'high' : historicalGames >= 15 ? 'medium' : historicalGames > 0 ? 'low' : 'none',
    sample: recent.length,
    historicalGames,
    historicalWins: historical?.win ?? 0,
    recentGames: recent.length,
    recentWins: recentRecord.wins,
    wins: recentRecord.wins,
    losses: recentRecord.losses,
    percent: recent.length ? recentRecord.percent : undefined,
    label: historicalGames ? `历史 ${historicalGames} 场` : '无公开英雄历史',
    explanation: '历史总场次表示熟悉程度；近期同英雄胜负只描述最近手感，两者不合并成总分。',
    evidence: [
      `历史 ${historicalGames} 场 / ${historical?.win ?? 0} 胜`,
      recent.length ? `近期 ${recent.length} 场 / ${recentRecord.wins} 胜` : '最近 50 场没有使用当前英雄',
    ],
  }
}

const laneRanges: Record<ScoutRole, { gold: [number, number]; xp: [number, number]; lh: [number, number] }> = {
  POS1: { gold: [2500, 5200], xp: [2500, 5600], lh: [25, 85] },
  MID: { gold: [2600, 5200], xp: [3000, 6200], lh: [30, 80] },
  POS3: { gold: [2200, 4700], xp: [2500, 5600], lh: [20, 70] },
  POS4: { gold: [1300, 3300], xp: [1800, 4400], lh: [0, 28] },
  POS5: { gold: [1200, 3100], xp: [1700, 4200], lh: [0, 22] },
}

function minuteTen(values: number[] | null | undefined) {
  return values && values.length > 10 && numberValue(values[10]) ? values[10] : null
}

export function calculateLaning(matches: PlayerMatch[], role: ScoutRole): SampleMetric {
  const ranges = laneRanges[role]
  const scored = matches
    .filter((match) => matchesRole(match, role))
    .map((match) => {
      const components: Array<{ score: number; weight: number; evidence: string }> = []
      if (numberValue(match.lane_efficiency)) components.push({ score: scale(match.lane_efficiency, 0.35, 0.75), weight: 0.5, evidence: `对线效率 ${Math.round(match.lane_efficiency * 100)}%` })
      const gold10 = minuteTen(match.gold_t)
      const xp10 = minuteTen(match.xp_t)
      const lh10 = minuteTen(match.lh_t)
      if (gold10 !== null) components.push({ score: scale(gold10, ...ranges.gold), weight: 0.25, evidence: `10 分钟经济 ${gold10}` })
      if (xp10 !== null) components.push({ score: scale(xp10, ...ranges.xp), weight: 0.15, evidence: `10 分钟经验 ${xp10}` })
      if (lh10 !== null) components.push({ score: scale(lh10, ...ranges.lh), weight: 0.1, evidence: `10 分钟补刀 ${lh10}` })
      if (!components.length || (!numberValue(match.lane_efficiency) && components.length < 2)) return null
      const totalWeight = components.reduce((sum, item) => sum + item.weight, 0)
      return { score: components.reduce((sum, item) => sum + item.score * item.weight, 0) / totalWeight, evidence: components.map((item) => item.evidence) }
    })
    .filter((item): item is { score: number; evidence: string[] } => item !== null)
    .slice(0, 10)

  if (scored.length < 3) {
    return {
      state: 'unavailable',
      confidence: 'none',
      sample: scored.length,
      label: '—',
      explanation: '基础历史接口没有 10 分钟曲线；至少需要 3 场已解析 replay 才计算对线能力。',
      evidence: [`可用解析样本 ${scored.length}/3`, '未使用整场 KDA 替代对线数据'],
    }
  }

  const score = Math.round(average(scored.map((item) => item.score)))
  return {
    state: 'available',
    confidence: sampleConfidence(scored.length, 8, 5),
    sample: scored.length,
    score,
    label: `${score} / 100`,
    explanation: '对线效率 50%、10 分钟经济 25%、经验 15%、补刀 10%；缺项后按剩余权重归一。',
    evidence: [`${scored.length} 场已解析对线样本`, ...scored[0].evidence],
  }
}

export function calculateFightActivity(matches: PlayerMatch[]): SampleMetric {
  const samples = matches.filter((match) => match.duration >= 300).slice(0, 20)
  if (samples.length < 5) {
    return { state: 'insufficient', confidence: sampleConfidence(samples.length), sample: samples.length, label: '样本不足', explanation: '至少需要 5 场正常比赛。', evidence: [`样本 ${samples.length}/5 场`] }
  }

  const actionsPer10 = average(samples.map((match) => (((match.kills ?? 0) + (match.assists ?? 0)) / match.duration) * 600))
  const damageSamples = samples.filter((match) => numberValue(match.hero_damage))
  const damagePerMin = damageSamples.length
    ? average(damageSamples.map((match) => (match.hero_damage! / match.duration) * 60))
    : null
  const actionScore = scale(actionsPer10, 2.5, 9)
  const score = damagePerMin === null ? actionScore : actionScore * 0.6 + scale(damagePerMin, 250, 900) * 0.4
  const roundedScore = Math.round(score)
  const coverage = damageSamples.length / samples.length
  return {
    state: 'available',
    confidence: coverage >= 0.8 && samples.length >= 10 ? 'high' : coverage >= 0.5 ? 'medium' : 'low',
    sample: samples.length,
    score: roundedScore,
    label: `${roundedScore} / 100`,
    explanation: '每 10 分钟击杀+助攻频率占 60%，每分钟英雄伤害占 40%；不是 KDA，也不等同于真实参战率。',
    evidence: [
      `每 10 分钟 ${round(actionsPer10, 1)} 次击杀或助攻`,
      damagePerMin === null ? '英雄伤害字段缺失' : `每分钟 ${Math.round(damagePerMin)} 英雄伤害`,
    ],
  }
}

export function generateTags(
  matches: PlayerMatch[],
  recent: SampleMetric,
  lane: SampleMetric,
  mastery: HeroMasteryMetric,
  fight: SampleMetric,
): ScoutTag[] {
  const tags: ScoutTag[] = []
  if ((recent.percent ?? 0) >= 70 && recent.sample >= 8) tags.push('近期手热')
  if (mastery.historicalGames >= 50 && mastery.recentGames >= 3) tags.push('当前英雄熟练')
  if (lane.state === 'available' && lane.sample >= 10) tags.push('分路熟练')
  if (lane.state !== 'available' && matches.length >= 20) tags.push('非常用分路')
  if ((fight.score ?? 0) >= 70 && fight.sample >= 8) tags.push('高频参战')

  const normalMatches = matches.filter((match) => match.duration >= 300).slice(0, 20)
  if (normalMatches.length) {
    const avgGpm = average(normalMatches.map((match) => match.gold_per_min ?? 0))
    const killsPer10 = average(normalMatches.map((match) => ((match.kills ?? 0) / match.duration) * 600))
    const deathsPer10 = average(normalMatches.map((match) => ((match.deaths ?? 0) / match.duration) * 600))
    if (avgGpm >= 550 && (fight.score ?? 50) < 50) tags.push('偏刷')
    if ((fight.score ?? 0) >= 62 && killsPer10 >= 1.5) tags.push('偏主动')
    if ((fight.score ?? 100) <= 38 && deathsPer10 <= 2.5) tags.push('偏保守')
  }
  return tags.slice(0, 3)
}

export function buildScoutReport(
  input: RosterPlayer,
  profile: ProfileResponse,
  matches: PlayerMatch[],
  heroHistory: HeroHistory[],
  heroMetadata: HeroMetadata | null,
): ScoutReport {
  const recentForm = calculateRecentForm(matches)
  const lanePerformance = calculateLanePerformance(matches, input.role)
  const heroMastery = calculateHeroMastery(matches, heroHistory, input.heroId)
  const laning = calculateLaning(matches, input.role)
  const fightActivity = calculateFightActivity(matches)
  return {
    input,
    profile,
    hero: heroMetadata,
    recentForm,
    lanePerformance,
    heroMastery,
    laning,
    fightActivity,
    tags: generateTags(matches, recentForm, lanePerformance, heroMastery, fightActivity),
    recentMatches: matches.slice(0, 12),
    generatedAt: new Date().toISOString(),
  }
}
