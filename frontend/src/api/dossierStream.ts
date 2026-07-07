import type { Dossier } from './types'

export interface DossierProgress {
  stage: string
  found?: number
  facts?: number
  sections?: number
}

export interface DossierStreamHandlers {
  onProgress: (p: DossierProgress) => void
  onDossier: (d: Dossier) => void
  onError: (message: string) => void
  onDone: () => void
}

/**
 * POST /api/v1/dossier/deep-dive as SSE (fetch + ReadableStream). The backend
 * builds the dossier live and streams `progress`* → `dossier` → `done`, so the
 * UI can show the research happening; `error` may replace the tail.
 */
export async function streamDeepDive(
  body: { city: string; country: string; model?: string },
  handlers: DossierStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/v1/dossier/deep-dive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as Error).name !== 'AbortError') handlers.onError('Немає з’єднання з сервером')
    return
  }
  if (!response.ok || !response.body) {
    handlers.onError(`Сервер відповів помилкою (${response.status})`)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false

  const dispatch = (frame: string) => {
    let event = ''
    let data = ''
    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim()
      else if (line.startsWith('data: ')) data += line.slice(6)
    }
    if (!event) return
    if (event === 'progress') handlers.onProgress(JSON.parse(data) as DossierProgress)
    else if (event === 'dossier') handlers.onDossier(JSON.parse(data) as Dossier)
    else if (event === 'done') {
      finished = true
      handlers.onDone()
    } else if (event === 'error') {
      finished = true
      handlers.onError((JSON.parse(data) as { message: string }).message)
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')
      while (boundary !== -1) {
        dispatch(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        boundary = buffer.indexOf('\n\n')
      }
    }
    if (buffer.trim()) dispatch(buffer)
    if (!finished) handlers.onError('З’єднання обірвалося під час аналізу')
  } catch (error) {
    if ((error as Error).name !== 'AbortError') handlers.onError('З’єднання обірвалося під час аналізу')
  }
}
