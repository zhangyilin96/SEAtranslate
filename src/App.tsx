import { useEffect, useMemo, useState } from 'react'
import { DebugRoster, MatchScout, type RosterDraft, type ScoutMode } from './components/MatchScout'
import { PlayerDetails } from './components/PlayerDetails'
import { LiveTranslate } from './components/LiveTranslate'
import { Settings } from './components/Settings'
import { fetchHeroMetadata, fetchScoutSource } from './lib/api'
import { normalizeAccountId } from './lib/identity'
import { createDemoReports, fallbackHeroes } from './scout/demo'
import { buildScoutReport } from './scout/metrics'
import type { ScoutReport } from './scout/types'
import type { HeroMetadata } from './types'
import type { DotaStatusResult } from './desktop'

type View = 'match' | 'translate' | 'details' | 'settings'
const REPORT_CACHE = 'dota-scout:match-reports-v2'
const DRAFT_CACHE = 'dota-scout:roster-drafts-v2'
const defaultHeroes = [48, 13, 2, 86, 31, 8, 17, 71, 26, 87]
const defaultRoles = ['POS1', 'MID', 'POS3', 'POS4', 'POS5'] as const

const initialDrafts: RosterDraft[] = Array.from({ length: 10 }, (_, slot) => ({
  slot,
  team: slot < 5 ? 'ally' : 'enemy',
  accountId: '',
  role: defaultRoles[slot % 5],
  heroId: defaultHeroes[slot],
}))

async function mapWithLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (cursor < items.length) {
      const index = cursor++
      results[index] = await work(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

function App() {
  const [view, setView] = useState<View>('match')
  const [heroes, setHeroes] = useState<HeroMetadata[]>(fallbackHeroes)
  const [drafts, setDrafts] = useState<RosterDraft[]>(() => {
    try { return JSON.parse(localStorage.getItem(DRAFT_CACHE) || 'null') || initialDrafts } catch { return initialDrafts }
  })
  const [reports, setReports] = useState<ScoutReport[]>([])
  const [mode, setMode] = useState<ScoutMode>('waiting')
  const [dotaStatus, setDotaStatus] = useState<DotaStatusResult | null>(null)
  const [selected, setSelected] = useState<ScoutReport | null>(null)
  const [errors, setErrors] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    localStorage.removeItem(REPORT_CACHE)
    const controller = new AbortController()
    fetchHeroMetadata(controller.signal)
      .then((items) => setHeroes(items.sort((a, b) => a.localized_name.localeCompare(b.localized_name))))
      .catch(() => setHeroes(fallbackHeroes))
    return () => controller.abort()
  }, [])

  useEffect(() => {
    let active = true
    async function poll() {
      const result = await window.dotaScoutDesktop?.getDotaStatus()
      if (active && result) setDotaStatus(result)
    }
    void poll()
    const timer = window.setInterval(poll, 3000)
    return () => { active = false; window.clearInterval(timer) }
  }, [])

  useEffect(() => { localStorage.setItem(DRAFT_CACHE, JSON.stringify(drafts)) }, [drafts])
  useEffect(() => { void window.dotaScoutDesktop?.updateOverlay({ reports, diagnostic: false }) }, [reports])

  const selectedForDetails = selected ?? reports[0] ?? null
  const statusText = useMemo(() => mode === 'demo' ? 'DEMO DATA' : mode === 'debug' ? 'DEBUG DATA' : dotaStatus?.ok && dotaStatus.isRunning ? 'DOTA DETECTED / IDS UNAVAILABLE' : 'WAITING FOR MATCH', [dotaStatus, mode])

  async function analyzeRoster() {
    const nextErrors: Record<number, string> = {}
    const valid = drafts.flatMap((draft) => {
      if (!draft.accountId.trim()) {
        nextErrors[draft.slot] = '请输入玩家 ID'
        return []
      }
      try { return [{ ...draft, accountId: normalizeAccountId(draft.accountId) }] }
      catch (error) { nextErrors[draft.slot] = error instanceof Error ? error.message : 'ID 无效'; return [] }
    })
    setErrors(nextErrors)
    if (!valid.length) return

    setLoading(true)
    const heroMap = new Map(heroes.map((hero) => [hero.id, hero]))
    try {
      const analyzed = await mapWithLimit(valid, 3, async (input) => {
        try {
          const source = await fetchScoutSource(input.accountId)
          return buildScoutReport(input, source.profile, source.matches, source.heroes, heroMap.get(input.heroId) ?? null)
        } catch (error) {
          setErrors((current) => ({ ...current, [input.slot]: error instanceof Error ? error.message : '分析失败' }))
          return null
        }
      })
      const completed = analyzed.filter((report): report is ScoutReport => report !== null).sort((a, b) => a.input.slot - b.input.slot)
      setReports(completed)
      if (completed.length) {
        setMode('debug')
        setView('match')
      }
    } finally {
      setLoading(false)
    }
  }

  function loadDemo() {
    const demo = createDemoReports()
    setReports(demo)
    setMode('demo')
    setSelected(null)
    setErrors({})
  }

  function chooseReport(report: ScoutReport) {
    setSelected(report)
  }

  function exitReport() {
    setReports([])
    setSelected(null)
    setMode('waiting')
    void window.dotaScoutDesktop?.updateOverlay({ reports: [], diagnostic: false })
  }

  return (
    <div className="app-shell">
      <aside className="app-nav">
        <div className="app-brand"><span>DS</span><div>DOTA SCOUT<small>COMPANION / V0.3</small></div></div>
        <nav>
          <button className={view === 'match' ? 'active' : ''} onClick={() => setView('match')}><b>01</b><span>MATCH SCOUT<small>双方十人</small></span></button>
          <button className={view === 'translate' ? 'active' : ''} onClick={() => setView('translate')}><b>02</b><span>LIVE TRANSLATE<small>聊天翻译</small></span></button>
          <button className={view === 'details' ? 'active' : ''} disabled={!selectedForDetails} onClick={() => setView('details')}><b>03</b><span>PLAYER DETAILS<small>单人详情</small></span></button>
          <button className={view === 'settings' ? 'active' : ''} onClick={() => setView('settings')}><b>04</b><span>SETTINGS<small>Overlay / OCR</small></span></button>
        </nav>
        <div className="nav-status"><i /><span>{statusText}</span><small>PUBLIC DATA ONLY</small></div>
      </aside>

      <main className="app-content">
        {view === 'match' && (
          <MatchScout
            reports={reports}
            mode={mode}
            dotaStatus={dotaStatus}
            onDemo={loadDemo}
            onSelect={chooseReport}
            onToggleOverlay={() => { void window.dotaScoutDesktop?.updateOverlay({ reports, diagnostic: false }).then(() => window.dotaScoutDesktop?.toggleOverlay()) }}
            onExit={exitReport}
          />
        )}
        {view === 'translate' && <LiveTranslate />}
        {view === 'settings' && <Settings debugTools={<DebugRoster drafts={drafts} heroes={heroes} errors={errors} loading={loading} onDraftsChange={setDrafts} onAnalyze={analyzeRoster} />} />}
        {view === 'details' && selectedForDetails && <PlayerDetails report={selectedForDetails} heroes={heroes} onClose={() => setView('match')} />}
      </main>
      {selected && view === 'match' && <PlayerDetails report={selected} heroes={heroes} onClose={() => setSelected(null)} />}
    </div>
  )
}

export default App
