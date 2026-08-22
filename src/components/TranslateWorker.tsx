import { useEffect, useRef } from 'react'
import type { TranslationLine, WorkerState } from '../desktop'
import { extractChatLinesFromTsv, type OcrChatLine } from '../translate/chatOcr'
import { applyDotaGlossary, translateDotaCall } from '../translate/glossary'
import { createFrameGateState, evaluateFrame, markFrameOcred } from '../translate/imageGate'
import { chatLanguageLabel, detectChatLanguage, languageCodeForProvider } from '../translate/language'
import { advanceOcrConsensus, createOcrConsensusState } from '../translate/ocrConsensus'
import { getOcrWorker, getThaiOcrWorker } from '../translate/ocr'
import { createRegionFingerprint, cropCapture, readImagePixels, readSavedRegion, type SavedCaptureRegion } from '../translate/region'

const API_KEY = 'dota-scout:google-translate-key-v1'
const PROBE_WIDTH = 320
const OCR_CAPTURE_WIDTH = 1_100
const PROBE_INTERVAL_MS = 750
const CONSENSUS_FRAME_INTERVAL_MS = 240
const BASELINE_TIMEOUT_MS = 1_600
const IDLE_REPORT_INTERVAL_MS = 3_000
const THAI_FALLBACK_INTERVAL_MS = 20_000
const FULL_CAPTURE_REGION = { x: 0, y: 0, width: 1, height: 1 }

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
    let consensus = createOcrConsensusState()
    let consensusFollowUp = false
    let diagnosticsEnabled = false
    let emptyEnglishFrames = 0
    let lastThaiFallbackAt = 0

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
      diagnosticsEnabled = diagnosticsEnabled || Boolean((await window.dotaScoutDesktop?.getOcrDiagnosticState())?.enabled)
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
        const nextDelayMs = consensusFollowUp ? CONSENSUS_FRAME_INTERVAL_MS : PROBE_INTERVAL_MS
        try {
          const followUpDue = consensusFollowUp && gate.lastOcrAt > 0 && Date.now() - gate.lastOcrAt >= CONSENSUS_FRAME_INTERVAL_MS
          let signature: Uint8Array | null = null
          let shouldOcr = followUpDue
          let triggerStatus = 'OCR 共识补帧'

          if (!followUpDue) {
            const probeStartedAt = performance.now()
            const probe = await window.dotaScoutDesktop?.captureScreen({ displayId: saved.displayId, maxWidth: PROBE_WIDTH, region: saved })
            probeCount += 1
            captureMs = Math.round(performance.now() - probeStartedAt)
            if (!probe?.ok) throw new Error(probe?.error || '聊天区域截图失败')
            signature = await createRegionFingerprint(probe.image, FULL_CAPTURE_REGION)
            if (!active()) return
            const decision = evaluateFrame(gate, signature, Date.now())
            gate = decision.state
            changePercent = Number((decision.ocrDifference * 100).toFixed(2))
            const baselineTimeout = !consensus.primed && Date.now() - startedAt >= BASELINE_TIMEOUT_MS
            shouldOcr = decision.trigger || baselineTimeout
            triggerStatus = decision.reason === 'heartbeat' ? 'OCR 恢复检查' : '检测到聊天变化'
          }

          if (shouldOcr) {
            report(triggerStatus, true, '', { captureMs, probeCount, ocrCount, candidateCount, changePercent })
            const fullCaptureStartedAt = performance.now()
            const capture = await window.dotaScoutDesktop?.captureScreen({ displayId: saved.displayId, maxWidth: OCR_CAPTURE_WIDTH, region: saved })
            captureMs += Math.round(performance.now() - fullCaptureStartedAt)
            if (!capture?.ok) throw new Error(capture?.error || '聊天区域截图失败')
            if (!active()) return
            const savedAspect = saved.captureWidth / saved.captureHeight
            const currentAspect = (capture.captureWidth || saved.captureWidth) / (capture.captureHeight || saved.captureHeight)
            if (Math.abs(savedAspect - currentAspect) > 0.02) {
              throw new Error(`显示比例已变化：已保存 ${saved.captureWidth}×${saved.captureHeight}，当前捕获 ${capture.captureWidth}×${capture.captureHeight}。请按 Ctrl+Shift+F8 重新选择。`)
            }
            signature = signature || await createRegionFingerprint(capture.image, FULL_CAPTURE_REGION)

            const [sample, colorSample] = await Promise.all([
              cropCapture(capture.image, FULL_CAPTURE_REGION),
              cropCapture(capture.image, FULL_CAPTURE_REGION, false, true),
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
            let diagnosticTsv = result.data.tsv || ''
            let diagnosticEngine = 'tesseract.js:eng'
            let candidates: OcrChatLine[] = extractChatLinesFromTsv(diagnosticTsv, colorPixels)
            emptyEnglishFrames = candidates.length === 0 ? emptyEnglishFrames + 1 : 0
            const shouldRunThaiFallback = consensus.primed
              && candidates.length === 0
              && emptyEnglishFrames >= 2
              && ocrAt - lastThaiFallbackAt >= THAI_FALLBACK_INTERVAL_MS
            if (shouldRunThaiFallback) {
              lastThaiFallbackAt = ocrAt
              const fallback = await getThaiOcrWorker((message, progress) => report(`泰文 OCR · ${message} ${Math.round(progress * 100)}%`, true, '', { captureMs }))
              if (!active()) return
              const thaiResult = await fallback.recognize(sample, {}, { tsv: true })
              if (!active()) return
              diagnosticTsv = thaiResult.data.tsv || ''
              diagnosticEngine = 'tesseract.js:eng+tha'
              candidates = extractChatLinesFromTsv(diagnosticTsv, colorPixels)
              if (candidates.length) emptyEnglishFrames = 0
            }
            if (diagnosticsEnabled) {
              const save = window.dotaScoutDesktop?.saveOcrDiagnostic({
                capturedAt: ocrAt,
                originalImage: colorSample,
                preprocessedImage: sample,
                tsv: diagnosticTsv,
                candidates,
                engine: diagnosticEngine,
              })
              if (save) void save.catch(() => undefined)
            }
            const ocrMs = Math.round(performance.now() - ocrStartedAt)
            candidateCount = candidates.length
            recognizedPreview = candidates.slice(-3).map(({ speaker, message }) => `${speaker ? `${speaker}: ` : ''}${message}`)
            const wasPrimed = consensus.primed
            const consensusDecision = advanceOcrConsensus(consensus, candidates, ocrAt)
            consensus = consensusDecision.state
            const needsLanguageFallbackFrame = consensus.primed && candidates.length === 0 && emptyEnglishFrames === 1
            consensusFollowUp = consensusDecision.needsFollowUp || needsLanguageFallbackFrame

            if (!consensus.primed) {
              report(`正在建立 OCR 共识基线 · ${consensus.pendingAttempts}/3 帧 · OCR #${ocrCount}`, true, '', { captureMs, ocrMs, lastOcrAt: ocrAt, probeCount, ocrCount, candidateCount, changePercent, recognizedPreview })
            } else if (!wasPrimed) {
              report(consensus.committed.length ? `实时翻译已启动 · 共识基线 ${consensus.committed.length} 行 · OCR #${ocrCount}` : `实时翻译已启动 · OCR #${ocrCount}`, true, '', { captureMs, ocrMs, lastOcrAt: ocrAt, probeCount, ocrCount, candidateCount, changePercent, recognizedPreview })
            } else {
              const fresh = consensusDecision.publish.slice(-3)
              let translateMs = 0

              if (fresh.length) {
                const translateStartedAt = performance.now()
                const translatedLines = await Promise.all(fresh.map(async (candidate): Promise<TranslationLine> => {
                  const source = candidate.message
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
                    speaker: candidate.speaker,
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

              const status = fresh.length
                ? `翻译完成 · 新消息 ${fresh.length} 条${consensusDecision.fastPath ? ' · 快速路径' : ' · 多帧共识'} · OCR #${ocrCount}`
                : consensusFollowUp
                  ? `OCR 共识采样 · ${consensus.pendingAttempts}/3 帧 · OCR #${ocrCount}`
                  : candidates.length ? `实时翻译中 · 识别 ${candidates.length} 行 · OCR #${ocrCount}` : `实时翻译中 · 等待聊天 · OCR #${ocrCount}`
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

        await sleep(consensusFollowUp ? CONSENSUS_FRAME_INTERVAL_MS : nextDelayMs)
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
      consensus = createOcrConsensusState()
      consensusFollowUp = false
      emptyEnglishFrames = 0
      lastThaiFallbackAt = 0
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
