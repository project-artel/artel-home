import { useCallback, useEffect, useRef, useState } from 'react'
import { getQaRun } from './qaApi'
import { isTerminalQaRunStatus, type QaRun } from './qaTypes'

export type QaRunLoadStatus = 'loading' | 'ready' | 'missing' | 'error'

export type QaRunSession = {
  loadStatus: QaRunLoadStatus
  run: QaRun | null
  reload: () => void
}

/** How often to re-read a live run's scenario states. The per-scenario detail is
 *  real-time (SSE); this overview only needs to keep the status column honest. */
const POLL_MS = 2500

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function statusOf(error: unknown): number | null {
  return typeof error === 'object' && error !== null && 'status' in error
    ? ((error as { status?: unknown }).status as number | null)
    : null
}

/**
 * Follows one run's overview. Polls {@link getQaRun} while the run is non-terminal
 * so the scenario status column advances as the session moves through them, then
 * stops once the run has ended. Each poll uses a fresh cursor via reload token.
 */
export function useQaRun(qaRunId: string): QaRunSession {
  const [loadStatus, setLoadStatus] = useState<QaRunLoadStatus>('loading')
  const [run, setRun] = useState<QaRun | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const generationRef = useRef(0)

  useEffect(() => {
    const generation = ++generationRef.current
    const controller = new AbortController()
    let timer: number | undefined

    async function tick() {
      try {
        const next = await getQaRun(qaRunId, controller.signal)
        if (generationRef.current !== generation) return
        setRun(next)
        setLoadStatus('ready')
        // Keep polling only while there is still something to change.
        if (!isTerminalQaRunStatus(next.status)) {
          timer = window.setTimeout(tick, POLL_MS)
        }
      } catch (error: unknown) {
        if (isAbort(error) || generationRef.current !== generation) return
        setLoadStatus(statusOf(error) === 404 ? 'missing' : 'error')
      }
    }

    // No synchronous reset here: the route remounts this hook via `key={qaRunId}`
    // so a new run starts from the initial 'loading', and a reload from an error
    // state simply settles again when tick() resolves.
    void tick()

    return () => {
      controller.abort()
      if (timer !== undefined) window.clearTimeout(timer)
    }
  }, [qaRunId, reloadToken])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  return { loadStatus, run, reload }
}
