import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { listTestScenarios } from '../testScenarios/scenarioApi'
import { ScenarioList } from '../testScenarios/ScenarioList'
import { getRunScenarios, getTestRun, setRunScenarios, type TestRun } from './testRunApi'
import { createTestScenario } from '../testScenarios/scenarioApi'
import { RunChat } from './RunChat'
import { RunNameCrumb } from './RunNameCrumb'
import { useRunChatSession } from './useRunChatSession'

/**
 * A run's edit entry point (`/test-runs/:runId/edit`).
 *
 * A TestRun is created before it has any scenarios, so opening one must not
 * require a scenario to exist. This decides where the run opens:
 *
 * - Has scenarios → jump to the newest one's studio, carrying the run context.
 * - Empty → the empty-run shell: the scenario rail with a "new scenario" button,
 *   the centre inviting the first scenario, and the Map locked (there is nothing
 *   to lay out until a scenario exists).
 *
 * Scenarios are project-level and reusable, so the run owns them by composition,
 * not ownership — creating one here appends it to this run.
 */
export function RunEditRoute() {
  const { projectId = '', runId = '' } = useParams()
  return <RunEditPage key={runId} projectId={projectId} runId={runId} />
}

function RunEditPage({ projectId, runId }: { projectId: string; runId: string }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'ready'; run: TestRun; hasScenarios: boolean }
    | { kind: 'redirect'; scenarioId: string }
    | { kind: 'missing' }
  >({ kind: 'loading' })
  const [creating, setCreating] = useState(false)
  // Bumped after the chat applies a proposal, so the rail re-fetches. Only the
  // FIRST load hands off to the studio; after an apply we stay here so the chat —
  // and any remaining proposal cards — survive (they are client-side state, and a
  // redirect would unmount them).
  const [reloadKey, setReloadKey] = useState(0)
  const initialLoad = useRef(true)
  const runChat = useRunChatSession(projectId, runId, () => setReloadKey((k) => k + 1))

  useEffect(() => {
    const controller = new AbortController()
    const signal = controller.signal
    ;(async () => {
      try {
        const [run, items, summaries] = await Promise.all([
          getTestRun(projectId, runId, signal),
          getRunScenarios(projectId, runId, signal),
          listTestScenarios(Number(projectId), signal),
        ])
        if (run === null) { setState({ kind: 'missing' }); return }
        // Opening a run that already has scenarios jumps to the newest one's studio.
        // After that (e.g. an empty run being authored into), an apply must NOT
        // redirect — that unmounts the chat and drops the other proposal cards.
        if (initialLoad.current && items.length > 0) {
          const createdById = new Map(summaries.map((s) => [String(s.testScenarioId), s.createdAt]))
          const first = [...items].sort(
            (a, b) => (createdById.get(b.testScenarioId) ?? '').localeCompare(createdById.get(a.testScenarioId) ?? ''),
          )[0]
          setState({ kind: 'redirect', scenarioId: first.testScenarioId })
        } else {
          setState({ kind: 'ready', run, hasScenarios: items.length > 0 })
        }
        initialLoad.current = false
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setState({ kind: 'missing' })
      }
    })()
    return () => controller.abort()
  }, [projectId, runId, reloadKey])

  async function createFirst() {
    if (creating) return
    setCreating(true)
    try {
      const id = await createTestScenario(Number(projectId))
      await setRunScenarios(projectId, runId, [String(id)])
      navigate(`/projects/${encodeURIComponent(projectId)}/test-scenarios/${id}?run=${encodeURIComponent(runId)}`)
    } catch {
      setCreating(false)
    }
  }

  if (state.kind === 'loading') {
    return <div className="scenario-studio"><div className="empty-note" style={{ padding: 40 }}>{t.scenarios.map.loading}</div></div>
  }
  if (state.kind === 'missing') {
    return (
      <section className="page"><div className="panel-message">
        <h1>{t.scenarios.page.notFoundTitle}</h1>
        <p className="panel-message-copy">{t.scenarios.map.missing}</p>
        <Link className="button button--secondary" to={`/projects/${encodeURIComponent(projectId)}`}>{t.scenarios.map.back}</Link>
      </div></section>
    )
  }
  if (state.kind === 'redirect') {
    return <Navigate replace to={`/projects/${encodeURIComponent(projectId)}/test-scenarios/${state.scenarioId}?run=${encodeURIComponent(runId)}`} />
  }

  // Run studio shell — the run-scoped chat lives here for the whole editing
  // session, so applying one card keeps the rest. The rail re-fetches on each
  // apply (key), while the chat aside stays mounted (stable position).
  const e = t.scenarios.runEdit
  return (
    <div className="scenario-studio">
      <header className="st-top">
        <Link className="st-back" to={`/projects/${encodeURIComponent(projectId)}`}>{t.scenarios.page.backToProject}</Link>
        <div className="st-crumb">
          <RunNameCrumb
            projectId={projectId}
            runId={runId}
            name={state.run.name}
            onRenamed={(run) => setState((prev) => (prev.kind === 'ready' ? { ...prev, run } : prev))}
          />
          <span className="id mono">TestRun</span>
        </div>
        <div className="st-spacer" />
        <div className="st-seg">
          <button className="on" type="button">{t.scenarios.map.editView}</button>
          <button className="locked" disabled title={e.mapLocked} type="button">
            <span aria-hidden="true">🔒</span> {t.scenarios.map.mapView}
          </button>
        </div>
      </header>

      <div className="st-edit">
        <ScenarioList key={reloadKey} projectId={projectId} activeId={-1} runId={runId} />
        <main className="edoc-wrap">
          <div className="edoc run-empty">
            {state.hasScenarios ? (
              <>
                <h1 className="run-empty-title">{e.authoredTitle}</h1>
                <p className="run-empty-copy">{e.authoredCopy}</p>
              </>
            ) : (
              <>
                <h1 className="run-empty-title">{e.emptyTitle}</h1>
                <p className="run-empty-copy">{e.emptyCopy}</p>
                <button className="st-btn st-btn--primary" disabled={creating} onClick={createFirst} type="button">
                  {creating ? e.creating : e.createFirst}
                </button>
              </>
            )}
          </div>
        </main>
        <aside className="st-chat">
          <RunChat session={runChat} />
        </aside>
      </div>
    </div>
  )
}
