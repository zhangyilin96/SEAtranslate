import type { PlayerMatch, ProfileResponse } from './types'
import type { ScoutReport } from './scout/types'

export type TranslationLine = { id: string; source: string; translated: string; language: string; at: number }
export type OverlayPayload = { reports: ScoutReport[]; translations: TranslationLine[]; diagnostic: boolean; configured?: boolean; engineStatus?: string; dotaForeground?: boolean; shortcutStatus?: Record<string, boolean> }
export type OverlaySettings = { opacity: number; position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'; fontSize: number; collapseDelay: number; showOriginal: boolean }
export type OverlayVerification = { status: 'overlay-diagnosis-active'; label: string; userVisible: 'failed-current-test'; automatedCapture: 'secondary-evidence-only'; windowState: 'diagnosing'; dotaFocus: 'diagnosing'; clickThrough: 'diagnosing'; hotkey: 'verified-pass'; note: string }
export type OverlayDiagnosticScenario = 'desktop' | 'dotaMainMenu' | 'windowed' | 'borderless' | 'exclusiveFullscreen'
export type OverlayDiagnosticState = {
  ok: boolean
  scenario: OverlayDiagnosticScenario
  updatedAt: string
  lastAction: string
  lastError: string | null
  dotaProcess: 'DETECTED' | 'NOT DETECTED'
  dotaForeground: boolean
  displayMode: { mode: 'Windowed' | 'Borderless' | 'Exclusive Fullscreen' | 'Unknown'; source: string; configPath: string | null; fullscreen?: string | null; borderless?: string | null; error?: string }
  overlayWindow: 'CREATED' | 'NOT CREATED'
  overlayVisible: boolean
  overlayDestroyed: boolean
  overlayHwnd: string
  overlayHwndDecimal: string
  alwaysOnTop: boolean
  clickThrough: boolean
  focusable: boolean
  focused: boolean
  foregroundHwnd: string
  foregroundTitle: string
  foregroundOwner: string
  bounds: { x: number; y: number; width: number; height: number } | null
  currentMonitor: null | { id: string; label: string; bounds: { x: number; y: number; width: number; height: number }; workArea: { x: number; y: number; width: number; height: number }; scaleFactor: number }
  zOrder: null | { command: string; ok: boolean; setWindowPos?: boolean; lastError?: number; topmostStyle?: boolean; noActivateStyle?: boolean; transparentStyle?: boolean; layeredStyle?: boolean; toolWindowStyle?: boolean; overlayZIndex?: number; dotaZIndex?: number; aboveDota?: boolean; checkedAt: string; error?: string }
  nativeOverlayPoc: { running: boolean; visible: boolean; hwnd: string; bounds: { x: number; y: number; width: number; height: number } | null; updatedAt: string | null; processRunning: boolean }
  renderer: string
  exclusiveFullscreenBoundary: string
}
export type HotkeyAction = 'toggle' | 'selectRegion'
export type HotkeyPhase = 'desktop' | 'dotaMenu' | 'inMatch'
export type HotkeyCounts = Record<HotkeyAction, number>
export type HotkeyDiagnostic = {
  mode: 'active'
  phase: HotkeyPhase
  sessionStartedAt: string
  activeHotkeys: { toggle: string; selectRegion: string; outgoing: string }
  legacyHotkeys: { toggle: string; selectRegion: string }
  registration: Record<HotkeyAction, { accelerator: string; registered: boolean; reason: string | null }>
  counts: HotkeyCounts
  byContext: { desktop: HotkeyCounts; dotaForeground: HotkeyCounts }
  byPhase: Record<HotkeyPhase, HotkeyCounts>
  lastEvent: null | { action: HotkeyAction; accelerator: string; at: string; phase: HotkeyPhase; context: 'desktop' | 'dotaForeground'; dotaForeground: boolean; count: number }
}
export type CompanionState = { ok: true; dotaRunning: boolean; dotaForeground: boolean; overlayVisible: boolean; overlaySuppressed: boolean; settings: OverlaySettings; shortcuts: Record<string, boolean>; liveOcrEnabled: boolean; overlayVerification: OverlayVerification; hotkeyDiagnostic: HotkeyDiagnostic }
export type WorkerState = { configured: boolean; running: boolean; status: string; lastScanAt?: number; lastOcrAt?: number; captureMs?: number; ocrMs?: number; translateMs?: number; probeCount?: number; ocrCount?: number; candidateCount?: number; changePercent?: number; lastError?: string }
export type GameBarLine = { language: string; text: string }
export type GameBarWidgetState = { type: 'state'; version: 1; sequence: number; sentAt: number; visible: boolean; opacity: number; lines: GameBarLine[] }
export type GameBarBridgeStatus = {
  processRunning: boolean
  ready: boolean
  connected: boolean
  pinned: boolean
  clickThrough: boolean
  gameBarVisible: boolean
  displayMode: string
  windowState: string
  lineCount: number
  latencyMs: number | null
  lastAckAt: string | null
  lastError: string | null
}
export type GameBarBridgeResult = { ok: true; state: GameBarWidgetState; status: GameBarBridgeStatus }

type DesktopApiResult =
  | { ok: true; profile: ProfileResponse; matches: PlayerMatch[] }
  | { ok: false; error: string }

type ScoutSourceResult =
  | { ok: true; profile: ProfileResponse; matches: PlayerMatch[]; heroes: import('./types').HeroHistory[] }
  | { ok: false; error: string }

type HeroMetadataResult =
  | { ok: true; heroes: import('./types').HeroMetadata[] }
  | { ok: false; error: string }

export type ScreenCaptureResult = { ok: true; image: string; width: number; height: number; displayId: string; displayName: string; resolution: string } | { ok: false; error: string }
type TranslationResult = { ok: true; translated: string; language: string; provider: string; cached?: boolean; elapsedMs?: number } | { ok: false; error: string }
export type DotaStatusResult = { ok: true; installed: boolean; installPath: string | null; isRunning: boolean; isForeground: boolean; identityStatus: 'unavailable' } | { ok: false; error: string }

declare global {
  interface Window {
    dotaScoutDesktop?: {
      fetchPlayerData(accountId: number): Promise<DesktopApiResult>
      fetchScoutSource(accountId: number): Promise<ScoutSourceResult>
      fetchHeroMetadata(): Promise<HeroMetadataResult>
      updateOverlay(payload: Partial<OverlayPayload>): Promise<{ ok: boolean }>
      toggleOverlay(): Promise<{ ok: boolean; visible: boolean }>
      setOverlaySettings(settings: OverlaySettings): Promise<{ ok: boolean; settings: OverlaySettings }>
      getOverlayState(): Promise<{ ok: boolean; verification: OverlayVerification; payload: OverlayPayload; settings: OverlaySettings; visible: boolean; diagnostics: { windowCreated: boolean; alwaysOnTop: boolean; focusable: boolean; clickThrough: boolean } }>
      getOverlayDiagnostic(): Promise<OverlayDiagnosticState>
      runOverlayDiagnosticAction(action: 'scenario' | 'create' | 'show' | 'hide' | 'topRight' | 'center' | 'clickThrough' | 'enforceTopmost' | 'nativePocStart' | 'nativePocStop', value?: unknown): Promise<OverlayDiagnosticState | { ok: false; error: string }>
      getDotaStatus(): Promise<DotaStatusResult>
      getCompanionState(): Promise<CompanionState>
      getHotkeyDiagnostic(): Promise<{ ok: true; diagnostic: HotkeyDiagnostic }>
      setHotkeyDiagnosticPhase(phase: HotkeyPhase): Promise<{ ok: boolean; diagnostic?: HotkeyDiagnostic; error?: string }>
      resetHotkeyDiagnostic(): Promise<{ ok: true; diagnostic: HotkeyDiagnostic }>
      openRegionSelector(): Promise<{ ok: boolean; error?: string }>
      confirmRegion(region: unknown): Promise<{ ok: boolean }>
      cancelRegion(): Promise<{ ok: boolean }>
      clearRegion(): Promise<{ ok: boolean }>
      reportWorkerState(state: WorkerState): Promise<{ ok: boolean }>
      finishOutgoing(options: { text?: string; copy?: boolean }): Promise<{ ok: boolean; copied: boolean; sent: false }>
      captureScreen(options?: { hideMain?: boolean; displayId?: string; maxWidth?: number }): Promise<ScreenCaptureResult>
      translateText(options: { text: string; target?: string; apiKey?: string }): Promise<TranslationResult>
      setLiveTranslateEnabled(enabled: boolean): Promise<CompanionState>
      getGameBarState(): Promise<GameBarBridgeResult>
      sendGameBarTestMessage(): Promise<GameBarBridgeResult>
      setGameBarVisible(visible: boolean): Promise<GameBarBridgeResult>
      setGameBarOpacity(opacity: number): Promise<GameBarBridgeResult>
      refreshGameBarState(): Promise<GameBarBridgeResult>
      publishGameBarTranslations(lines: TranslationLine[]): Promise<GameBarBridgeResult>
      onGameBarState(callback: (state: GameBarBridgeResult) => void): () => void
      onOverlayPayload(callback: (payload: OverlayPayload) => void): () => void
      onOverlaySettings(callback: (settings: OverlaySettings) => void): () => void
      onOverlayDiagnostic(callback: (diagnostic: OverlayDiagnosticState) => void): () => void
      onForegroundState(callback: (state: { foreground: boolean; running: boolean }) => void): () => void
      onHotkeyDiagnostic(callback: (diagnostic: HotkeyDiagnostic) => void): () => void
      onRegionChanged(callback: (region: unknown) => void): () => void
      onWorkerState(callback: (state: WorkerState) => void): () => void
      onRegionSelectorInit(callback: (capture: Extract<ScreenCaptureResult, { ok: true }>) => void): () => void
      platform: 'windows'
    }
  }
}

export {}
