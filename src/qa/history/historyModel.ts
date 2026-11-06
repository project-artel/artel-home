import { bucketOf } from '../../testRuns/runLibrary'
import type { TestRun } from '../../testRuns/testRunApi'
import type { RunFolder } from '../../testRuns/testRunFolders'
import type { QaRunSummary } from '../launch/qaLaunchApi'

/** 테스트 런 하나에서 한 번에 읽는 실행 수. 서버의 상한(50)과 같다. */
export const RUNS_PER_TEST_RUN = 50

export type HistoryFilter = 'ALL' | 'FAILED' | 'COMPLETED' | 'CANCELLED'

/** 통과율 링의 색 칸. CSS 의 `qh-tone--*` 와 짝이다. */
export type RingTone = 'pass' | 'partial' | 'fail' | 'cancelled' | 'running'

const RUNNING = new Set(['RUNNING', 'STARTING', 'PENDING'])

export function isRunning(run: Pick<QaRunSummary, 'status'>): boolean {
  return RUNNING.has(run.status)
}

/**
 * 그 테스트 런 안에서 몇 번째 실행인가(오래된 것이 1). DB 번호를 사람에게 보이지 않으려는 것이다 —
 * 히스토리는 테스트 런별로 묶여 있으니 "이 런의 4회차" 가 바로 읽힌다.
 *
 * 다 읽지 못했으면(`complete` 가 false) 비어 있는 맵이다. 앞쪽이 잘린 목록으로 세면 회차가 틀린다.
 */
export function runOrdinals(runs: readonly QaRunSummary[], complete: boolean): Map<string, number> {
  const ordinals = new Map<string, number>()
  if (!complete) return ordinals
  const oldestFirst = [...runs].sort((a, b) => a.startedAt.localeCompare(b.startedAt) || Number(a.id) - Number(b.id))
  oldestFirst.forEach((run, index) => ordinals.set(run.id, index + 1))
  return ordinals
}

/**
 * 링이 얼마나 차고 무슨 색인가. 다 통과하면 초록, 60% 이상이면 노랑, 그 아래는 빨강이다. 판정이
 * 없는 실행은 끝났으면 꽉 찬 초록, 실패했으면 꽉 찬 빨강, 취소면 빈 회색 링이다.
 */
export function ringOf(run: Pick<QaRunSummary, 'status' | 'casesPassed' | 'casesTotal'>): { tone: RingTone; ratio: number } {
  if (isRunning(run)) return { tone: 'running', ratio: 0.25 }
  if (run.status === 'CANCELLED') return { tone: 'cancelled', ratio: 0 }
  const { casesPassed: passed, casesTotal: total } = run
  if (passed === null || total === null || total === 0) {
    return run.status === 'FAILED' ? { tone: 'fail', ratio: 1 } : { tone: 'pass', ratio: 1 }
  }
  const ratio = passed / total
  return { tone: ratio >= 1 ? 'pass' : ratio >= 0.6 ? 'partial' : 'fail', ratio }
}

export function matchesFilter(run: Pick<QaRunSummary, 'status'>, filter: HistoryFilter): boolean {
  return filter === 'ALL' || run.status === filter
}

/** 필터 칩의 숫자. 읽어 온 실행만 센다. */
export function countByFilter(runs: readonly Pick<QaRunSummary, 'status'>[]): Record<HistoryFilter, number> {
  const counts: Record<HistoryFilter, number> = { ALL: runs.length, FAILED: 0, COMPLETED: 0, CANCELLED: 0 }
  for (const run of runs) {
    if (run.status === 'FAILED' || run.status === 'COMPLETED' || run.status === 'CANCELLED') counts[run.status] += 1
  }
  return counts
}

/** 타일의 날짜시각(`10/08 14:52`). 회차와 함께 실행을 가르는 두 번째 표지다. 한 줄에 들어가도록 짧게 쓴다. */
export function shortWhen(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(date.getMonth() + 1)}/${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}`
}

/**
 * 트리에서 고른 자리 아래의 테스트 런. 버전을 고르면 그 버전의 런 전부(폴더 안 것도), 폴더를 고르면
 * 그 폴더와 하위 폴더의 런이다 — 히스토리는 "이 버전에서 무엇을 돌렸나" 를 먼저 묻는 화면이라, 폴더를
 * 하나씩 열어야 보이게 두지 않는다.
 */
export function testRunsUnder(
  runs: readonly TestRun[],
  folders: readonly Pick<RunFolder, 'id' | 'parentId'>[],
  bucket: string,
  folderId: string | null,
): TestRun[] {
  const inBucket = runs.filter((run) => bucketOf(run) === bucket)
  if (folderId === null) return inBucket
  const ids = new Set([folderId])
  let grew = true
  while (grew) {
    grew = false
    for (const folder of folders) {
      if (folder.parentId !== null && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id)
        grew = true
      }
    }
  }
  return inBucket.filter((run) => run.folderId !== null && ids.has(run.folderId))
}
