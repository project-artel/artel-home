import { apiFetch } from '../../auth/authApi'
import { asNullableString, asRecord, asString, readJson, toApiError } from '../../projects/projectApi'

/*
 * QA 실행 화면이 읽는 값(ARTEL-1084) — 프로젝트의 실행 목록과 테스트 런의 "지난 실행 이후".
 * 서버는 orchestration ARTEL-1083 의 두 조회다. 둘 다 읽기만 한다.
 */

/** 실행(`qa_run`) 한 줄. 케이스 수는 판정이 없으면 0 이 아니라 null 이다. */
export type QaRunSummary = {
  id: string
  testRunId: string
  testRunName: string | null
  gameInstanceId: string
  gameInstanceName: string | null
  gameBuildVersion: string | null
  model: string | null
  reasoningEffort: string | null
  keySource: string | null
  status: string
  startedAt: string
  completedAt: string | null
  casesPassed: number | null
  casesTotal: number | null
  issueCount: number
  /** 실행을 시작한 사람(app_user id). */
  startedBy: string
  /** 추가 검토로 고른 판정 수와, 그중 사람이 아직 정하지 않은 수(ARTEL-1255). */
  reviewFlagged: number
  reviewPending: number
}

export type SinceLastQaIssue = {
  id: string
  title: string
  severity: string | null
  status: string
  qaTryId: string
  scenarioId: string
  scenarioTitle: string
  step: number | null
  reportedAt: string
}

export type SinceLastQaChangeKind =
  | 'ISSUE_RESOLVED'
  | 'BUILD_REPORTED'
  | 'SCENARIO_UPDATED'
  | 'SCENARIO_ADDED'
  | 'CASE_VERSION_ADDED'

export type SinceLastQaChange = {
  kind: SinceLastQaChangeKind
  at: string
  subjectId: string | null
  subjectName: string | null
  count: number
}

export type SinceLastQa = {
  lastQaRun: QaRunSummary | null
  issues: SinceLastQaIssue[]
  changes: SinceLastQaChange[]
}

const CHANGE_KINDS: readonly SinceLastQaChangeKind[] = [
  'ISSUE_RESOLVED',
  'BUILD_REPORTED',
  'SCENARIO_UPDATED',
  'SCENARIO_ADDED',
  'CASE_VERSION_ADDED',
]

function asCountOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export function parseQaRunSummary(data: unknown): QaRunSummary | null {
  const record = asRecord(data)
  const id = record === null ? '' : asString(record.id)
  if (record === null || id.length === 0) return null
  return {
    id,
    testRunId: asString(record.testRunId),
    testRunName: asNullableString(record.testRunName),
    gameInstanceId: asString(record.gameInstanceId),
    gameInstanceName: asNullableString(record.gameInstanceName),
    gameBuildVersion: asNullableString(record.gameBuildVersion),
    model: asNullableString(record.model),
    reasoningEffort: asNullableString(record.reasoningEffort),
    keySource: asNullableString(record.keySource),
    status: asString(record.status),
    startedAt: asString(record.startedAt),
    completedAt: asNullableString(record.completedAt),
    casesPassed: asCountOrNull(record.casesPassed),
    casesTotal: asCountOrNull(record.casesTotal),
    issueCount: asCountOrNull(record.issueCount) ?? 0,
    startedBy: asString(record.startedBy),
    reviewFlagged: asCountOrNull(record.reviewFlagged) ?? 0,
    reviewPending: asCountOrNull(record.reviewPending) ?? 0,
  }
}

export function parseSinceLastQa(data: unknown): SinceLastQa {
  const record = asRecord(data) ?? {}
  const issues = Array.isArray(record.issues) ? record.issues : []
  const changes = Array.isArray(record.changes) ? record.changes : []
  return {
    lastQaRun: parseQaRunSummary(record.lastQaRun),
    issues: issues.flatMap((value) => {
      const issue = asRecord(value)
      const id = issue === null ? '' : asString(issue.id)
      if (issue === null || id.length === 0) return []
      return [{
        id,
        title: asString(issue.title),
        severity: asNullableString(issue.severity),
        status: asString(issue.status),
        qaTryId: asString(issue.qaTryId),
        scenarioId: asString(issue.scenarioId),
        scenarioTitle: asString(issue.scenarioTitle),
        step: asCountOrNull(issue.step),
        reportedAt: asString(issue.reportedAt),
      }]
    }),
    // 모르는 종류는 버린다. 서버가 종류를 늘려도 화면이 빈 줄을 그리지 않게.
    changes: changes.flatMap((value) => {
      const change = asRecord(value)
      const kind = change === null ? '' : asString(change.kind)
      if (change === null || !CHANGE_KINDS.includes(kind as SinceLastQaChangeKind)) return []
      return [{
        kind: kind as SinceLastQaChangeKind,
        at: asString(change.at),
        subjectId: asNullableString(change.subjectId),
        subjectName: asNullableString(change.subjectName),
        count: asCountOrNull(change.count) ?? 1,
      }]
    }),
  }
}

/** 프로젝트의 실행, 최신순. [testRunId] 를 주면 그 테스트 런의 실행만(QA 히스토리, ARTEL-1100). */
export async function listProjectQaRuns(
  projectId: string,
  limit: number,
  signal?: AbortSignal,
  testRunId?: string,
): Promise<QaRunSummary[]> {
  const query = new URLSearchParams({ limit: String(limit) })
  if (testRunId !== undefined) query.set('testRunId', testRunId)
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/qa-runs?${query}`, { signal })
  if (!response.ok) throw await toApiError(response)
  const items = asRecord(await readJson(response))?.items
  return Array.isArray(items) ? items.map(parseQaRunSummary).filter((run): run is QaRunSummary => run !== null) : []
}

/** 상단바 알림함 한 줄(ARTEL-1255): 내가 시작해 끝난 실행과 그 프로젝트. */
export type QaNotice = {
  run: QaRunSummary
  projectId: string
  projectName: string
  read: boolean
}

/** 알림함. [unreadCount] 는 [items] 밖의 오래된 것까지 센다. */
export type QaNotices = { items: QaNotice[]; unreadCount: number }

export function parseQaNotices(data: unknown): QaNotices {
  const record = asRecord(data)
  const items = Array.isArray(record?.items) ? record.items : []
  return {
    items: items.flatMap((item) => {
      const entry = asRecord(item)
      const run = parseQaRunSummary(entry?.run)
      if (entry === null || run === null) return []
      return [{ run, projectId: asString(entry.projectId), projectName: asString(entry.projectName), read: entry.read === true }]
    }),
    unreadCount: asCountOrNull(record?.unreadCount) ?? 0,
  }
}

export async function listQaNotices(signal?: AbortSignal): Promise<QaNotices> {
  const response = await apiFetch('/api/qa-notices?limit=10', { signal })
  if (!response.ok) throw await toApiError(response)
  return parseQaNotices(await readJson(response))
}

/** 알림 하나를 읽음으로. 서버가 고친 알림함을 돌려준다. */
export async function readQaNotice(qaRunId: string): Promise<QaNotices> {
  const response = await apiFetch(`/api/qa-notices/${encodeURIComponent(qaRunId)}/read`, { method: 'POST' })
  if (!response.ok) throw await toApiError(response)
  return parseQaNotices(await readJson(response))
}

export async function readAllQaNotices(): Promise<QaNotices> {
  const response = await apiFetch('/api/qa-notices/read-all', { method: 'POST' })
  if (!response.ok) throw await toApiError(response)
  return parseQaNotices(await readJson(response))
}

/** 알림이 가리키는 곳. 검토할 판정이 남았으면 검토 화면으로 바로 간다. */
export function qaNoticeTarget(projectId: string, run: Pick<QaRunSummary, 'id' | 'reviewPending'>): string {
  return `/projects/${encodeURIComponent(projectId)}/qa-history/${encodeURIComponent(run.id)}${run.reviewPending > 0 ? '?review=1' : ''}`
}

/** 끝 알림이 새로 떴다. 상단바 알림함이 이 소식을 받고 다시 읽는다. */
export const QA_NOTICES_CHANGED = 'artel:qa-notices-changed'

export async function getSinceLastQa(projectId: string, testRunId: string, signal?: AbortSignal): Promise<SinceLastQa> {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(testRunId)}/since-last-qa`,
    { signal },
  )
  if (!response.ok) throw await toApiError(response)
  return parseSinceLastQa(await readJson(response))
}

/** 빠른 시작 한 칸 — 최근에 돌린 (런, 게임, 모델, 키 출처) 조합. 추론은 그 조합의 마지막 값이다. */
export type QuickStart = {
  run: QaRunSummary
  /** 같은 조합으로 돈 횟수. */
  times: number
}

/**
 * 최근 실행에서 서로 다른 조합을 최신순으로 [limit] 개 고른다.
 *
 * 같은 조합을 세 번 돌렸으면 칸은 하나다 — 칸이 같은 것으로 채워지면 고를 것이 없다. 지워진 런의
 * 실행은 다시 돌릴 수 없으므로 뺀다.
 */
export function quickStarts(runs: readonly QaRunSummary[], liveRunIds: ReadonlySet<string>, limit = 3): QuickStart[] {
  const seen = new Map<string, QuickStart>()
  for (const run of runs) {
    if (!liveRunIds.has(run.testRunId) || run.model === null) continue
    const key = [run.testRunId, run.gameInstanceId, run.model, run.keySource ?? ''].join('|')
    const known = seen.get(key)
    if (known !== undefined) known.times += 1
    else seen.set(key, { run, times: 1 })
  }
  return [...seen.values()].slice(0, limit)
}

/** 통과율(0~100). 판정이 없으면 null. */
export function passRate(run: Pick<QaRunSummary, 'casesPassed' | 'casesTotal'>): number | null {
  if (run.casesPassed === null || run.casesTotal === null || run.casesTotal === 0) return null
  return Math.round((run.casesPassed / run.casesTotal) * 100)
}

/** 걸린 시간(ms). 끝나지 않았으면 null. */
export function runDuration(run: Pick<QaRunSummary, 'startedAt' | 'completedAt'>): number | null {
  if (run.completedAt === null) return null
  const ms = Date.parse(run.completedAt) - Date.parse(run.startedAt)
  return Number.isFinite(ms) && ms >= 0 ? ms : null
}
