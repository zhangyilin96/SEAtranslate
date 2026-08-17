import { useEffect, useState } from 'react'
import type { TranslationLine, WorkerState } from '../desktop'
import { readSavedRegion, type SavedCaptureRegion } from '../translate/region'

const API_KEY = 'dota-scout:google-translate-key-v1'

export function LiveTranslate() {
  const [region, setRegion] = useState<SavedCaptureRegion | null>(readSavedRegion)
  const [worker, setWorker] = useState<WorkerState>({ configured: Boolean(region), running: false, status: region ? 'OCR READY' : '聊天翻译未配置' })
  const [lines, setLines] = useState<TranslationLine[]>([])
  const [foreground, setForeground] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(API_KEY) || '')
  const [overlayNote, setOverlayNote] = useState('用户最新实测为游戏内不可见；当前正在独立诊断 Overlay。')

  useEffect(() => {
    const removePayload = window.dotaScoutDesktop?.onOverlayPayload((payload) => setLines(payload.translations))
    const removeWorker = window.dotaScoutDesktop?.onWorkerState(setWorker)
    const removeRegion = window.dotaScoutDesktop?.onRegionChanged((next) => setRegion(next as SavedCaptureRegion | null))
    const removeForeground = window.dotaScoutDesktop?.onForegroundState((state) => setForeground(state.foreground))
    void window.dotaScoutDesktop?.getOverlayState().then((state) => state.ok && setLines(state.payload.translations))
    void window.dotaScoutDesktop?.getCompanionState().then((state) => {
      setForeground(state.dotaForeground)
      setOverlayNote(state.overlayVerification.note)
    })
    return () => { removePayload?.(); removeWorker?.(); removeRegion?.(); removeForeground?.() }
  }, [])

  return (
    <div className="translate-page">
      <header className="page-header"><div><span className="overline">LIVE TRANSLATE / BACKGROUND COMPANION</span><h1>进游戏就开始听。</h1><p>控制面板不需要保持打开。Dota 进入前台后，后台引擎自动读取已保存的固定聊天区域。</p></div></header>
      <section className="translate-console">
        <div className="overlay-verification"><strong>游戏内 Overlay：诊断中 / 未通过</strong><p>{overlayNote}</p><span>热键已经 PASS；本阶段只检查 Window / Z-order / Focus / Click-through。</span></div>
        <div className="translate-controls">
          <span className={`status-pill ${worker.running ? 'active' : ''}`}>{worker.status}</span>
          <button className="ghost-button" onClick={() => void window.dotaScoutDesktop?.openRegionSelector()}>{region ? 'Ctrl+Shift+F8 重新选择' : 'Ctrl+Shift+F8 设置区域'}</button>
          <button className="primary-button" onClick={() => void window.dotaScoutDesktop?.toggleOverlay()}>Ctrl+Shift+F7 显示 / 隐藏</button>
        </div>
        <div className="companion-readiness">
          <span className={foreground ? 'ready' : ''}><b>01</b>Dota 前台<strong>{foreground ? '已检测' : '等待中'}</strong></span>
          <span className={region ? 'ready' : ''}><b>02</b>固定 OCR 区域<strong>{region ? '已保存' : '未配置'}</strong></span>
          <span className={worker.running ? 'ready' : ''}><b>03</b>后台翻译<strong>{worker.running ? '运行中' : '待机'}</strong></span>
        </div>
        {region && <div className="active-region-note"><strong>固定读取区域</strong><span>{region.displayName} · {region.captureWidth}×{region.captureHeight} · X {region.pixelX} · Y {region.pixelY} · W {region.pixelWidth} · H {region.pixelHeight}</span></div>}
        {worker.lastError && <div className="translate-error">{worker.lastError}</div>}
        <div className="translation-list">
          {lines.length === 0 ? <div className="translation-empty"><strong>等待真实聊天消息</strong><span>首次扫描只建立基线，不会把进入游戏前已经存在的文字当作新消息。</span></div> : lines.map((line) => <article key={line.id}><small>{line.language.toUpperCase()}</small><p>{line.source}</p><strong>{line.translated}</strong></article>)}
        </div>
        <details className="provider-settings"><summary>翻译服务设置</summary><label>Google Cloud API Key（可选）<input type="password" value={apiKey} onChange={(event) => { setApiKey(event.target.value); localStorage.setItem(API_KEY, event.target.value) }} placeholder="留空使用实验性免 Key 通道" /></label><p>Key 只保存在这台电脑的应用存储中；后台翻译窗口读取同一设置。</p></details>
      </section>
    </div>
  )
}
