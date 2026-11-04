import { apiFetch } from '../../../auth/authApi'
import { asNullableString, asRecord, asString, readJson, toApiError } from '../../projectApi'

/*
 * 대시보드의 QA 판정 추이(ARTEL-1387). 서버는 orchestration ARTEL-1386 의
 * `GET /api/projects/{projectId}/qa-verdict-trend` 다. 판정이 없는 날 · 주는 칸이 오지 않는다.
 */

export type TrendBucketUnit = 'DAY' | 'WEEK' | 'RUN'

export type TrendCase = { testCaseId: string; caseNumber: string | null; title: string; failures: number }

export type TrendBucket = {
  /** `DAY` · `WEEK` 은 그 날 · 그 주 월요일(`yyyy-MM-dd`), `RUN` 은 qa_run id. */
  key: string
  /** `RUN` 이면 그 실행의 시작 시각. */
  startedAt: string | null
  runs: number
  passed: number
  /** 회귀는 들지 않는다. */
  failed: number
  regression: number
  undecided: number
  topFailing: TrendCase | null
}

export type TrendBuild = { gameBuildId: string; version: string; isEditor: boolean; createdAt: string }

export type QaVerdictTrend = { bucket: TrendBucketUnit; from: string; to: string; timeZone: string; buckets: TrendBucket[]; builds: TrendBuild[] }

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

function parseCase(value: unknown): TrendCase | null {
  const record = asRecord(value)
  if (record === null) return null
  const testCaseId = asString(record.testCaseId)
  if (testCaseId.length === 0) return null
  const caseNumber = record.caseNumber === null || record.caseNumber === undefined ? null : String(record.caseNumber)
  return { testCaseId, caseNumber, title: asString(record.title), failures: count(record.failures) }
}

export function parseQaVerdictTrend(data: unknown): QaVerdictTrend {
  const record = asRecord(data) ?? {}
  const bucket = record.bucket === 'WEEK' || record.bucket === 'RUN' ? record.bucket : 'DAY'
  const buckets = (Array.isArray(record.buckets) ? record.buckets : [])
    .map((value): TrendBucket | null => {
      const item = asRecord(value)
      const key = asString(item?.key)
      if (item === null || key.length === 0) return null
      return {
        key,
        startedAt: asNullableString(item.startedAt),
        runs: count(item.runs),
        passed: count(item.passed),
        failed: count(item.failed),
        regression: count(item.regression),
        undecided: count(item.undecided),
        topFailing: parseCase(item.topFailing),
      }
    })
    .filter((item): item is TrendBucket => item !== null)
  const builds = (Array.isArray(record.builds) ? record.builds : [])
    .map((value): TrendBuild | null => {
      const item = asRecord(value)
      const gameBuildId = asString(item?.gameBuildId)
      if (item === null || gameBuildId.length === 0) return null
      return { gameBuildId, version: asString(item.version), isEditor: item.isEditor === true, createdAt: asString(item.createdAt) }
    })
    .filter((item): item is TrendBuild => item !== null)
  return { bucket, from: asString(record.from), to: asString(record.to), timeZone: asString(record.timeZone), buckets, builds }
}

export async function fetchQaVerdictTrend(
  projectId: string,
  query: { from: Date; to: Date; bucket: TrendBucketUnit; timeZone: string; gameBuildId: string | null },
  signal?: AbortSignal,
): Promise<QaVerdictTrend> {
  const params = new URLSearchParams({ from: query.from.toISOString(), to: query.to.toISOString(), bucket: query.bucket, timeZone: query.timeZone })
  if (query.gameBuildId !== null) params.set('gameBuildId', query.gameBuildId)
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/qa-verdict-trend?${params}`, { signal })
  if (!response.ok) throw await toApiError(response)
  return parseQaVerdictTrend(await readJson(response))
}
