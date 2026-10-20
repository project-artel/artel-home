/*
 * 대화마다 지켜보고 있는 job 을 localStorage 에 남긴다. 탭을 새로 고치면 메모리의 watch 는 사라지므로,
 * 대화창이 `resumeWatches` 로 이 기록을 읽어 다시 지켜본다.
 */

export type WatchKind = 'content_map_scan' | 'qa_run'

export type WatchRecord = {
  kind: WatchKind
  id: string
  label: string
  /** 지켜보기 시작한 시각(epoch 밀리초). 오래된 스캔 결과를 새 것으로 착각하지 않는 기준이다. */
  startedAtMs: number
}

type WatchStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** 이만큼 지난 기록은 이어 지켜보지 않고 버린다. QA 실행은 길어도 한 시간을 넘기는 일이 드물다. */
export const WATCH_RECORD_MAX_AGE_MS = 6 * 60 * 60 * 1000

export function watchKey(kind: WatchKind, id: string): string {
  return `${kind}:${id}`
}

export function watchStorageKey(projectId: string, conversationId: number): string {
  return `artel.projectAgent.watches.${projectId}.${conversationId}`
}

export function isWatchKind(value: unknown): value is WatchKind {
  return value === 'content_map_scan' || value === 'qa_run'
}

function parseRecords(raw: string | null): WatchRecord[] {
  if (raw === null) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((entry): WatchRecord[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const { kind, id, label, startedAtMs } = entry as Record<string, unknown>
    if (!isWatchKind(kind) || typeof id !== 'string' || id.length === 0) return []
    if (typeof startedAtMs !== 'number' || !Number.isFinite(startedAtMs)) return []
    return [{ kind, id, label: typeof label === 'string' ? label : '', startedAtMs }]
  })
}

/** 저장소를 못 읽으면 빈 목록이다. 지켜보기는 계속되고, 새로 고친 뒤에만 이어지지 않는다. */
export function loadWatchRecords(
  storage: WatchStorage,
  projectId: string,
  conversationId: number,
  nowMs: number,
): WatchRecord[] {
  try {
    return parseRecords(storage.getItem(watchStorageKey(projectId, conversationId))).filter(
      (record) => nowMs - record.startedAtMs < WATCH_RECORD_MAX_AGE_MS,
    )
  } catch {
    return []
  }
}

function writeRecords(storage: WatchStorage, projectId: string, conversationId: number, records: WatchRecord[]): void {
  const key = watchStorageKey(projectId, conversationId)
  try {
    if (records.length === 0) storage.removeItem(key)
    else storage.setItem(key, JSON.stringify(records))
  } catch {
    // private mode 등. 이번 탭에서만 지켜본다.
  }
}

/** 같은 job 이 이미 있으면 새 기록으로 바꾼다. */
export function saveWatchRecord(
  storage: WatchStorage,
  projectId: string,
  conversationId: number,
  record: WatchRecord,
  nowMs: number,
): void {
  const others = loadWatchRecords(storage, projectId, conversationId, nowMs).filter(
    (one) => watchKey(one.kind, one.id) !== watchKey(record.kind, record.id),
  )
  writeRecords(storage, projectId, conversationId, [...others, record])
}

export function removeWatchRecord(
  storage: WatchStorage,
  projectId: string,
  conversationId: number,
  kind: WatchKind,
  id: string,
  nowMs: number,
): void {
  const remaining = loadWatchRecords(storage, projectId, conversationId, nowMs).filter(
    (one) => watchKey(one.kind, one.id) !== watchKey(kind, id),
  )
  writeRecords(storage, projectId, conversationId, remaining)
}

export function clearWatchRecords(storage: WatchStorage, projectId: string, conversationId: number): void {
  writeRecords(storage, projectId, conversationId, [])
}
