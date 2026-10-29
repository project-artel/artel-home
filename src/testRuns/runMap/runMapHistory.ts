/**
 * 맵의 되돌리기 · 다시 하기(ARTEL-1245). 한 칸은 한 동작이고, 앞 · 뒤 상태를 함께 든다. 되돌리기는 앞 상태를,
 * 다시 하기는 뒤 상태를 다시 적용한다(TS 저장이면 PUT 을 한 번 더 한다).
 */
export type HistoryEntry<T> = { label: string; before: T; after: T }

export type History<T> = { undo: HistoryEntry<T>[]; redo: HistoryEntry<T>[] }

const LIMIT = 100

export function emptyHistory<T>(): History<T> {
  return { undo: [], redo: [] }
}

/** 새 동작을 쌓는다. 다시 하기 칸은 비운다. */
export function record<T>(history: History<T>, entry: HistoryEntry<T>): History<T> {
  return { undo: [...history.undo, entry].slice(-LIMIT), redo: [] }
}

export function undo<T>(history: History<T>): { history: History<T>; entry: HistoryEntry<T> } | null {
  const entry = history.undo[history.undo.length - 1]
  if (entry === undefined) return null
  return { history: { undo: history.undo.slice(0, -1), redo: [...history.redo, entry] }, entry }
}

export function redo<T>(history: History<T>): { history: History<T>; entry: HistoryEntry<T> } | null {
  const entry = history.redo[history.redo.length - 1]
  if (entry === undefined) return null
  return { history: { undo: [...history.undo, entry], redo: history.redo.slice(0, -1) }, entry }
}
