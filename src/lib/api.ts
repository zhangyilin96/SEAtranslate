import type { HeroHistory, HeroMetadata, PlayerMatch, ProfileResponse } from '../types'
import type { ScoutSource } from '../scout/types'

const API_BASE = (import.meta.env.VITE_OPENDOTA_API_BASE || 'https://api.opendota.com/api').replace(/\/$/, '')
const MATCH_FIELDS = [
  'match_id',
  'player_slot',
  'radiant_win',
  'duration',
  'hero_id',
  'start_time',
  'kills',
  'deaths',
  'assists',
  'gold_per_min',
  'xp_per_min',
  'last_hits',
  'hero_damage',
  'tower_damage',
  'hero_healing',
  'leaver_status',
  'lane',
  'lane_role',
  'is_roaming',
  'lane_efficiency',
  'gold_t',
  'xp_t',
  'lh_t',
  'denies',
]

async function requestJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (response.status === 404) throw new Error('没有找到这个玩家。请检查 ID 是否正确。')
  if (response.status === 429) throw new Error('OpenDota 请求过于频繁，请稍等一分钟再试。')
  if (!response.ok) throw new Error(`OpenDota 暂时不可用（${response.status}），请稍后重试。`)
  return response.json() as Promise<T>
}

export async function fetchPlayerData(accountId: number, signal?: AbortSignal) {
  if (window.dotaScoutDesktop) {
    const desktopRequest = window.dotaScoutDesktop.fetchPlayerData(accountId)
    const result = signal
      ? await Promise.race([
          desktopRequest,
          new Promise<never>((_, reject) => {
            signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
          }),
        ])
      : await desktopRequest

    if (!result.ok) throw new Error(result.error)
    return { profile: result.profile, matches: result.matches }
  }

  const projects = MATCH_FIELDS.map((field) => `project=${field}`).join('&')
  const [profile, matches] = await Promise.all([
    requestJson<ProfileResponse>(`${API_BASE}/players/${accountId}`, signal),
    requestJson<PlayerMatch[]>(`${API_BASE}/players/${accountId}/matches?limit=50&${projects}`, signal),
  ])

  if (!profile.profile) throw new Error('该玩家资料未公开，无法生成画像。')
  if (!Array.isArray(matches) || matches.length === 0) {
    throw new Error('没有可分析的公开比赛。玩家可能隐藏了比赛数据。')
  }
  return { profile, matches }
}

export async function fetchScoutSource(accountId: number, signal?: AbortSignal): Promise<ScoutSource> {
  if (window.dotaScoutDesktop) {
    const result = await window.dotaScoutDesktop.fetchScoutSource(accountId)
    if (!result.ok) throw new Error(result.error)
    return { profile: result.profile, matches: result.matches, heroes: result.heroes }
  }

  const projects = MATCH_FIELDS.map((field) => `project=${field}`).join('&')
  const [profile, matches, heroes] = await Promise.all([
    requestJson<ProfileResponse>(`${API_BASE}/players/${accountId}`, signal),
    requestJson<PlayerMatch[]>(`${API_BASE}/players/${accountId}/matches?limit=50&${projects}`, signal),
    requestJson<HeroHistory[]>(`${API_BASE}/players/${accountId}/heroes`, signal),
  ])
  if (!profile.profile) throw new Error('该玩家资料未公开，无法生成 Scout。')
  if (!matches.length) throw new Error('没有可分析的公开比赛。玩家可能隐藏了比赛数据。')
  return { profile, matches, heroes }
}

export async function fetchHeroMetadata(signal?: AbortSignal): Promise<HeroMetadata[]> {
  if (window.dotaScoutDesktop) {
    const result = await window.dotaScoutDesktop.fetchHeroMetadata()
    if (!result.ok) throw new Error(result.error)
    return result.heroes
  }
  return requestJson<HeroMetadata[]>(`${API_BASE}/heroStats`, signal)
}
