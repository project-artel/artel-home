import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { ApproveScenarioDialog } from './ApproveScenarioDialog'
import { DeleteScenarioDialog } from './DeleteScenarioDialog'
import { ScenarioCanvas } from './ScenarioCanvas'
import { ScenarioChat } from './ScenarioChat'
import { useScenarioSession } from './useScenarioSession'

/**
 * Keyed by the scenario id so opening another scenario remounts rather than
 * reusing the previous conversation's stream and canvas.
 */
export function TestScenarioRoute() {
  const { projectId = '', testScenarioId = '' } = useParams()
  return (
    <TestScenarioPage
      key={testScenarioId}
      projectId={projectId}
      testScenarioId={testScenarioId}
    />
  )
}

function backLink(projectId: string) {
  return `/projects/${encodeURIComponent(projectId)}`
}

/**
 * One scenario: the conversation on the left, the scenario it produces on the
 * right.
 *
 * The id lives in the URL because it is the only way back. The server has no
 * endpoint that lists a project's scenarios, so a reload or a bookmark is what
 * makes a scenario reachable a second time.
 */
function TestScenarioPage({
  projectId,
  testScenarioId,
}: {
  projectId: string
  testScenarioId: string
}) {
  const scenarioId = Number(testScenarioId)
  const session = useScenarioSession(scenarioId)
  const navigate = useNavigate()
  const { t } = useI18n()
  // Approve finalizes and Delete discards; both end the scenario, so each opens
  // a confirmation first rather than acting on a single click.
  const [dialog, setDialog] = useState<'approve' | 'delete' | null>(null)

  if (!Number.isInteger(scenarioId) || scenarioId <= 0) {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>{t.scenarios.page.notFoundTitle}</h1>
          <p className="panel-message-copy">{t.scenarios.page.invalidAddress}</p>
          <Link className="button button--secondary" to={backLink(projectId)}>
            {t.scenarios.page.backToProject}
          </Link>
        </div>
      </section>
    )
  }

  if (session.status === 'loading') {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">{t.scenarios.page.loading}</p>
      </section>
    )
  }

  if (session.status === 'missing') {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>{t.scenarios.page.notFoundTitle}</h1>
          <p className="panel-message-copy">{t.scenarios.page.missingCopy}</p>
          <Link className="button button--secondary" to={backLink(projectId)}>
            {t.scenarios.page.backToProject}
          </Link>
        </div>
      </section>
    )
  }

  if (session.status === 'error') {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          <p>{t.scenarios.page.loadFailed}</p>
          <button className="button button--secondary" onClick={session.reload} type="button">
            {t.scenarios.page.retry}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="page" aria-labelledby="scenario-title">
      <header className="page-header">
        <div>
          <Link className="back-link" to={backLink(projectId)}>{t.scenarios.page.backToProject}</Link>
          <h1 id="scenario-title">
            {session.saved.title.length > 0 ? session.saved.title : t.scenarios.page.untitled}
          </h1>
          <p className="page-subtitle">
            {t.scenarios.page.scenarioLabel} <span className="mono">#{scenarioId}</span>
          </p>
        </div>
        <div className="page-header-actions">
          {/* Only the interrupted state is announced. A healthy stream is the
              expected case, and a permanent "connected" badge would be noise on
              a screen whose real subject is the conversation. */}
          {!session.connected && session.closure === null && (
            <span className="badge scenario-reconnecting">{t.scenarios.page.reconnecting}</span>
          )}
          <button
            className="button button--danger-quiet"
            onClick={() => setDialog('delete')}
            type="button"
          >
            {t.scenarios.page.delete}
          </button>
          <button
            className="button button--primary"
            onClick={() => setDialog('approve')}
            type="button"
          >
            {t.scenarios.page.approve}
          </button>
        </div>
      </header>

      <div className="scenario-workspace">
        <ScenarioChat
          awaitingReply={session.awaitingReply}
          closure={session.closure}
          messages={session.messages}
          onSend={session.send}
          sendFailure={session.sendFailure}
          sending={session.sending}
        />
        <ScenarioCanvas
          dirty={session.dirty}
          draft={session.draft}
          onChange={session.editDraft}
          readOnly={session.closure !== null}
          saving={session.saving}
        />
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
          scenarioTitle={session.saved.title}
          testScenarioId={scenarioId}
        />
      )}
    </section>
  )
}
