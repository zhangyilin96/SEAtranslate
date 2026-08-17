import { useState } from 'react'
import type { DotaStatusResult } from '../desktop'
import type { HeroMetadata } from '../types'
import type { RosterPlayer, ScoutReport, ScoutRole, TeamSide } from '../scout/types'

export type RosterDraft = Omit<RosterPlayer, 'accountId'> & { accountId: string }
export type ScoutMode = 'waiting' | 'demo' | 'debug'

const roles: ScoutRole[] = ['POS1', 'MID', 'POS3', 'POS4', 'POS5']
const heroImage = (hero: HeroMetadata | null) => hero ? `https://cdn.cloudflare.steamstatic.com${hero.img}` : ''

export function DebugRoster({ drafts, heroes, errors, loading, onDraftsChange, onAnalyze }: {
  drafts: RosterDraft[]
  heroes: HeroMetadata[]
  errors: Record<number, string>
  loading: boolean
  onDraftsChange(drafts: RosterDraft[]): void
  onAnalyze(): void
}) {
  const [showImport, setShowImport] = useState(false)
  const [paste, setPaste] = useState('')

  function update(slot: number, patch: Partial<RosterDraft>) {
    onDraftsChange(drafts.map((draft) => draft.slot === slot ? { ...draft, ...patch } : draft))
  }

  function importRoster() {
    const lines = paste.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 10)
    const next = drafts.map((draft, index) => {
      const parts = lines[index]?.split(/[\t,，|]+/).map((part) => part.trim()) ?? []
      if (!parts.length) return draft
      const role = roles.includes(parts[1]?.toUpperCase() as ScoutRole) ? parts[1].toUpperCase() as ScoutRole : draft.role
      const heroQuery = parts[2]?.toLowerCase()
      const hero = heroes.find((item) => String(item.id) === heroQuery || item.localized_name.toLowerCase() === heroQuery)
      return { ...draft, accountId: parts[0], role, heroId: hero?.id ?? draft.heroId }
    })
    onDraftsChange(next)
    setShowImport(false)
  }

  return (
    <section className="roster-setup debug-roster">
      <div className="section-title"><div><span>DEBUG INPUT</span><h2>手动输入十名玩家</h2></div><button className="ghost-button" onClick={() => setShowImport((value) => !value)}>一次粘贴</button></div>
      {showImport && <div className="paste-panel"><textarea value={paste} onChange={(event) => setPaste(event.target.value)} placeholder={'每行：Account ID, 位置, 英雄名\n前 5 行我方，后 5 行敌方'} /><button onClick={importRoster}>应用调试阵容</button></div>}
      <div className="roster-teams">
        {(['ally', 'enemy'] as TeamSide[]).map((team) => <div className={`roster-team ${team}`} key={team}>
          <h3>{team === 'ally' ? '我方' : '敌方'} <small>{team === 'ally' ? 'ALLY' : 'ENEMY'}</small></h3>
          {drafts.filter((draft) => draft.team === team).map((draft) => <div className="roster-input-row" key={draft.slot}>
            <select value={draft.role} aria-label={`位置 ${draft.slot + 1}`} onChange={(event) => update(draft.slot, { role: event.target.value as ScoutRole })}>{roles.map((role) => <option key={role}>{role}</option>)}</select>
            <input value={draft.accountId} aria-label={`玩家 ID ${draft.slot + 1}`} onChange={(event) => update(draft.slot, { accountId: event.target.value })} placeholder="Account ID" />
            <select value={draft.heroId} aria-label={`英雄 ${draft.slot + 1}`} onChange={(event) => update(draft.slot, { heroId: Number(event.target.value) })}>{heroes.map((hero) => <option value={hero.id} key={hero.id}>{hero.localized_name}</option>)}</select>
            {errors[draft.slot] && <span className="row-error" title={errors[draft.slot]}>!</span>}
          </div>)}
        </div>)}
      </div>
      <div className="debug-submit"><button className="primary-button" disabled={loading} onClick={onAnalyze}>{loading ? '正在查询真实 OpenDota 数据…' : '运行手动调试分析'}</button><span>结果将标记为 DEBUG，不会标记 LIVE。</span></div>
    </section>
  )
}

function MetricCell({ title, value, sub, unavailable = false }: { title: string; value: string; sub?: string; unavailable?: boolean }) {
  return <div className={`scout-metric ${unavailable ? 'metric-na' : ''}`}><small>{title}</small><strong>{value}</strong>{sub && <span>{sub}</span>}</div>
}

function PlayerRow({ report, onSelect }: { report: ScoutReport; onSelect(report: ScoutReport): void }) {
  const name = report.profile.profile?.personaname || `Player ${report.input.accountId}`
  const mastery = report.heroMastery
  const heroRecent = mastery.recentGames ? `${mastery.recentWins}W ${mastery.recentGames - mastery.recentWins}L` : '近期无样本'
  return <button className="scout-player" onClick={() => onSelect(report)}>
    <div className="player-identity"><span className="role-chip">{report.input.role}</span><img src={heroImage(report.hero)} alt="" /><div><strong>{report.hero?.localized_name ?? `Hero ${report.input.heroId}`}</strong><span>{name} · ID {report.input.accountId}</span></div></div>
    <MetricCell title="最近 10 场" value={report.recentForm.label} sub={`${report.recentForm.sample} 场公开样本`} />
    <MetricCell title="当前分路" value={report.lanePerformance.label} sub={report.lanePerformance.state === 'available' ? `${report.input.role} · ${report.lanePerformance.sample} 场` : report.lanePerformance.explanation} unavailable={report.lanePerformance.state !== 'available'} />
    <MetricCell title="当前英雄" value={mastery.label} sub={heroRecent} unavailable={mastery.state !== 'available'} />
    <MetricCell title="对线能力" value={report.laning.label} sub={report.laning.state === 'available' ? `${report.laning.sample} 场解析` : '缺少回放时间线'} unavailable={report.laning.state !== 'available'} />
    <MetricCell title="打架积极性" value={report.fightActivity.label} sub={`${report.fightActivity.sample} 场代理值`} unavailable={report.fightActivity.state !== 'available'} />
    <div className="style-tags">{report.tags.length ? report.tags.map((tag) => <span key={tag}>{tag}</span>) : <span className="muted-tag">暂无强标签</span>}</div><span className="row-arrow">›</span>
  </button>
}

function WaitingState({ dotaStatus, onDemo }: { dotaStatus: DotaStatusResult | null; onDemo(): void }) {
  const running = dotaStatus?.ok && dotaStatus.isRunning
  return <section className="waiting-match">
    <div className="waiting-signal"><i className={running ? 'running' : ''} /><div><span>{running ? 'DOTA 2 PROCESS DETECTED' : 'WAITING FOR DOTA 2'}</span><h2>{running ? '已检测到 Dota 2，但尚不能可靠取得十人身份' : '尚未检测到当前比赛'}</h2><p>{running ? '当前版本会保持等待，不会用演示数据冒充扫描结果。' : '进入 Dota 2 后，本程序会检测游戏进程；十人 Account ID 自动识别仍在技术验证。'}</p></div></div>
    <div className="detection-pipeline">
      <div className={running ? 'done' : ''}><b>01</b><span>检测 Dota 2<small>{running ? '已检测到进程' : '等待游戏启动'}</small></span></div>
      <div className="blocked"><b>02</b><span>取得十人 Account ID<small>技术验证未完成</small></span></div>
      <div><b>03</b><span>OpenDota 分析<small>等待可靠玩家 ID</small></span></div>
      <div><b>04</b><span>Scout Report<small>尚未生成</small></span></div>
    </div>
    <div className="truth-notice"><strong>为什么没有自动显示十个人？</strong><p>普通玩家视角的 Dota GSI 不能可靠提供完整十人身份；屏幕上的玩家名也无法唯一映射 Account ID。在 Overwolf roster 或其他合规来源完成真实对局验证前，本页不会标记 LIVE。</p></div>
    <button className="ghost-button" onClick={onDemo}>加载明确标注的演示数据</button>
  </section>
}

export function MatchScout({ reports, mode, dotaStatus, onDemo, onSelect, onToggleOverlay, onExit }: {
  reports: ScoutReport[]
  mode: ScoutMode
  dotaStatus: DotaStatusResult | null
  onDemo(): void
  onSelect(report: ScoutReport): void
  onToggleOverlay(): void
  onExit(): void
}) {
  const hasReports = reports.length > 0
  return <div className="match-scout-page">
    <header className="page-header"><div><span className="overline">MATCH SCOUT / PAUSED</span><h1>当前比赛玩家侦察。</h1><p>本阶段暂停开发，只保留真实性状态和 Debug 数据入口。</p></div><div className="header-actions"><button className="ghost-button" onClick={onDemo}>加载演示</button><button className="ghost-button" disabled={!hasReports} onClick={onToggleOverlay}>Ctrl+Shift+F7 显示悬浮窗</button><button className="primary-button unreleased-button" disabled title="当前独立版尚无可靠的十人 Account ID 来源">扫描当前比赛 · 技术验证暂停</button></div></header>

    {mode === 'waiting' && <WaitingState dotaStatus={dotaStatus} onDemo={onDemo} />}
    {hasReports && mode !== 'waiting' && <>
      <div className={`data-mode-banner ${mode}`}><strong>{mode === 'demo' ? 'DEMO / SAMPLE MATCH' : 'DEBUG / MANUAL INPUT'}</strong><span>{mode === 'demo' ? '以下全部为演示数据，不是当前 Dota 比赛。' : '玩家 ID 由开发调试入口手动提供，不是自动扫描结果。'}</span></div>
      <section className="scout-board">
        <div className="board-head"><span>玩家 / 英雄</span><span>最近状态</span><span>当前分路</span><span>英雄熟练</span><span>对线</span><span>打架</span><span>风格</span></div>
        {(['ally', 'enemy'] as TeamSide[]).map((team) => <div className={`scout-team ${team}`} key={team}><div className="team-label"><strong>{team === 'ally' ? '我方' : '敌方'}</strong><span>{team === 'ally' ? 'ALLY TEAM' : 'ENEMY TEAM'}</span></div>{reports.filter((report) => report.input.team === team).map((report) => <PlayerRow key={report.input.slot} report={report} onSelect={onSelect} />)}</div>)}
        <button className="edit-roster" onClick={onExit}>退出{mode === 'demo' ? '演示' : '调试'}，返回等待比赛</button>
      </section>
    </>}
  </div>
}
