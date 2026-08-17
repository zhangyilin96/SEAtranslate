import type { HeroMetadata, PlayerMatch } from '../types'
import { didPlayerWin } from '../scout/metrics'
import type { SampleMetric, ScoutReport } from '../scout/types'

const heroImage = (hero?: HeroMetadata) => hero ? `https://cdn.cloudflare.steamstatic.com${hero.img}` : ''
const laneName = (match: PlayerMatch) => ({ 1: 'SAFE', 2: 'MID', 3: 'OFF', 4: 'JUNGLE' }[match.lane_role ?? 0] ?? '—')
const duration = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
const relativeTime = (timestamp: number) => {
  const hours = Math.max(1, Math.round((Date.now() / 1000 - timestamp) / 3600))
  return hours < 24 ? `${hours} 小时前` : `${Math.round(hours / 24)} 天前`
}

function ExplainMetric({ name, metric }: { name: string; metric: SampleMetric }) {
  return (
    <div className="explain-metric">
      <div><span>{name}</span><strong>{metric.label}</strong><small>{metric.confidence === 'none' ? '无可信度' : `${metric.confidence.toUpperCase()} CONFIDENCE`}</small></div>
      <p>{metric.explanation}</p>
      <ul>{metric.evidence.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  )
}

export function PlayerDetails({ report, heroes, onClose }: { report: ScoutReport; heroes: HeroMetadata[]; onClose(): void }) {
  const heroMap = new Map(heroes.map((hero) => [hero.id, hero]))
  return (
    <aside className="details-drawer">
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer-panel">
        <button className="drawer-close" onClick={onClose}>×</button>
        <header className="detail-hero">
          {report.hero && <img src={heroImage(report.hero)} alt="" />}
          <div><span>{report.input.role} · {report.input.team === 'ally' ? '我方' : '敌方'}</span><h2>{report.hero?.localized_name ?? 'Unknown Hero'}</h2><p>{report.profile.profile?.personaname || report.input.accountId}</p></div>
        </header>
        <div className="detail-summary">
          <div><span>最近状态</span><strong>{report.recentForm.label}</strong></div>
          <div><span>{report.input.role} 表现</span><strong>{report.lanePerformance.label}</strong></div>
          <div><span>英雄历史</span><strong>{report.heroMastery.historicalGames} 场</strong></div>
          <div><span>近期同英雄</span><strong>{report.heroMastery.recentGames ? `${report.heroMastery.recentWins}W ${report.heroMastery.recentGames - report.heroMastery.recentWins}L` : '无样本'}</strong></div>
        </div>
        <section className="detail-section"><h3>计算依据</h3><ExplainMetric name="对线能力" metric={report.laning} /><ExplainMetric name="打架积极性" metric={report.fightActivity} /></section>
        <section className="detail-section">
          <h3>最近比赛</h3>
          <div className="recent-match-list">
            {report.recentMatches.map((match) => {
              const hero = heroMap.get(match.hero_id)
              return (
                <div className="recent-match" key={match.match_id}>
                  <img src={heroImage(hero)} alt="" />
                  <div><strong>{hero?.localized_name ?? `Hero ${match.hero_id}`}</strong><span>{laneName(match)} · {relativeTime(match.start_time)}</span></div>
                  <span className={didPlayerWin(match) ? 'win' : 'loss'}>{didPlayerWin(match) ? '胜' : '负'}</span>
                  <strong>{match.kills ?? '—'} / {match.deaths ?? '—'} / {match.assists ?? '—'}</strong>
                  <span>{duration(match.duration)}</span>
                  <details><summary>高级</summary><small>Match {match.match_id} · GPM {match.gold_per_min ?? '—'}</small></details>
                </div>
              )
            })}
          </div>
        </section>
      </div>
    </aside>
  )
}
