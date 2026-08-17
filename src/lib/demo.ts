import type { PlayerMatch, ProfileResponse } from '../types'

export const demoProfile: ProfileResponse = {
  profile: {
    account_id: 86745912,
    personaname: 'Scout Demo',
    avatarfull: null,
    profileurl: null,
  },
  rank_tier: 72,
}

export const demoMatches: PlayerMatch[] = Array.from({ length: 36 }, (_, index) => {
  const duration = 1850 + ((index * 83) % 920)
  return {
    match_id: 8900000000 + index,
    player_slot: index % 2 ? 129 : 2,
    radiant_win: index % 3 !== 0,
    duration,
    hero_id: 1 + (index % 20),
    start_time: Math.floor(Date.now() / 1000) - index * 86400,
    kills: 7 + (index % 8),
    deaths: 3 + (index % 5),
    assists: 10 + (index % 13),
    gold_per_min: 510 + (index % 9) * 21,
    xp_per_min: 620 + (index % 8) * 24,
    last_hits: Math.round((duration / 60) * (6.3 + (index % 5) * 0.35)),
    hero_damage: Math.round((duration / 60) * (560 + (index % 7) * 42)),
    tower_damage: 1800 + index * 90,
    hero_healing: 0,
    leaver_status: 0,
  }
})
