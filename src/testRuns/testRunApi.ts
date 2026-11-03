import { buildDisplayName, parseBuildEnvironment } from '../projects/buildEnvironment'
import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, jsonRequest, readJson, toApiError } from '../projects/projectApi'
import { parseExecutionMode } from '../testScenarios/scenarioApi'
import type { ExecutionMode } from '../testScenarios/scenarioTypes'

/*
 * TestRun read API — the Map is read-only for now, so only the two GETs the
 * visualisation needs are here (run header + its ordered scenario composition).
 * Create/update/delete and scenario editing come with the editable Map later.
 */

/** TR 을 만든 게임 버전(ARTEL-995). `label` 이 있으면 그것, 없으면 `version` 을 보인다. */
export type RunGameBuild = {
  gameBuildId: string
  version: string
  isEditor?: boolean | null
  label: string | null
}

export type TestRun = {
  id: string
  projectId: string
  name: string
  description: string | null
  createdAt: string
  /** 이 TR 이 따르는 빌드 버전(ARTEL-1049). null 은 버전 없음이다. */
  gameBuild: RunGameBuild | null
  /** 든 폴더. 폴더는 그 빌드 버전 안에만 있다. null 이면 버전 바로 아래다. */
  folderId: string | null
  /** 담은 시나리오 수. 목록 응답에만 있고, 단건 응답이면 null 이다. */
  scenarioCount: number | null
  /** 마지막 QA 실행 요약. 돌린 적이 없거나 단건 응답이면 null 이다. */
  lastQaRun: RunLastQa | null
}

/** TR 의 마지막 QA 실행. `passed` · `failed` 는 그 실행의 시나리오 결과 수다. */
export type RunLastQa = {
  qaRunId: string
  status: string
  startedAt: string
  passed: number
  failed: number
  total: number
}

function parseRunLastQa(data: unknown): RunLastQa | null {
  const record = asRecord(data)
  const qaRunId = record === null ? '' : asString(record.qaRunId)
  if (record === null || qaRunId.length === 0) return null
  return {
    qaRunId,
    status: asString(record.status),
    startedAt: asString(record.startedAt),
    passed: asCount(record.passed),
    failed: asCount(record.failed),
    total: asCount(record.total),
  }
}

export function parseRunGameBuild(data: unknown): RunGameBuild | null {
  const record = asRecord(data)
  if (record === null) return null
  const gameBuildId = asString(record.gameBuildId)
  if (gameBuildId.length === 0) return null
  return { gameBuildId, version: asString(record.version), label: asNullableString(record.label), isEditor: parseBuildEnvironment(record.isEditor) }
}

/** 사람이 붙인 이름이 있으면 그것, 없으면 SDK 가 보고한 version. */
export function gameBuildName(build: RunGameBuild): string {
  return buildDisplayName(build)
}

/** One slot of a run's scenario composition: position + the scenario id it points at. */
export type RunScenarioItem = {
  position: number
  testScenarioId: string
}

function runsRoot(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/test-runs`
}

export function parseTestRun(data: unknown): TestRun | null {
  const record = asRecord(data)
  if (record === null) return null
  const id = asString(record.id)
  if (id.length === 0) return null
  return {
    id,
    projectId: asString(record.projectId),
    name: asString(record.name),
    description: asNullableString(record.description),
    createdAt: asString(record.createdAt),
    gameBuild: parseRunGameBuild(record.gameBuild),
    folderId: asNullableString(record.folderId),
    scenarioCount: typeof record.scenarioCount === 'number' ? asCount(record.scenarioCount) : null,
    lastQaRun: parseRunLastQa(record.lastQaRun),
  }
}

function toItemArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data
  const items = asRecord(data)?.items
  return Array.isArray(items) ? items : []
}

/** `GET /api/projects/{projectId}/test-runs` — the project's runs. */
export async function listTestRuns(projectId: string, signal?: AbortSignal): Promise<TestRun[]> {
  const response = await apiFetch(runsRoot(projectId), { signal })
  return toItemArray(await readJson(response))
    .map(parseTestRun)
    .filter((run): run is TestRun => run !== null)
}

/**
 * `POST /api/projects/{projectId}/test-runs` — create an empty run. `gameBuildId` picks the case version it follows
 * (ARTEL-1049); `unversioned` makes it follow none. Without either the server picks the newest game build.
 */
export async function createTestRun(
  projectId: string,
  body: { name?: string; description?: string; gameBuildId?: string; unversioned?: boolean; folderId?: string } = {},
): Promise<TestRun> {
  const response = await apiFetch(runsRoot(projectId), { method: 'POST', ...jsonRequest(body) })
  if (!response.ok) throw await toApiError(response)
  const run = parseTestRun(await readJson(response))
  if (run === null) throw new Error('The server did not return a run.')
  return run
}

export async function getTestRun(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<TestRun | null> {
  const response = await apiFetch(`${runsRoot(projectId)}/${encodeURIComponent(runId)}`, { signal })
  return parseTestRun(await readJson(response))
}

/** `PUT /api/projects/{projectId}/test-runs/{runId}` — rename/update a run (name/description). */
export async function updateTestRun(
  projectId: string,
  runId: string,
  body: { name?: string; description?: string },
): Promise<TestRun> {
  const response = await apiFetch(
    `${runsRoot(projectId)}/${encodeURIComponent(runId)}`,
    { method: 'PUT', ...jsonRequest(body) },
  )
  if (!response.ok) throw await toApiError(response)
  const run = parseTestRun(await readJson(response))
  if (run === null) throw new Error('The server did not return a run.')
  return run
}

/**
 * `PUT /api/projects/{projectId}/test-runs/{runId}/scenarios` — replaces the run's
 * scenario composition wholesale. Order of `scenarioIds` becomes the position.
 */
export async function setRunScenarios(
  projectId: string,
  runId: string,
  scenarioIds: string[],
): Promise<RunScenarioItem[]> {
  const response = await apiFetch(
    `${runsRoot(projectId)}/${encodeURIComponent(runId)}/scenarios`,
    { method: 'PUT', ...jsonRequest({ scenarioIds }) },
  )
  if (!response.ok) throw await toApiError(response)
  const items = asRecord(await readJson(response))?.items
  const list = Array.isArray(items) ? items : []
  return list
    .map((raw): RunScenarioItem | null => {
      const record = asRecord(raw)
      const testScenarioId = record === null ? '' : asString(record.testScenarioId)
      if (testScenarioId.length === 0) return null
      return { position: typeof record?.position === 'number' ? record.position : 0, testScenarioId }
    })
    .filter((item): item is RunScenarioItem => item !== null)
    .sort((left, right) => left.position - right.position)
}

/**
 * What deleting this run would take with it (ARTEL-487).
 *
 * Deleting a run drops the composition but keeps the scenarios, while coverage
 * counts every scenario in the project — so a run deleted on its own leaves cases
 * counted as authored by scenarios nothing holds any more. The dialog asks about
 * that, and it can only ask honestly if it knows the numbers first.
 */
export type RunDeletionPreview = {
  /** Scenarios in this run. */
  scenarioCount: number
  /** Of those, the ones in no other run — the ones deletable along with the run. */
  removableScenarioCount: number
  /** Of those, kept regardless because a QA run has already used them. */
  keptForQaHistoryCount: number
}

/** `GET /api/projects/{projectId}/test-runs/{runId}/deletion-preview`. */
export async function getRunDeletionPreview(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<RunDeletionPreview> {
  const response = await apiFetch(
    `${runsRoot(projectId)}/${encodeURIComponent(runId)}/deletion-preview`,
    { signal },
  )
  if (!response.ok) throw await toApiError(response)
  const record = asRecord(await readJson(response))
  const count = (value: unknown) => (typeof value === 'number' ? value : 0)
  return {
    scenarioCount: count(record?.scenarioCount),
    removableScenarioCount: count(record?.removableScenarioCount),
    keptForQaHistoryCount: count(record?.keptForQaHistoryCount),
  }
}

/**
 * `DELETE /api/projects/{projectId}/test-runs/{runId}` — removes the run (composition links go with it).
 *
 * `dropScenarios` also deletes the scenarios only this run held. The server keeps
 * them by default and so does this signature: an irreversible delete takes the
 * smaller default and the caller opts in.
 */
export async function deleteTestRun(
  projectId: string,
  runId: string,
  dropScenarios = false,
): Promise<void> {
  const query = dropScenarios ? '?dropScenarios=true' : ''
  const response = await apiFetch(
    `${runsRoot(projectId)}/${encodeURIComponent(runId)}${query}`,
    { method: 'DELETE' },
  )
  if (!response.ok) throw await toApiError(response)
}

/** `GET /api/projects/{projectId}/test-runs/{runId}/scenarios` — ordered slots. */
export async function getRunScenarios(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<RunScenarioItem[]> {
  const response = await apiFetch(
    `${runsRoot(projectId)}/${encodeURIComponent(runId)}/scenarios`,
    { signal },
  )
  const items = asRecord(await readJson(response))?.items
  const list = Array.isArray(items) ? items : []
  return list
    .map((raw): RunScenarioItem | null => {
      const record = asRecord(raw)
      const testScenarioId = record === null ? '' : asString(record.testScenarioId)
      if (testScenarioId.length === 0) return null
      return { position: typeof record?.position === 'number' ? record.position : 0, testScenarioId }
    })
    .filter((item): item is RunScenarioItem => item !== null)
    .sort((left, right) => left.position - right.position)
}

/**
 * 이 런의 시나리오 하나가 담은 것.
 *
 * `steps` 는 저장된 최종본의 스텝 수이고 `cases` 는 그 스텝들이 검증하는 서로 다른 케이스 수다.
 * 둘이 다른 이유는 코드가 메운 `bridge` 가 아무것도 검증하지 않기 때문이고, 그 차이가 곧
 * "옮겨 가기만 하는 스텝" 의 수다.
 */
export type RunCoverageScenario = {
  position: number
  testScenarioId: string
  title: string
  /** QA 실행 화면이 `planner_executer` 를 막을 때 읽는다(ARTEL-1119). 그 엔진은 ORDERED 만 돌린다. */
  executionMode: ExecutionMode
  steps: number
  cases: number
}

/**
 * **이 런이 무엇을 담았는가**(ARTEL-904).
 *
 * 프로젝트 전량을 재는 {@link getCoverage} 와 축이 다르다. 저작하는 자리에서 알고 싶은 것은
 * "이 프로젝트에 케이스가 몇 건인가" 가 아니라 **지금 만들고 있는 것들이 무엇을 덮었는가**다.
 *
 * `covered` 는 시나리오별 `cases` 의 합이 아니다 — 같은 케이스가 맥락을 달리해 두 시나리오에
 * 들어가는 것은 정상이고, 그것을 2로 세면 이 런이 실제로 덮은 범위보다 커진다. 서버가 서로
 * 다른 케이스로 세어 준다.
 */
export type RunCoverage = {
  total: number
  covered: number
  uncovered: number
  scenarios: RunCoverageScenario[]
}

function asCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * 응답을 읽는다. 값이 빠져 있으면 0으로 — 시나리오가 없는 런은 흔한 상태이고, 숫자 하나가
 * 없다고 배지를 비우면 읽는 사람은 조회가 깨진 것과 구분할 수 없다.
 *
 * 순서는 `position` 으로 다시 세운다. 서버가 순서대로 주지만 배열 순서에 기대는 화면은
 * 언젠가 어긋나고, 그때 어긋난 것이 화면이라는 것을 알아낼 방법이 없다.
 */
export function parseRunCoverage(data: unknown): RunCoverage {
  const record = asRecord(data) ?? {}
  const rows = Array.isArray(record.scenarios) ? record.scenarios : []
  return {
    total: asCount(record.total),
    covered: asCount(record.covered),
    uncovered: asCount(record.uncovered),
    scenarios: rows
      .map((raw): RunCoverageScenario | null => {
        const row = asRecord(raw)
        if (row === null) return null
        const testScenarioId = asString(row.testScenarioId)
        if (testScenarioId.length === 0) return null
        return {
          position: asCount(row.position),
          testScenarioId,
          title: asString(row.title),
          executionMode: parseExecutionMode(row.execution_mode),
          steps: asCount(row.steps),
          cases: asCount(row.cases),
        }
      })
      .filter((row): row is RunCoverageScenario => row !== null)
      .sort((left, right) => left.position - right.position),
  }
}

/** `GET /api/projects/{projectId}/test-runs/{runId}/coverage`. */
export async function getRunCoverage(
  projectId: string,
  runId: string,
  signal?: AbortSignal,
): Promise<RunCoverage> {
  const response = await apiFetch(
    `${runsRoot(projectId)}/${encodeURIComponent(runId)}/coverage`,
    { signal },
  )
  return parseRunCoverage(await readJson(response))
}

/**
 * 런의 케이스 중 켜진 게임의 버전에 없는 것(ARTEL-1070). QA 는 이 케이스들을 판정하지 않고 넘긴다.
 * `gameBuildId` 는 판정이 속할 게임 빌드이고, 게임 버전을 모르면 null 이며 목록은 비어 있다.
 */
export type RunCasesOutsideBuild = { gameBuildId: string | null; testCaseIds: string[] }

export function parseRunCasesOutsideBuild(data: unknown): RunCasesOutsideBuild {
  const record = asRecord(data)
  const ids = Array.isArray(record?.testCaseIds) ? record.testCaseIds : []
  return {
    gameBuildId: asNullableString(record?.gameBuildId),
    testCaseIds: ids.map((id) => asString(id)).filter((id) => id.length > 0),
  }
}

/** `GET /api/projects/{projectId}/test-runs/{runId}/cases-outside-build?gameInstanceId=`. */
export async function getRunCasesOutsideBuild(
  projectId: string,
  runId: string,
  gameInstanceId: string,
  signal?: AbortSignal,
): Promise<RunCasesOutsideBuild> {
  const response = await apiFetch(
    `${runsRoot(projectId)}/${encodeURIComponent(runId)}/cases-outside-build?gameInstanceId=${encodeURIComponent(gameInstanceId)}`,
    { signal },
  )
  if (!response.ok) throw await toApiError(response)
  return parseRunCasesOutsideBuild(await readJson(response))
}

/**
 * `PUT /api/projects/{projectId}/test-runs/{runId}/game-build` — move the run to another build version or folder (ARTEL-1049).
 * `null` means no version. Its scenarios stay; authoring follows the new version from the next turn.
 */
export async function changeRunGameBuild(
  projectId: string,
  runId: string,
  gameBuildId: string | null,
  folderId: string | null = null,
): Promise<TestRun> {
  // 폴더를 주면 그 폴더 안으로 가고, 빌드 버전도 폴더의 것이 된다(ARTEL-1049).
  const response = await apiFetch(`${runsRoot(projectId)}/${encodeURIComponent(runId)}/game-build`, {
    method: 'PUT',
    ...jsonRequest({ gameBuildId, folderId }),
  })
  if (!response.ok) throw await toApiError(response)
  const run = parseTestRun(await readJson(response))
  if (run === null) throw new Error('The server did not return a run.')
  return run
}
