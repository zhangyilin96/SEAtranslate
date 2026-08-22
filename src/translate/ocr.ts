import { createWorker, PSM } from 'tesseract.js'

type OcrWorker = Awaited<ReturnType<typeof createWorker>>
let englishWorker: OcrWorker | null = null
let thaiWorker: OcrWorker | null = null
let progressListener: ((status: string, progress: number) => void) | null = null

async function createConfiguredWorker(languages: string[]) {
  const active = await createWorker(languages, undefined, {
      logger: (message) => progressListener?.(message.status || 'loading', message.progress || 0),
  })
  // Dota renders the colored player/tag prefix and the white message on one
  // visual row. SINGLE_COLUMN can split those colors into separate TSV blocks,
  // leaving the parser with a speaker-only row and an orphaned message.
  await active.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, preserve_interword_spaces: '1', user_defined_dpi: '300' })
  return active
}

export async function getOcrWorker(listener?: (status: string, progress: number) => void) {
  progressListener = listener ?? null
  if (!englishWorker) englishWorker = await createConfiguredWorker(['eng'])
  return englishWorker
}

export async function getThaiOcrWorker(listener?: (status: string, progress: number) => void) {
  progressListener = listener ?? null
  if (!thaiWorker) thaiWorker = await createConfiguredWorker(['eng', 'tha'])
  return thaiWorker
}

export async function recognizeImage(image: string, listener?: (status: string, progress: number) => void) {
  const active = await getOcrWorker(listener)
  const result = await active.recognize(image)
  return result.data.text.trim()
}

export async function terminateOcrWorker() {
  await Promise.all([englishWorker?.terminate(), thaiWorker?.terminate()])
  englishWorker = null
  thaiWorker = null
}
