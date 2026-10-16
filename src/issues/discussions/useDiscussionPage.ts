import { useCallback, useEffect, useRef, useState } from 'react'
import type { Page } from './discussionTypes'

export function useDiscussionPage<T extends { id: string }>(
  load: (cursor: string | undefined, signal: AbortSignal) => Promise<Page<T>>,
) {
  const [items, setItems] = useState<T[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreFailed, setMoreFailed] = useState(false)
  const [revision, setRevision] = useState(0)
  const controller = useRef<AbortController | null>(null)
  const busy = useRef(false)
  useEffect(() => {
    const current = new AbortController()
    controller.current = current
    busy.current = false
    void Promise.resolve().then(() => {
      if (current.signal.aborted) return
      setStatus('loading')
      setItems([])
      setCursor(null)
      setMoreFailed(false)
      setLoadingMore(false)
      return load(undefined, current.signal)
        .then((page) => {
          if (current.signal.aborted) return
          setItems(page.items)
          setCursor(page.nextCursor)
          setStatus('ready')
        })
        .catch(() => {
          if (!current.signal.aborted) setStatus('error')
        })
    })
    return () => current.abort()
  }, [load, revision])
  const loadMore = useCallback(async () => {
    const current = controller.current
    if (!cursor || !current || current.signal.aborted || busy.current) return
    busy.current = true
    setLoadingMore(true)
    setMoreFailed(false)
    try {
      const page = await load(cursor, current.signal)
      if (current.signal.aborted) return
      setItems((existing) => [
        ...existing,
        ...page.items.filter(
          (item) => !existing.some((previous) => previous.id === item.id),
        ),
      ])
      setCursor(page.nextCursor)
    } catch {
      if (!current.signal.aborted) setMoreFailed(true)
    } finally {
      if (!current.signal.aborted) {
        busy.current = false
        setLoadingMore(false)
      }
    }
  }, [cursor, load])
  return {
    items,
    setItems,
    status,
    loadingMore,
    moreFailed,
    hasMore: cursor !== null,
    loadMore,
    refresh: () => setRevision((value) => value + 1),
  }
}
