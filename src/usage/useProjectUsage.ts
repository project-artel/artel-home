import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProjectChange } from '../live/useProjectChange'
import { usePolling } from '../live/usePolling'
import { buildGrass, type GrassGrid } from './grass'
import { fetchUsage, type ProjectUsage } from './usageApi'

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
 * The agent posts usage in batches after the calls happen and drops a batch it
 * fails to send, so these numbers trail the run log by up to a flush interval.
 * The project change stream reports `USAGE` when a batch lands and the totals
 * are re-read then; polling covers the time the stream is down. A re-read never
 * returns to `loading`, and one that fails keeps the figures already on screen.
 */
export function useProjectUsage(projectId: string): ProjectUsageRead {
  return useUsage(projectId)
}

/**
 * [useProjectUsage] 의 넓은 판(ARTEL-1393). [projectId] 가 null 이면 볼 수 있는 전 프로젝트 합산이다 — 프로젝트 변경
 * 흐름이 없으니 polling 만 한다. [enabled] 가 false 면 읽지 않는다(같은 것을 두 번 읽지 않게).
 */
export function useUsage(projectId: string | null, enabled = true): ProjectUsageRead {
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
    if (!enabled) return
    inFlight.current?.abort()
    const controller = new AbortController()
    inFlight.current = controller

    fetchUsage(projectId, today, controller.signal)
      .then((result) => {
        setUsage(result)
        setStatus('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setStatus((current) => (current === 'ready' ? current : 'error'))
      })
  }, [projectId, today, enabled])

  useEffect(() => {
    load()
    return () => inFlight.current?.abort()
  }, [load])

  const live = useProjectChange(enabled ? projectId : null, 'USAGE', load)
  usePolling(load, undefined, !live)

  const grid = useMemo(
    () => (usage === null ? null : buildGrass(usage.daily, today)),
    [usage, today],
  )

  return { status, usage, grid, today }
}
