import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { usePolling } from '../live/usePolling'
import { buildGrass, type GrassGrid } from './grass'
import { fetchProjectUsage, type ProjectUsage } from './usageApi'

export type UsageStatus = 'loading' | 'ready' | 'error'

export interface ProjectUsageRead {
  status: UsageStatus
  usage: ProjectUsage | null
  grid: GrassGrid | null
  /** The day the window ends on. Held still so the grid and the request agree. */
  today: Date
}

/**
 * One project's spend, and the grid drawn from it.
 *
 * Polled rather than streamed. The agent posts usage in batches after the calls
 * happen and drops a batch it fails to send, so these numbers trail the run log
 * by up to a flush interval; a poll redraws the latest totals without a button.
 * A poll never returns to `loading`, and one that fails keeps the figures
 * already on screen.
 */
export function useProjectUsage(projectId: string): ProjectUsageRead {
  // Pinned on mount. Reading the clock per render would let the window slide
  // mid-session, and a viewer whose tab is open past midnight would see the
  // grid and the request disagree about which day is "today".
  const [today] = useState(() => new Date())
  const [usage, setUsage] = useState<ProjectUsage | null>(null)
  const [status, setStatus] = useState<UsageStatus>('loading')
  const inFlight = useRef<AbortController | null>(null)

  // Aborts any request still running, so two reads never overlap and a late
  // answer cannot overwrite a newer one. A failure becomes `error` only while
  // nothing has loaded yet.
  const load = useCallback(() => {
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    fetchProjectUsage(projectId, today, controller.signal)
      .then((result) => {
        setUsage(result)
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatus((current) => (current === 'ready' ? current : 'error'))
      })
  }, [projectId, today])

  useEffect(() => {
    load()
    return () => inFlight.current?.abort()
  }, [load])

  usePolling(load)

  const grid = useMemo(
    () => (usage === null ? null : buildGrass(usage.daily, today)),
    [usage, today],
  )

  return { status, usage, grid, today }
}
