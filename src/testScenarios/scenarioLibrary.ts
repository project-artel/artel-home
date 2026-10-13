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
  /** 스텝이 검증하는 서로 다른 TC 수. */
  caseCount: number
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
                caseCount: typeof scenario?.caseCount === 'number' ? scenario.caseCount : 0,
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

/** 펼침 상태의 키. 버전은 build id(없으면 `none`). */
export const versionKey = (version: LibraryVersion) => `v:${version.gameBuild?.gameBuildId ?? 'none'}`
/** 오른쪽에 펼칠 런의 키. 어느 런에도 없는 묶음은 버전마다 하나라 버전 키를 붙인다. */
export const runKey = (version: LibraryVersion, run: LibraryRun) =>
  `${versionKey(version)}/r:${run.testRunId ?? 'loose'}`

/** 지금 편집 중인 런이 든 버전. 트리에서 "이 런의 버전" 을 표시한다. */
export function currentVersionKey(versions: readonly LibraryVersion[], runId: string): string | null {
  const found = versions.find((version) => version.testRuns.some((run) => run.testRunId === runId))
  return found === undefined ? null : versionKey(found)
}

/** 처음에는 모든 버전을 펼친다. 버전 수는 적고, 접혀 있으면 런이 있는지조차 안 보인다. */
export function initialExpanded(versions: readonly LibraryVersion[]): Set<string> {
  return new Set(versions.map(versionKey))
}

/**
 * 처음 오른쪽에 보일 런: 가장 최근 버전부터 훑어, 지금 편집 중인 런이 아니고 시나리오가 있는 첫 런.
 * 자기 런을 먼저 보이면 첫 화면이 "이미 있는 것" 이다.
 */
export function initialActiveRun(versions: readonly LibraryVersion[], runId: string): string | null {
  for (const version of versions) {
    for (const run of version.testRuns) {
      if (run.testRunId !== runId && run.testScenarios.length > 0) return runKey(version, run)
    }
  }
  return null
}

export function findRun(
  versions: readonly LibraryVersion[],
  key: string | null,
): { version: LibraryVersion; run: LibraryRun } | null {
  for (const version of versions) {
    for (const run of version.testRuns) {
      if (runKey(version, run) === key) return { version, run }
    }
  }
  return null
}

/** 고른 것 줄이 보일 출처. 같은 TS 가 여러 런에 있으면 트리에서 먼저 나오는 곳이다. */
export function scenarioOrigins(
  versions: readonly LibraryVersion[],
  noVersion: string,
  looseRun: string,
): Map<string, { title: string; from: string }> {
  const origins = new Map<string, { title: string; from: string }>()
  for (const version of versions) {
    for (const run of version.testRuns) {
      for (const scenario of run.testScenarios) {
        if (origins.has(scenario.testScenarioId)) continue
        origins.set(scenario.testScenarioId, {
          title: scenario.title,
          from: `${versionLabel(version, noVersion)} · ${run.name ?? looseRun}`,
        })
      }
    }
  }
  return origins
}

/** 런의 고른 상태. 안의 TS 가 전부 골라졌으면 `all`, 일부면 `some`. */
export function runSelection(scenarioIds: readonly string[], picked: readonly string[]): 'all' | 'some' | 'none' {
  const count = scenarioIds.filter((id) => picked.includes(id)).length
  if (count === 0) return 'none'
  return count === scenarioIds.length ? 'all' : 'some'
}

/**
 * "이 런 전체" 를 누르면 빠진 것을 런 순서대로 뒤에 붙이고, 이미 전부 골랐으면 그 런의 것을 모두 뺀다.
 * 고른 것은 배열이다 — 그 순서가 곧 TR 에 붙는 순서이고, 고른 것 줄도 같은 순서로 보인다.
 */
export function toggleRun(scenarioIds: readonly string[], picked: readonly string[]): string[] {
  if (runSelection(scenarioIds, picked) === 'all') return picked.filter((id) => !scenarioIds.includes(id))
  return [...picked, ...scenarioIds.filter((id) => !picked.includes(id))]
}

export function toggleScenario(testScenarioId: string, picked: readonly string[]): string[] {
  return picked.includes(testScenarioId)
    ? picked.filter((id) => id !== testScenarioId)
    : [...picked, testScenarioId]
}

export function versionLabel(version: LibraryVersion, noVersion: string): string {
  return version.gameBuild === null ? noVersion : gameBuildName(version.gameBuild)
}
