import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { CaptureRegion } from '../translate/region'

type Point = { x: number; y: number }

function inside(point: Point, box: CaptureRegion) {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height
}

export function RegionSelector({ image, width, height, onCancel, onConfirm }: { image: string; width: number; height: number; onCancel(): void; onConfirm(region: CaptureRegion): void }) {
  const frame = useRef<HTMLDivElement>(null)
  const drag = useRef<{ origin: Point; moved: boolean } | null>(null)
  const [box, setBox] = useState<CaptureRegion | null>(null)

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onCancel() }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [onCancel])

  function point(event: PointerEvent): Point {
    const bounds = frame.current!.getBoundingClientRect()
    return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }
  }

  function down(event: PointerEvent) {
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* synthetic desktop tests may not own a pointer capture */ }
    drag.current = { origin: point(event), moved: false }
  }

  function move(event: PointerEvent) {
    if (!drag.current) return
    const current = point(event)
    const origin = drag.current.origin
    if (Math.abs(current.x - origin.x) + Math.abs(current.y - origin.y) > .006) drag.current.moved = true
    if (!drag.current.moved) return
    setBox({ x: Math.min(origin.x, current.x), y: Math.min(origin.y, current.y), width: Math.abs(current.x - origin.x), height: Math.abs(current.y - origin.y) })
  }

  function up(event: PointerEvent) {
    if (!drag.current) return
    const finish = point(event)
    if (!drag.current.moved && box && inside(finish, box)) {
      onConfirm(box)
      drag.current = null
      return
    }
    if (!drag.current.moved) setBox(null)
    drag.current = null
  }

  const valid = Boolean(box && box.width >= .03 && box.height >= .03)
  const ratio = width / Math.max(height, 1)
  return (
    <div className="region-modal" data-phase={valid ? 'confirm' : 'select'}>
      <div className="region-toolbar">
        <strong>{valid ? '已选择区域' : '框选 Dota 聊天区域'}</strong>
        <span>{valid ? '再次点击矩形确认 · 拖动可重新选择 · ESC 取消' : '第一步：按下鼠标并拖动，松开后进入待确认状态'}</span>
        <button onClick={onCancel}>取消</button>
        <button className="primary-button" disabled={!valid} onClick={() => box && onConfirm(box)}>确认此区域</button>
      </div>
      <div ref={frame} className="region-image" style={{ backgroundImage: `url(${image})`, aspectRatio: `${width} / ${height}`, width: `min(100vw, calc((100vh - 56px) * ${ratio}))` }} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
        {box && <div className="region-box" style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}><span>单击区域内部确认</span></div>}
      </div>
    </div>
  )
}
