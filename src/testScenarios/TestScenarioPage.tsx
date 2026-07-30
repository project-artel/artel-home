import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { ApproveScenarioDialog } from './ApproveScenarioDialog'
import { DeleteScenarioDialog } from './DeleteScenarioDialog'
import { ScenarioChat } from './ScenarioChat'
import { ScenarioComposition } from './ScenarioComposition'
import { ScenarioList } from './ScenarioList'
import { useScenarioComposition } from './useScenarioComposition'
import { useScenarioSession } from './useScenarioSession'

/**
 * Keyed by the scenario id so opening another scenario remounts rather than
 * reusing the previous conversation's stream and composition.
 */
export function TestScenarioRoute() {
  const { projectId = '', testScenarioId = '' } = useParams()
  return <TestScenarioPage key={testScenarioId} projectId={projectId} testScenarioId={testScenarioId} />
}

function backLink(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`
}

/**
 * The scenario studio: a scenario's ordered cases in the centre, the project's
 * scenarios on the left, and the agent conversation on the right.
 *
 * The case body is {@link useScenarioComposition}; the chat, approve and delete
 * stay on {@link useScenarioSession}. The agent still authors the scenario's
 * draft, not its cases, so the chat is present but not wired to the case flow —
 * called out in the column rather than hidden.
 */
function TestScenarioPage({ projectId, testScenarioId }: { projectId: string; testScenarioId: string }) {
  const scenarioId = Number(testScenarioId)
  const { t } = useI18n()
  const navigate = useNavigate()
  const session = useScenarioSession(scenarioId)
  const comp = useScenarioComposition(projectId, scenarioId)
  const [dialog, setDialog] = useState<'approve' | 'delete' | null>(null)
  const [searchParams] = useSearchParams()
  const fromRun = searchParams.get('run')
  const initialCase = searchParams.get('case')

  const readOnly = session.closure !== null

  // Page-level undo/redo shortcuts (outside text fields, their own text-undo wins).
  useEffect(() => {
    if (readOnly) return undefined
    function onKeyDown(event: KeyboardEvent) {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const target = event.target as HTMLElement | null
      if (target !== null && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); if (comp.canUndo) comp.undo() }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); if (comp.canRedo) comp.redo() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [readOnly, comp.canUndo, comp.canRedo, comp.undo, comp.redo])

  if (!Number.isInteger(scenarioId) || scenarioId <= 0) {
    return (
      <section className="page"><div className="panel-message">
        <h1>{t.scenarios.page.notFoundTitle}</h1>
        <p className="panel-message-copy">{t.scenarios.page.invalidAddress}</p>
        <Link className="button button--secondary" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
      </div></section>
    )
  }
  if (comp.status === 'missing') {
    return (
      <section className="page"><div className="panel-message">
        <h1>{t.scenarios.page.notFoundTitle}</h1>
        <p className="panel-message-copy">{t.scenarios.page.missingCopy}</p>
        <Link className="button button--secondary" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
      </div></section>
    )
  }

  const saveState = comp.saving ? 'saving' : comp.dirty ? 'unsaved' : 'saved'
  const cc = t.scenarios.composition
  const title = comp.working.title.length > 0 ? comp.working.title : t.scenarios.page.untitled

  return (
    <div className="scenario-studio">
      <header className="st-top">
        <Link className="st-back" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
        <div className="st-crumb">
          <span className="scn">{title}</span>
          <span className="id mono">#{scenarioId}</span>
        </div>
        <div className="st-spacer" />
        {fromRun !== null && (
          <div className="st-seg">
            <button className="on" type="button">{t.scenarios.map.editView}</button>
            <button onClick={() => navigate(`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(fromRun)}`)} type="button">{t.scenarios.map.mapView}</button>
          </div>
        )}
        {!session.connected && session.closure === null && (
          <span className="reconnect"><span className="d" style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }} />{t.scenarios.page.reconnecting}</span>
        )}
        {!readOnly && (
          <>
            <div className="st-icons">
              <button className="iconbtn" disabled={!comp.canUndo} onClick={comp.undo} title={cc.undoTitle} type="button">↶</button>
              <button className="iconbtn" disabled={!comp.canRedo} onClick={comp.redo} title={cc.redoTitle} type="button">↷</button>
            </div>
            <span className={`savebadge ${saveState}`}>
              {saveState !== 'saved' && <span className="d" />}
              {saveState === 'saving' ? cc.saving : saveState === 'unsaved' ? cc.unsaved : cc.saved}
            </span>
          </>
        )}
        <button className="st-btn st-btn--danger" onClick={() => setDialog('delete')} type="button">{t.scenarios.page.delete}</button>
        <button className="st-btn st-btn--primary" onClick={() => setDialog('approve')} type="button">{t.scenarios.page.approve}</button>
      </header>

      <div className="st-edit">
        <ScenarioList projectId={projectId} activeId={scenarioId} runId={fromRun} />
        <ScenarioComposition comp={comp} projectId={projectId} readOnly={readOnly} initialCaseId={initialCase} />
        <aside className="st-chat">
          <ScenarioChat
            awaitingReply={session.awaitingReply}
            closure={session.closure}
            messages={session.messages}
            onSend={session.send}
            sendFailure={session.sendFailure}
            sending={session.sending}
          />
          <p className="agent-note">{cc.agentNote}</p>
        </aside>
      </div>

      {dialog === 'approve' && (
        <ApproveScenarioDialog
          draft={session.draft}
          onApproved={() => navigate(backLink(projectId), { replace: true })}
          onClose={() => setDialog(null)}
          testScenarioId={scenarioId}
        />
      )}
      {dialog === 'delete' && (
        <DeleteScenarioDialog
          onClose={() => setDialog(null)}
          onDeleted={() => navigate(backLink(projectId), { replace: true })}
          scenarioTitle={comp.working.title}
          testScenarioId={scenarioId}
        />
      )}
    </div>
  )
}
