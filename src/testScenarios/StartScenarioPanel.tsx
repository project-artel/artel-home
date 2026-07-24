import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { ProjectApiError } from '../projects/projectApi'
import { createTestScenario, SCENARIO_ID_MISSING } from './scenarioApi'

/**
 * The way into a scenario conversation.
 *
 * There is no list of past scenarios here because the server has no endpoint
 * that returns one. A scenario is reached by its URL, which is why starting one
 * navigates to its own route instead of opening the conversation in place.
 */
export function StartScenarioPanel({ projectId }: { projectId: string }) {
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const navigate = useNavigate()
  const { t } = useI18n()

  async function start() {
    // The project API serialises the id as a string; the scenario API declares
    // it as a number. Converting here keeps a malformed id from being sent as
    // `NaN`, which the server would reject with a message about the body.
    const numericProjectId = Number(projectId)
    if (!Number.isInteger(numericProjectId)) {
      setFailure(t.scenarios.start.invalidProjectId)
      return
    }

    setStarting(true)
    setFailure(null)

    try {
      const testScenarioId = await createTestScenario(numericProjectId)
      navigate(`/projects/${encodeURIComponent(projectId)}/test-scenarios/${testScenarioId}`)
    } catch (error: unknown) {
      // Server-provided messages are shown as written; the client-detected
      // contract break maps to localized copy through its code.
      setFailure(
        error instanceof ProjectApiError
          ? error.code === SCENARIO_ID_MISSING
            ? t.scenarios.start.badServerResponse
            : error.message
          : t.scenarios.start.startFailed,
      )
      setStarting(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="test-scenarios-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="test-scenarios-title">{t.scenarios.start.title}</h2>
          <p className="scenario-hint">{t.scenarios.start.hint}</p>
        </div>
        <button
          className="button button--primary button--compact"
          disabled={starting}
          onClick={start}
          type="button"
        >
          {starting ? t.scenarios.start.starting : t.scenarios.start.startButton}
        </button>
      </header>

      {failure !== null && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>
          {failure}
        </div>
      )}

      <p className="panel-empty">
        {/* Said plainly rather than hidden: a user who closes the tab has no way
            back to the conversation, and finding that out afterwards is worse
            than being told now. */}
        {t.scenarios.start.bookmarkNote}
      </p>
    </section>
  )
}
