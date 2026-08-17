import { useEffect, useRef } from 'react'
import type { TranslationLine } from '../desktop'
import { applyDotaGlossary, lineFingerprint, normalizeOcrLine } from '../translate/glossary'
import { getOcrWorker } from '../translate/ocr'
import { cropCapture, readSavedRegion, type SavedCaptureRegion } from '../translate/region'

const API_KEY = 'dota-scout:google-translate-key-v1'

export function TranslateWorker() {
  const foreground = useRef(false)
  const region = useRef<SavedCaptureRegion | null>(readSavedRegion())
  const loopToken = useRef(0)
  const seen = useRef(new Set<string>())
  const lines = useRef<TranslationLine[]>([])

  useEffect(() => {
    let disposed = false

    function report(status: string, running = false, lastError = '') {
      void window.dotaScoutDesktop?.reportWorkerState({ configured: Boolean(region.current), running, status, lastScanAt: Date.now(), lastError })
      void window.dotaScoutDesktop?.updateOverlay({ configured: Boolean(region.current), engineStatus: status, diagnostic: false })
    }

    async function stop(status: string) {
      loopToken.current += 1
      report(status, false)
    }

    async function run() {
      if (disposed || !foreground.current || !region.current) return
      const token = ++loopToken.current
      let primed = false
      report('OCR 正在加载', true)
      try {
        const worker = await getOcrWorker((message, progress) => report(`OCR · ${message} ${Math.round(progress * 100)}%`, true))
        while (!disposed && token === loopToken.current && foreground.current && region.current) {
          const saved = region.current
          try {
            const capture = await window.dotaScoutDesktop?.captureScreen({ displayId: saved.displayId })
            if (!capture?.ok) throw new Error(capture?.error || '截图失败')
            if (capture.width !== saved.captureWidth || capture.height !== saved.captureHeight) {
              throw new Error(`显示分辨率已变化：已保存 ${saved.captureWidth}×${saved.captureHeight}，当前 ${capture.width}×${capture.height}。请按 Ctrl+Shift+F8 重新选择。`)
            }
            const sample = await cropCapture(capture.image, saved)
            const result = await worker.recognize(sample)
            const candidates = result.data.text.split(/\r?\n/).map(normalizeOcrLine).filter((line) => line.length >= 2).slice(-8)
            if (!primed) {
              for (const source of candidates) seen.current.add(lineFingerprint(source))
              primed = true
            } else {
              for (const source of candidates) {
                const key = lineFingerprint(source)
                if (!key || seen.current.has(key)) continue
                seen.current.add(key)
                const translated = await window.dotaScoutDesktop?.translateText({ text: source, target: 'zh-CN', apiKey: localStorage.getItem(API_KEY)?.trim() || undefined })
                if (!translated?.ok) throw new Error(translated?.error || '翻译失败')
                const line: TranslationLine = { id: `${Date.now()}-${Math.random()}`, source, translated: applyDotaGlossary(translated.translated, source), language: translated.language, at: Date.now() }
                lines.current = [...lines.current, line].slice(-3)
                await window.dotaScoutDesktop?.updateOverlay({ translations: lines.current, configured: true, engineStatus: 'Translate ON', diagnostic: false })
              }
            }
            if (seen.current.size > 300) seen.current = new Set(candidates.map(lineFingerprint))
            report(candidates.length ? `Translate ON · 本轮 ${candidates.length} 行` : 'Translate ON', true)
          } catch (error) {
            const message = error instanceof Error ? error.message : 'OCR 识别失败'
            report(message, true, message)
          }
          await new Promise((resolve) => setTimeout(resolve, 1800))
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'OCR 初始化失败'
        report(message, false, message)
      }
    }

    const removeForeground = window.dotaScoutDesktop?.onForegroundState((state) => {
      foreground.current = state.foreground
      if (state.foreground && region.current) void run()
      else void stop(region.current ? '等待 Dota 2 前台' : '聊天翻译未配置')
    })
    const removeRegion = window.dotaScoutDesktop?.onRegionChanged((next) => {
      region.current = next as SavedCaptureRegion | null
      seen.current.clear()
      loopToken.current += 1
      if (foreground.current && region.current) void run()
      else report(region.current ? 'OCR READY' : '聊天翻译未配置', false)
    })
    void window.dotaScoutDesktop?.getCompanionState().then((state) => {
      foreground.current = state.dotaForeground
      report(region.current ? (state.dotaForeground ? 'OCR 正在启动' : 'OCR READY') : '聊天翻译未配置', state.dotaForeground && Boolean(region.current))
      if (state.dotaForeground && region.current) void run()
    })

    return () => {
      disposed = true
      loopToken.current += 1
      removeForeground?.()
      removeRegion?.()
    }
  }, [])

  return null
}
