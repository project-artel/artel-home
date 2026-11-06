import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useProjectChange } from '../../live/useProjectChange'
import { getTestScenario } from '../../testScenarios/scenarioApi'
import type { ScenarioDraft } from '../../testScenarios/scenarioTypes'
import { useProjectCases } from '../../testScenarios/useProjectCases'
import { getRunScenarios, getTestRun, type TestRun } from '../testRunApi'
import { buildMapScenario, type MapScenario } from './runMapModel'
import { EMPTY_RUN_MAP, getRunMap, type RunMap } from './runMapApi'

export type RunMapStatus = 'loading' | 'ready' | 'missing' | 'error'

/**
 * 런 맵이 그리는 것 전부(ARTEL-1245): 런, 런에 든 TS 의 본문(런 순서), 맵 배치 · 주석, 스텝의 씬을 찾을 TC.
 *
 * 프로젝트 변경 이벤트 `TEST_RUNS` 가 오면 조용히 다시 읽는다. 다른 사람이 편집 화면이나 맵에서 고친 것이
 * 새로고침 없이 들어온다. 맵 배치 · 주석은 [keepLocalMap] 이 true 인 동안(내가 저장 중) 건너뛴다. 내 저장이
 * 끝나기 전의 낡은 값으로 내 화면을 덮지 않으려는 것이다.
 */
export function useRunMapData(projectId: string, runId: string, keepLocalMap: () => boolean) {
  const [status, setStatus] = useState<RunMapStatus>('loading')
  const [run, setRun] = useState<TestRun | null>(null)
  const [order, setOrder] = useState<string[]>([])
  const [drafts, setDrafts] = useState<Record<string, ScenarioDraft>>({})
  const [map, setMap] = useState<RunMap>(EMPTY_RUN_MAP)
  const keepRef = useRef(keepLocalMap)
  useEffect(() => {
    keepRef.current = keepLocalMap
  })

  // 읽기와 상태 바꾸기를 나눈다. 읽기는 effect 밖에서도(이벤트 · 실패 뒤 다시 읽기) 같은 것을 쓴다.
  const apply = useCallback((result: Loaded | null, quiet: boolean) => {
    if (result === null) {
      if (!quiet) setStatus('error')
      return
    }
    if (result.run === null) {
      setStatus('missing')
      return
    }
    setRun(result.run)
    setOrder(result.ids)
    setDrafts(result.drafts)
    if (result.map !== null && !(quiet && keepRef.current())) setMap(result.map)
    setStatus('ready')
  }, [])
  const load = useCallback(
    (signal?: AbortSignal, quiet = false) => readAll(projectId, runId, signal).then((result) => apply(result, quiet)),
    [projectId, runId, apply],
  )

  useEffect(() => {
    const controller = new AbortController()
    readAll(projectId, runId, controller.signal).then((result) => {
      if (!controller.signal.aborted) apply(result, false)
    })
    return () => controller.abort()
  }, [projectId, runId, apply])

  useProjectChange(projectId, 'TEST_RUNS', () => void load(undefined, true))

  const cases = useProjectCases(projectId, status === 'ready', run?.gameBuild?.gameBuildId ?? null)
  const sceneOfCase = useMemo(() => {
    const scenes = new Map(cases.cases.map((c) => [Number(c.id), c.scene] as const))
    return (caseId: number) => scenes.get(caseId) ?? null
  }, [cases.cases])

  const scenarios = useMemo(
    () => order.filter((id) => drafts[id] !== undefined).map((id) => buildMapScenario(id, drafts[id], sceneOfCase)),
    [order, drafts, sceneOfCase],
  )

  return { status, run, order, setOrder, drafts, setDrafts, scenarios, map, setMap, cases, reload: load }
}

type Loaded = { run: TestRun | null; ids: string[]; drafts: Record<string, ScenarioDraft>; map: RunMap | null }

/** 런 · 구성 · TS 본문 · 맵을 한 번에 읽는다. 읽지 못하면 null, 런이 없으면 run 이 null. */
async function readAll(projectId: string, runId: string, signal?: AbortSignal): Promise<Loaded | null> {
  try {
    const [run, items] = await Promise.all([getTestRun(projectId, runId, signal), getRunScenarios(projectId, runId, signal)])
    if (run === null) return { run: null, ids: [], drafts: {}, map: null }
    const ids = [...items].sort((a, b) => a.position - b.position).map((item) => item.testScenarioId)
    const [loaded, map] = await Promise.all([
      Promise.all(ids.map((id) => getTestScenario(Number(id), signal).then((s) => [id, s.payload] as const).catch(() => null))),
      getRunMap(projectId, runId, signal).catch(() => null),
    ])
    return { run, ids, drafts: Object.fromEntries(loaded.filter((entry) => entry !== null)), map }
  } catch {
    return null
  }
}

export type RunMapData = ReturnType<typeof useRunMapData>
export type { MapScenario }
