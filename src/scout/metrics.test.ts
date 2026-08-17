import { describe, expect, it } from 'vitest'
import type { HeroHistory, PlayerMatch } from '../types'
import type { HeroMasteryMetric, SampleMetric } from './types'
import {
  buildScoutReport,
  calculateFightActivity,
  calculateLanePerformance,
  calculateLaning,
  calculateRecentForm,
  generateTags,
} from './metrics'

function match(index: number, overrides: Partial<PlayerMatch> = {}): PlayerMatch {
  return {
    match_id: 9000 + index,
    player_slot: index % 2 ? 129 : 2,
    radiant_win: index % 3 !== 0,
    duration: 2100,
    hero_id: 13,
    start_time: 1_700_000_000 - index * 1000,
    kills: 8,
    deaths: 4,
    assists: 14,
    gold_per_min: 580,
    xp_per_min: 650,
    last_hits: 240,
    hero_damage: 24_000,
    lane_role: 2,
    is_roaming: false,
    ...overrides,
  }
}

describe('Scout metrics', () => {
  it('uses exactly the latest ten valid matches for recent form', () => {
    const result = calculateRecentForm(Array.from({ length: 15 }, (_, index) => match(index, { radiant_win: index < 7 })))
    expect(result.sample).toBe(10)
    expect(result.wins! + result.losses!).toBe(10)
  })

  it('marks a lane with fewer than five samples as insufficient', () => {
    const matches = [match(1), match(2), match(3), match(4, { lane_role: 1 })]
    expect(calculateLanePerformance(matches, 'MID')).toMatchObject({ state: 'insufficient', sample: 3 })
  })

  it('does not invent a laning score without parsed early-game curves', () => {
    const result = calculateLaning(Array.from({ length: 10 }, (_, index) => match(index)), 'MID')
    expect(result.state).toBe('unavailable')
    expect(result).not.toHaveProperty('score')
  })

  it('calculates laning only from parsed evidence', () => {
    const parsed = Array.from({ length: 5 }, (_, index) => match(index, {
      lane_efficiency: 0.62,
      gold_t: Array(11).fill(0).map((_, minute) => minute * 360),
      xp_t: Array(11).fill(0).map((_, minute) => minute * 410),
      lh_t: Array(11).fill(0).map((_, minute) => minute * 5),
    }))
    const result = calculateLaning(parsed, 'MID')
    expect(result.state).toBe('available')
    expect(result.score).toBeGreaterThan(0)
    expect(result.score).toBeLessThanOrEqual(100)
  })

  it('bounds fight activity and never uses deaths in its score', () => {
    const highDeaths = calculateFightActivity(Array.from({ length: 20 }, (_, index) => match(index, { deaths: 25 })))
    const lowDeaths = calculateFightActivity(Array.from({ length: 20 }, (_, index) => match(index, { deaths: 0 })))
    expect(highDeaths.score).toBeGreaterThanOrEqual(0)
    expect(highDeaths.score).toBeLessThanOrEqual(100)
    expect(highDeaths.score).toBe(lowDeaths.score)
  })

  it('generates deterministic labels with explicit thresholds', () => {
    const recent: SampleMetric = { state: 'available', confidence: 'high', sample: 10, percent: 80, label: '', explanation: '', evidence: [] }
    const lane: SampleMetric = { state: 'available', confidence: 'high', sample: 12, percent: 60, label: '', explanation: '', evidence: [] }
    const mastery: HeroMasteryMetric = { state: 'available', confidence: 'high', sample: 4, historicalGames: 100, historicalWins: 60, recentGames: 4, recentWins: 3, label: '', explanation: '', evidence: [] }
    const fight: SampleMetric = { state: 'available', confidence: 'high', sample: 12, score: 75, label: '', explanation: '', evidence: [] }
    expect(generateTags(Array.from({ length: 20 }, (_, index) => match(index)), recent, lane, mastery, fight)).toEqual([
      '近期手热',
      '当前英雄熟练',
      '分路熟练',
    ])
  })

  it('builds a report without any overall reliability score', () => {
    const matches = Array.from({ length: 20 }, (_, index) => match(index))
    const history: HeroHistory[] = [{ hero_id: 13, games: 88, win: 52 }]
    const report = buildScoutReport(
      { slot: 0, team: 'ally', accountId: 123, role: 'MID', heroId: 13 },
      { profile: { account_id: 123, personaname: 'Player' } },
      matches,
      history,
      { id: 13, name: 'npc_dota_hero_puck', localized_name: 'Puck', img: '/puck.png', icon: '/puck-icon.png' },
    )
    expect(report.heroMastery.historicalGames).toBe(88)
    expect(report).not.toHaveProperty('score')
  })
})
