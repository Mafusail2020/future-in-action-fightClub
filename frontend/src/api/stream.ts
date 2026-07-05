import type { ChatRequestBody, MapOp, MatchesEvent, SourcesMap } from './types'

export interface StreamHandlers {
  onMatches: (payload: MatchesEvent) => void
  onToken: (text: string) => void
  onMapOp: (op: MapOp) => void
  onSources: (sources: SourcesMap) => void
  onDone: () => void
  onError: (message: string) => void
}

/**
 * POST /api/v1/chat consumed as SSE (fetch + ReadableStream — EventSource can't POST).
 * Event order from the backend: `matches` (optional, when city+country sent) →
 * `token`* → `done`; `error` may replace any of it.
 */
export async function streamChat(
  body: ChatRequestBody,
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/v1/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      handlers.onError('Немає з’єднання з сервером')
    }
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
    if (event === 'matches') handlers.onMatches(JSON.parse(data) as MatchesEvent)
    else if (event === 'token') handlers.onToken((JSON.parse(data) as { text: string }).text)
    else if (event === 'map_op') handlers.onMapOp(JSON.parse(data) as MapOp)
    else if (event === 'sources') handlers.onSources(JSON.parse(data) as SourcesMap)
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
    if (!finished) {
      // stream closed without done/error (backend crash mid-stream)
      handlers.onError('З’єднання обірвалося під час відповіді')
    }
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      handlers.onError('З’єднання обірвалося під час відповіді')
    }
  }
}
