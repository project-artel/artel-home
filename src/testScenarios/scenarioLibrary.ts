import { apiFetch } from '../auth/authApi'
import { asNullableString, asRecord, asString, jsonRequest, readJson, toApiError } from '../projects/projectApi'
import { gameBuildName, parseRunGameBuild, type RunGameBuild } from '../testRuns/testRunApi'

/*
 * TS 불러오기(ARTEL-995). 서버가 주는 버전 → TR → TS 트리와, 고른 TS 를 지금 TR 로 복사해 오는 요청.
 *
 * 트리를 펼치고 고르는 규칙은 여기 순수 함수로 둔다. 모달은 이 함수들이 낸 줄을 그리기만 한다 —
 * 렌더 없이 테스트되고, "TR 전체를 골랐다" 같은 판정이 한 곳에만 있다.
 */

export type LibraryScenario = {
  testScenarioId: string
  title: string
  stepCount: number
  updatedAt: string | null
}

/** `testRunId` 가 null 이면 어느 TR 에도 없는 TS 묶음이다. */
export type LibraryRun = {
  testRunId: string | null
  name: string | null
  testScenarios: LibraryScenario[]
}

/** `gameBuild` 가 null 이면 버전이 없는 묶음이다. 서버는 늘 맨 뒤에 둔다. */
export type LibraryVersion = {
  gameBuild: RunGameBuild | null
  testRuns: LibraryRun[]
}

export type ScenarioImportResult = {
  importedScenarios: { sourceTestScenarioId: string; testScenarioId: string; title: string }[]
  /** 이 TR 의 build 에 짝이 없어 바꿔 끼우지 못한 TC. 그 케이스가 이 버전에서 사라졌다는 뜻이다. */
  unmatchedCaseIds: string[]
}

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

export function parseScenarioLibrary(data: unknown): LibraryVersion[] {
  return asArray(asRecord(data)?.versions).map((rawVersion) => {
    const version = asRecord(rawVersion)
    return {
      gameBuild: parseRunGameBuild(version?.gameBuild),
      testRuns: asArray(version?.testRuns).map((rawRun) => {
        const run = asRecord(rawRun)
        return {
          testRunId: asNullableString(run?.testRunId),
          name: asNullableString(run?.name),
          testScenarios: asArray(run?.testScenarios)
            .map((rawScenario): LibraryScenario | null => {
              const scenario = asRecord(rawScenario)
              const testScenarioId = asString(scenario?.testScenarioId)
              if (testScenarioId.length === 0) return null
              return {
                testScenarioId,
                title: asString(scenario?.title),
                stepCount: typeof scenario?.stepCount === 'number' ? scenario.stepCount : 0,
                updatedAt: asNullableString(scenario?.updatedAt),
              }
            })
            .filter((scenario): scenario is LibraryScenario => scenario !== null),
        }
      }),
    }
  })
}

export function parseScenarioImport(data: unknown): ScenarioImportResult {
  const record = asRecord(data)
  return {
    importedScenarios: asArray(record?.importedScenarios)
      .map((raw) => {
        const item = asRecord(raw)
        return {
          sourceTestScenarioId: asString(item?.sourceTestScenarioId),
          testScenarioId: asString(item?.testScenarioId),
          title: asString(item?.title),
        }
      })
      .filter((item) => item.testScenarioId.length > 0),
    unmatchedCaseIds: asArray(record?.unmatchedCaseIds).map((id) => asString(id)).filter((id) => id.length > 0),
  }
}

/** `GET /api/projects/{projectId}/test-scenario-library`. */
export async function getScenarioLibrary(projectId: string, signal?: AbortSignal): Promise<LibraryVersion[]> {
  const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/test-scenario-library`, { signal })
  if (!response.ok) throw await toApiError(response)
  return parseScenarioLibrary(await readJson(response))
}

/** `POST /api/projects/{projectId}/test-runs/{runId}/scenarios/imports` — 순서대로 복사해 TR 끝에 붙인다. */
export async function importScenarios(
  projectId: string,
  runId: string,
  testScenarioIds: readonly string[],
): Promise<ScenarioImportResult> {
  const response = await apiFetch(
    `/api/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/scenarios/imports`,
    { method: 'POST', ...jsonRequest({ testScenarioIds }) },
  )
  if (!response.ok) throw await toApiError(response)
  return parseScenarioImport(await readJson(response))
}

/* ---------------------------------------------------------------- tree */

/** 펼침 상태의 키. 버전은 build id(없으면 `none`), TR 은 그 아래 TR id(없으면 `loose`). */
export const versionKey = (version: LibraryVersion) => `v:${version.gameBuild?.gameBuildId ?? 'none'}`
export const runKey = (version: LibraryVersion, run: LibraryRun) =>
  `${versionKey(version)}/r:${run.testRunId ?? 'loose'}`

export type LibraryRow =
  | { kind: 'version'; key: string; level: 1; version: LibraryVersion; expanded: boolean; runCount: number }
  | { kind: 'run'; key: string; level: 2; run: LibraryRun; expanded: boolean; scenarioIds: string[] }
  | { kind: 'scenario'; key: string; level: 3; scenario: LibraryScenario }

/**
 * 펼친 노드만 따라 내려간 평면 줄 목록. `aria-level` 로 들여쓰기를 그리는 ARIA tree 가 이것을 읽는다.
 * 같은 TS 가 여러 TR 에 들어 있으면 TR 마다 한 줄씩 나온다 — 어느 TR 에서 왔는지가 고를 때의 맥락이다.
 */
export function libraryRows(versions: readonly LibraryVersion[], expanded: ReadonlySet<string>): LibraryRow[] {
  const rows: LibraryRow[] = []
  for (const version of versions) {
    const vKey = versionKey(version)
    const vOpen = expanded.has(vKey)
    rows.push({ kind: 'version', key: vKey, level: 1, version, expanded: vOpen, runCount: version.testRuns.length })
    if (!vOpen) continue
    for (const run of version.testRuns) {
      const rKey = runKey(version, run)
      const rOpen = expanded.has(rKey)
      const scenarioIds = run.testScenarios.map((scenario) => scenario.testScenarioId)
      rows.push({ kind: 'run', key: rKey, level: 2, run, expanded: rOpen, scenarioIds })
      if (!rOpen) continue
      for (const scenario of run.testScenarios) {
        rows.push({ kind: 'scenario', key: `${rKey}/s:${scenario.testScenarioId}`, level: 3, scenario })
      }
    }
  }
  return rows
}

/** 처음 열 때 펼쳐 둘 것: 가장 최근 버전과 그 아래 TR 들. 나머지는 접어 둔다. */
export function initialExpanded(versions: readonly LibraryVersion[]): Set<string> {
  const first = versions[0]
  if (first === undefined) return new Set()
  return new Set([versionKey(first), ...first.testRuns.map((run) => runKey(first, run))])
}

/** TR 줄의 체크 상태. 안의 TS 가 전부 골라졌으면 `all`, 일부면 `some`. */
export function runSelection(scenarioIds: readonly string[], selected: ReadonlySet<string>): 'all' | 'some' | 'none' {
  const picked = scenarioIds.filter((id) => selected.has(id)).length
  if (picked === 0) return 'none'
  return picked === scenarioIds.length ? 'all' : 'some'
}

/** TR 줄을 누르면 전부 고르거나, 이미 전부 골랐으면 전부 푼다. */
export function toggleRun(scenarioIds: readonly string[], selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected)
  if (runSelection(scenarioIds, selected) === 'all') scenarioIds.forEach((id) => next.delete(id))
  else scenarioIds.forEach((id) => next.add(id))
  return next
}

export function toggleScenario(testScenarioId: string, selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected)
  if (next.has(testScenarioId)) next.delete(testScenarioId)
  else next.add(testScenarioId)
  return next
}

/**
 * 서버로 보낼 순서. 트리에 보이는 순서(버전 → TR → TR 안의 순서)를 따르고, 여러 TR 에 든 TS 는 한 번만 보낸다.
 * 고른 순서를 따르지 않는 것은, 사람이 TR 째 고를 때 기대하는 것이 그 TR 의 순서이기 때문이다.
 */
export function importOrder(versions: readonly LibraryVersion[], selected: ReadonlySet<string>): string[] {
  const order: string[] = []
  for (const version of versions) {
    for (const run of version.testRuns) {
      for (const scenario of run.testScenarios) {
        if (selected.has(scenario.testScenarioId) && !order.includes(scenario.testScenarioId)) {
          order.push(scenario.testScenarioId)
        }
      }
    }
  }
  return order
}

export function versionLabel(version: LibraryVersion, noVersion: string): string {
  return version.gameBuild === null ? noVersion : gameBuildName(version.gameBuild)
}
