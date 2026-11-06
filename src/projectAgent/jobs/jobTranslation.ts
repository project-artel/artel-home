import type { LastScan } from '../../contentMap/contentMapTypes'
import type { QaRun } from '../../qa/qaTypes'
import type { TasksCopy } from '../tasksCopy'

/*
 * 서버가 알려 주는 job 상태를 대화창의 진행 카드와 모델에게 보낼 event 로 옮기는 순수 함수들.
 * 네트워크와 timer 를 모르므로 렌더 없이 테스트한다.
 */

export type JobTranslation = {
  state: 'running' | 'finished' | 'failed'
  /** 진행 중에 카드에 보이는 짧은 문장. */
  progress?: string
  /** 끝났을 때의 한 문장 요약. 모델에게 가는 event 의 본문이기도 하다. */
  detail?: string
  /** event 에 실리는 작은 숫자 모음. */
  data?: Record<string, string | number | null>
}

/** QA 실행을 다시 읽는 간격의 시작값. QaRunPage 와 같다. */
export const QA_POLL_INTERVAL_MS = 3000
/** 읽기가 연달아 실패할 때 간격이 커지는 상한. QaRunPage 와 같다. */
export const QA_POLL_BACKOFF_MAX_MS = 30_000

/** 읽기가 연달아 `failures` 번 실패한 뒤의 대기: 3, 6, 12, 24, 30초. 성공하면 failures 가 0 으로 돌아가 3초로 간다. */
export function qaPollDelay(failures: number): number {
  if (failures <= 0) return QA_POLL_INTERVAL_MS
  return Math.min(QA_POLL_INTERVAL_MS * 2 ** (failures - 1), QA_POLL_BACKOFF_MAX_MS)
}

/** 스캔 시작 시각보다 이만큼 이른 requestedAt 의 스캔은 이전 스캔으로 본다. 두 시계가 조금 어긋나도 새 스캔을 놓치지 않는 여유다. */
export const SCAN_STALE_TOLERANCE_MS = 2 * 60 * 1000

export function translateQaRun(run: QaRun, copy: TasksCopy['jobs']): JobTranslation {
  const total = run.tries.length
  const completed = run.tries.filter((one) => one.status === 'COMPLETED').length
  const failed = run.tries.filter((one) => one.status === 'FAILED').length
  const done = run.tries.filter(
    (one) => one.status === 'COMPLETED' || one.status === 'FAILED' || one.status === 'CANCELLED',
  ).length
  const data = { qaRunId: run.id, status: run.status, total, completed, failed }
  if (run.status === 'COMPLETED') {
    return { state: 'finished', detail: copy.qaFinished(run.id, completed, total, failed), data }
  }
  if (run.status === 'FAILED') {
    return { state: 'failed', detail: copy.qaFailed(run.id, done, total), data }
  }
  if (run.status === 'CANCELLED') {
    return { state: 'failed', detail: copy.qaCancelled(run.id, done, total), data }
  }
  return {
    state: 'running',
    progress: total === 0 ? copy.qaPending : copy.qaProgress(done, total),
    data,
  }
}

/**
 * 스캔 상태 하나를 job 상태로 옮긴다. `scan` 이 `undefined` 면 아직 첫 snapshot 이 없고, `null` 이면
 * 서버가 이 빌드의 스캔을 모른다. 둘 다 아직 시작되지 않은 것으로 본다.
 *
 * 시작 직후의 snapshot 에는 이전 스캔의 끝난 기록이 남아 있을 수 있다. 지켜보기를 시작하기 전에
 * 요청된 스캔은 이번 것이 아니므로 `running` 으로 남긴다.
 */
export function translateScan(
  scan: LastScan | null | undefined,
  buildId: string,
  startedAtMs: number,
  copy: TasksCopy['jobs'],
): JobTranslation {
  const data = { buildId }
  if (scan === undefined || scan === null) return { state: 'running', progress: copy.scanWaiting, data }

  const requestedAtMs = Date.parse(scan.requestedAt)
  if (Number.isFinite(requestedAtMs) && requestedAtMs < startedAtMs - SCAN_STALE_TOLERANCE_MS) {
    return { state: 'running', progress: copy.scanWaiting, data }
  }

  const documents = scan.ingestedDocuments
  if (scan.state === 'FAILED') {
    return {
      state: 'failed',
      detail: copy.scanFailed(buildId, scan.error),
      data: { ...data, scanState: scan.state },
    }
  }
  if (scan.state === 'REQUESTED') {
    return {
      state: 'running',
      progress: documents === null ? copy.scanReadingNoCount : copy.scanReading(documents),
      data,
    }
  }

  const testCases = scan.testCases
  const scanData = { ...data, scanState: scan.state, documents }
  if (testCases === null) {
    return { state: 'finished', detail: copy.scanFinished(buildId, documents), data: scanData }
  }
  if (testCases.state === 'PENDING') {
    return { state: 'running', progress: copy.scanGeneratingTestCases, data: scanData }
  }
  if (testCases.state === 'FAILED') {
    return {
      state: 'failed',
      detail: copy.scanTestCasesFailed(buildId, testCases.reason),
      data: { ...scanData, testCasesState: testCases.state },
    }
  }
  if (testCases.state === 'SKIPPED') {
    return {
      state: 'finished',
      detail: copy.scanTestCasesSkipped(buildId),
      data: { ...scanData, testCasesState: testCases.state },
    }
  }
  const created = testCases.created ?? 0
  const carriedOver = testCases.carriedOver ?? 0
  return {
    state: 'finished',
    detail: copy.scanFinishedWithTestCases(buildId, documents, created, carriedOver),
    data: { ...scanData, testCasesState: testCases.state, created, carriedOver },
  }
}

/** 대화창 카드의 결과 링크. project 기준 상대 경로다. */
export function jobHref(kind: 'content_map_scan' | 'qa_run', id: string): string {
  return kind === 'qa_run'
    ? `qa-runs/${encodeURIComponent(id)}`
    : `content-map?build=${encodeURIComponent(id)}`
}
