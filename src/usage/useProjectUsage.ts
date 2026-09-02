import { useEffect, useMemo, useState } from 'react'
import { buildGrass, type GrassGrid } from './grass'
import { fetchProjectUsage, type ProjectUsage } from './usageApi'

export type UsageStatus = 'loading' | 'ready' | 'error'

export interface ProjectUsageRead {
  status: UsageStatus
  usage: ProjectUsage | null
  grid: GrassGrid | null
  /** The day the window ends on. Held still so the grid and the request agree. */
  today: Date
  reload: () => void
}

/**
 * One project's spend, and the grid drawn from it.
 *
 * **Not live.** The agent posts usage in batches after the calls happen and
 * drops a batch it fails to send, so these numbers trail the run log by up to a
 * flush interval. Polling would only redraw the same figures more often; the
 * panel and the section both offer a refresh instead.
 */
export function useProjectUsage(projectId: string): ProjectUsageRead {
  // Pinned on mount. Reading the clock per render would let the window slide
  // mid-session, and a viewer whose tab is open past midnight would see the
  // grid and the request disagree about which day is "today".
  const [today] = useState(() => new Date())
  const [usage, setUsage] = useState<ProjectUsage | null>(null)
  const [status, setStatus] = useState<UsageStatus>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  // The effect writes only when a request settles. `loading` belongs to the
  // refresh handler, which is the event that causes it.
  useEffect(() => {
    const controller = new AbortController()

    fetchProjectUsage(projectId, today, controller.signal)
      .then((result) => {
        setUsage(result)
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatus('error')
      })

    return () => controller.abort()
  }, [projectId, today, reloadToken])

  const grid = useMemo(
    () => (usage === null ? null : buildGrass(usage.daily, today)),
    [usage, today],
  )

  return {
    status,
    usage,
    grid,
    today,
    reload: () => {
      setStatus('loading')
      setReloadToken((token) => token + 1)
    },
  }
}
