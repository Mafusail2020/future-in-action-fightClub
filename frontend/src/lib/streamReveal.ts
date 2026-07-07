/**
 * Self-pacing typewriter for streamed text. SSE tokens arrive in uneven network
 * bursts; revealing them raw looks choppy. This buffers incoming text and hands
 * it out on animation frames at a steady cadence — a fixed fraction of the
 * backlog per frame (with a small floor), so it catches up smoothly on a burst
 * and short tails still finish quickly, the way Claude's own UI reads.
 */
export function createReveal(
  onReveal: (chunk: string) => void,
  onDrained: () => void,
) {
  let buffer = ''
  let raf = 0
  let ending = false

  const tick = () => {
    if (buffer.length > 0) {
      const n = Math.min(buffer.length, Math.max(3, Math.ceil(buffer.length * 0.2)))
      onReveal(buffer.slice(0, n))
      buffer = buffer.slice(n)
    }
    if (buffer.length > 0) {
      raf = requestAnimationFrame(tick)
    } else {
      raf = 0
      if (ending) {
        ending = false
        onDrained()
      }
    }
  }

  const kick = () => {
    if (!raf) raf = requestAnimationFrame(tick)
  }

  return {
    /** Queue streamed text; revealed gradually over the next frames. */
    push(text: string) {
      buffer += text
      kick()
    },
    /** Stream finished: keep draining smoothly, then fire onDrained once. */
    finish() {
      ending = true
      if (!raf && buffer.length === 0) {
        ending = false
        onDrained()
      } else {
        kick()
      }
    },
    /** Aborted/errored: dump the remainder instantly and stop. */
    cancel() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
      ending = false
      if (buffer.length > 0) {
        onReveal(buffer)
        buffer = ''
      }
    },
  }
}
