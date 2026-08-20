import { useEffect, useState } from 'react'
import type { GameBarBridgeResult, TranslationLine, WorkerState } from '../desktop'
import { readSavedRegion, type SavedCaptureRegion } from '../translate/region'

const API_KEY = 'dota-scout:google-translate-key-v1'

export function LiveTranslate() {
  const [region, setRegion] = useState<SavedCaptureRegion | null>(readSavedRegion)
  const [worker, setWorker] = useState<WorkerState>({ configured: Boolean(region), running: false, status: region ? 'OCR READY' : '聊天翻译未配置' })
  const [lines, setLines] = useState<TranslationLine[]>([])
  const [foreground, setForeground] = useState(false)
  const [liveOcrEnabled, setLiveOcrEnabled] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY) || '')
  const [gameBar, setGameBar] = useState<GameBarBridgeResult | null>(null)
  const [toggleError, setToggleError] = useState('')

  useEffect(() => {
    const removePayload = window.dotaScoutDesktop?.onOverlayPayload((payload) => setLines(payload.translations))
    const removeWorker = window.dotaScoutDesktop?.onWorkerState(setWorker)
    const removeRegion = window.dotaScoutDesktop?.onRegionChanged((next) => setRegion(next as SavedCaptureRegion | null))
    const removeForeground = window.dotaScoutDesktop?.onForegroundState((state) => setForeground(state.foreground))
    const removeGameBar = window.dotaScoutDesktop?.onGameBarState(setGameBar)
    void window.dotaScoutDesktop?.getOverlayState().then((state) => state.ok && setLines(state.payload.translations))
    void window.dotaScoutDesktop?.getCompanionState().then((state) => {
      setForeground(state.dotaForeground)
      setLiveOcrEnabled(state.liveOcrEnabled)
    })
    void window.dotaScoutDesktop?.getGameBarState().then(setGameBar)
    return () => { removePayload?.(); removeWorker?.(); removeRegion?.(); removeForeground?.(); removeGameBar?.() }
  }, [])

  async function toggleLiveTranslate() {
    setToggleError('')
    try {
      const state = await window.dotaScoutDesktop?.setLiveTranslateEnabled(!liveOcrEnabled)
      if (!state) throw new Error('Desktop 后台服务不可用。')
      setLiveOcrEnabled(state.liveOcrEnabled)
    } catch (error) {
      setToggleError(error instanceof Error ? error.message : '实时翻译启停失败。')
    }
  }

  return (
    <div className="translate-page">
      <header className="page-header"><div><span className="overline">LIVE TRANSLATE / BACKGROUND COMPANION</span><h1>{liveOcrEnabled ? '进游戏就开始听。' : '实时翻译由你控制。'}</h1><p>{liveOcrEnabled ? '控制面板不需要保持打开。Dota 进入前台后，后台引擎自动读取已保存的固定聊天区域。' : '选择聊天区域后点击开启；设置会保存，之后启动 Dota Scout 时自动恢复。'}</p></div></header>
      <section className="translate-console">
        <div className="overlay-verification"><strong>Xbox Game Bar：实机验证通过</strong><p>全屏可见、click-through、Dota focus 与鼠标流畅度均已由用户确认。</p><span>实时翻译只读取用户框选的屏幕区域，不进入或读取 Dota 进程。</span></div>
        <div className="translate-controls">
          <span className={`status-pill ${worker.running ? 'active' : ''}`}>{liveOcrEnabled ? worker.status : '实时翻译已暂停'}</span>
          <button className="ghost-button" onClick={() => void window.dotaScoutDesktop?.openRegionSelector()}>{region ? 'Ctrl+Shift+F8 重新选择' : 'Ctrl+Shift+F8 设置区域'}</button>
          <button className="primary-button" disabled={!region} onClick={() => void toggleLiveTranslate()}>{liveOcrEnabled ? '暂停实时翻译' : '开启实时翻译'}</button>
        </div>
        <div className="companion-readiness">
          <span className={foreground ? 'ready' : ''}><b>01</b>Dota 前台<strong>{foreground ? '已检测' : '等待中'}</strong></span>
          <span className={region ? 'ready' : ''}><b>02</b>固定 OCR 区域<strong>{region ? '已保存' : '未配置'}</strong></span>
          <span className={worker.running ? 'ready' : ''}><b>03</b>后台翻译<strong>{liveOcrEnabled ? (worker.running ? '运行中' : '待机') : '性能测试中暂停'}</strong></span>
        </div>
        {region && <div className="active-region-note"><strong>固定读取区域</strong><span>{region.displayName} · {region.captureWidth}×{region.captureHeight} · X {region.pixelX} · Y {region.pixelY} · W {region.pixelWidth} · H {region.pixelHeight}</span></div>}
        {worker.running && <div className="active-region-note"><strong>本轮性能</strong><span>Capture {worker.captureMs ?? 0} ms · OCR {worker.ocrMs ?? 0} ms · Translate {worker.translateMs ?? 0} ms · Probe #{worker.probeCount ?? 0} · OCR #{worker.ocrCount ?? 0} · Lines {worker.candidateCount ?? 0} · Δ {worker.changePercent ?? 0}%</span></div>}
        {toggleError && <div className="translate-error">{toggleError}</div>}
        {worker.lastError && <div className="translate-error">{worker.lastError}</div>}
        <div className="translation-list">
          {lines.length === 0 ? <div className="translation-empty"><strong>等待真实聊天消息</strong><span>首次扫描只建立基线，不会把进入游戏前已经存在的文字当作新消息。</span></div> : lines.map((line) => <article key={line.id}><small>{line.language.toUpperCase()}</small><p>{line.source}</p><strong>{line.translated}</strong></article>)}
        </div>
        <details className="provider-settings"><summary>翻译服务设置</summary><label>Google Cloud API Key（可选）<input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); localStorage.setItem(API_KEY, event.target.value) }} placeholder="留空使用实验性免 Key 通道" /></label><p>Key 只保存在这台电脑的应用存储中；后台翻译窗口读取同一设置。</p></details>
      </section>
      <section className="translate-console gamebar-ipc-card">
        <div className="gamebar-ipc-heading">
          <div><span className="overline">LIVE OUTPUT → GAME BAR</span><h2>实时翻译输出</h2></div>
          <span className={`status-pill ${gameBar?.status.connected ? 'active' : ''}`}>{gameBar?.status.connected ? 'WIDGET CONNECTED' : gameBar?.status.ready ? 'WAITING FOR WIDGET' : 'BRIDGE STARTING'}</span>
        </div>
        <div className="gamebar-ipc-status">
          <span>最近消息<strong>{gameBar?.state.lines.length ?? 0} / 3</strong></span>
          <span>Latency<strong>{gameBar?.status.latencyMs == null ? '待首次 ACK' : `${gameBar.status.latencyMs} ms`}</strong></span>
          <span>Pinned<strong>{gameBar?.status.pinned ? 'YES' : 'NO / WAITING'}</strong></span>
          <span>Click-through<strong>{gameBar?.status.clickThrough ? 'YES' : 'NO / WAITING'}</strong></span>
          <span>Widget host<strong>{gameBar?.status.displayMode || 'Unknown'}</strong></span>
        </div>
        <div className="settings-actions">
          <button className="primary-button" onClick={() => void window.dotaScoutDesktop?.sendGameBarTestMessage()}>发送诊断测试消息</button>
          <button className="ghost-button" onClick={() => void window.dotaScoutDesktop?.setGameBarVisible(!(gameBar?.state.visible ?? true))}>{gameBar?.state.visible ? 'Hide Widget Content' : 'Show Widget Content'}</button>
          <button className="ghost-button" onClick={() => void window.dotaScoutDesktop?.refreshGameBarState()}>Refresh State</button>
        </div>
        <label className="gamebar-opacity">Widget 内容透明度 <strong>{Math.round((gameBar?.state.opacity ?? .9) * 100)}%</strong><input type="range" min="20" max="100" value={(gameBar?.state.opacity ?? .9) * 100} onChange={(event) => void window.dotaScoutDesktop?.setGameBarOpacity(Number(event.target.value) / 100)} /></label>
        <div className="gamebar-test-preview">
          {(gameBar?.state.lines.length ?? 0) === 0 ? <span>首条固定消息：[TH] 别打，等我。</span> : gameBar?.state.lines.map((line, index) => <p key={`${index}-${line.language}-${line.text}`}><small>[{line.language}]</small><strong>{line.text}</strong></p>)}
        </div>
        <p className="diagnostic-instruction">真实 OCR 翻译与诊断消息共用已验证的 IPC；Pinned 与 click-through 仍由 Xbox Game Bar 控制，不向 Dota 加载模块。</p>
        {gameBar?.status.lastError && <div className="translate-error">{gameBar.status.lastError}</div>}
      </section>
    </div>
  )
}
