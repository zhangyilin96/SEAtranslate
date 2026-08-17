import type { HeroHistory, HeroMetadata, PlayerMatch, ProfileResponse } from '../types'

export type TeamSide = 'ally' | 'enemy'
export type ScoutRole = 'POS1' | 'MID' | 'POS3' | 'POS4' | 'POS5'
export type MetricState = 'available' | 'insufficient' | 'unavailable'
export type MetricConfidence = 'high' | 'medium' | 'low' | 'none'

export type RosterPlayer = {
  slot: number
  team: TeamSide
  accountId: number
  role: ScoutRole
  heroId: number
}

export type SampleMetric = {
  state: MetricState
  confidence: MetricConfidence
  sample: number
  wins?: number
  losses?: number
  percent?: number
  score?: number
  label: string
  explanation: string
  evidence: string[]
}

export type HeroMasteryMetric = SampleMetric & {
  historicalGames: number
  historicalWins: number
  recentGames: number
  recentWins: number
}

export type ScoutTag =
  | '近期手热'
  | '当前英雄熟练'
  | '分路熟练'
  | '高频参战'
  | '偏刷'
  | '偏主动'
  | '偏保守'
  | '非常用分路'

export type ScoutReport = {
  input: RosterPlayer
  profile: ProfileResponse
  hero: HeroMetadata | null
  recentForm: SampleMetric
  lanePerformance: SampleMetric
  heroMastery: HeroMasteryMetric
  laning: SampleMetric
  fightActivity: SampleMetric
  tags: ScoutTag[]
  recentMatches: PlayerMatch[]
  generatedAt: string
}

export type ScoutSource = {
  profile: ProfileResponse
  matches: PlayerMatch[]
  heroes: HeroHistory[]
}
