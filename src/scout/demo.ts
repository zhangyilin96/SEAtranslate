import type { HeroHistory, HeroMetadata, PlayerMatch, ProfileResponse } from '../types'
import { buildScoutReport } from './metrics'
import type { RosterPlayer, ScoutReport, ScoutRole } from './types'

export const fallbackHeroes: HeroMetadata[] = [
  [1, 'Anti-Mage', 'antimage'], [2, 'Axe', 'axe'], [3, 'Bane', 'bane'], [8, 'Juggernaut', 'juggernaut'],
  [11, 'Shadow Fiend', 'nevermore'], [13, 'Puck', 'puck'], [17, 'Storm Spirit', 'storm_spirit'],
  [26, 'Lion', 'lion'], [31, 'Lich', 'lich'], [44, 'Phantom Assassin', 'phantom_assassin'],
  [48, 'Luna', 'luna'], [71, 'Spirit Breaker', 'spirit_breaker'], [86, 'Rubick', 'rubick'],
  [87, 'Disruptor', 'disruptor'], [106, 'Ember Spirit', 'ember_spirit'],
].map(([id, localizedName, slug]) => ({
  id: Number(id),
  name: `npc_dota_hero_${slug}`,
  localized_name: String(localizedName),
  img: `/apps/dota2/images/dota_react/heroes/${slug}.png?`,
  icon: `/apps/dota2/images/dota_react/heroes/icons/${slug}.png?`,
}))

const roleLane: Record<ScoutRole, number> = { POS1: 1, MID: 2, POS3: 3, POS4: 3, POS5: 1 }

function demoMatches(player: RosterPlayer, strength: number): PlayerMatch[] {
  return Array.from({ length: 50 }, (_, index) => {
    const duration = 1700 + ((index * 71) % 1200)
    const support = player.role === 'POS4' || player.role === 'POS5'
    const onRole = index < 14 || index % 3 !== 0
    const heroId = index < 7 ? player.heroId : fallbackHeroes[(index + player.slot) % fallbackHeroes.length].id
    const win = index < 10 ? index < Math.round(strength * 10) : (index * 17 + player.slot) % 10 < Math.round(strength * 10)
    return {
      match_id: 9100000000 + player.slot * 100 + index,
      player_slot: index % 2 ? 129 : 2,
      radiant_win: index % 2 ? !win : win,
      duration,
      hero_id: heroId,
      start_time: Math.floor(Date.now() / 1000) - index * 7200,
      kills: support ? 3 + (index % 4) : 7 + (index % 7),
      deaths: 3 + (index % 5),
      assists: support ? 15 + (index % 9) : 8 + (index % 10),
      gold_per_min: support ? 320 + (index % 6) * 18 : 520 + (index % 7) * 23,
      xp_per_min: support ? 430 + (index % 5) * 22 : 610 + (index % 7) * 25,
      last_hits: Math.round((duration / 60) * (support ? 1.4 : 6.4)),
      hero_damage: Math.round((duration / 60) * (support ? 420 : 650)),
      lane_role: onRole ? roleLane[player.role] : ((roleLane[player.role] % 3) + 1),
      is_roaming: player.role === 'POS4' && onRole,
      denies: support ? 2 : 9,
      leaver_status: 0,
    }
  })
}

export function createDemoReports(): ScoutReport[] {
  const heroes = [48, 13, 2, 86, 31, 8, 17, 71, 26, 87]
  const roles: ScoutRole[] = ['POS1', 'MID', 'POS3', 'POS4', 'POS5', 'POS1', 'MID', 'POS3', 'POS4', 'POS5']
  const strengths = [0.6, 0.7, 0.4, 0.6, 0.5, 0.5, 0.8, 0.6, 0.4, 0.7]
  return roles.map((role, slot) => {
    const input: RosterPlayer = { slot, team: slot < 5 ? 'ally' : 'enemy', accountId: 80000000 + slot, role, heroId: heroes[slot] }
    const metadata = fallbackHeroes.find((hero) => hero.id === input.heroId) ?? null
    const matches = demoMatches(input, strengths[slot])
    const profile: ProfileResponse = { profile: { account_id: input.accountId, personaname: ['Moonlight', 'Orbit', 'Timberline', 'Moss', 'North', 'Viper', 'Static', 'Hammer', 'Blink', 'Echo'][slot] } }
    const history: HeroHistory[] = [{ hero_id: input.heroId, games: 35 + slot * 31, win: 20 + slot * 17 }]
    return buildScoutReport(input, profile, matches, history, metadata)
  })
}
