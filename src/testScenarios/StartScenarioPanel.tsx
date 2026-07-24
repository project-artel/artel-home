import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { formatDate } from '../projects/formatters'
import { ProjectApiError } from '../projects/projectApi'
import { createTestScenario, listTestScenarios } from './scenarioApi'
import type { TestScenarioSummary } from './scenarioTypes'

type ScenarioListState =
  | { kind: 'loading' }
  | { kind: 'ready'; scenarios: TestScenarioSummary[] }
  /** The server has not shipped the list endpoint yet — not the same as empty. */
  | { kind: 'unsupported' }
  | { kind: 'failed'; message: string }

/**
 * The way into a scenario conversation: the list of this project's scenarios,
 * and the button that starts a new one. Each row links to the scenario's own
 * route, which is where the conversation lives.
 */
export function StartScenarioPanel({ projectId }: { projectId: string }) {
  const [starting, setStarting] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [list, setList] = useState<ScenarioListState>({ kind: 'loading' })
  const [reloadCount, setReloadCount] = useState(0)
  const navigate = useNavigate()

  // The project API serialises the id as a string; the scenario API declares
  // it as a number. Converting here keeps a malformed id from being sent as
  // `NaN`, which the server would reject with a message about the body.
  const numericProjectId = Number(projectId)

  // The state is only ever touched from the promise callbacks, matching
  // `useProjects`; the reload handler resets to loading before re-triggering.
  useEffect(() => {
    if (!Number.isInteger(numericProjectId)) return

    const controller = new AbortController()

    listTestScenarios(numericProjectId, controller.signal)
      .then((scenarios) => setList({ kind: 'ready', scenarios }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        // A 404 today means the endpoint does not exist on the server yet.
        // Showing it as an empty list would tell the user their scenarios are
        // gone; showing it as an error would tell them something broke.
        if (error instanceof ProjectApiError && error.isNotFound) {
          setList({ kind: 'unsupported' })
          return
        }
        setList({
          kind: 'failed',
          message:
            error instanceof ProjectApiError
              ? error.message
              : 'The scenario list could not be loaded.',
        })
      })

    return () => controller.abort()
  }, [numericProjectId, reloadCount])

  async function start() {
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

      <ScenarioList
        onRetry={() => {
          setList({ kind: 'loading' })
          setReloadCount((count) => count + 1)
        }}
        projectId={projectId}
        // A non-numeric address can never have scenarios; there is nothing to
        // fetch, so the list is empty by construction rather than by response.
        state={Number.isInteger(numericProjectId) ? list : { kind: 'ready', scenarios: [] }}
      />
    </section>
  )
}

function ScenarioList({
  onRetry,
  projectId,
  state,
}: {
  onRetry: () => void
  projectId: string
  state: ScenarioListState
}) {
  if (state.kind === 'loading') {
    return <p className="panel-empty">Loading scenarios…</p>
  }

  if (state.kind === 'unsupported') {
    return (
      <p className="panel-empty">
        {/* Said plainly rather than hidden: until the server lists scenarios,
            a user who closes the tab has no way back to the conversation, and
            finding that out afterwards is worse than being told now. */}
        The server does not list scenarios yet, so a scenario is reached by its own address.
        Bookmark it, or keep the tab open.
      </p>
    )
  }

  if (state.kind === 'failed') {
    return (
      <div className="inline-error" role="alert">
        <span aria-hidden="true">!</span>
        {state.message}
        <button
          className="button button--secondary button--compact"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      </div>
    )
  }

  if (state.scenarios.length === 0) {
    return (
      <p className="panel-empty">
        No scenarios yet. Write one and the agent turns it into steps you can run.
      </p>
    )
  }

  return (
    <ul className="scenario-list">
      {state.scenarios.map((scenario) => (
        <li className="scenario-row" key={scenario.testScenarioId}>
          <div className="scenario-row-main">
            {/* The title is the way into the conversation, so the identity is
                what navigates. */}
            <Link
              className="scenario-name"
              to={`/projects/${encodeURIComponent(projectId)}/test-scenarios/${scenario.testScenarioId}`}
            >
              {scenario.title.length > 0 ? scenario.title : 'Untitled scenario'}
            </Link>
          </div>
          {/* The edit date orders the list for the user; creation only matters
              for a scenario never touched since. */}
          <p className="scenario-row-meta">
            {scenario.updatedAt.length > 0
              ? `Updated ${formatDate(scenario.updatedAt)}`
              : `Created ${formatDate(scenario.createdAt)}`}
          </p>
        </li>
      ))}
    </ul>
  )
}
