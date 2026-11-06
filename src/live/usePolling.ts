import { useEffect, useRef } from 'react'

/** How often a screen re-reads data that has no server push. */
export const POLL_INTERVAL_MS = 10_000

/**
 * Calls `tick` every `intervalMs` while the tab is visible, in place of a
 * refresh button.
 *
 * A hidden tab does not poll. When the tab becomes visible again `tick` runs
 * once right away, so a viewer coming back sees current data instead of waiting
 * out the interval.
 *
 * `tick` is read through a ref, so passing a new function each render does not
 * restart the timer. It must reload silently: a tick that flips the screen back
 * to a loading state would blank it every `intervalMs`.
 */
export function usePolling(tick: () => void, intervalMs = POLL_INTERVAL_MS, enabled = true): void {
  const tickRef = useRef(tick)
  useEffect(() => {
    tickRef.current = tick
  })

  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setInterval> | null = null
    const start = () => {
      if (timer === null) timer = setInterval(() => tickRef.current(), intervalMs)
    }
    const stop = () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        tickRef.current()
        start()
      } else {
        stop()
      }
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [intervalMs, enabled])
}
