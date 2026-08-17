import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { conciseDotaEnglish, exactDotaEnglish } from '../translate/outgoing'

export function OutgoingTranslate() {
  const input = useRef<HTMLInputElement>(null)
  const [source, setSource] = useState('')
  const [result, setResult] = useState('')
  const [status, setStatus] = useState('Enter 生成 Dota 英文 · ESC 取消')

  useEffect(() => { input.current?.focus() }, [])

  async function generate() {
    const text = source.trim()
    if (!text) return
    setStatus('正在生成简短 Dota 英文…')
    const exact = exactDotaEnglish(text)
    if (exact) {
      setResult(exact)
      setStatus('再次 Enter 复制并返回游戏 · 不会自动发送')
      return
    }
    const translated = await window.dotaScoutDesktop?.translateText({ text, target: 'en' })
    if (!translated?.ok) {
      setStatus(translated?.error || '翻译失败')
      return
    }
    setResult(conciseDotaEnglish(translated.translated))
    setStatus('再次 Enter 复制并返回游戏 · 不会自动发送')
  }

  function keydown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      void window.dotaScoutDesktop?.finishOutgoing({})
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (result) void window.dotaScoutDesktop?.finishOutgoing({ text: result, copy: true })
      else void generate()
    }
  }

  return (
    <main className="outgoing-overlay">
      <header><strong>DS · OUTGOING</strong><span>Alt+T</span></header>
      <label>说给队友：<input ref={input} value={source} onChange={(event) => { setSource(event.target.value); setResult('') }} onKeyDown={keydown} placeholder="我还有20秒BKB，不要打" /></label>
      {result && <output>{result}</output>}
      <small>{status}</small>
    </main>
  )
}
