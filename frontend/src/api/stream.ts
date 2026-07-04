import type { ChatFinal, ModelAlias, StreamEvent } from './types'

export interface StreamHandlers {
  onToken: (text: string) => void
  onStatus: (tool: string) => void
  onFinal: (payload: ChatFinal) => void
  onError: (message: string) => void
}

/** POST + ReadableStream SSE parser (EventSource can't POST). */
export async function streamChat(
  body: { session_id: string | null; message: string; model: ModelAlias },
  handlers: StreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch('/api/v1/chat/stream', {
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

  const dispatch = (frame: string) => {
    let event = ''
    let data = ''
    for (const line of frame.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim()
      else if (line.startsWith('data: ')) data += line.slice(6)
    }
    if (!event || !data) return
    const parsed = { event, data: JSON.parse(data) } as StreamEvent
    if (parsed.event === 'token') handlers.onToken(parsed.data.text)
    else if (parsed.event === 'status') handlers.onStatus(parsed.data.tool)
    else if (parsed.event === 'final') handlers.onFinal(parsed.data)
    else if (parsed.event === 'error') handlers.onError(parsed.data.message)
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
  } catch (error) {
    if ((error as Error).name !== 'AbortError') {
      handlers.onError('З’єднання обірвалося під час відповіді')
    }
  }
}
