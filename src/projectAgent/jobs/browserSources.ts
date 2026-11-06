import {
  contentMapEventsUrl,
  parseContentMapScanEvent,
  parseContentMapSnapshotEvent,
} from '../../contentMap/contentMapApi'
import type { LastScan } from '../../contentMap/contentMapTypes'
import { getQaRun } from '../../qa/qaApi'
import { tasksCopy } from '../tasksCopy'
import { browserLockManager } from '../webLocks'
import type { Clock, WatchDependencies } from './watchRunner'
import { createQaRunObserver, createScanObserver } from './watchRunner'

/*
 * `watch_job` 을 브라우저에 붙이는 부분: 실제 timer, localStorage, EventSource, `getQaRun`.
 * 판단은 모두 `watchRunner.ts` 와 `jobTranslation.ts` 에 있고 여기에는 없다.
 */

export const browserClock: Clock = {
  now: () => Date.now(),
  sleep: (milliseconds, signal) =>
    new Promise<boolean>((resolve) => {
      if (signal.aborted) {
        resolve(false)
        return
      }
      const onAbort = () => {
        clearTimeout(timer)
        resolve(false)
      }
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve(true)
      }, milliseconds)
      signal.addEventListener('abort', onAbort, { once: true })
    }),
}

/** `.../content-map/events` 의 `snapshot` 과 `scan` frame 에서 마지막 스캔을 읽는다. */
export function subscribeToScan(
  projectId: string,
  buildId: string,
  onScan: (scan: LastScan | null) => void,
): () => void {
  const source = new EventSource(contentMapEventsUrl(projectId, buildId), { withCredentials: true })
  source.addEventListener('snapshot', (event: Event) => {
    if (!(event instanceof MessageEvent)) return
    const frame = parseContentMapSnapshotEvent(event.data)
    if (frame !== null) onScan(frame.scan)
  })
  source.addEventListener('scan', (event: Event) => {
    if (!(event instanceof MessageEvent)) return
    const frame = parseContentMapScanEvent(event.data)
    if (frame !== null) onScan(frame.scan)
  })
  return () => source.close()
}

function browserStorage(): WatchDependencies['storage'] {
  try {
    return window.localStorage
  } catch {
    // 저장소 접근 자체가 던지는 환경. 기록 없이 이번 탭에서만 지켜본다.
    return { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
  }
}

export function browserWatchDependencies(projectId: string): WatchDependencies {
  return {
    clock: browserClock,
    storage: browserStorage(),
    copy: tasksCopy,
    observers: {
      qa_run: createQaRunObserver(getQaRun, browserClock, tasksCopy),
      content_map_scan: createScanObserver(subscribeToScan, projectId, tasksCopy),
    },
    lockManager: browserLockManager(),
  }
}
