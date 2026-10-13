import { useCallback, useEffect, useState } from 'react'
import { listQaChanges, qaChangeKey, type QaChange } from './qaChangeApi'
import type { QaRun } from './qaTypes'

type LoadState = 'loading' | 'ready' | 'error'

export type QaRunChanges = {
  items: QaChange[]
  state: LoadState
  reload: () => void
  replaceItem: (updated: QaChange) => void
}

/**
 * The knowledge entries and macros this run created, updated, or deleted.
 *
 * It re-reads whenever `run` changes. The page already polls the run every few
 * seconds while it is active and stops once it is finished, so this follows that
 * polling instead of running a timer of its own, and reads once more after the
 * last poll. It lives outside the panel so the tab label can show the count
 * while the chat tab is open.
 */
export function useQaRunChanges(qaRun: QaRun): QaRunChanges {
  const qaRunId = qaRun.id
  const [items, setItems] = useState<QaChange[]>([])
  const [state, setState] = useState<LoadState>('loading')
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    listQaChanges(qaRunId, controller.signal)
      .then((next) => {
        setItems(next)
        setState('ready')
      })
      .catch(() => {
        if (controller.signal.aborted) return
        // A failed poll keeps the list already on screen.
        setState((previous) => (previous === 'ready' ? 'ready' : 'error'))
      })
    return () => controller.abort()
  }, [qaRunId, qaRun, reloadToken])

  const replaceItem = useCallback((updated: QaChange) => {
    setItems((current) =>
      current.map((item) => (qaChangeKey(item) === qaChangeKey(updated) ? updated : item)),
    )
  }, [])

  const reload = useCallback(() => setReloadToken((token) => token + 1), [])

  return { items, state, reload, replaceItem }
}
