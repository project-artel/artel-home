import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { isProjectChangeTopic, projectEvents, type ProjectChangeTopic } from './projectEvents'

/**
 * Calls `onChange` when the project change stream says one of `topics` moved,
 * and once on every `ready` (first connect and each reconnect), so the caller
 * re-reads whatever it may have missed. Calls within 300ms are coalesced.
 *
 * Returns whether the stream is live. Callers pass `!live` as `usePolling`'s
 * `enabled`, so polling runs only while the stream is down. A `null`
 * `projectId` subscribes to nothing and always reads as not live.
 *
 * `onChange` is read through a ref, so an inline function does not resubscribe.
 * It must reload silently, for the same reason a poll tick must.
 */
export function useProjectChange(
  projectId: string | null,
  topics: readonly ProjectChangeTopic[] | ProjectChangeTopic,
  onChange: () => void,
): boolean {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  // A string key, so a fresh array literal each render does not resubscribe.
  const topicKey = (typeof topics === 'string' ? [topics] : topics).join(',')

  useEffect(() => {
    if (projectId === null) return undefined
    return projectEvents.subscribe(projectId, {
      topics: topicKey.split(',').filter(isProjectChangeTopic),
      onChange: () => onChangeRef.current(),
    })
  }, [projectId, topicKey])

  const watch = useCallback(
    (listener: () => void) => (projectId === null ? () => {} : projectEvents.watchLive(projectId, listener)),
    [projectId],
  )
  const read = useCallback(() => projectId !== null && projectEvents.isLive(projectId), [projectId])
  return useSyncExternalStore(watch, read, () => false)
}
