import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { OverlayView } from './components/OverlayView'
import { OutgoingTranslate } from './components/OutgoingTranslate'
import { RegionSelectorView } from './components/RegionSelectorView'
import { TranslateWorker } from './components/TranslateWorker'
import './styles.css'

const mode = new URLSearchParams(window.location.search).get('mode')
document.body.classList.toggle('overlay-mode', mode === 'overlay')
document.body.classList.toggle('selector-mode', mode === 'region-select')
document.body.classList.toggle('outgoing-mode', mode === 'outgoing')

const content = mode === 'overlay'
  ? <OverlayView />
  : mode === 'region-select'
    ? <RegionSelectorView />
    : mode === 'translate-worker'
      ? <TranslateWorker />
      : mode === 'outgoing'
        ? <OutgoingTranslate />
        : <App />

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {content}
  </StrictMode>,
)
