import { apiFetch } from '../auth/authApi'
import { asRecord, asString, jsonRequest, projectPath, readJson, toApiError } from '../projects/projectApi'

/*
 * 빌드 검증 진행과 출시 기준(ARTEL-1386 · 1387). 서버는 orchestration 의 `ProjectReleaseController` 다.
 * 출시 판단은 서버가 하지 않는다 — 숫자를 [evaluateRelease](./releaseModel.ts) 로 맞대어 화면이 정한다.
 */

export type BuildRef = { gameBuildId: string; version: string; isEditor: boolean; createdAt: string }

/** 한 빌드의 TC 를 마지막 판정으로 센 것. [failed] 에 [regression] 은 들지 않는다. */
export type BuildVerificationSummary = {
  build: BuildRef
  total: number
  passed: number
  failed: number
  regression: number
  inconclusive: number
  pending: number
  /** 이 빌드에서 직접 보지 않고 앞 버전 판정을 이어받아 [passed] · [failed] 에 든 것. */
  carried: number
  openBlockers: number
  lastJudgedAt: string | null
}

/** 그날이 끝났을 때의 누적 상태와 그날 시작한 QA 실행 수. */
export type BuildVerificationDay = { date: string; passed: number; failed: number; regression: number; inconclusive: number; runs: number }

export type BuildVerificationProgress = {
  summary: BuildVerificationSummary
  previousBuild: BuildRef | null
  timeZone: string
  days: BuildVerificationDay[]
}

export type ReleaseCriteria = {
  maxPending: number
  maxRegression: number
  minPassRate: number
  maxOpenBlockers: number
  maxInconclusiveRate: number
}

export type ReleaseCriteriaState = { criteria: ReleaseCriteria; defaults: ReleaseCriteria; isDefault: boolean; updatedAt: string | null }

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

function parseBuild(value: unknown): BuildRef | null {
  const record = asRecord(value)
  const gameBuildId = asString(record?.gameBuildId)
  if (record === null || gameBuildId.length === 0) return null
  return { gameBuildId, version: asString(record.version), isEditor: record.isEditor === true, createdAt: asString(record.createdAt) }
}

export function parseSummary(value: unknown): BuildVerificationSummary | null {
  const record = asRecord(value)
  const build = parseBuild(record?.build)
  if (record === null || build === null) return null
  return {
    build,
    total: count(record.total),
    passed: count(record.passed),
    failed: count(record.failed),
    regression: count(record.regression),
    inconclusive: count(record.inconclusive),
    pending: count(record.pending),
    carried: count(record.carried),
    openBlockers: count(record.openBlockers),
    lastJudgedAt: typeof record.lastJudgedAt === 'string' ? record.lastJudgedAt : null,
  }
}

export function parseProgress(data: unknown): BuildVerificationProgress | null {
  const record = asRecord(data)
  const summary = parseSummary(record?.summary)
  if (record === null || summary === null) return null
  const days = (Array.isArray(record.days) ? record.days : [])
    .map((value): BuildVerificationDay | null => {
      const day = asRecord(value)
      const date = asString(day?.date)
      if (day === null || date.length === 0) return null
      return { date, passed: count(day.passed), failed: count(day.failed), regression: count(day.regression), inconclusive: count(day.inconclusive), runs: count(day.runs) }
    })
    .filter((day): day is BuildVerificationDay => day !== null)
  return { summary, previousBuild: parseBuild(record.previousBuild), timeZone: asString(record.timeZone), days }
}

function parseCriteria(value: unknown): ReleaseCriteria | null {
  const record = asRecord(value)
  if (record === null) return null
  return {
    maxPending: count(record.maxPending),
    maxRegression: count(record.maxRegression),
    minPassRate: count(record.minPassRate),
    maxOpenBlockers: count(record.maxOpenBlockers),
    maxInconclusiveRate: count(record.maxInconclusiveRate),
  }
}

export function parseCriteriaState(data: unknown): ReleaseCriteriaState | null {
  const record = asRecord(data)
  const criteria = parseCriteria(record?.criteria)
  const defaults = parseCriteria(record?.defaults)
  if (record === null || criteria === null || defaults === null) return null
  return { criteria, defaults, isDefault: record.isDefault === true, updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : null }
}

async function read<T>(response: Response, parse: (data: unknown) => T | null): Promise<T> {
  if (!response.ok) throw await toApiError(response)
  const parsed = parse(await readJson(response))
  if (parsed === null) throw new Error('unexpected response')
  return parsed
}

const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul'

export async function fetchBuildVerificationProgress(projectId: string, gameBuildId: string, signal?: AbortSignal): Promise<BuildVerificationProgress> {
  const query = new URLSearchParams({ timeZone: zone() })
  const path = projectPath(projectId, `/game-builds/${encodeURIComponent(gameBuildId)}/verification-progress?${query}`)
  return read(await apiFetch(path, { signal }), parseProgress)
}

export async function fetchBuildVerificationSummaries(projectId: string, limit: number, signal?: AbortSignal): Promise<BuildVerificationSummary[]> {
  const response = await apiFetch(projectPath(projectId, `/build-verification-summaries?limit=${limit}`), { signal })
  return read(response, (data) => {
    const items = asRecord(data)?.items
    return Array.isArray(items) ? items.map(parseSummary).filter((item): item is BuildVerificationSummary => item !== null) : null
  })
}

export async function fetchReleaseCriteria(projectId: string, signal?: AbortSignal): Promise<ReleaseCriteriaState> {
  return read(await apiFetch(projectPath(projectId, '/release-criteria'), { signal }), parseCriteriaState)
}

export async function updateReleaseCriteria(projectId: string, criteria: ReleaseCriteria): Promise<ReleaseCriteriaState> {
  return read(await apiFetch(projectPath(projectId, '/release-criteria'), { method: 'PUT', ...jsonRequest(criteria) }), parseCriteriaState)
}

export async function resetReleaseCriteria(projectId: string): Promise<ReleaseCriteriaState> {
  return read(await apiFetch(projectPath(projectId, '/release-criteria'), { method: 'DELETE' }), parseCriteriaState)
}
