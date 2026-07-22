import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProjectApiError } from '../projects/projectApi'
import { createTestScenario } from './scenarioApi'

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

  async function start() {
    // The project API serialises the id as a string; the scenario API declares
    // it as a number. Converting here keeps a malformed id from being sent as
    // `NaN`, which the server would reject with a message about the body.
    const numericProjectId = Number(projectId)
    if (!Number.isInteger(numericProjectId)) {
      setFailure('This project cannot start a scenario: its address is not a project id.')
      return
    }

    setStarting(true)
    setFailure(null)

    try {
      const testScenarioId = await createTestScenario(numericProjectId)
      navigate(`/projects/${encodeURIComponent(projectId)}/test-scenarios/${testScenarioId}`)
    } catch (error: unknown) {
      setFailure(
        error instanceof ProjectApiError
          ? error.message
          : 'The scenario could not be started. Please try again.',
      )
      setStarting(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="test-scenarios-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="test-scenarios-title">Test scenarios</h2>
          <p className="scenario-hint">
            Describe what should be tested and the agent writes the steps. You can edit them before
            sending the next message.
          </p>
        </div>
        <button
          className="button button--primary button--compact"
          disabled={starting}
          onClick={start}
          type="button"
        >
          {starting ? 'Starting…' : 'Write a scenario'}
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
        A scenario is reached by its own address. Bookmark it, or keep the tab open — this project
        does not yet list the scenarios written for it.
      </p>
    </section>
  )
}
