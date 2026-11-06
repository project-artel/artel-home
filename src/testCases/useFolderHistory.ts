import { useCallback, useEffect, useRef, useState } from 'react'
import { FolderHistory, type FolderCommand, type HistoryState } from './folderHistory'

/**
 * 폴더 작업 기록을 화면에 붙인다(ARTEL-1024). 프로젝트가 바뀌면 기록을 비운다.
 *
 * [onSettled] 는 작업 · Undo · Redo 가 끝날 때마다(실패해도) 부른다 — 화면이 폴더와 목록을 다시 읽는다.
 * 작업([execute])의 실패는 던진다. dialog 가 그 오류를 그 자리에서 보여 준다. Undo · Redo 의 실패는
 * [onFailed] 로 알린다.
 */
export function useFolderHistory(
  projectId: string,
  onSettled: () => void,
  onFailed: (error: unknown) => void,
) {
  const [state, setState] = useState<HistoryState>({ canUndo: false, canRedo: false, busy: false })
  const [history] = useState(() => new FolderHistory(setState))

  useEffect(() => {
    history.clear()
  }, [history, projectId])

  const settledRef = useRef(onSettled)
  const failedRef = useRef(onFailed)
  useEffect(() => {
    settledRef.current = onSettled
    failedRef.current = onFailed
  })

  const execute = useCallback(
    async (command: FolderCommand): Promise<boolean> => {
      try {
        return await history.execute(command)
      } finally {
        settledRef.current()
      }
    },
    [history],
  )

  const step = useCallback(
    async (direction: 'undo' | 'redo'): Promise<FolderCommand | null> => {
      try {
        return await (direction === 'undo' ? history.undo() : history.redo())
      } catch (error: unknown) {
        failedRef.current(error)
        return null
      } finally {
        settledRef.current()
      }
    },
    [history],
  )

  return { ...state, execute, step }
}
