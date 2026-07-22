import { Link, useParams } from 'react-router-dom'
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

  if (!Number.isInteger(scenarioId) || scenarioId <= 0) {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>Scenario not found</h1>
          <p className="panel-message-copy">That address does not name a scenario.</p>
          <Link className="button button--secondary" to={backLink(projectId)}>
            Back to the project
          </Link>
        </div>
      </section>
    )
  }

  if (session.status === 'loading') {
    return (
      <section className="page" aria-busy="true">
        <p className="panel-empty">Loading scenario…</p>
      </section>
    )
  }

  if (session.status === 'missing') {
    return (
      <section className="page">
        <div className="panel-message">
          <h1>Scenario not found</h1>
          <p className="panel-message-copy">
            It may have been deleted, or you may not have access to it.
          </p>
          <Link className="button button--secondary" to={backLink(projectId)}>
            Back to the project
          </Link>
        </div>
      </section>
    )
  }

  if (session.status === 'error') {
    return (
      <section className="page">
        <div className="panel-message" role="alert">
          <p>This scenario could not be loaded.</p>
          <button className="button button--secondary" onClick={session.reload} type="button">
            Retry
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="page" aria-labelledby="scenario-title">
      <header className="page-header">
        <div>
          <Link className="back-link" to={backLink(projectId)}>Back to the project</Link>
          <h1 id="scenario-title">
            {session.saved.title.length > 0 ? session.saved.title : 'Untitled scenario'}
          </h1>
          <p className="page-subtitle">
            Scenario <span className="mono">#{scenarioId}</span>
          </p>
        </div>
        {/* Only the interrupted state is announced. A healthy stream is the
            expected case, and a permanent "connected" badge would be noise on
            a screen whose real subject is the conversation. */}
        {!session.connected && session.closure === null && (
          <span className="badge scenario-reconnecting">Reconnecting…</span>
        )}
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
        />
      </div>
    </section>
  )
}
