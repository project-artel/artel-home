import { useEffect, useState } from 'react'
import { fetchQaRunUsage } from '../../../admin/usage/llmUsageApi'
import type { QaRunUsage } from '../../../admin/usage/llmUsageTypes'
import { listProjectIssues } from '../../../issues/issueApi'
import type { Issue } from '../../../issues/issueTypes'
import { listQaTries } from '../../../qa/qaApi'
import type { QaTry } from '../../../qa/qaTypes'
import { listProjectQaRuns, type QaRunSummary } from '../../../qa/launch/qaLaunchApi'
import { listTestCaseVersions, listVersionCases, type TestCaseVersionSummary, type VersionCaseRow } from '../../../testCases/testCaseVersions'
import { listTestScenarios } from '../../../testScenarios/scenarioApi'
import type { TestScenarioSummary } from '../../../testScenarios/scenarioTypes'

export type Loaded<T> = { status: 'loading' } | { status: 'ready'; value: T } | { status: 'failed' }

export type VersionPair = { current: TestCaseVersionSummary; previous: TestCaseVersionSummary | null; rows: VersionCaseRow[] }

export type DashboardData = {
  qaRuns: Loaded<QaRunSummary[]>
  versions: Loaded<VersionPair | null>
  tries: Loaded<QaTry[]>
  usage: Loaded<QaRunUsage[]>
  scenarios: Loaded<TestScenarioSummary[]>
  issues: Loaded<Issue[]>
}

const LOADING: DashboardData = {
  qaRuns: { status: 'loading' },
  versions: { status: 'loading' },
  tries: { status: 'loading' },
  usage: { status: 'loading' },
  scenarios: { status: 'loading' },
  issues: { status: 'loading' },
}

/** 화면에 보이는 버전 중 최신과 그 바로 앞. 만든 순서로 고른다 — 이름(1.10 · 1.9)으로 줄 세우면 틀린다. */
export function pickVersions(versions: readonly TestCaseVersionSummary[]): { current: TestCaseVersionSummary; previous: TestCaseVersionSummary | null } | null {
  const shown = versions.filter((version) => !version.hidden).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const current = shown.find((version) => version.latest) ?? shown[0]
  if (current === undefined) return null
  const previous = shown.find((version) => version.gameBuildId !== current.gameBuildId && version.createdAt <= current.createdAt) ?? null
  return { current, previous }
}

/**
 * 대시보드가 workspace 밖에서 더 읽는 것(ARTEL-1164). 칸마다 따로 읽고 따로 실패한다 — 사용량을 못 읽었다고 QA 히스토리까지
 * 비우지 않는다. [reloadKey] 가 바뀌면(실행이 새로 생기는 등) 다시 읽는다.
 */
export function useDashboardData(projectId: string, reloadKey: number): DashboardData {
  const [data, setData] = useState<{ key: string; value: DashboardData }>({ key: '', value: LOADING })
  const key = `${projectId}#${reloadKey}`

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    const put = <K extends keyof DashboardData>(name: K, value: DashboardData[K]) =>
      setData((current) => ({ key, value: { ...(current.key === key ? current.value : LOADING), [name]: value } }))
    const settle = <K extends keyof DashboardData, T>(name: K, promise: Promise<T>) =>
      promise
        .then((value) => put(name, { status: 'ready', value } as DashboardData[K]))
        .catch((error: unknown) => {
          if (!(error instanceof DOMException && error.name === 'AbortError')) put(name, { status: 'failed' } as DashboardData[K])
        })

    const now = new Date()
    const from = new Date(now.getTime() - 90 * 86_400_000)
    void settle('qaRuns', listProjectQaRuns(projectId, 50, signal))
    void settle('tries', listQaTries(projectId, signal, 100))
    void settle('usage', fetchQaRunUsage({ projectId, from, to: now }, 100, signal))
    void settle('scenarios', listTestScenarios(Number(projectId), signal))
    void settle('issues', listProjectIssues(projectId, {}, undefined, signal).then((page) => page.items))
    void settle(
      'versions',
      listTestCaseVersions(projectId, signal).then(async (library) => {
        const pair = pickVersions(library.versions)
        if (pair === null) return null
        const rows = await listVersionCases(projectId, pair.current.gameBuildId, pair.previous?.gameBuildId ?? null, signal)
        return { ...pair, rows }
      }),
    )
    return () => controller.abort()
  }, [projectId, key])

  return data.key === key ? data.value : LOADING
}
