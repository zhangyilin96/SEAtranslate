import { useEffect, useState } from 'react'
import type { ScreenCaptureResult } from '../desktop'
import { saveCaptureRegion, type CaptureRegion } from '../translate/region'
import { RegionSelector } from './RegionSelector'

export function RegionSelectorView() {
  const [capture, setCapture] = useState<Extract<ScreenCaptureResult, { ok: true }> | null>(null)

  useEffect(() => window.dotaScoutDesktop?.onRegionSelectorInit(setCapture), [])

  async function confirm(region: CaptureRegion) {
    if (!capture) return
    const saved = await saveCaptureRegion(region, capture)
    await window.dotaScoutDesktop?.confirmRegion(saved)
  }

  if (!capture) return <main className="selector-loading">正在读取 Dota 画面…</main>
  return <RegionSelector image={capture.image} width={capture.width} height={capture.height} onCancel={() => void window.dotaScoutDesktop?.cancelRegion()} onConfirm={(region) => void confirm(region)} />
}
