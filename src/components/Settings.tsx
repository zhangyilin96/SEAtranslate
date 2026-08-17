import { useEffect, useState, type ReactNode } from 'react'
import type { CompanionState, HotkeyDiagnostic, HotkeyPhase, OverlayDiagnosticScenario, OverlayDiagnosticState, OverlaySettings, WorkerState } from '../desktop'
import { applyDotaGlossary, normalizeOcrLine } from '../translate/glossary'
import { recognizeImage } from '../translate/ocr'
import { clearSavedRegion, cropCapture, readSavedRegion, type SavedCaptureRegion } from '../translate/region'

const defaults: OverlaySettings = { opacity: .9, position: 'top-right', fontSize: 15, collapseDelay: 6500, showOriginal: false }

export function Settings({ debugTools }: { debugTools: ReactNode }) {
  const [settings, setSettings] = useState(defaults)
  const [companion, setCompanion] = useState<CompanionState | null>(null)
  const [hotkeys, setHotkeys] = useState<HotkeyDiagnostic | null>(null)
  const [worker, setWorker] = useState<WorkerState | null>(null)
  const [saved, setSaved] = useState(false)
  const [region, setRegion] = useState<SavedCaptureRegion | null>(readSavedRegion)
  const [overlayStatus, setOverlayStatus] = useState('')
  const [overlayDiagnostic, setOverlayDiagnostic] = useState<OverlayDiagnosticState | null>(null)
  const [ocrStatus, setOcrStatus] = useState('')
  const [ocrImage, setOcrImage] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [ocrLanguage, setOcrLanguage] = useState('')
  const [ocrTranslation, setOcrTranslation] = useState('')
  const [ocrError, setOcrError] = useState('')

  useEffect(() => {
    void window.dotaScoutDesktop?.getOverlayState().then((state) => state.ok && setSettings(state.settings))
    void window.dotaScoutDesktop?.getCompanionState().then(setCompanion)
    void window.dotaScoutDesktop?.getHotkeyDiagnostic().then((result) => setHotkeys(result.diagnostic))
    void window.dotaScoutDesktop?.getOverlayDiagnostic().then(setOverlayDiagnostic)
    const removeRegion = window.dotaScoutDesktop?.onRegionChanged((next) => setRegion(next as SavedCaptureRegion | null))
    const removeWorker = window.dotaScoutDesktop?.onWorkerState(setWorker)
    const removeForeground = window.dotaScoutDesktop?.onForegroundState(() => void window.dotaScoutDesktop?.getCompanionState().then(setCompanion))
    const removeHotkeys = window.dotaScoutDesktop?.onHotkeyDiagnostic(setHotkeys)
    const removeOverlayDiagnostic = window.dotaScoutDesktop?.onOverlayDiagnostic(setOverlayDiagnostic)
    const refresh = window.setInterval(() => void window.dotaScoutDesktop?.getOverlayDiagnostic().then(setOverlayDiagnostic), 1000)
    return () => { window.clearInterval(refresh); removeRegion?.(); removeWorker?.(); removeForeground?.(); removeHotkeys?.(); removeOverlayDiagnostic?.() }
  }, [])

  async function setDiagnosticPhase(phase: HotkeyPhase) {
    const result = await window.dotaScoutDesktop?.setHotkeyDiagnosticPhase(phase)
    if (result?.diagnostic) setHotkeys(result.diagnostic)
  }

  async function save(next: OverlaySettings) {
    setSettings(next)
    await window.dotaScoutDesktop?.setOverlaySettings(next)
    setSaved(true)
    setTimeout(() => setSaved(false), 1200)
  }

  async function testOverlay() {
    setOverlayStatus('正在创建并强制显示 DOTA SCOUT TEST…')
    await window.dotaScoutDesktop?.runOverlayDiagnosticAction('create')
    const result = await window.dotaScoutDesktop?.runOverlayDiagnosticAction('show')
    if (result?.ok) {
      setOverlayDiagnostic(result as OverlayDiagnosticState)
      setOverlayStatus(result.overlayVisible && result.zOrder?.setWindowPos && !result.focused ? '窗口状态已建立；游戏内肉眼可见性仍需单独确认。' : `Overlay 状态失败：${result.lastError || '请查看下方逐项状态'}`)
    } else setOverlayStatus(`Overlay 操作失败：${result && 'error' in result ? result.error : '未知错误'}`)
  }

  async function runOverlayAction(action: 'create' | 'show' | 'hide' | 'topRight' | 'center' | 'clickThrough' | 'enforceTopmost' | 'nativePocStart' | 'nativePocStop', value?: unknown) {
    const result = await window.dotaScoutDesktop?.runOverlayDiagnosticAction(action, value)
    if (result?.ok) {
      setOverlayDiagnostic(result as OverlayDiagnosticState)
      setOverlayStatus(`${action.toUpperCase()} 已执行；请按状态与实机肉眼结果验收。`)
    } else setOverlayStatus(`${action.toUpperCase()} 失败：${result && 'error' in result ? result.error : '未知错误'}`)
  }

  async function setOverlayScenario(scenario: OverlayDiagnosticScenario) {
    const result = await window.dotaScoutDesktop?.runOverlayDiagnosticAction('scenario', scenario)
    if (result?.ok) setOverlayDiagnostic(result as OverlayDiagnosticState)
  }

  async function testOcr() {
    if (!region) return
    setOcrError('')
    setOcrText('')
    setOcrLanguage('')
    setOcrTranslation('')
    setOcrStatus('正在截取已保存区域…')
    try {
      const capture = await window.dotaScoutDesktop?.captureScreen({ hideMain: true, displayId: region.displayId })
      if (!capture?.ok) throw new Error(capture?.error || '截图失败')
      if (capture.width !== region.captureWidth || capture.height !== region.captureHeight) throw new Error('当前分辨率与保存区域不一致，请按 Ctrl+Shift+F8 重新选择。')
      const sample = await cropCapture(capture.image, region)
      setOcrImage(sample)
      const text = await recognizeImage(sample, (message, progress) => setOcrStatus(`OCR · ${message} ${Math.round(progress * 100)}%`))
      const normalized = text.split(/\r?\n/).map(normalizeOcrLine).filter(Boolean).join('\n')
      setOcrText(text || '（没有识别到文字）')
      if (normalized) {
        const translated = await window.dotaScoutDesktop?.translateText({ text: normalized, target: 'zh-CN' })
        if (!translated?.ok) throw new Error(translated?.error || '翻译失败')
        setOcrLanguage(translated.language)
        setOcrTranslation(applyDotaGlossary(translated.translated, normalized))
      } else {
        setOcrLanguage('未检测')
        setOcrTranslation('（没有可翻译文字）')
      }
      setOcrStatus('截图 → OCR → 语言识别 → 翻译测试完成')
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : 'OCR 测试失败')
      setOcrStatus('测试失败')
    }
  }

  function clearRegion() {
    clearSavedRegion()
    void window.dotaScoutDesktop?.clearRegion()
    setRegion(null)
    setOcrImage('')
    setOcrText('')
    setOcrLanguage('')
    setOcrTranslation('')
    setOcrStatus('区域已清除')
  }

  return (
    <div className="settings-page">
      <header className="page-header"><div><span className="overline">OVERLAY DIAGNOSIS / WINDOWS</span><h1>只验证窗口能否真正盖在 Dota 上方。</h1><p>本阶段暂停 OCR、翻译和 Match Scout。热键已通过，只检查 Overlay Window、Z-order、焦点与输入穿透。</p></div></header>

      <section className="settings-card hotkey-diagnostic-card">
        <div className="diagnostic-heading"><div><span className="diagnostic-live">HOTKEY DIAGNOSTIC MODE · ACTIVE</span><h2>先确认 Dota 到底有没有把热键交给程序。</h2></div><button className="ghost-button" onClick={async () => { const result = await window.dotaScoutDesktop?.resetHotkeyDiagnostic(); if (result) setHotkeys(result.diagnostic) }}>清零计数</button></div>
        <div className="phase-selector">
          {([['desktop', 'Test A · 桌面'], ['dotaMenu', 'Test B · Dota 主菜单'], ['inMatch', 'Test C · 比赛中']] as const).map(([phase, label]) => <button key={phase} className={hotkeys?.phase === phase ? 'active' : ''} onClick={() => void setDiagnosticPhase(phase)}>{label}</button>)}
        </div>
        <p className="diagnostic-instruction">先选择当前测试场景，再回到目标窗口按热键。即使 Overlay 不出现，只要 EVENT COUNT 增加，就证明 Dota Scout 收到了事件。</p>
        <div className="hotkey-status-grid">
          {(['toggle', 'selectRegion'] as const).map((action) => {
            const item = hotkeys?.registration[action]
            const count = hotkeys?.counts[action] ?? 0
            return <article key={action} className={item?.registered ? 'registered' : 'failed'}><small>{action === 'toggle' ? 'OVERLAY TOGGLE' : 'OCR SELECT'}</small><h3>{item?.accelerator || (action === 'toggle' ? 'Ctrl+Shift+F7' : 'Ctrl+Shift+F8')}</h3><strong>{item?.registered ? 'REGISTERED ✅' : 'FAILED ❌'}</strong><b>EVENT COUNT: {count}</b>{item?.reason && <p>HOTKEY_REGISTER_FAILED · {item.reason}</p>}</article>
          })}
        </div>
        <div className="diagnostic-results">
          {([['desktop', 'Desktop Hotkey'], ['dotaMenu', 'Dota Menu Hotkey'], ['inMatch', 'Dota In-Match Hotkey']] as const).map(([phase, label]) => { const counts = hotkeys?.byPhase[phase]; const passed = Boolean(counts?.toggle && counts?.selectRegion); return <span key={phase}>{label}<strong>{passed ? 'PASS' : 'PENDING'}</strong><em>F7 {counts?.toggle ?? 0} · F8 {counts?.selectRegion ?? 0}</em></span> })}
        </div>
        <p className="last-hotkey-event">{hotkeys?.lastEvent ? `LAST: ${hotkeys.lastEvent.accelerator} · ${hotkeys.lastEvent.phase} · ${new Date(hotkeys.lastEvent.at).toLocaleTimeString()} · ${hotkeys.lastEvent.context}` : 'LAST: 尚未收到任何诊断热键事件'}</p>
      </section>

      <section className="settings-card overlay-diagnostic-console">
        <div className="diagnostic-heading"><div><span className="diagnostic-live">OVERLAY DIAGNOSTIC · LIVE STATE</span><h2>DOTA SCOUT TEST · 320 × 120</h2></div><strong className={overlayDiagnostic?.lastError ? 'diagnostic-fail' : 'diagnostic-pass'}>{overlayDiagnostic?.lastError || overlayDiagnostic?.lastAction || '读取中'}</strong></div>
        <div className="phase-selector overlay-scenarios">
          {([['desktop', 'Desktop'], ['dotaMainMenu', 'Dota Menu'], ['windowed', 'Windowed'], ['borderless', 'Borderless'], ['exclusiveFullscreen', 'Exclusive Fullscreen']] as const).map(([scenario, label]) => <button key={scenario} className={overlayDiagnostic?.scenario === scenario ? 'active' : ''} onClick={() => void setOverlayScenario(scenario)}>{label}</button>)}
        </div>
        <div className="overlay-diagnostic-grid">
          <span>Dota Process<strong>{overlayDiagnostic?.dotaProcess || '读取中'}</strong></span>
          <span>Dota Foreground<strong>{overlayDiagnostic?.dotaForeground ? 'YES' : 'NO'}</strong></span>
          <span>Display Mode<strong>{overlayDiagnostic?.displayMode.mode || 'Unknown'}</strong></span>
          <span>Overlay Window<strong>{overlayDiagnostic?.overlayWindow || 'NOT CREATED'}</strong></span>
          <span>Overlay Visible<strong>{overlayDiagnostic?.overlayVisible ? 'YES' : 'NO'}</strong></span>
          <span>Always On Top<strong>{overlayDiagnostic?.alwaysOnTop ? 'YES' : 'NO'}</strong></span>
          <span>Click Through<strong>{overlayDiagnostic?.clickThrough ? 'YES' : 'NO'}</strong></span>
          <span>Overlay Focus<strong>{overlayDiagnostic?.focused ? 'YES · FAIL' : 'NO · PASS'}</strong></span>
          <span>Overlay HWND<strong>{overlayDiagnostic?.overlayHwnd || '0x0'}</strong></span>
          <span>Foreground HWND<strong>{overlayDiagnostic?.foregroundHwnd || '0x0'}</strong></span>
          <span>Windows Z-order<strong>{overlayDiagnostic?.zOrder ? (overlayDiagnostic.zOrder.setWindowPos && overlayDiagnostic.zOrder.aboveDota !== false ? 'PASS' : 'FAIL') : 'NOT TESTED'}</strong></span>
          <span>Current Monitor<strong>{overlayDiagnostic?.currentMonitor?.label || 'Unknown'} · {overlayDiagnostic?.currentMonitor?.scaleFactor || 1}x</strong></span>
          <span>Native PoC<strong>{overlayDiagnostic?.nativeOverlayPoc.processRunning ? `RUNNING · ${overlayDiagnostic.nativeOverlayPoc.hwnd}` : 'STOPPED'}</strong></span>
          <span>Native Visible State<strong>{overlayDiagnostic?.nativeOverlayPoc.visible ? 'YES · USER CHECK REQUIRED' : 'NO'}</strong></span>
          <span className="wide">Overlay Bounds<strong>{overlayDiagnostic?.bounds ? `X ${overlayDiagnostic.bounds.x} / Y ${overlayDiagnostic.bounds.y} / W ${overlayDiagnostic.bounds.width} / H ${overlayDiagnostic.bounds.height}` : 'N/A'}</strong></span>
          <span className="wide">Foreground Window<strong>{overlayDiagnostic?.foregroundOwner || 'Unknown'} · {overlayDiagnostic?.foregroundTitle || '无标题'}</strong></span>
          <span className="wide">Win32 Styles<strong>{overlayDiagnostic?.zOrder ? `TOPMOST ${overlayDiagnostic.zOrder.topmostStyle ? 'YES' : 'NO'} · NOACTIVATE ${overlayDiagnostic.zOrder.noActivateStyle ? 'YES' : 'NO'} · TRANSPARENT ${overlayDiagnostic.zOrder.transparentStyle ? 'YES' : 'NO'} · LAYERED ${overlayDiagnostic.zOrder.layeredStyle ? 'YES' : 'NO'}` : '尚未调用 Native Helper'}</strong></span>
        </div>
        <div className="settings-actions overlay-actions">
          <button className="ghost-button" onClick={() => void runOverlayAction('create')}>Create Overlay Test</button>
          <button className="primary-button" onClick={() => void runOverlayAction('show')}>Force Show</button>
          <button className="ghost-button" onClick={() => void runOverlayAction('hide')}>Force Hide</button>
          <button className="ghost-button" onClick={() => void runOverlayAction('enforceTopmost')}>Enforce HWND_TOPMOST</button>
          <button className="ghost-button" onClick={() => void runOverlayAction('topRight')}>Move Top-Right</button>
          <button className="ghost-button" onClick={() => void runOverlayAction('center')}>Move Center</button>
          <button className="ghost-button" onClick={() => void runOverlayAction('clickThrough', !overlayDiagnostic?.clickThrough)}>Click-through {overlayDiagnostic?.clickThrough ? 'OFF' : 'ON'}</button>
          <button className="ghost-button" onClick={() => void runOverlayAction('nativePocStart')}>Start Native Overlay PoC</button>
          <button className="ghost-button" onClick={() => void runOverlayAction('nativePocStop')}>Stop Native Overlay PoC</button>
        </div>
        <p className="diagnostic-instruction">窗口状态 PASS 不等于游戏内肉眼可见。最终仍按：用户肉眼 → Dota 操作 → 状态日志 → 自动截图 的顺序验收。</p>
        {overlayStatus && <p className="control-result">{overlayStatus}</p>}
      </section>

      <section className="settings-card">
        <h2>Overlay Appearance</h2>
        <label>透明度 <strong>{Math.round(settings.opacity * 100)}%</strong><input type="range" min="35" max="100" value={settings.opacity * 100} onChange={(event) => void save({ ...settings, opacity: Number(event.target.value) / 100 })} /></label>
        <label>位置<select value={settings.position} onChange={(event) => void save({ ...settings, position: event.target.value as OverlaySettings['position'] })}><option value="top-right">右上</option><option value="top-left">左上</option><option value="bottom-right">右下</option><option value="bottom-left">左下</option></select></label>
        <label>字体大小 <strong>{settings.fontSize}px</strong><input type="range" min="11" max="28" value={settings.fontSize} onChange={(event) => void save({ ...settings, fontSize: Number(event.target.value) })} /></label>
        <label>自动收缩 <strong>{(settings.collapseDelay / 1000).toFixed(1)} 秒</strong><input type="range" min="2000" max="15000" step="500" value={settings.collapseDelay} onChange={(event) => void save({ ...settings, collapseDelay: Number(event.target.value) })} /></label>
        <label className="toggle-setting">显示原文 <input type="checkbox" checked={settings.showOriginal} onChange={(event) => void save({ ...settings, showOriginal: event.target.checked })} /></label>
        <button className="primary-button" onClick={() => void testOverlay()}>Create + Force Show</button>
        {saved && <span className="saved-note">已保存</span>}
        {overlayStatus && <p className="control-result">{overlayStatus}</p>}
      </section>

      <section className="settings-card ocr-region-card">
        <h2>OCR Chat Region</h2>
        {!region ? <div className="region-empty"><strong>聊天翻译未配置</strong><p>在 Dota 前台按 Ctrl+Shift+F8，直接覆盖游戏画面完成两阶段框选。</p></div> : (
          <div className="region-inspector">
            <div className="region-values"><span>显示器<strong>{region.displayName}</strong></span><span>Resolution<strong>{region.captureWidth} × {region.captureHeight}</strong></span><span>X<strong>{region.pixelX}</strong></span><span>Y<strong>{region.pixelY}</strong></span><span>Width<strong>{region.pixelWidth}</strong></span><span>Height<strong>{region.pixelHeight}</strong></span></div>
            <figure><img src={region.preview} alt="已保存 OCR 区域预览" /><figcaption>固定输入区域 · {new Date(region.savedAt).toLocaleString()}</figcaption></figure>
          </div>
        )}
        <div className="settings-actions">
          <button className="ghost-button" onClick={() => void window.dotaScoutDesktop?.openRegionSelector()}>{region ? 'Ctrl + Shift + F8 重新选择' : 'Ctrl + Shift + F8 选择区域'}</button>
          <button className="primary-button" disabled={!region} onClick={() => void testOcr()}>测试 OCR</button>
          <button className="ghost-button danger-button" disabled={!region} onClick={clearRegion}>清除区域</button>
        </div>
        {ocrStatus && <p className="control-result">{ocrStatus}</p>}
        {ocrError && <div className="translate-error">{ocrError}</div>}
        {(ocrImage || ocrText) && <div className="ocr-test-result"><div><h3>当前区域截图</h3>{ocrImage && <img src={ocrImage} alt="当前 OCR 测试截图" />}</div><div><h3>OCR 原始文本</h3><pre>{ocrText}</pre><h3>语言识别</h3><pre>{ocrLanguage}</pre><h3>最终翻译</h3><pre>{ocrTranslation}</pre></div></div>}
      </section>

      <section className="settings-card"><h2>Outgoing Translate</h2><div className="shortcut-grid"><span>快捷键<strong>Alt + T</strong></span><span>目标语言<strong>English</strong></span><span>Dota concise mode<strong>默认开启</strong></span><span>发送方式<strong>复制后返回游戏；不自动发送</strong></span></div></section>

      <section className="safety-card"><strong>数据边界</strong><p>只读取用户在屏幕上可见且主动框选的固定区域。不读取内存、不注入、不 Hook，也不会自动向 Dota 聊天发送文字。</p></section>
      <details className="developer-panel"><summary>Developer / Debug · 手动玩家 ID</summary><div className="debug-warning"><strong>DEBUG / MANUAL INPUT</strong><p>Match Scout 本轮暂停。这里保留的手动 ID 工具不属于 Live Translate 正式流程。</p></div>{debugTools}</details>
    </div>
  )
}
