import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { RunChat } from '../testRuns/RunChat'
import { RunNameCrumb } from '../testRuns/RunNameCrumb'
import { getTestRun } from '../testRuns/testRunApi'
import { useRunChatSession } from '../testRuns/useRunChatSession'
import { ApproveScenarioDialog } from './ApproveScenarioDialog'
import { DeleteScenarioDialog } from './DeleteScenarioDialog'
import { getTestScenario } from './scenarioApi'
import { ScenarioList } from './ScenarioList'
import { ScenarioStepsView } from './ScenarioStepsView'
import { EMPTY_SCENARIO_DRAFT, type ScenarioDraft } from './scenarioTypes'

/**
 * Keyed by the scenario id so opening another scenario remounts rather than
 * reusing the previous one.
 */
export function TestScenarioRoute() {
  const { projectId = '', testScenarioId = '' } = useParams()
  return <TestScenarioPage key={testScenarioId} projectId={projectId} testScenarioId={testScenarioId} />
}

function backLink(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`
}

/**
 * The scenario studio (재설계 2026-08-08): a scenario's ordered STEPS in the
 * centre, the project's scenarios on the left, and the run's authoring
 * conversation on the right.
 *
 * A scenario body is now `payload.steps` — read here with {@link getTestScenario}
 * and shown read-only ({@link ScenarioStepsView}); manual step editing is a later
 * track. The chat is RUN-scoped ({@link useRunChatSession}): one conversation
 * spans the whole run and its proposals are applied into it, so it shows only when
 * the studio was opened from a run (`?run=`). Applying a proposal reloads the
 * scenario so committed steps appear.
 */
function TestScenarioPage({ projectId, testScenarioId }: { projectId: string; testScenarioId: string }) {
  const scenarioId = Number(testScenarioId)
  const validId = Number.isInteger(scenarioId) && scenarioId > 0
  const { t } = useI18n()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fromRun = searchParams.get('run')

  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading')
  const [draft, setDraft] = useState<ScenarioDraft>(EMPTY_SCENARIO_DRAFT)
  const [reloadKey, setReloadKey] = useState(0)
  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  useEffect(() => {
    if (!validId) return
    const controller = new AbortController()
    setStatus('loading')
    getTestScenario(scenarioId, controller.signal)
      .then((scenario) => { setDraft(scenario.payload); setStatus('ready') })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return
        setStatus('missing')
      })
    return () => controller.abort()
  }, [scenarioId, validId, reloadKey])

  // Applying a chat proposal reloads the scenario so committed steps appear.
  const runChat = useRunChatSession(projectId, fromRun, reload)

  // The run's name for the crumb, when the studio was opened from a run. Fetched
  // here because the studio only carries the run id (?run=), not its name.
  const [runName, setRunName] = useState('')
  useEffect(() => {
    if (fromRun === null) return
    const controller = new AbortController()
    getTestRun(projectId, fromRun, controller.signal)
      .then((run) => { if (run !== null) setRunName(run.name) })
      .catch(() => { /* leave the crumb blank on failure */ })
    return () => controller.abort()
  }, [projectId, fromRun])

  const [dialog, setDialog] = useState<'approve' | 'delete' | null>(null)
  // Approve/delete return to where the scenario was opened from: the run's edit
  // view when in a run, otherwise the project.
  const afterExit = fromRun !== null
    ? `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(fromRun)}/edit`
    : backLink(projectId)

  if (!validId) {
    return (
      <section className="page"><div className="panel-message">
        <h1>{t.scenarios.page.notFoundTitle}</h1>
        <p className="panel-message-copy">{t.scenarios.page.invalidAddress}</p>
        <Link className="button button--secondary" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
      </div></section>
    )
  }
  if (status === 'missing') {
    return (
      <section className="page"><div className="panel-message">
        <h1>{t.scenarios.page.notFoundTitle}</h1>
        <p className="panel-message-copy">{t.scenarios.page.missingCopy}</p>
        <Link className="button button--secondary" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
      </div></section>
    )
  }

  const title = draft.title.length > 0 ? draft.title : t.scenarios.page.untitled

  return (
    <div className="scenario-studio">
      <header className="st-top">
        <Link className="st-back" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
        <div className="st-crumb">
          {fromRun !== null && (
            <>
              <RunNameCrumb
                projectId={projectId}
                runId={fromRun}
                name={runName}
                onRenamed={(run) => setRunName(run.name)}
              />
              <span className="st-crumb-sep" aria-hidden="true">/</span>
            </>
          )}
          <span className="scn">{title}</span>
        </div>
        <div className="st-spacer" />
        {fromRun !== null && (
          <div className="st-seg">
            <button className="on" type="button">{t.scenarios.map.editView}</button>
            <button onClick={() => navigate(`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(fromRun)}`)} type="button">{t.scenarios.map.mapView}</button>
          </div>
        )}
        <button className="st-btn st-btn--danger" onClick={() => setDialog('delete')} type="button">{t.scenarios.page.delete}</button>
        <button className="st-btn st-btn--primary" onClick={() => setDialog('approve')} type="button">{t.scenarios.page.approve}</button>
      </header>

      <div className="st-edit">
        <ScenarioList projectId={projectId} activeId={scenarioId} runId={fromRun} />
        {status === 'ready' ? <ScenarioStepsView draft={draft} /> : <main className="edoc-wrap"><div className="edoc" /></main>}
        <aside className="st-chat">
          {fromRun !== null && <RunChat session={runChat} />}
        </aside>
      </div>

      {dialog === 'approve' && (
        <ApproveScenarioDialog
          onApproved={() => navigate(afterExit, { replace: true })}
          onClose={() => setDialog(null)}
          testScenarioId={scenarioId}
        />
      )}
      {dialog === 'delete' && (
        <DeleteScenarioDialog
          onClose={() => setDialog(null)}
          onDeleted={() => navigate(afterExit, { replace: true })}
          scenarioTitle={draft.title}
          testScenarioId={scenarioId}
        />
      )}
    </div>
  )
}
