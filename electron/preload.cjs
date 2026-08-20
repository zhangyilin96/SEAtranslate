const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dotaScoutDesktop', {
  platform: 'windows',
  fetchPlayerData: (accountId) => ipcRenderer.invoke('opendota:player-data', accountId),
  fetchScoutSource: (accountId) => ipcRenderer.invoke('opendota:scout-source', accountId),
  fetchHeroMetadata: () => ipcRenderer.invoke('opendota:hero-metadata'),
  updateOverlay: (payload) => ipcRenderer.invoke('overlay:update', payload),
  toggleOverlay: () => ipcRenderer.invoke('overlay:toggle'),
  setOverlaySettings: (settings) => ipcRenderer.invoke('overlay:settings', settings),
  getOverlayState: () => ipcRenderer.invoke('overlay:get-state'),
  getOverlayDiagnostic: () => ipcRenderer.invoke('overlay:get-diagnostic'),
  runOverlayDiagnosticAction: (action, value) => ipcRenderer.invoke('overlay:diagnostic-action', action, value),
  getDotaStatus: () => ipcRenderer.invoke('dota:get-status'),
  getCompanionState: () => ipcRenderer.invoke('companion:get-state'),
  setLiveTranslateEnabled: (enabled) => ipcRenderer.invoke('companion:set-live-translate-enabled', enabled),
  getHotkeyDiagnostic: () => ipcRenderer.invoke('hotkey:get-diagnostic'),
  setHotkeyDiagnosticPhase: (phase) => ipcRenderer.invoke('hotkey:set-phase', phase),
  resetHotkeyDiagnostic: () => ipcRenderer.invoke('hotkey:reset-diagnostic'),
  openRegionSelector: () => ipcRenderer.invoke('companion:open-region-selector'),
  confirmRegion: (region) => ipcRenderer.invoke('companion:region-confirmed', region),
  cancelRegion: () => ipcRenderer.invoke('companion:region-cancelled'),
  clearRegion: () => ipcRenderer.invoke('companion:region-cleared'),
  reportWorkerState: (state) => ipcRenderer.invoke('companion:worker-state', state),
  finishOutgoing: (options) => ipcRenderer.invoke('outgoing:finish', options),
  captureScreen: (options) => ipcRenderer.invoke('capture:screen', options),
  translateText: (options) => ipcRenderer.invoke('translate:text', options),
  getGameBarState: () => ipcRenderer.invoke('gamebar:get-state'),
  sendGameBarTestMessage: () => ipcRenderer.invoke('gamebar:send-test-message'),
  setGameBarVisible: (visible) => ipcRenderer.invoke('gamebar:set-visible', visible),
  setGameBarOpacity: (opacity) => ipcRenderer.invoke('gamebar:set-opacity', opacity),
  refreshGameBarState: () => ipcRenderer.invoke('gamebar:refresh'),
  publishGameBarTranslations: (lines) => ipcRenderer.invoke('gamebar:publish-translations', lines),
  onGameBarState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('gamebar:state', listener)
    return () => ipcRenderer.removeListener('gamebar:state', listener)
  },
  onOverlayPayload: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('overlay:payload', listener)
    return () => ipcRenderer.removeListener('overlay:payload', listener)
  },
  onOverlaySettings: (callback) => {
    const listener = (_event, settings) => callback(settings)
    ipcRenderer.on('overlay:settings', listener)
    return () => ipcRenderer.removeListener('overlay:settings', listener)
  },
  onOverlayDiagnostic: (callback) => {
    const listener = (_event, payload) => callback(payload)
    ipcRenderer.on('overlay:diagnostic', listener)
    return () => ipcRenderer.removeListener('overlay:diagnostic', listener)
  },
  onForegroundState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('companion:foreground', listener)
    return () => ipcRenderer.removeListener('companion:foreground', listener)
  },
  onHotkeyDiagnostic: (callback) => {
    const listener = (_event, diagnostic) => callback(diagnostic)
    ipcRenderer.on('hotkey:diagnostic', listener)
    return () => ipcRenderer.removeListener('hotkey:diagnostic', listener)
  },
  onRegionChanged: (callback) => {
    const listener = (_event, region) => callback(region)
    ipcRenderer.on('companion:region-changed', listener)
    return () => ipcRenderer.removeListener('companion:region-changed', listener)
  },
  onWorkerState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('companion:worker-state', listener)
    return () => ipcRenderer.removeListener('companion:worker-state', listener)
  },
  onRegionSelectorInit: (callback) => {
    const listener = (_event, capture) => callback(capture)
    ipcRenderer.on('region-selector:init', listener)
    return () => ipcRenderer.removeListener('region-selector:init', listener)
  },
})
