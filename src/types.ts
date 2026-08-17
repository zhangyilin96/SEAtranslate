export type ProfileResponse = {
  profile?: {
    account_id: number
    personaname?: string | null
    avatarfull?: string | null
    profileurl?: string | null
  } | null
  rank_tier?: number | null
  leaderboard_rank?: number | null
}

export type PlayerMatch = {
  match_id: number
  player_slot: number
  radiant_win: boolean
  duration: number
  hero_id: number
  start_time: number
  kills?: number | null
  deaths?: number | null
  assists?: number | null
  gold_per_min?: number | null
  xp_per_min?: number | null
  last_hits?: number | null
  hero_damage?: number | null
  tower_damage?: number | null
  hero_healing?: number | null
  leaver_status?: number | null
  lane?: number | null
  lane_role?: number | null
  is_roaming?: boolean | null
  lane_efficiency?: number | null
  gold_t?: number[] | null
  xp_t?: number[] | null
  lh_t?: number[] | null
  denies?: number | null
}

export type HeroHistory = {
  hero_id: number
  last_played?: number
  games: number
  win: number
}

export type HeroMetadata = {
  id: number
  name: string
  localized_name: string
  img: string
  icon: string
}

export type MetricKey =
  | 'aggression'
  | 'farm'
  | 'fight'
  | 'survival'
  | 'teamfight'
  | 'initiation'

export type Metric = {
  key: MetricKey
  label: string
  englishLabel: string
  score: number | null
  confidence: 'high' | 'medium' | 'low' | 'unavailable'
  explanation: string
  evidence: string[]
}

export type Analysis = {
  accountId: number
  generatedAt: string
  profile: ProfileResponse
  metrics: Metric[]
  labels: string[]
  summary: string
  matchCount: number
  validMatchCount: number
  coverage: number
  record: { wins: number; losses: number }
  averages: {
    kills: number
    deaths: number
    assists: number
    gpm: number | null
    xpm: number | null
    lastHitsPerMin: number | null
    heroDamagePerMin: number | null
  }
  matches: PlayerMatch[]
}
