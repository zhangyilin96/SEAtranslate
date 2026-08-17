import { createWorker } from 'tesseract.js'

type OcrWorker = Awaited<ReturnType<typeof createWorker>>
let worker: OcrWorker | null = null
let progressListener: ((status: string, progress: number) => void) | null = null

export async function getOcrWorker(listener?: (status: string, progress: number) => void) {
  progressListener = listener ?? null
  if (!worker) {
    worker = await createWorker(['eng', 'tha', 'msa', 'ind'], undefined, {
      logger: (message) => progressListener?.(message.status || 'loading', message.progress || 0),
    })
  }
  return worker
}

export async function recognizeImage(image: string, listener?: (status: string, progress: number) => void) {
  const active = await getOcrWorker(listener)
  const result = await active.recognize(image)
  return result.data.text.trim()
}

export async function terminateOcrWorker() {
  if (!worker) return
  await worker.terminate()
  worker = null
}
