import { apiFetch, asNullableString, asRecord, asString, readJson } from '../shared/adminApi'
import { ALL_PROJECTS } from '../shared/projects/pick'

/**
 * `test run` 목록을 부를 프로젝트 id.
 *
 * `/api/projects/{projectId}/test-runs`가 프로젝트 경계를 지나므로, 프로젝트를 아직 안 골랐거나
 * (`null`) "전 프로젝트 합산"(`ALL_PROJECTS`, ARTEL-750)을 고른 상태에는 부를 프로젝트가 없다.
 * `listTestRuns`와 한 파일에 두는 이유는 그 함수를 부를지 말지가 바로 이 규칙이기 때문이다.
 */
export function activeProjectId(projectId: string | null): string | null {
  return projectId !== null && projectId !== ALL_PROJECTS ? projectId : null
}

/** `test run` 선택기 한 줄. 목록 응답은 이름까지만 준다 — 본문은 이 화면이 쓰지 않는다. */
export interface TestRunSummary {
  id: string
  name: string
  description: string | null
}

/**
 * 프로젝트 하나의 `test run` 목록.
 *
 * 경로가 `/api/projects/{projectId}/test-runs`를 지나 프로젝트 경계가 필수다 — "전 프로젝트
 * 합산"(`ALL_PROJECTS`, ARTEL-750) 상태에서는 부를 프로젝트 자체가 없다. 그 상태를 가리는 것은
 * 이 함수를 부르는 화면 쪽 몫이다.
 */
export async function listTestRuns(
  projectId: string,
  signal?: AbortSignal,
): Promise<TestRunSummary[]> {
  const response = await apiFetch(`/api/projects/${projectId}/test-runs`, { signal })
  const body = asRecord(await readJson(response))
  const items = Array.isArray(body.items) ? body.items : []

  return items.map((item) => {
    const row = asRecord(item)
    return {
      id: asString(row.id, 'testRun.id'),
      name: asString(row.name, 'testRun.name'),
      description: asNullableString(row.description),
    }
  })
}
