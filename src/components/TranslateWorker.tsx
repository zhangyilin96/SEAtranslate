import { useEffect, useRef } from 'react'
import type { TranslationLine, WorkerState } from '../desktop'
import { diffChatLines, filterTtlDuplicates, rememberObservedChatLines } from '../translate/chatLines'
import { extractChatLinesFromTsv, type OcrChatLine } from '../translate/chatOcr'
import { applyDotaGlossary, translateDotaCall } from '../translate/glossary'
import { createFrameGateState, evaluateFrame, markFrameOcred } from '../translate/imageGate'
import { chatLanguageLabel, detectChatLanguage, languageCodeForProvider } from '../translate/language'
import { getOcrWorker, getThaiOcrWorker } from '../translate/ocr'
import { createRegionFingerprint, cropCapture, readImagePixels, readSavedRegion, type SavedCaptureRegion } from '../translate/region'

const API_KEY = 'dota-scout:google-translate-key-v1'
const PROBE_WIDTH = 512
const OCR_CAPTURE_WIDTH = 1920
const PROBE_INTERVAL_MS = 400
const BASELINE_TIMEOUT_MS = 1_600
const IDLE_REPORT_INTERVAL_MS = 3_000

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function TranslateWorker() {
  const foreground = useRef(false)
  const region = useRef<SavedCaptureRegion | null>(readSavedRegion())
  const loopToken = useRef(0)
  const lines = useRef<TranslationLine[]>([])

  useEffect(() => {
    let disposed = false
    let gate = createFrameGateState()
    let primed = false
    let previousCandidates: string[] = []
    const seenAt = new Map<string, number>()

    function report(status: string, running = false, lastError = '', metrics: Partial<WorkerState> = {}) {
      void window.dotaScoutDesktop?.reportWorkerState({ configured: Boolean(region.current), running, status, lastScanAt: Date.now(), lastError, ...metrics })
      void window.dotaScoutDesktop?.updateOverlay({ configured: Boolean(region.current), engineStatus: status, diagnostic: false })
    }

    function stop(status: string) {
      loopToken.current += 1
      report(status, false)
    }

    async function run() {
      if (disposed || !foreground.current || !region.current) return
      const token = ++loopToken.current
      const startedAt = Date.now()
      let lastIdleReportAt = 0
      let probeCount = 0
      let ocrCount = 0
      let candidateCount = 0
      let changePercent = 0
      let recognizedPreview: string[] = []
      report('正在监测聊天区域', true)

      while (!disposed && token === loopToken.current && foreground.current && region.current) {
        const saved: SavedCaptureRegion = region.current
        const active = () => !disposed && token === loopToken.current && foreground.current && region.current === saved
        let captureMs = 0
        try {
          const probeStartedAt = performance.now()
          const probe = await window.dotaScoutDesktop?.captureScreen({ displayId: saved.displayId, maxWidth: PROBE_WIDTH })
          probeCount += 1
          captureMs = Math.round(performance.now() - probeStartedAt)
          if (!probe?.ok) throw new Error(probe?.error || '聊天区域截图失败')
          const signature = await createRegionFingerprint(probe.image, saved)
          if (!active()) return
          const decision = evaluateFrame(gate, signature, Date.now())
          gate = decision.state
          changePercent = Number((decision.ocrDifference * 100).toFixed(2))
          const baselineTimeout = !primed && Date.now() - startedAt >= BASELINE_TIMEOUT_MS

          if (decision.trigger || baselineTimeout) {
            report(decision.reason === 'heartbeat' ? 'OCR 恢复检查' : '检测到聊天变化', true, '', { captureMs, probeCount, ocrCount, candidateCount, changePercent })
            const fullCaptureStartedAt = performance.now()
            const capture = await window.dotaScoutDesktop?.captureScreen({ displayId: saved.displayId, maxWidth: OCR_CAPTURE_WIDTH })
            captureMs += Math.round(performance.now() - fullCaptureStartedAt)
            if (!capture?.ok) throw new Error(capture?.error || '聊天区域截图失败')
            if (!active()) return
            const savedAspect = saved.captureWidth / saved.captureHeight
            const currentAspect = capture.width / capture.height
            if (Math.abs(savedAspect - currentAspect) > 0.02) {
              throw new Error(`显示比例已变化：已保存 ${saved.captureWidth}×${saved.captureHeight}，当前捕获 ${capture.width}×${capture.height}。请按 Ctrl+Shift+F8 重新选择。`)
            }

            const [sample, colorSample] = await Promise.all([
              cropCapture(capture.image, saved),
              cropCapture(capture.image, saved, false, true),
            ])
            if (!active()) return
            const worker = await getOcrWorker((message, progress) => report(`OCR · ${message} ${Math.round(progress * 100)}%`, true, '', { captureMs }))
            if (!active()) return
            const ocrStartedAt = performance.now()
            const result = await worker.recognize(sample, {}, { tsv: true })
            if (!active()) return
            const ocrAt = Date.now()
            ocrCount += 1
            gate = markFrameOcred(gate, signature, ocrAt)
            const colorPixels = await readImagePixels(colorSample)
            let candidates: OcrChatLine[] = extractChatLinesFromTsv(result.data.tsv || '', colorPixels)
            if (primed && candidates.length === 0) {
              const fallback = await getThaiOcrWorker((message, progress) => report(`泰文 OCR · ${message} ${Math.round(progress * 100)}%`, true, '', { captureMs }))
              if (!active()) return
              const thaiResult = await fallback.recognize(sample, {}, { tsv: true })
              if (!active()) return
              candidates = extractChatLinesFromTsv(thaiResult.data.tsv || '', colorPixels)
            }
            const ocrMs = Math.round(performance.now() - ocrStartedAt)
            candidateCount = candidates.length
            recognizedPreview = candidates.slice(-3).map(({ speaker, message }) => `${speaker ? `${speaker}: ` : ''}${message}`)
            const currentMessages = candidates.map(({ message }) => message)

            if (!primed) {
              previousCandidates = currentMessages
              rememberObservedChatLines(currentMessages, seenAt, ocrAt)
              primed = true
              report(candidates.length ? `实时翻译已启动 · 基线 ${candidates.length} 行 · OCR #${ocrCount}` : `实时翻译已启动 · OCR #${ocrCount}`, true, '', { captureMs, ocrMs, lastOcrAt: ocrAt, probeCount, ocrCount, candidateCount, changePercent, recognizedPreview })
            } else {
              const difference = diffChatLines(previousCandidates, currentMessages)
              const appended = difference.lines.slice(-3)
              // A matched scrolling overlap proves that the tail is a newly
              // appended chat row. Allow a player to repeat a real command
              // such as "back"; TTL remains the fallback for unordered OCR
              // fragments and baseline rows that disappear/reappear.
              const fresh = difference.orderedAppend ? appended : filterTtlDuplicates(appended, seenAt, ocrAt)
              if (currentMessages.length) {
                previousCandidates = currentMessages
                rememberObservedChatLines(currentMessages, seenAt, ocrAt)
              }
              let translateMs = 0

              if (fresh.length) {
                const translateStartedAt = performance.now()
                const translatedLines = await Promise.all(fresh.map(async (source): Promise<TranslationLine> => {
                  const speaker = [...candidates].reverse().find((candidate) => candidate.message === source)?.speaker || ''
                  const detectedBeforeTranslation = detectChatLanguage(source)
                  const quickTranslation = translateDotaCall(source)
                  let translatedText = quickTranslation
                  let providerLanguage: string | undefined
                  if (!quickTranslation) {
                    const translated = await window.dotaScoutDesktop?.translateText({
                      text: source,
                      target: 'zh-CN',
                      sourceLanguage: languageCodeForProvider(detectedBeforeTranslation),
                      apiKey: localStorage.getItem(API_KEY)?.trim() || undefined,
                    })
                    if (!translated?.ok) throw new Error(translated?.error || '翻译失败')
                    translatedText = translated.translated
                    providerLanguage = translated.language
                  }
                  return {
                    id: `${Date.now()}-${Math.random()}`,
                    source,
                    translated: applyDotaGlossary(translatedText || source, source),
                    language: detectedBeforeTranslation === 'AUTO' ? chatLanguageLabel(providerLanguage, source) : detectedBeforeTranslation,
                    at: Date.now(),
                    speaker,
                  }
                }))
                translateMs = Math.round(performance.now() - translateStartedAt)
                // A completed OCR batch remains valid if focus changes while the
                // provider is translating it. Only disposal or a new region can
                // invalidate the result at this point.
                if (!disposed && region.current === saved) {
                  lines.current = [...lines.current, ...translatedLines].slice(-3)
                  await window.dotaScoutDesktop?.updateOverlay({ translations: lines.current, configured: true, engineStatus: 'Translate ON', diagnostic: false })
                  await window.dotaScoutDesktop?.publishGameBarTranslations(lines.current)
                }
              }

              const status = fresh.length ? `翻译完成 · 新消息 ${fresh.length} 条 · OCR #${ocrCount}` : candidates.length ? `实时翻译中 · 识别 ${candidates.length} 行 · OCR #${ocrCount}` : `实时翻译中 · 等待聊天 · OCR #${ocrCount}`
              report(status, true, '', { captureMs, ocrMs, translateMs, lastOcrAt: ocrAt, probeCount, ocrCount, candidateCount, changePercent, recognizedPreview })
            }
          } else if (Date.now() - lastIdleReportAt >= IDLE_REPORT_INTERVAL_MS) {
            lastIdleReportAt = Date.now()
            report('实时翻译中 · 轻量监测', true, '', { captureMs, probeCount, ocrCount, candidateCount, changePercent, recognizedPreview })
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : '实时翻译失败'
          report(message, true, message, { captureMs })
          await sleep(1_200)
        }

        await sleep(PROBE_INTERVAL_MS)
      }
    }

    const removeForeground = window.dotaScoutDesktop?.onForegroundState((state) => {
      foreground.current = state.foreground
      if (state.foreground && region.current) void run()
      else stop(region.current ? '等待 Dota 2 前台' : '聊天翻译未配置')
    })
    const removeRegion = window.dotaScoutDesktop?.onRegionChanged((next) => {
      region.current = next as SavedCaptureRegion | null
      loopToken.current += 1
      gate = createFrameGateState()
      primed = false
      previousCandidates = []
      seenAt.clear()
      lines.current = []
      void window.dotaScoutDesktop?.updateOverlay({ translations: [], configured: Boolean(region.current), diagnostic: false })
      void window.dotaScoutDesktop?.publishGameBarTranslations([])
      if (foreground.current && region.current) void run()
      else report(region.current ? '实时翻译待机' : '聊天翻译未配置', false)
    })
    void window.dotaScoutDesktop?.getCompanionState().then((state) => {
      foreground.current = state.dotaForeground
      report(region.current ? (state.dotaForeground ? '正在启动实时翻译' : '实时翻译待机') : '聊天翻译未配置', state.dotaForeground && Boolean(region.current))
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
