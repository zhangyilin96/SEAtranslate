import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { OverlayPayload, OverlaySettings } from '../desktop'

const emptyPayload: OverlayPayload = { reports: [], translations: [], diagnostic: false, configured: false, engineStatus: '等待 Dota 2' }
const defaultSettings: OverlaySettings = { opacity: .9, position: 'top-right', fontSize: 15, collapseDelay: 6500, showOriginal: false }

export function OverlayView() {
  const [payload, setPayload] = useState<OverlayPayload>(emptyPayload)
  const [settings, setSettings] = useState<OverlaySettings>(defaultSettings)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    window.dotaScoutDesktop?.getOverlayState().then((state) => {
      if (!state.ok) return
      setPayload(state.payload)
      setSettings(state.settings)
    })
    const removePayload = window.dotaScoutDesktop?.onOverlayPayload(setPayload)
    const removeSettings = window.dotaScoutDesktop?.onOverlaySettings(setSettings)
    return () => { removePayload?.(); removeSettings?.() }
  }, [])

  const latestAt = payload.translations.at(-1)?.at || 0
  useEffect(() => {
    if (!latestAt) return
    setExpanded(true)
    const timer = window.setTimeout(() => setExpanded(false), settings.collapseDelay)
    return () => window.clearTimeout(timer)
  }, [latestAt, settings.collapseDelay])

  const status = useMemo(() => {
    if (!payload.configured) return 'DS · Ctrl+Shift+F8 设置聊天区域'
    if (/translate on/i.test(payload.engineStatus || '')) return 'DS · Translate ON'
    return `DS · ${payload.engineStatus || 'OCR READY'}`
  }, [payload.configured, payload.engineStatus])

  return (
    <main className={`overlay-root ${expanded ? 'expanded' : 'compact'}`} style={{ '--overlay-font-size': `${settings.fontSize}px` } as CSSProperties}>
      {payload.diagnostic ? (
        <section className="overlay-diagnostic">
          <span>OVERLAY DIAGNOSIS</span>
          <strong>DOTA SCOUT TEST</strong>
          <p>Win32 TOPMOST · NOACTIVATE · CLICK-THROUGH</p>
          <small>Ctrl+Shift+F7 隐藏</small>
        </section>
      ) : (
        <>
          <div className={`overlay-status ${payload.configured ? 'ready' : 'setup'}`}><i />{status}</div>
          {expanded && payload.translations.length > 0 && (
            <section className="overlay-translations">
              {payload.translations.slice(-3).map((line) => (
                <article key={line.id}>
                  <small>[{line.language.toUpperCase()}]</small>
                  {settings.showOriginal && <p>{line.source}</p>}
                  <strong>{line.speaker ? `${line.speaker}: ` : ''}{line.translated}</strong>
                </article>
              ))}
            </section>
          )}
        </>
      )}
    </main>
  )
}
