const { app, BrowserWindow, Menu, Tray, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, nativeImage, net, screen, shell } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { execFile, spawn } = require('node:child_process')
const readline = require('node:readline')
const { TEST_MESSAGES, applyGameBarCommand, createGameBarState } = require('./gamebar-protocol.cjs')

const APP_ID = 'com.dota-scout.desktop'
const API_BASE = 'https://api.opendota.com/api'
const GAME_OVERLAY_VERIFICATION = {
  status: 'overlay-diagnosis-active',
  label: '用户最新实测：游戏内不可见',
  userVisible: 'failed-current-test',
  automatedCapture: 'secondary-evidence-only',
  windowState: 'diagnosing',
  dotaFocus: 'diagnosing',
  clickThrough: 'diagnosing',
  hotkey: 'verified-pass',
  note: '热键已经通过；当前只诊断 Overlay Window、Z-order、焦点与输入穿透，不再用自动截图替代用户肉眼结论。',
}
const isSmokeTest = process.argv.includes('--smoke-test')
// Live OCR is intentionally opt-in while the Game Bar IPC/performance gate is active.
// This keeps the existing OCR PoC available without running Tesseract during normal play.
const liveOcrAutostartEnabled = process.env.DOTA_SCOUT_ENABLE_LIVE_OCR === '1'
const DOTA_PROCESS_POLL_INTERVAL_MS = 15_000
const liveProbePath = process.env.DOTA_SCOUT_LIVE_PROBE_OUTPUT || ''
const liveProbeScreenshotPath = process.env.DOTA_SCOUT_LIVE_PROBE_SCREENSHOT || ''
const MATCH_FIELDS = [
  'match_id',
  'player_slot',
  'radiant_win',
  'duration',
  'hero_id',
  'start_time',
  'kills',
  'deaths',
  'assists',
  'gold_per_min',
  'xp_per_min',
  'last_hits',
  'hero_damage',
  'tower_damage',
  'hero_healing',
  'leaver_status',
  'lane',
  'lane_role',
  'is_roaming',
  'lane_efficiency',
  'gold_t',
  'xp_t',
  'lh_t',
  'denies',
]

async function loadRendererMode(window, mode) {
  const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
  if (!fs.existsSync(indexPath)) throw new Error('应用界面文件缺失，请重新下载 Dota Scout。')
  const rendererUrl = pathToFileURL(indexPath)
  rendererUrl.searchParams.set('mode', mode)
  await window.loadURL(rendererUrl.href)
}
const ACTIVE_HOTKEYS = Object.freeze({
  toggle: 'Ctrl+Shift+F7',
  selectRegion: 'Ctrl+Shift+F8',
  outgoing: 'Alt+T',
})
const LEGACY_HOTKEYS = Object.freeze({ toggle: 'Alt+F7', selectRegion: 'Alt+F8' })
const OVERLAY_DIAGNOSTIC_SIZE = Object.freeze({ width: 320, height: 120 })

let mainWindow = null
let overlayWindow = null
let workerWindow = null
let selectorWindow = null
let outgoingWindow = null
let tray = null
let isQuitting = false
let foregroundTimer = null
let trayDiagnosticTimer = null
let activeWindowReader = null
let liveProbeCompleted = false
let dotaForeground = false
let dotaRunning = false
let lastDotaProcessCheckAt = 0
let overlaySuppressed = false
let overlayClickThrough = true
let overlayDiagnosticScenario = 'desktop'
let lastOverlayAction = 'IDLE'
let lastOverlayError = null
let lastZOrderResult = null
let nativeOverlayProcess = null
let gameBarBridgeProcess = null
let gameBarBridgeReady = false
let gameBarTestMessageIndex = 0
let gameBarState = createGameBarState()
let gameBarBridgeStatus = {
  processRunning: false,
  ready: false,
  connected: false,
  pinned: false,
  clickThrough: false,
  gameBarVisible: false,
  displayMode: 'Unknown',
  windowState: 'Unknown',
  lineCount: 0,
  latencyMs: null,
  lastAckAt: null,
  lastError: null,
}
let overlayDiagnosticUpdatedAt = new Date().toISOString()
let startupErrorShown = false
let heroMetadataCache = null
let overlayPayload = { reports: [], translations: [], diagnostic: false, configured: false, engineStatus: '等待 Dota 2', dotaForeground: false }
let overlaySettings = { opacity: 0.9, position: 'top-right', fontSize: 15, collapseDelay: 6500, showOriginal: false }
let hotkeyDiagnostic = {
  mode: 'active',
  phase: 'desktop',
  sessionStartedAt: new Date().toISOString(),
  activeHotkeys: ACTIVE_HOTKEYS,
  legacyHotkeys: LEGACY_HOTKEYS,
  registration: {
    toggle: { accelerator: ACTIVE_HOTKEYS.toggle, registered: false, reason: '尚未注册' },
    selectRegion: { accelerator: ACTIVE_HOTKEYS.selectRegion, registered: false, reason: '尚未注册' },
  },
  counts: { toggle: 0, selectRegion: 0 },
  byContext: { desktop: { toggle: 0, selectRegion: 0 }, dotaForeground: { toggle: 0, selectRegion: 0 } },
  byPhase: {
    desktop: { toggle: 0, selectRegion: 0 },
    dotaMenu: { toggle: 0, selectRegion: 0 },
    inMatch: { toggle: 0, selectRegion: 0 },
  },
  lastEvent: null,
}

app.setAppUserModelId(APP_ID)
app.setName('Dota Scout')

function log(message) {
  try {
    const logDir = app.getPath('userData')
    fs.mkdirSync(logDir, { recursive: true })
    fs.appendFileSync(path.join(logDir, 'dota-scout.log'), `[${new Date().toISOString()}] ${message}\n`, 'utf8')
  } catch {
    // Logging must never prevent the app from opening.
  }
}

function overlayDiagnosticPath() {
  return path.join(app.getPath('userData'), 'overlay-diagnostic.json')
}

function nativeHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'DotaScout.Win32Helper.exe')
    : path.join(__dirname, '..', 'native', 'DotaScout.Win32Helper.exe')
}

function nativeOverlayHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'DotaScout.NativeOverlay.exe')
    : path.join(__dirname, '..', 'native', 'DotaScout.NativeOverlay.exe')
}

function gameBarBridgeHelperPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'native', 'DotaScout.GameBarBridge.exe')
    : path.join(__dirname, '..', 'native', 'DotaScout.GameBarBridge.exe')
}

function publishGameBarBridgeState() {
  const value = { ok: true, state: gameBarState, status: gameBarBridgeStatus }
  mainWindow?.webContents.send('gamebar:state', value)
  return value
}

function writeGameBarState() {
  if (!gameBarBridgeProcess?.stdin?.writable || !gameBarBridgeReady) return false
  gameBarBridgeProcess.stdin.write(`${JSON.stringify(gameBarState)}\n`)
  return true
}

function handleGameBarBridgeEvent(event) {
  if (!event || typeof event.type !== 'string') return
  if (event.type === 'bridge-ready') {
    gameBarBridgeReady = true
    gameBarBridgeStatus = { ...gameBarBridgeStatus, processRunning: true, ready: true, lastError: null }
    writeGameBarState()
  } else if (event.type === 'connection') {
    gameBarBridgeStatus = { ...gameBarBridgeStatus, connected: Boolean(event.connected), lastError: null }
    if (event.connected) writeGameBarState()
  } else if (event.type === 'ack' || event.type === 'widget-status') {
    const appliedAt = Number(event.appliedAt || 0)
    const sentAt = Number(event.sentAt || 0)
    const latencyMs = event.type === 'ack' && appliedAt >= sentAt && sentAt > 0 ? appliedAt - sentAt : gameBarBridgeStatus.latencyMs
    gameBarBridgeStatus = {
      ...gameBarBridgeStatus,
      connected: true,
      pinned: Boolean(event.pinned),
      clickThrough: Boolean(event.clickThrough),
      gameBarVisible: Boolean(event.gameBarVisible),
      displayMode: String(event.displayMode || 'Unknown'),
      windowState: String(event.windowState || 'Unknown'),
      lineCount: Number(event.lineCount ?? gameBarBridgeStatus.lineCount) || 0,
      latencyMs,
      lastAckAt: new Date().toISOString(),
      lastError: null,
    }
  } else if (event.type === 'bridge-error') {
    gameBarBridgeStatus = { ...gameBarBridgeStatus, lastError: String(event.error || 'Game Bar bridge error') }
    log(`GAME_BAR_BRIDGE_ERROR reason=${gameBarBridgeStatus.lastError}`)
  }
  publishGameBarBridgeState()
}

function startGameBarBridge() {
  if (gameBarBridgeProcess && !gameBarBridgeProcess.killed) return true
  const helper = gameBarBridgeHelperPath()
  if (!fs.existsSync(helper)) {
    gameBarBridgeStatus = { ...gameBarBridgeStatus, lastError: `Game Bar IPC Bridge 不存在: ${helper}` }
    return false
  }
  try {
    gameBarBridgeProcess = spawn(helper, [], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    gameBarBridgeReady = false
    gameBarBridgeStatus = { ...gameBarBridgeStatus, processRunning: true, ready: false, connected: false, lastError: null }
    const output = readline.createInterface({ input: gameBarBridgeProcess.stdout })
    output.on('line', (line) => {
      try { handleGameBarBridgeEvent(JSON.parse(line)) }
      catch { log(`GAME_BAR_BRIDGE_INVALID_OUTPUT value=${JSON.stringify(line.slice(0, 500))}`) }
    })
    gameBarBridgeProcess.stderr.on('data', (data) => log(`GAME_BAR_BRIDGE_STDERR value=${JSON.stringify(String(data).slice(0, 500))}`))
    gameBarBridgeProcess.once('exit', (code) => {
      log(`GAME_BAR_BRIDGE_EXIT code=${code}`)
      output.close()
      gameBarBridgeProcess = null
      gameBarBridgeReady = false
      gameBarBridgeStatus = { ...gameBarBridgeStatus, processRunning: false, ready: false, connected: false, lastError: code === 0 ? null : `Bridge exited with code ${code}` }
      publishGameBarBridgeState()
    })
    log(`GAME_BAR_BRIDGE_STARTED pid=${gameBarBridgeProcess.pid}`)
    return true
  } catch (error) {
    gameBarBridgeStatus = { ...gameBarBridgeStatus, processRunning: false, ready: false, connected: false, lastError: error instanceof Error ? error.message : String(error) }
    return false
  }
}

function stopGameBarBridge() {
  if (gameBarBridgeProcess && !gameBarBridgeProcess.killed) gameBarBridgeProcess.kill()
  gameBarBridgeProcess = null
  gameBarBridgeReady = false
}

function updateGameBarState(command, value) {
  if (!startGameBarBridge()) return publishGameBarBridgeState()
  try {
    gameBarState = applyGameBarCommand(gameBarState, command, value)
    writeGameBarState()
  } catch (error) {
    gameBarBridgeStatus = { ...gameBarBridgeStatus, lastError: error instanceof Error ? error.message : String(error) }
  }
  return publishGameBarBridgeState()
}

function nativeOverlayStatusPath() {
  return path.join(app.getPath('userData'), 'native-overlay-diagnostic.json')
}

function readNativeOverlayStatus() {
  const processRunning = Boolean(nativeOverlayProcess && !nativeOverlayProcess.killed)
  try {
    const status = JSON.parse(fs.readFileSync(nativeOverlayStatusPath(), 'utf8'))
    return {
      ...status,
      running: processRunning && Boolean(status.running),
      visible: processRunning && Boolean(status.visible),
      processRunning,
    }
  } catch {
    return { running: false, visible: false, hwnd: '0x0', bounds: null, updatedAt: null, processRunning }
  }
}

function writeNativeOverlayStoppedStatus() {
  try {
    fs.writeFileSync(nativeOverlayStatusPath(), JSON.stringify({
      running: false,
      visible: false,
      hwnd: '0x0',
      bounds: null,
      updatedAt: new Date().toISOString(),
    }))
  } catch (error) {
    log(`NATIVE_OVERLAY_POC_STATUS_WRITE_FAILED reason=${error instanceof Error ? error.message : String(error)}`)
  }
}

function startNativeOverlayPoc() {
  if (nativeOverlayProcess && !nativeOverlayProcess.killed) return { ok: true, alreadyRunning: true }
  const helper = nativeOverlayHelperPath()
  if (!fs.existsSync(helper)) return { ok: false, error: `Native Overlay PoC 不存在: ${helper}` }
  try { fs.unlinkSync(nativeOverlayStatusPath()) } catch { }
  nativeOverlayProcess = spawn(helper, [nativeOverlayStatusPath()], { windowsHide: true, stdio: 'ignore' })
  nativeOverlayProcess.once('exit', (code) => {
    log(`NATIVE_OVERLAY_POC_EXIT code=${code}`)
    nativeOverlayProcess = null
    writeNativeOverlayStoppedStatus()
    void publishOverlayDiagnostic()
  })
  log(`NATIVE_OVERLAY_POC_STARTED pid=${nativeOverlayProcess.pid}`)
  return { ok: true, pid: nativeOverlayProcess.pid }
}

function stopNativeOverlayPoc() {
  if (nativeOverlayProcess && !nativeOverlayProcess.killed) nativeOverlayProcess.kill()
  nativeOverlayProcess = null
  writeNativeOverlayStoppedStatus()
  log('NATIVE_OVERLAY_POC_STOPPED')
  return { ok: true }
}

function nativeHandleValue(window) {
  if (!window || window.isDestroyed()) return { decimal: '0', hex: '0x0' }
  const buffer = window.getNativeWindowHandle()
  const value = buffer.length >= 8 ? buffer.readBigUInt64LE(0) : BigInt(buffer.readUInt32LE(0))
  return { decimal: value.toString(), hex: `0x${value.toString(16).toUpperCase()}` }
}

function normalizeForegroundHandle(active) {
  const value = Number(active?.id || 0)
  return {
    decimal: Number.isFinite(value) ? String(Math.trunc(value)) : '0',
    hex: Number.isFinite(value) ? `0x${Math.trunc(value).toString(16).toUpperCase()}` : '0x0',
  }
}

function runNativeOverlayHelper(command, overlayHwnd, dotaHwnd = '0') {
  return new Promise((resolve) => {
    const helper = nativeHelperPath()
    if (!fs.existsSync(helper)) {
      resolve({ ok: false, error: `Win32 Helper 不存在: ${helper}` })
      return
    }
    execFile(helper, [command, overlayHwnd, dotaHwnd], { windowsHide: true, timeout: 4000 }, (error, stdout, stderr) => {
      try {
        const parsed = JSON.parse(String(stdout || '').trim())
        resolve(error ? { ...parsed, ok: false, error: parsed.error || error.message } : parsed)
      } catch {
        resolve({ ok: false, error: String(stderr || error?.message || 'Win32 Helper 返回了无效结果。').trim() })
      }
    })
  })
}

function findNewestDotaVideoConfig() {
  const roots = [
    'C:\\steam\\userdata',
    'C:\\Program Files (x86)\\Steam\\userdata',
    'D:\\SteamLibrary\\userdata',
    'E:\\SteamLibrary\\userdata',
  ]
  const found = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const user of fs.readdirSync(root, { withFileTypes: true })) {
      if (!user.isDirectory()) continue
      const candidate = path.join(root, user.name, '570', 'local', 'cfg', 'video.txt')
      if (fs.existsSync(candidate)) found.push({ path: candidate, modifiedAt: fs.statSync(candidate).mtimeMs })
    }
  }
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt)[0]?.path || null
}

function readDotaDisplaySettings() {
  try {
    const configPath = findNewestDotaVideoConfig()
    if (!configPath) return { mode: 'Unknown', source: 'no-video-config', configPath: null }
    const content = fs.readFileSync(configPath, 'utf8')
    const value = (name) => content.match(new RegExp(`"${name}"\\s+"([^"]+)"`, 'i'))?.[1] ?? null
    const fullscreen = value('setting.fullscreen')
    const borderless = value('setting.nowindowborder')
    let mode = 'Unknown'
    if (fullscreen === '1') mode = 'Exclusive Fullscreen'
    else if (fullscreen === '0' && borderless === '1') mode = 'Borderless'
    else if (fullscreen === '0' && borderless === '0') mode = 'Windowed'
    return { mode, source: 'dota-video-config', configPath, fullscreen, borderless }
  } catch (error) {
    return { mode: 'Unknown', source: 'config-read-failed', configPath: null, error: error instanceof Error ? error.message : String(error) }
  }
}

async function buildOverlayDiagnosticState() {
  const exists = Boolean(overlayWindow && !overlayWindow.isDestroyed())
  const bounds = exists ? overlayWindow.getBounds() : null
  const monitor = bounds ? screen.getDisplayMatching(bounds) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const active = activeWindowReader ? await activeWindowReader() : null
  const foreground = normalizeForegroundHandle(active)
  const hwnd = nativeHandleValue(overlayWindow)
  const displayMode = readDotaDisplaySettings()
  const state = {
    ok: true,
    scenario: overlayDiagnosticScenario,
    updatedAt: overlayDiagnosticUpdatedAt,
    lastAction: lastOverlayAction,
    lastError: lastOverlayError,
    dotaProcess: dotaRunning ? 'DETECTED' : 'NOT DETECTED',
    dotaForeground,
    displayMode,
    overlayWindow: exists ? 'CREATED' : 'NOT CREATED',
    overlayVisible: Boolean(exists && overlayWindow.isVisible()),
    overlayDestroyed: exists ? overlayWindow.isDestroyed() : false,
    overlayHwnd: hwnd.hex,
    overlayHwndDecimal: hwnd.decimal,
    alwaysOnTop: Boolean(exists && overlayWindow.isAlwaysOnTop()),
    clickThrough: overlayClickThrough,
    focusable: exists ? overlayWindow.isFocusable() : false,
    focused: exists ? overlayWindow.isFocused() : false,
    foregroundHwnd: foreground.hex,
    foregroundTitle: String(active?.title || ''),
    foregroundOwner: String(active?.owner?.name || ''),
    bounds,
    currentMonitor: monitor ? { id: String(monitor.id), label: monitor.label || `Monitor ${monitor.id}`, bounds: monitor.bounds, workArea: monitor.workArea, scaleFactor: monitor.scaleFactor } : null,
    zOrder: lastZOrderResult,
    nativeOverlayPoc: readNativeOverlayStatus(),
    renderer: 'Electron BrowserWindow + Win32 SetWindowPos helper',
    exclusiveFullscreenBoundary: '不注入、不 Hook；真独占扫描输出是否允许独立 HWND 合成由 Windows/GPU 呈现路径决定。',
  }
  try {
    fs.mkdirSync(path.dirname(overlayDiagnosticPath()), { recursive: true })
    fs.writeFileSync(overlayDiagnosticPath(), JSON.stringify(state, null, 2), 'utf8')
  } catch (error) {
    log(`OVERLAY_DIAGNOSTIC_PERSIST_FAILED reason=${error instanceof Error ? error.message : String(error)}`)
  }
  return state
}

async function publishOverlayDiagnostic() {
  const state = await buildOverlayDiagnosticState()
  mainWindow?.webContents.send('overlay:diagnostic', state)
  return state
}

async function inspectOrEnforceOverlay(command = 'inspect') {
  if (!overlayWindow || overlayWindow.isDestroyed()) return { ok: false, error: 'Overlay window does not exist.' }
  const active = activeWindowReader ? await activeWindowReader() : null
  const overlayHwnd = nativeHandleValue(overlayWindow)
  const foregroundHwnd = normalizeForegroundHandle(active)
  const dotaHwnd = String(active?.owner?.path || '').toLowerCase().endsWith('dota2.exe') ? foregroundHwnd.decimal : '0'
  const result = await runNativeOverlayHelper(command, overlayHwnd.decimal, dotaHwnd)
  lastZOrderResult = { command, ...result, checkedAt: new Date().toISOString() }
  log(`WINDOWS_Z_ORDER_RESULT command=${command} result=${result.ok && result.aboveDota !== false ? 'PASS' : 'FAIL'} detail=${JSON.stringify(result)}`)
  return result
}

async function logOverlayWindowState(action) {
  overlayDiagnosticUpdatedAt = new Date().toISOString()
  lastOverlayAction = action
  const state = await buildOverlayDiagnosticState()
  log(`OVERLAY_WINDOW_EXISTS value=${state.overlayWindow === 'CREATED'}`)
  log(`WINDOW_IS_VISIBLE value=${state.overlayVisible}`)
  log(`WINDOW_IS_DESTROYED value=${state.overlayDestroyed}`)
  log(`WINDOW_BOUNDS value=${JSON.stringify(state.bounds)}`)
  log(`WINDOW_FOCUS_STATE focused=${state.focused} focusable=${state.focusable}`)
  log(`ALWAYS_ON_TOP_STATE value=${state.alwaysOnTop}`)
  log(`CLICK_THROUGH_STATE value=${state.clickThrough}`)
  log(`HWND value=${state.overlayHwnd}`)
  log(`ACTIVE_FOREGROUND_WINDOW hwnd=${state.foregroundHwnd} owner=${state.foregroundOwner} title=${JSON.stringify(state.foregroundTitle)}`)
  mainWindow?.webContents.send('overlay:diagnostic', state)
  return state
}

function showStartupError(reason) {
  if (startupErrorShown) return
  startupErrorShown = true
  const detail = reason instanceof Error ? reason.message : String(reason)
  log(`启动失败: ${detail}`)
  dialog.showErrorBox(
    'Dota Scout 启动失败',
    `程序未能正常启动。\n\n原因：${detail}\n\n请重新启动；如果仍然失败，请查看应用数据目录中的 dota-scout.log。`,
  )
}

function settingsPath() {
  return path.join(app.getPath('userData'), 'companion-settings.json')
}

function hotkeyDiagnosticPath() {
  return path.join(app.getPath('userData'), 'hotkey-diagnostic.json')
}

function persistHotkeyDiagnostic() {
  try {
    fs.mkdirSync(path.dirname(hotkeyDiagnosticPath()), { recursive: true })
    fs.writeFileSync(hotkeyDiagnosticPath(), JSON.stringify(hotkeyDiagnostic, null, 2), 'utf8')
  } catch (error) {
    log(`热键诊断快照写入失败: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function publishHotkeyDiagnostic() {
  persistHotkeyDiagnostic()
  mainWindow?.webContents.send('hotkey:diagnostic', hotkeyDiagnostic)
}

function setTrayDiagnostic(message) {
  if (!tray) return
  tray.setToolTip(`Dota Scout · ${message}`)
  if (trayDiagnosticTimer) clearTimeout(trayDiagnosticTimer)
  trayDiagnosticTimer = setTimeout(() => tray?.setToolTip('Dota Scout · Live Translate'), 1800)
}

function recordHotkeyEvent(action) {
  const key = action === 'toggle' ? 'F7' : 'F8'
  const context = dotaForeground ? 'dotaForeground' : 'desktop'
  hotkeyDiagnostic.counts[action] += 1
  hotkeyDiagnostic.byContext[context][action] += 1
  hotkeyDiagnostic.byPhase[hotkeyDiagnostic.phase][action] += 1
  hotkeyDiagnostic.lastEvent = {
    action,
    accelerator: ACTIVE_HOTKEYS[action],
    at: new Date().toISOString(),
    phase: hotkeyDiagnostic.phase,
    context,
    dotaForeground,
    count: hotkeyDiagnostic.counts[action],
  }
  log(`HOTKEY_${key}_RECEIVED accelerator=${ACTIVE_HOTKEYS[action]} count=${hotkeyDiagnostic.counts[action]} phase=${hotkeyDiagnostic.phase} context=${context}`)
  if (action === 'toggle') log(`HOTKEY_RECEIVED accelerator=${ACTIVE_HOTKEYS[action]} action=OVERLAY_TOGGLE`)
  setTrayDiagnostic(`${key} received #${hotkeyDiagnostic.counts[action]}`)
  publishHotkeyDiagnostic()
}

function loadSettings() {
  try {
    const stored = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'))
    overlaySettings = {
      opacity: Math.max(0.35, Math.min(1, Number(stored.opacity) || overlaySettings.opacity)),
      position: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(stored.position) ? stored.position : overlaySettings.position,
      fontSize: Math.max(11, Math.min(28, Number(stored.fontSize) || overlaySettings.fontSize)),
      collapseDelay: Math.max(2000, Math.min(20000, Number(stored.collapseDelay) || overlaySettings.collapseDelay)),
      showOriginal: Boolean(stored.showOriginal),
    }
  } catch {
    // First launch has no settings file.
  }
}

function saveSettings() {
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true })
  fs.writeFileSync(settingsPath(), JSON.stringify(overlaySettings, null, 2), 'utf8')
}

function writeCaptureDataUrl(filePath, dataUrl) {
  if (!filePath || !dataUrl) return
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const comma = dataUrl.indexOf(',')
  fs.writeFileSync(filePath, Buffer.from(dataUrl.slice(comma + 1), 'base64'))
}

async function moveOverlayAboveDota() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return false
  let electronMovedAbove = false
  try {
    const sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 1, height: 1 } })
    const dotaSource = sources.find((source) => /dota\s*2/i.test(source.name))
    if (dotaSource) {
      overlayWindow.moveAbove(dotaSource.id)
      electronMovedAbove = true
    }
  } catch (error) {
    log(`ELECTRON_MOVE_ABOVE_FAILED reason=${error instanceof Error ? error.message : String(error)}`)
  }
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.moveTop()
  const native = await inspectOrEnforceOverlay('enforce')
  return Boolean(electronMovedAbove || native.ok)
}

async function runLiveDotaProbe(active) {
  if (!liveProbePath || liveProbeCompleted) return
  liveProbeCompleted = true
  await new Promise((resolve) => setTimeout(resolve, 2500))
  const before = active || (activeWindowReader ? await activeWindowReader() : null)
  const movedAboveDota = await moveOverlayAboveDota()
  overlayWindow?.showInactive()
  overlayWindow?.moveTop()
  await new Promise((resolve) => setTimeout(resolve, 900))
  const afterShow = activeWindowReader ? await activeWindowReader() : null
  const capture = await captureDisplay()
  if (capture.ok) writeCaptureDataUrl(liveProbeScreenshotPath, capture.image)
  overlayWindow?.hide()
  await new Promise((resolve) => setTimeout(resolve, 350))
  const hidden = !overlayWindow?.isVisible()
  overlayWindow?.showInactive()
  await moveOverlayAboveDota()
  await new Promise((resolve) => setTimeout(resolve, 350))
  const afterRestore = activeWindowReader ? await activeWindowReader() : null
  const result = {
    ok: Boolean(before && overlayWindow?.isVisible()),
    testedAt: new Date().toISOString(),
    activeBefore: before,
    activeAfterShow: afterShow,
    activeAfterRestore: afterRestore,
    dotaProcessRunning: dotaRunning,
    dotaForegroundDetected: dotaForeground,
    overlay: {
      visible: Boolean(overlayWindow?.isVisible()),
      alwaysOnTop: Boolean(overlayWindow?.isAlwaysOnTop()),
      focusable: overlayWindow ? overlayWindow.isFocusable() : null,
      clickThroughConfigured: Boolean(overlayWindow && !overlayWindow.isDestroyed()),
      movedAboveDota,
      hiddenDuringToggleProbe: hidden,
      configured: overlayPayload.configured,
      engineStatus: overlayPayload.engineStatus,
    },
    shortcuts: overlayPayload.shortcutStatus || {},
    capture: capture.ok ? { ok: true, width: capture.width, height: capture.height, displayName: capture.displayName } : capture,
    screenshotPath: liveProbeScreenshotPath,
    limitation: '探针验证真实 Dota 前台与窗口状态；未物理按下快捷键，也未执行英雄控制输入。',
  }
  fs.mkdirSync(path.dirname(liveProbePath), { recursive: true })
  fs.writeFileSync(liveProbePath, JSON.stringify(result, null, 2), 'utf8')
  log(`真实 Dota 前台探针完成: ${JSON.stringify(result)}`)
}

async function getDotaProcessStatus() {
  return new Promise((resolve) => {
    execFile('C:\\Windows\\System32\\tasklist.exe', ['/FI', 'IMAGENAME eq dota2.exe', '/FO', 'CSV', '/NH'], { windowsHide: true }, (error, stdout) => {
      resolve(!error && /"dota2\.exe"/i.test(stdout))
    })
  })
}

function getDotaInstallPath() {
  const candidates = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta',
    'C:\\steam\\steamapps\\common\\dota 2 beta',
    'D:\\SteamLibrary\\steamapps\\common\\dota 2 beta',
    'E:\\SteamLibrary\\steamapps\\common\\dota 2 beta',
  ]
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, 'game', 'bin', 'win64', 'dota2.exe'))) || null
}

function createTray() {
  if (tray || isSmokeTest) return
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#d8ff46"/><text x="16" y="21" text-anchor="middle" font-family="Arial" font-size="14" font-weight="700" fill="#080b10">DS</text></svg>'
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`).resize({ width: 16, height: 16 })
  tray = new Tray(icon)
  tray.setToolTip('Dota Scout · Live Translate')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 Dota Scout', click: () => showMainWindow() },
    { label: '选择聊天区域（Ctrl+Shift+F8）', click: () => void openRegionSelector(true) },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } },
  ]))
  tray.on('double-click', () => showMainWindow())
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

async function registerCompanionShortcuts() {
  function registerDiagnosticHotkey(action, callback) {
    const accelerator = ACTIVE_HOTKEYS[action]
    let accepted = false
    let errorReason = ''
    try {
      accepted = globalShortcut.register(accelerator, callback)
    } catch (error) {
      errorReason = error instanceof Error ? error.message : String(error)
    }
    const verified = accepted && globalShortcut.isRegistered(accelerator)
    const reason = verified ? null : (errorReason || 'Electron globalShortcut.register 返回 false，快捷键可能被其他程序占用或被系统拒绝。')
    hotkeyDiagnostic.registration[action] = { accelerator, registered: verified, reason }
    if (!verified) log(`HOTKEY_REGISTER_FAILED accelerator=${accelerator} reason=${reason}`)
    else log(`HOTKEY_REGISTERED accelerator=${accelerator}`)
    return verified
  }

  const registered = {
    toggle: registerDiagnosticHotkey('toggle', () => {
      recordHotkeyEvent('toggle')
      void toggleOverlay(true)
    }),
    selectRegion: registerDiagnosticHotkey('selectRegion', () => {
      recordHotkeyEvent('selectRegion')
      if (dotaForeground) void openRegionSelector(false)
      else log('HOTKEY_F8_ACTION_SKIPPED reason=DOTA_NOT_FOREGROUND')
    }),
    outgoing: globalShortcut.register(ACTIVE_HOTKEYS.outgoing, () => { if (dotaForeground) void openOutgoingTranslate() }),
  }
  overlayPayload.shortcutStatus = registered
  if (!Object.values(registered).every(Boolean)) log(`全局快捷键注册不完整: ${JSON.stringify(registered)}`)
  publishHotkeyDiagnostic()
}

async function startForegroundMonitor() {
  try {
    const packageRoot = app.isPackaged
      ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'get-windows')
      : path.dirname(require.resolve('get-windows'))
    const bindingPath = path.join(packageRoot, 'lib', 'binding', 'napi-9-win32-unknown-x64', 'node-get-windows.node')
    const binding = require(bindingPath)
    activeWindowReader = async () => binding.getActiveWindow()
    log('前台窗口检测模块已加载到内存')
  } catch (error) {
    log(`前台窗口检测模块加载失败: ${error instanceof Error ? error.message : String(error)}`)
  }
  const check = async () => {
    try {
      const active = activeWindowReader ? await activeWindowReader() : null
      const ownerPath = String(active?.owner?.path || '').toLowerCase()
      const ownerName = String(active?.owner?.name || '').toLowerCase()
      const nextForeground = ownerPath.endsWith('dota2.exe') || ownerName === 'dota 2' || ownerName === 'dota2'
      const now = Date.now()
      if (nextForeground) {
        dotaRunning = true
      } else if (!lastDotaProcessCheckAt || now - lastDotaProcessCheckAt >= DOTA_PROCESS_POLL_INTERVAL_MS) {
        lastDotaProcessCheckAt = now
        dotaRunning = await getDotaProcessStatus()
      }
      if (nextForeground !== dotaForeground) {
        dotaForeground = nextForeground
        overlayPayload.dotaForeground = dotaForeground
        workerWindow?.webContents.send('companion:foreground', { foreground: dotaForeground, running: dotaRunning })
        mainWindow?.webContents.send('companion:foreground', { foreground: dotaForeground, running: dotaRunning })
        if (dotaForeground && overlayWindow?.isVisible()) {
          placeOverlay(overlayWindow)
          await moveOverlayAboveDota()
          overlayWindow.webContents.send('overlay:payload', overlayPayload)
          void runLiveDotaProbe(active)
        } else if (!dotaForeground && overlayWindow?.isVisible() && !overlayPayload.diagnostic) {
          overlayWindow.hide()
        }
        void publishOverlayDiagnostic()
      }
    } catch (error) {
      log(`前台检测失败: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  await check()
  foregroundTimer = setInterval(check, 1000)
}

async function captureDisplay(displayId) {
  try {
    const displays = screen.getAllDisplays()
    const requested = displays.find((item) => String(item.id) === String(displayId))
    const display = requested || screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const width = Math.round(display.size.width * display.scaleFactor)
    const height = Math.round(display.size.height * display.scaleFactor)
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width, height } })
    const source = sources.find((item) => item.display_id === String(display.id)) || sources[0]
    if (!source || source.thumbnail.isEmpty()) return { ok: false, error: '无法读取当前屏幕，请检查 Windows 屏幕录制权限。' }
    return {
      ok: true,
      image: source.thumbnail.toDataURL(),
      width: source.thumbnail.getSize().width,
      height: source.thumbnail.getSize().height,
      displayId: String(display.id),
      displayName: display.label || `Monitor ${display.id}`,
      resolution: `${source.thumbnail.getSize().width} × ${source.thumbnail.getSize().height}`,
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : '屏幕截图失败。' }
  }
}

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    log('检测到第二次启动，已合并到现有实例')
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })

  process.on('uncaughtException', (error) => showStartupError(error))
  process.on('unhandledRejection', (error) => showStartupError(error))

  app.whenReady().then(async () => {
    loadSettings()
    registerApiHandler()
    startGameBarBridge()
    if (liveOcrAutostartEnabled || isSmokeTest) await ensureWorker()
    else log('LIVE_OCR_AUTOSTART_DISABLED reason=GAME_BAR_IPC_PERFORMANCE_GATE')
    await registerCompanionShortcuts()
    createTray()
    await createWindow()
    await startForegroundMonitor()
  }).catch((error) => {
    showStartupError(error)
    app.exit(1)
  })
}

function registerApiHandler() {
  ipcMain.handle('gamebar:get-state', () => publishGameBarBridgeState())
  ipcMain.handle('gamebar:send-test-message', () => {
    const message = TEST_MESSAGES[gameBarTestMessageIndex % TEST_MESSAGES.length]
    gameBarTestMessageIndex += 1
    return updateGameBarState('append', message)
  })
  ipcMain.handle('gamebar:set-visible', (_event, visible) => updateGameBarState('visible', visible))
  ipcMain.handle('gamebar:set-opacity', (_event, opacity) => updateGameBarState('opacity', opacity))
  ipcMain.handle('gamebar:refresh', () => updateGameBarState('refresh'))

  ipcMain.handle('overlay:update', (_event, payload) => {
    overlayPayload = {
      reports: Array.isArray(payload?.reports) ? payload.reports : overlayPayload.reports,
      translations: Array.isArray(payload?.translations) ? payload.translations.slice(-3) : overlayPayload.translations,
      diagnostic: typeof payload?.diagnostic === 'boolean' ? payload.diagnostic : overlayPayload.diagnostic,
      configured: typeof payload?.configured === 'boolean' ? payload.configured : overlayPayload.configured,
      engineStatus: typeof payload?.engineStatus === 'string' ? payload.engineStatus : overlayPayload.engineStatus,
      dotaForeground,
      shortcutStatus: overlayPayload.shortcutStatus,
    }
    overlayWindow?.webContents.send('overlay:payload', overlayPayload)
    return { ok: true }
  })

  ipcMain.handle('overlay:toggle', async () => {
    await toggleOverlay(true)
    return { ok: true, visible: Boolean(overlayWindow?.isVisible()) }
  })

  ipcMain.handle('overlay:settings', async (_event, next) => {
    overlaySettings = {
      opacity: Math.max(0.35, Math.min(1, Number(next?.opacity) || overlaySettings.opacity)),
      position: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(next?.position) ? next.position : overlaySettings.position,
      fontSize: Math.max(11, Math.min(28, Number(next?.fontSize) || overlaySettings.fontSize)),
      collapseDelay: Math.max(2000, Math.min(20000, Number(next?.collapseDelay) || overlaySettings.collapseDelay)),
      showOriginal: Boolean(next?.showOriginal),
    }
    saveSettings()
    if (overlayWindow) {
      overlayWindow.setOpacity(overlaySettings.opacity)
      placeOverlay(overlayWindow)
      overlayWindow.webContents.send('overlay:settings', overlaySettings)
    }
    return { ok: true, settings: overlaySettings }
  })

  ipcMain.handle('overlay:get-state', () => ({
    ok: true,
    verification: GAME_OVERLAY_VERIFICATION,
    payload: overlayPayload,
    settings: overlaySettings,
    visible: Boolean(overlayWindow?.isVisible()),
    diagnostics: {
      windowCreated: Boolean(overlayWindow && !overlayWindow.isDestroyed()),
      alwaysOnTop: Boolean(overlayWindow?.isAlwaysOnTop()),
      focusable: overlayWindow ? overlayWindow.isFocusable() : false,
      clickThrough: Boolean(overlayWindow && !overlayWindow.isDestroyed()),
    },
  }))

  ipcMain.handle('overlay:get-diagnostic', () => publishOverlayDiagnostic())
  ipcMain.handle('overlay:diagnostic-action', async (_event, action, value) => {
    try {
      if (action === 'scenario') {
        const allowed = ['desktop', 'dotaMainMenu', 'windowed', 'borderless', 'exclusiveFullscreen']
        if (!allowed.includes(value)) return { ok: false, error: '未知 Overlay 测试场景。' }
        overlayDiagnosticScenario = value
        lastOverlayAction = `SCENARIO_${String(value).toUpperCase()}`
        log(`OVERLAY_DIAGNOSTIC_SCENARIO value=${value}`)
      } else if (action === 'create') {
        overlayPayload = { ...overlayPayload, reports: [], translations: [], diagnostic: true, engineStatus: 'Overlay Diagnosis' }
        const window = await ensureOverlay()
        window.webContents.send('overlay:payload', overlayPayload)
        lastOverlayAction = 'CREATE'
        lastOverlayError = null
      } else if (action === 'show') {
        overlayPayload = { ...overlayPayload, reports: [], translations: [], diagnostic: true, engineStatus: 'Overlay Diagnosis' }
        const window = await ensureOverlay()
        window.webContents.send('overlay:payload', overlayPayload)
        placeOverlay(window)
        log('OVERLAY_SHOW_CALLED method=diagnostic-force-show')
        window.showInactive()
        window.setAlwaysOnTop(true, 'screen-saver')
        const zOrder = await moveOverlayAboveDota()
        lastOverlayError = zOrder ? null : 'OVERLAY_ZORDER_GAME_FAILURE'
        await logOverlayWindowState('FORCE_SHOW')
      } else if (action === 'hide') {
        if (overlayWindow && !overlayWindow.isDestroyed()) {
          log('OVERLAY_HIDE_CALLED method=diagnostic-force-hide')
          overlayWindow.hide()
        }
        lastOverlayAction = 'FORCE_HIDE'
        lastOverlayError = null
        await logOverlayWindowState('FORCE_HIDE')
      } else if (action === 'topRight') {
        const window = await ensureOverlay()
        placeOverlay(window)
        if (window.isVisible()) await moveOverlayAboveDota()
        await logOverlayWindowState('MOVE_TOP_RIGHT')
      } else if (action === 'center') {
        const window = await ensureOverlay()
        placeOverlayCenter(window)
        if (window.isVisible()) await moveOverlayAboveDota()
        await logOverlayWindowState('MOVE_CENTER')
      } else if (action === 'clickThrough') {
        const window = await ensureOverlay()
        overlayClickThrough = Boolean(value)
        window.setIgnoreMouseEvents(overlayClickThrough, { forward: true })
        log(`CLICK_THROUGH_CHANGED value=${overlayClickThrough}`)
        await logOverlayWindowState('CLICK_THROUGH_CHANGED')
      } else if (action === 'enforceTopmost') {
        const window = await ensureOverlay()
        if (!window.isVisible()) window.showInactive()
        window.setAlwaysOnTop(true, 'screen-saver')
        const result = await moveOverlayAboveDota()
        lastOverlayError = result ? null : 'OVERLAY_ZORDER_GAME_FAILURE'
        await logOverlayWindowState('ENFORCE_TOPMOST')
      } else if (action === 'nativePocStart') {
        const result = startNativeOverlayPoc()
        if (!result.ok) return result
        lastOverlayAction = 'NATIVE_POC_START'
        lastOverlayError = null
      } else if (action === 'nativePocStop') {
        stopNativeOverlayPoc()
        lastOverlayAction = 'NATIVE_POC_STOP'
        lastOverlayError = null
      } else {
        return { ok: false, error: '未知 Overlay 诊断操作。' }
      }
      return await publishOverlayDiagnostic()
    } catch (error) {
      lastOverlayError = error instanceof Error ? error.message : String(error)
      log(`OVERLAY_DIAGNOSTIC_ACTION_FAILED action=${action} reason=${lastOverlayError}`)
      return { ok: false, error: lastOverlayError }
    }
  })

  ipcMain.handle('dota:get-status', async () => {
    const installPath = getDotaInstallPath()
    return { ok: true, installed: Boolean(installPath), installPath, isRunning: dotaRunning, isForeground: dotaForeground, identityStatus: 'unavailable' }
  })

  ipcMain.handle('companion:get-state', () => ({
    ok: true,
    dotaRunning,
    dotaForeground,
    overlayVisible: Boolean(overlayWindow?.isVisible()),
    overlaySuppressed,
    settings: overlaySettings,
    shortcuts: overlayPayload.shortcutStatus || {},
    liveOcrEnabled: liveOcrAutostartEnabled,
    overlayVerification: GAME_OVERLAY_VERIFICATION,
    hotkeyDiagnostic,
  }))

  ipcMain.handle('hotkey:get-diagnostic', () => ({ ok: true, diagnostic: hotkeyDiagnostic }))
  ipcMain.handle('hotkey:set-phase', (_event, phase) => {
    if (!['desktop', 'dotaMenu', 'inMatch'].includes(phase)) return { ok: false, error: '未知诊断阶段。' }
    hotkeyDiagnostic.phase = phase
    log(`HOTKEY_DIAGNOSTIC_PHASE phase=${phase}`)
    publishHotkeyDiagnostic()
    return { ok: true, diagnostic: hotkeyDiagnostic }
  })
  ipcMain.handle('hotkey:reset-diagnostic', () => {
    hotkeyDiagnostic.counts = { toggle: 0, selectRegion: 0 }
    hotkeyDiagnostic.byContext = { desktop: { toggle: 0, selectRegion: 0 }, dotaForeground: { toggle: 0, selectRegion: 0 } }
    hotkeyDiagnostic.byPhase = {
      desktop: { toggle: 0, selectRegion: 0 },
      dotaMenu: { toggle: 0, selectRegion: 0 },
      inMatch: { toggle: 0, selectRegion: 0 },
    }
    hotkeyDiagnostic.lastEvent = null
    log('HOTKEY_DIAGNOSTIC_RESET')
    publishHotkeyDiagnostic()
    return { ok: true, diagnostic: hotkeyDiagnostic }
  })

  ipcMain.handle('companion:open-region-selector', () => openRegionSelector(true))
  ipcMain.handle('companion:region-confirmed', (_event, region) => {
    selectorWindow?.close()
    selectorWindow = null
    overlayPayload.configured = Boolean(region)
    overlayPayload.engineStatus = region ? (liveOcrAutostartEnabled ? 'OCR READY' : 'OCR 自动运行已暂停') : '聊天翻译未配置'
    workerWindow?.webContents.send('companion:region-changed', region)
    mainWindow?.webContents.send('companion:region-changed', region)
    overlayWindow?.webContents.send('overlay:payload', overlayPayload)
    return { ok: true }
  })
  ipcMain.handle('companion:region-cancelled', () => {
    selectorWindow?.close()
    selectorWindow = null
    return { ok: true }
  })
  ipcMain.handle('companion:region-cleared', () => {
    overlayPayload.configured = false
    overlayPayload.engineStatus = '聊天翻译未配置'
    workerWindow?.webContents.send('companion:region-changed', null)
    mainWindow?.webContents.send('companion:region-changed', null)
    overlayWindow?.webContents.send('overlay:payload', overlayPayload)
    return { ok: true }
  })
  ipcMain.handle('companion:worker-state', (_event, state) => {
    overlayPayload.configured = Boolean(state?.configured)
    overlayPayload.engineStatus = String(state?.status || (state?.configured ? 'OCR READY' : '聊天翻译未配置'))
    overlayWindow?.webContents.send('overlay:payload', overlayPayload)
    mainWindow?.webContents.send('companion:worker-state', state)
    if (state?.lastError) log(`翻译工作窗口错误: ${state.lastError}`)
    return { ok: true }
  })
  ipcMain.handle('outgoing:finish', (_event, options = {}) => {
    const text = String(options.text || '').trim()
    if (text && options.copy) clipboard.writeText(text)
    outgoingWindow?.close()
    outgoingWindow = null
    return { ok: true, copied: Boolean(text && options.copy), sent: false }
  })

  ipcMain.handle('capture:screen', async (_event, options = {}) => {
    const hideMain = Boolean(options.hideMain)
    if (hideMain) {
      mainWindow?.hide()
      await new Promise((resolve) => setTimeout(resolve, 350))
    }
    try {
      return await captureDisplay(options.displayId)
    } finally {
      if (hideMain && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  ipcMain.handle('translate:text', async (_event, options = {}) => {
    const text = String(options.text || '').trim().slice(0, 1200)
    if (!text) return { ok: false, error: '没有可翻译的文字。' }
    const target = String(options.target || 'zh-CN')
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 12000)
    try {
      if (options.apiKey) {
        const response = await net.fetch(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(options.apiKey)}`, {
          method: 'POST', signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: text, target, format: 'text' }),
        })
        if (!response.ok) throw new Error(`Google Cloud 翻译失败（${response.status}）`)
        const data = await response.json()
        const item = data?.data?.translations?.[0]
        return { ok: true, translated: item?.translatedText || text, language: item?.detectedSourceLanguage || 'auto', provider: 'google-cloud' }
      }
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text)}`
      const response = await net.fetch(url, { signal: controller.signal })
      if (!response.ok) throw new Error(`在线翻译暂时不可用（${response.status}）`)
      const data = await response.json()
      return { ok: true, translated: (data?.[0] || []).map((item) => item?.[0] || '').join('').trim(), language: data?.[2] || 'auto', provider: 'experimental' }
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, error: '翻译请求超时，请稍后重试。' }
      return { ok: false, error: error instanceof Error ? error.message : '翻译服务暂时不可用。' }
    } finally {
      clearTimeout(timeout)
    }
  })

  ipcMain.handle('opendota:player-data', async (_event, accountId) => {
    if (!Number.isInteger(accountId) || accountId <= 0 || accountId > 4294967295) {
      return { ok: false, error: '玩家 ID 无效，请检查后重试。' }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 18000)
    try {
      const projects = MATCH_FIELDS.map((field) => `project=${field}`).join('&')
      const [profile, matches] = await Promise.all([
        requestJson(`${API_BASE}/players/${accountId}`, controller.signal),
        requestJson(`${API_BASE}/players/${accountId}/matches?limit=50&${projects}`, controller.signal),
      ])

      if (!profile.profile) return { ok: false, error: '该玩家资料未公开，无法生成画像。' }
      if (!Array.isArray(matches) || matches.length === 0) {
        return { ok: false, error: '没有可分析的公开比赛。玩家可能隐藏了比赛数据。' }
      }
      return { ok: true, profile, matches }
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, error: '请求超时。OpenDota 可能繁忙，请稍后重试。' }
      log(`OpenDota 请求失败: ${error instanceof Error ? error.message : String(error)}`)
      return { ok: false, error: error instanceof Error ? error.message : 'OpenDota 暂时不可用，请稍后重试。' }
    } finally {
      clearTimeout(timeout)
    }
  })

  ipcMain.handle('opendota:scout-source', async (_event, accountId) => {
    if (!Number.isInteger(accountId) || accountId <= 0 || accountId > 4294967295) {
      return { ok: false, error: '玩家 ID 无效，请检查后重试。' }
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20000)
    try {
      const projects = MATCH_FIELDS.map((field) => `project=${field}`).join('&')
      const [profile, matches, heroes] = await Promise.all([
        requestJson(`${API_BASE}/players/${accountId}`, controller.signal),
        requestJson(`${API_BASE}/players/${accountId}/matches?limit=50&${projects}`, controller.signal),
        requestJson(`${API_BASE}/players/${accountId}/heroes`, controller.signal),
      ])
      if (!profile.profile) return { ok: false, error: '该玩家资料未公开，无法生成 Scout。' }
      if (!Array.isArray(matches) || matches.length === 0) return { ok: false, error: '没有可分析的公开比赛。玩家可能隐藏了比赛数据。' }
      return { ok: true, profile, matches, heroes: Array.isArray(heroes) ? heroes : [] }
    } catch (error) {
      if (error?.name === 'AbortError') return { ok: false, error: '请求超时。OpenDota 可能繁忙，请稍后重试。' }
      return { ok: false, error: error instanceof Error ? error.message : 'OpenDota 暂时不可用，请稍后重试。' }
    } finally {
      clearTimeout(timeout)
    }
  })

  ipcMain.handle('opendota:hero-metadata', async () => {
    try {
      if (!heroMetadataCache) heroMetadataCache = await requestJson(`${API_BASE}/heroStats`)
      return { ok: true, heroes: heroMetadataCache }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : '英雄资料暂时不可用。' }
    }
  })
}

async function requestJson(url, signal) {
  const response = await net.fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (response.status === 404) throw new Error('没有找到这个玩家。请检查 ID 是否正确。')
  if (response.status === 429) throw new Error('OpenDota 请求过于频繁，请稍等一分钟再试。')
  if (!response.ok) throw new Error(`OpenDota 暂时不可用（${response.status}），请稍后重试。`)
  return response.json()
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Dota Scout',
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 650,
    show: false,
    backgroundColor: '#080b10',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    log('主窗口已就绪，Companion 后台常驻')
  })

  mainWindow.webContents.on('did-fail-load', (_event, code, description) => {
    showStartupError(new Error(`界面加载失败（${code}）：${description}`))
  })

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    showStartupError(new Error(`界面进程异常退出：${details.reason}`))
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(www\.)?opendota\.com\//i.test(url)) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting && !isSmokeTest) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
  mainWindow.on('closed', () => { log('主窗口已销毁'); mainWindow = null })

  const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
  if (!fs.existsSync(indexPath)) throw new Error('应用界面文件缺失，请重新下载 Dota Scout。')
  await mainWindow.loadFile(indexPath)
  if (isSmokeTest) await runSmokeTest(mainWindow)
}

async function ensureWorker() {
  if (workerWindow && !workerWindow.isDestroyed()) return workerWindow
  workerWindow = new BrowserWindow({
    title: 'Dota Scout Translate Worker',
    width: 32,
    height: 32,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  })
  workerWindow.on('closed', () => { log('翻译工作窗口已销毁'); workerWindow = null })
  await loadRendererMode(workerWindow, 'translate-worker')
  workerWindow.webContents.send('companion:foreground', { foreground: dotaForeground, running: dotaRunning })
  return workerWindow
}

async function openRegionSelector(force = false) {
  if (!force && !dotaForeground) return { ok: false, error: 'Dota 2 当前不在前台。' }
  if (selectorWindow && !selectorWindow.isDestroyed()) {
    selectorWindow.show()
    selectorWindow.focus()
    return { ok: true }
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const capture = await captureDisplay(String(display.id))
  if (!capture.ok) return capture
  selectorWindow = new BrowserWindow({
    title: 'Dota Scout · 选择聊天区域',
    ...display.bounds,
    show: false,
    frame: false,
    transparent: false,
    backgroundColor: '#05070a',
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  selectorWindow.setAlwaysOnTop(true, 'screen-saver')
  selectorWindow.on('closed', () => { log('区域选择窗口已关闭'); selectorWindow = null })
  await loadRendererMode(selectorWindow, 'region-select')
  selectorWindow.webContents.send('region-selector:init', capture)
  selectorWindow.show()
  selectorWindow.focus()
  return { ok: true }
}

async function openOutgoingTranslate() {
  if (!dotaForeground) return { ok: false, error: 'Dota 2 当前不在前台。' }
  if (outgoingWindow && !outgoingWindow.isDestroyed()) {
    outgoingWindow.show()
    outgoingWindow.focus()
    return { ok: true }
  }
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const width = 520
  const height = 190
  outgoingWindow = new BrowserWindow({
    title: 'Dota Scout · Outgoing Translate',
    width,
    height,
    x: Math.round(display.bounds.x + (display.bounds.width - width) / 2),
    y: Math.round(display.bounds.y + display.bounds.height * .16),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    focusable: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  outgoingWindow.setAlwaysOnTop(true, 'screen-saver')
  outgoingWindow.on('closed', () => { outgoingWindow = null })
  await loadRendererMode(outgoingWindow, 'outgoing')
  outgoingWindow.show()
  outgoingWindow.focus()
  return { ok: true }
}

function placeOverlay(window) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const [width, height] = window.getSize()
  const margin = 18
  const left = overlaySettings.position.endsWith('left')
  const top = overlaySettings.position.startsWith('top')
  window.setPosition(
    left ? area.x + margin : area.x + area.width - width - margin,
    top ? area.y + margin : area.y + area.height - height - margin,
    false,
  )
}

function placeOverlayCenter(window) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
  const area = display.workArea
  const [width, height] = window.getSize()
  window.setPosition(
    Math.round(area.x + (area.width - width) / 2),
    Math.round(area.y + (area.height - height) / 2),
    false,
  )
}

async function ensureOverlay() {
  if (overlayWindow && !overlayWindow.isDestroyed()) return overlayWindow
  overlayWindow = new BrowserWindow({
    title: 'Dota Scout Overlay',
    width: OVERLAY_DIAGNOSTIC_SIZE.width,
    height: OVERLAY_DIAGNOSTIC_SIZE.height,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    focusable: false,
    skipTaskbar: true,
    resizable: false,
    fullscreenable: false,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  overlayWindow.setIgnoreMouseEvents(overlayClickThrough, { forward: true })
  overlayWindow.setOpacity(overlaySettings.opacity)
  overlayWindow.on('always-on-top-changed', (_event, value) => {
    log(`ALWAYS_ON_TOP_CHANGED value=${value}`)
    void publishOverlayDiagnostic()
  })
  overlayWindow.on('show', () => { log('OVERLAY_EVENT_SHOW'); void publishOverlayDiagnostic() })
  overlayWindow.on('hide', () => { log('OVERLAY_EVENT_HIDE'); void publishOverlayDiagnostic() })
  overlayWindow.on('closed', () => { overlayWindow = null; void publishOverlayDiagnostic() })
  await loadRendererMode(overlayWindow, 'overlay')
  placeOverlay(overlayWindow)
  overlayWindow.webContents.send('overlay:payload', overlayPayload)
  overlayWindow.webContents.send('overlay:settings', overlaySettings)
  log('OVERLAY_WINDOW_CREATED renderer=Electron width=320 height=120')
  await logOverlayWindowState('CREATE')
  return overlayWindow
}

async function toggleOverlay(userInitiated = false) {
  overlayPayload = { ...overlayPayload, reports: [], translations: [], diagnostic: true, engineStatus: 'Overlay Diagnosis' }
  const window = await ensureOverlay()
  window.webContents.send('overlay:payload', overlayPayload)
  log(`OVERLAY_TARGET_STATE value=${window.isVisible() ? 'HIDDEN' : 'VISIBLE'}`)
  if (window.isVisible()) {
    log('OVERLAY_HIDE_CALLED')
    window.hide()
    if (userInitiated) overlaySuppressed = true
    lastOverlayError = null
    await logOverlayWindowState('FORCE_HIDE')
  }
  else {
    if (userInitiated) overlaySuppressed = false
    placeOverlay(window)
    log('OVERLAY_SHOW_CALLED method=showInactive')
    window.showInactive()
    window.setAlwaysOnTop(true, 'screen-saver')
    window.webContents.send('overlay:payload', overlayPayload)
    const zOrder = await moveOverlayAboveDota()
    lastOverlayError = zOrder ? null : 'OVERLAY_ZORDER_GAME_FAILURE'
    await logOverlayWindowState('FORCE_SHOW')
  }
}

async function runSmokeTest(window) {
  const outputPath = process.env.DOTA_SCOUT_SMOKE_OUTPUT || path.join(app.getPath('userData'), 'smoke-test.json')
  const screenshotPath = process.env.DOTA_SCOUT_SCREENSHOT_OUTPUT || path.join(path.dirname(outputPath), 'dota-scout-ui.png')
  const waitingScreenshotPath = process.env.DOTA_SCOUT_WAITING_SCREENSHOT_OUTPUT || path.join(path.dirname(outputPath), 'dota-scout-waiting.png')
  const settingsScreenshotPath = process.env.DOTA_SCOUT_SETTINGS_SCREENSHOT_OUTPUT || path.join(path.dirname(outputPath), 'dota-scout-settings.png')
  const overlayScreenshotPath = process.env.DOTA_SCOUT_OVERLAY_SCREENSHOT_OUTPUT || path.join(path.dirname(outputPath), 'dota-scout-overlay.png')
  let result = { ok: false, error: '桌面端真实性与交互测试超时。' }

  try {
    window.show()
    await new Promise((resolve) => setTimeout(resolve, 350))
    log('自检阶段 1/7：默认真实性状态')
    const initialState = await window.webContents.executeJavaScript(`({
      desktopBridge: Boolean(window.dotaScoutDesktop),
      waitingVisible: Boolean(document.querySelector('.waiting-match')),
      initialRows: document.querySelectorAll('.scout-player').length,
      manualInputsOnMain: document.querySelectorAll('.match-scout-page .roster-input-row').length,
      scanDisabled: Boolean(document.querySelector('.unreleased-button')?.disabled),
      demoBannerVisible: Boolean(document.querySelector('.data-mode-banner'))
    })`)
    if (!initialState.desktopBridge || !initialState.waitingVisible || initialState.initialRows !== 0 || initialState.manualInputsOnMain !== 0 || !initialState.scanDisabled || initialState.demoBannerVisible) {
      throw new Error(`默认等待状态不真实：${JSON.stringify(initialState)}`)
    }
    fs.mkdirSync(path.dirname(waitingScreenshotPath), { recursive: true })
    fs.writeFileSync(waitingScreenshotPath, (await window.webContents.capturePage()).toPNG())

    const kickoff = await window.webContents.executeJavaScript(`
      (() => {
        try {
          const button = document.querySelector('.header-actions .ghost-button');
          if (!button) throw new Error('界面没有正确加载演示入口。');
          button.click();
          return { ok: true };
        } catch (error) {
          return { ok: false, error: error instanceof Error ? error.message : String(error) };
        }
      })()
    `)

    if (!kickoff.ok) throw new Error(kickoff.error)

    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      const state = await window.webContents.executeJavaScript(`
        ({
          desktopBridge: Boolean(window.dotaScoutDesktop),
          rows: document.querySelectorAll('.scout-player').length,
          allyRows: document.querySelectorAll('.scout-team.ally .scout-player').length,
          enemyRows: document.querySelectorAll('.scout-team.enemy .scout-player').length,
          hasOverallScore: /综合|可靠度|overall/i.test(document.body.innerText),
          demoBanner: document.querySelector('.data-mode-banner.demo')?.textContent || '',
          title: document.querySelector('.page-header h1')?.textContent || ''
        })
      `)
      if (state.desktopBridge && state.rows === 10 && state.allyRows === 5 && state.enemyRows === 5 && /DEMO/.test(state.demoBanner)) {
        result = { ok: true, ...state }
        break
      }
    }
    if (!result.ok) throw new Error(result.error)
    fs.mkdirSync(path.dirname(screenshotPath), { recursive: true })
    fs.writeFileSync(screenshotPath, (await window.webContents.capturePage()).toPNG())
    await window.webContents.executeJavaScript(`document.querySelector('.scout-player')?.click()`)
    await new Promise((resolve) => setTimeout(resolve, 250))
    const details = await window.webContents.executeJavaScript(`({ drawer: Boolean(document.querySelector('.details-drawer')), matches: document.querySelectorAll('.recent-match').length })`)
    await window.webContents.executeJavaScript(`document.querySelector('.drawer-close')?.click()`)
    const bridgeChecks = await window.webContents.executeJavaScript(`Promise.all([
      window.dotaScoutDesktop.captureScreen(),
      window.dotaScoutDesktop.translateText({ text: 'smoke rosh then buyback', target: 'zh-CN' }),
      window.dotaScoutDesktop.fetchScoutSource(86745912),
      window.dotaScoutDesktop.getDotaStatus()
    ]).then(([capture, translation, scout, dota]) => ({
      captureOk: capture.ok,
      captureSize: capture.ok ? [capture.width, capture.height] : null,
      translationOk: translation.ok,
      detectedLanguage: translation.ok ? translation.language : null,
      realDataOk: scout.ok,
      realMatchCount: scout.ok ? scout.matches.length : 0,
      realHeroHistoryCount: scout.ok ? scout.heroes.length : 0,
      dotaStatusOk: dota.ok,
      dotaInstalled: dota.ok ? dota.installed : false,
      autoIdentityStatus: dota.ok ? dota.identityStatus : null
    }))`)
    if (!bridgeChecks.captureOk || !bridgeChecks.translationOk || !bridgeChecks.realDataOk || !bridgeChecks.dotaStatusOk || bridgeChecks.autoIdentityStatus !== 'unavailable') throw new Error(`桌面桥接自检失败：${JSON.stringify(bridgeChecks)}`)
    log('自检阶段 2/7：桌面桥接与真实 API')

    await window.webContents.executeJavaScript(`document.querySelectorAll('.app-nav nav button')[1]?.click()`)
    await new Promise((resolve) => setTimeout(resolve, 250))
    await window.webContents.executeJavaScript(`document.querySelector('.translate-controls .ghost-button')?.click()`)
    let selectorBounds = null
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 250))
      if (selectorWindow && !selectorWindow.isDestroyed()) selectorBounds = await selectorWindow.webContents.executeJavaScript(`(() => { const box = document.querySelector('.region-image')?.getBoundingClientRect(); return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null })()`)
      if (selectorBounds) break
    }
    if (!selectorBounds) throw new Error('两阶段区域选择器没有打开。')
    const start = { x: Math.round(selectorBounds.x + selectorBounds.width * .12), y: Math.round(selectorBounds.y + selectorBounds.height * .58) }
    const end = { x: Math.round(selectorBounds.x + selectorBounds.width * .48), y: Math.round(selectorBounds.y + selectorBounds.height * .78) }
    await selectorWindow.webContents.executeJavaScript(`document.querySelector('.region-image').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1, clientX: ${start.x}, clientY: ${start.y} }))`)
    await selectorWindow.webContents.executeJavaScript(`document.querySelector('.region-image').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 1, clientX: ${end.x}, clientY: ${end.y} }))`)
    await selectorWindow.webContents.executeJavaScript(`document.querySelector('.region-image').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, buttons: 0, clientX: ${end.x}, clientY: ${end.y} }))`)
    await new Promise((resolve) => setTimeout(resolve, 250))
    const pendingSelection = await selectorWindow.webContents.executeJavaScript(`({ phase: document.querySelector('.region-modal')?.dataset.phase || '', hint: document.querySelector('.region-box span')?.textContent || '', style: document.querySelector('.region-box')?.getAttribute('style') || '', frame: (() => { const b = document.querySelector('.region-image')?.getBoundingClientRect(); return b ? { x:b.x,y:b.y,width:b.width,height:b.height } : null })() })`)
    if (pendingSelection.phase !== 'confirm') throw new Error(`区域拖动后没有进入待确认状态：${JSON.stringify(pendingSelection)}`)
    const selectedBox = await selectorWindow.webContents.executeJavaScript(`(() => { const box = document.querySelector('.region-box')?.getBoundingClientRect(); return box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null })()`)
    const confirmPoint = { x: Math.round(selectedBox.x + selectedBox.width * .5), y: Math.round(selectedBox.y + selectedBox.height * .5) }
    selectorWindow.webContents.sendInputEvent({ type: 'mouseDown', x: confirmPoint.x, y: confirmPoint.y, button: 'left', clickCount: 1 })
    selectorWindow.webContents.sendInputEvent({ type: 'mouseUp', x: confirmPoint.x, y: confirmPoint.y, button: 'left', clickCount: 1 })
    await new Promise((resolve) => setTimeout(resolve, 350))
    const regionCheck = await window.webContents.executeJavaScript(`({ selectorClosed: true, savedNote: document.querySelector('.active-region-note')?.textContent || '', hasStoredRegion: Boolean(localStorage.getItem('dota-scout:chat-region-v2')) })`)
    if (!regionCheck.selectorClosed || !regionCheck.hasStoredRegion) throw new Error(`区域二次点击没有保存：${JSON.stringify(regionCheck)}`)
    log('自检阶段 3/7：独立两阶段区域选择')

    workerWindow.webContents.send('companion:foreground', { foreground: true, running: true })
    let ocrCheck = { ocrOk: false, ocrStatus: '', ocrError: '' }
    for (let attempt = 0; attempt < 120; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      ocrCheck = {
        ocrOk: /Translate ON|本轮/.test(overlayPayload.engineStatus || ''),
        ocrStatus: overlayPayload.engineStatus || '',
        ocrError: /失败|错误|变化/.test(overlayPayload.engineStatus || '') ? overlayPayload.engineStatus : '',
      }
      if (ocrCheck.ocrOk || ocrCheck.ocrError) break
    }
    workerWindow.webContents.send('companion:foreground', { foreground: false, running: false })
    await window.webContents.executeJavaScript(`document.querySelectorAll('.app-nav nav button')[3]?.click()`)
    if (!ocrCheck.ocrOk) throw new Error(ocrCheck.ocrError || `OCR 自检未完成：${ocrCheck.ocrStatus}`)
    log('自检阶段 4/7：后台固定区域 OCR')
    await new Promise((resolve) => setTimeout(resolve, 250))
    const settingsRegion = await window.webContents.executeJavaScript(`({ values: document.querySelector('.region-values')?.textContent || '', preview: Boolean(document.querySelector('.region-inspector img')) })`)
    if (!settingsRegion.preview || !/Width/.test(settingsRegion.values)) throw new Error(`Settings 没有显示已保存区域：${JSON.stringify(settingsRegion)}`)
    await window.webContents.executeJavaScript(`document.querySelector('.ocr-region-card .primary-button')?.click()`)
    let ocrTest = { ok: false, status: '', error: '', screenshot: false, text: '' }
    for (let attempt = 0; attempt < 80; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      ocrTest = await window.webContents.executeJavaScript(`({
        ok: document.querySelector('.ocr-region-card .control-result')?.textContent?.includes('测试完成') || false,
        status: document.querySelector('.ocr-region-card .control-result')?.textContent || '',
        error: document.querySelector('.ocr-region-card .translate-error')?.textContent || '',
        screenshot: Boolean(document.querySelector('.ocr-test-result img')),
        text: document.querySelector('.ocr-test-result pre')?.textContent || ''
      })`)
      if (ocrTest.ok || ocrTest.error) break
    }
    if (!ocrTest.ok || !ocrTest.screenshot) throw new Error(ocrTest.error || `Settings OCR 测试未完成：${JSON.stringify(ocrTest)}`)
    log('自检阶段 5/7：Settings 截图、OCR、语言与翻译')
    fs.writeFileSync(settingsScreenshotPath, (await window.webContents.capturePage()).toPNG())
    dotaForeground = true
    const outgoingOpen = await openOutgoingTranslate()
    if (!outgoingOpen.ok) throw new Error(outgoingOpen.error)
    await outgoingWindow.webContents.executeJavaScript(`(() => { const input = document.querySelector('input'); const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; setter.call(input, '我还有20秒BKB，不要打'); input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`)
    await new Promise((resolve) => setTimeout(resolve, 350))
    const outgoingCheck = await outgoingWindow.webContents.executeJavaScript(`({ result: document.querySelector('output')?.textContent || '', status: document.querySelector('.outgoing-overlay > small')?.textContent || '' })`)
    if (outgoingCheck.result !== "Don't fight. BKB in 20s.") throw new Error(`Outgoing 翻译不符合要求：${JSON.stringify(outgoingCheck)}`)
    outgoingWindow.close()
    outgoingWindow = null
    dotaForeground = false
    log('自检阶段 6/7：Outgoing Translate')
    await window.webContents.executeJavaScript(`document.querySelector('.settings-card .primary-button')?.click()`)
    await new Promise((resolve) => setTimeout(resolve, 500))
    const overlayCheck = await window.webContents.executeJavaScript(`window.dotaScoutDesktop.getOverlayState().then((state) => ({ visible: state.visible, ...state.diagnostics }))`)
    if (!overlayCheck.visible || !overlayCheck.windowCreated || !overlayCheck.alwaysOnTop || overlayCheck.focusable) throw new Error(`Overlay 状态检查失败：${JSON.stringify(overlayCheck)}`)
    log('自检阶段 7/7：紧凑 Windows Overlay')
    fs.writeFileSync(overlayScreenshotPath, (await overlayWindow.webContents.capturePage()).toPNG())
    const companionCheck = await window.webContents.executeJavaScript(`window.dotaScoutDesktop.getCompanionState()`)
    if (!companionCheck.shortcuts.toggle || !companionCheck.shortcuts.selectRegion || !companionCheck.shortcuts.outgoing) throw new Error(`全局快捷键注册失败：${JSON.stringify(companionCheck.shortcuts)}`)
    result = { ...result, ...initialState, ...details, ...bridgeChecks, ...regionCheck, ...ocrCheck, settingsRegion, ocrTest, outgoingCheck, companionCheck, overlayCheck, waitingScreenshotPath, screenshotPath, settingsScreenshotPath, overlayScreenshotPath, overlayVisible: overlayWindow.isVisible() }
  } catch (error) {
    result = { ok: false, error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, JSON.stringify({ ...result, testedAt: new Date().toISOString() }, null, 2), 'utf8')
  log(`桌面端自检${result.ok ? '通过' : '失败'}: ${JSON.stringify(result)}`)
  app.exit(result.ok ? 0 : 1)
}

app.on('activate', () => {
  if (!mainWindow) void createWindow()
  else showMainWindow()
})

app.on('window-all-closed', () => {
  log('所有 BrowserWindow 已关闭；后台进程保持运行')
})

app.on('before-quit', () => { isQuitting = true; stopGameBarBridge(); stopNativeOverlayPoc() })

app.on('will-quit', () => {
  if (foregroundTimer) clearInterval(foregroundTimer)
  if (trayDiagnosticTimer) clearTimeout(trayDiagnosticTimer)
  globalShortcut.unregisterAll()
})
