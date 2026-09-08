import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import { getRunScenarios, setRunScenarios } from '../testRuns/testRunApi'
import { createTestScenario, listTestScenarios } from './scenarioApi'
import type { TestScenarioSummary } from './scenarioTypes'

/**
 * The studio's left rail. When a `runId` is given the list is that run's
 * scenarios (in newest-first order); otherwise it is the whole project's. A row
 * navigates to the scenario, carrying the run so the Edit/Map toggle survives.
 *
 * Creating a scenario in a run context both makes it and appends it to the run,
 * so a scenario made here is immediately part of the run being edited.
 */
export function ScenarioList({
  projectId,
  activeId,
  runId = null,
  refreshToken = 0,
}: {
  projectId: string
  activeId: number
  /** When set, the rail is scoped to this run and new scenarios append to it. */
  runId?: string | null
  /**
   * Bumped by the studio when the authoring chat writes scenarios. The rail owns
   * its list, so without this a scenario the agent just made stays invisible
   * until the page is reloaded — and reloading is how the conversation is lost.
   */
  refreshToken?: number
}) {
  const { t } = useI18n()
  const s = t.scenarios.list
  const navigate = useNavigate()
  // 노드를 state 로 든다 — {@link EdgeScrollbar} 가 붙는 시점을 알아야 한다.
  const [listNode, setListNode] = useState<HTMLDivElement | null>(null)
  const [items, setItems] = useState<TestScenarioSummary[]>([])
  const [creating, setCreating] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const sortNewest = (list: TestScenarioSummary[]) =>
      [...list].sort(
        (a, b) => b.createdAt.localeCompare(a.createdAt) || (b.testScenarioId - a.testScenarioId),
      )

    async function load() {
      const all = await listTestScenarios(Number(projectId), controller.signal)
      if (runId === null) return sortNewest(all)
      // Run-scoped: keep only scenarios in this run's composition.
      const runItems = await getRunScenarios(projectId, runId, controller.signal)
      const runIds = new Set(runItems.map((item) => item.testScenarioId))
      return sortNewest(all.filter((summary) => runIds.has(String(summary.testScenarioId))))
    }

    load().then(setItems).catch(() => undefined)
    return () => controller.abort()
  }, [projectId, runId, activeId, reload, refreshToken])

  function open(id: number) {
    const suffix = runId !== null ? `?run=${encodeURIComponent(runId)}` : ''
    navigate(`/projects/${encodeURIComponent(projectId)}/test-scenarios/${id}${suffix}`)
  }

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      const id = await createTestScenario(Number(projectId))
      // In a run, the new scenario must join the run's composition to be visible
      // and reachable within it — append after the existing ones.
      if (runId !== null) {
        const existing = await getRunScenarios(projectId, runId)
        await setRunScenarios(projectId, runId, [...existing.map((i) => i.testScenarioId), String(id)])
        setReload((n) => n + 1)
      }
      open(id)
    } catch {
      // stay put; the topbar's own errors already cover a failed round trip
    } finally {
      setCreating(false)
    }
  }

  return (
    <aside className="elist">
      <div className="elist-head">
        <h2>{s.heading}</h2>
        <span className="count-pill">{items.length}</span>
        <button className="mini-add" onClick={create} disabled={creating} aria-label={s.new} title={s.new} type="button">＋</button>
      </div>
      <div className="scn-list" ref={setListNode}>
        {items.length === 0 ? (
          <p className="empty-note">{s.empty}</p>
        ) : (
          items.map((item) => (
            <button
              className={'scnrow' + (item.testScenarioId === activeId ? ' sel' : '')}
              key={item.testScenarioId}
              onClick={() => open(item.testScenarioId)}
              type="button"
            >
              <span className="vdot DRAFT" />
              <span className="scnrow-main">
                <span className="scnrow-name">{item.title.length > 0 ? item.title : s.untitled}</span>
                <span className="scnrow-meta">{formatDay(item.updatedAt || item.createdAt)}</span>
              </span>
              <span />
            </button>
          ))
        )}
      </div>
      <EdgeScrollbar label={s.heading} scroller={listNode} side="left" />
    </aside>
  )
}

function formatDay(value: string): string {
  return value.length >= 10 ? value.slice(0, 10) : value
}
