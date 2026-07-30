import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { createTestScenario, listTestScenarios } from './scenarioApi'
import type { TestScenarioSummary } from './scenarioTypes'

/**
 * The project's scenarios, as the studio's left rail. Selecting one navigates to
 * its URL (the page is keyed by id, so it remounts on the new scenario). The
 * list has no case counts — the list endpoint does not carry them — so a row
 * shows the name and when it was last touched, not a rollup.
 */
export function ScenarioList({
  projectId,
  activeId,
  runId = null,
}: {
  projectId: string
  activeId: number
  /** Carried into each row's link so the Edit/Map toggle survives switching scenarios. */
  runId?: string | null
}) {
  const { t } = useI18n()
  const s = t.scenarios.list
  const navigate = useNavigate()
  const [items, setItems] = useState<TestScenarioSummary[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listTestScenarios(Number(projectId), controller.signal)
      // Newest first: the server does not guarantee an order, so sort by
      // createdAt descending (id descending as a stable tiebreaker).
      .then((list) =>
        setItems(
          [...list].sort(
            (a, b) =>
              (b.createdAt.localeCompare(a.createdAt)) || (b.testScenarioId - a.testScenarioId),
          ),
        ),
      )
      .catch(() => undefined)
    return () => controller.abort()
  }, [projectId, activeId])

  function open(id: number) {
    const suffix = runId !== null ? `?run=${encodeURIComponent(runId)}` : ''
    navigate(`/projects/${encodeURIComponent(projectId)}/test-scenarios/${id}${suffix}`)
  }

  async function create() {
    if (creating) return
    setCreating(true)
    try {
      const id = await createTestScenario(Number(projectId))
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
      <div className="scn-list">
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
    </aside>
  )
}

function formatDay(value: string): string {
  return value.length >= 10 ? value.slice(0, 10) : value
}
