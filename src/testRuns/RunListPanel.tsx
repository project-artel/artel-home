import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import { ProjectApiError } from '../projects/projectApi'
import { createTestRun, deleteTestRun, listTestRuns, type TestRun } from './testRunApi'

type ListState =
  | { kind: 'loading' }
  | { kind: 'ready'; runs: TestRun[] }
  | { kind: 'failed'; message: string }

/**
 * The project's TestRuns — the entry point into the run map. A run bundles
 * scenarios (which bundle cases), so the project screen lists runs, not
 * scenarios: opening one navigates to its map, where its scenarios and their
 * cases are laid out and edited.
 */
export function RunListPanel({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const r = t.scenarios.runList
  const navigate = useNavigate()
  const [state, setState] = useState<ListState>({ kind: 'loading' })
  const [reload, setReload] = useState(0)
  const [creating, setCreating] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TestRun | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function confirmDelete() {
    if (pendingDelete === null || deleting) return
    setDeleting(true)
    try {
      await deleteTestRun(projectId, pendingDelete.id)
      setPendingDelete(null)
      setReload((n) => n + 1)
    } catch (error: unknown) {
      setFailure(error instanceof ProjectApiError ? error.message : r.deleteFailed)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    listTestRuns(projectId, controller.signal)
      .then((runs) => setState({ kind: 'ready', runs }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          kind: 'failed',
          message: error instanceof ProjectApiError ? error.message : r.loadFailed,
        })
      })
    return () => controller.abort()
  }, [projectId, reload, r])

  // Opening a run always lands in the run's edit entry, which decides between the
  // empty-run shell and the newest scenario's studio (see RunEditPage).
  function openRun(runId: string) {
    navigate(`/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/edit`)
  }

  async function create() {
    if (creating) return
    setCreating(true)
    setFailure(null)
    try {
      const run = await createTestRun(projectId, { name: r.newName })
      openRun(run.id)
    } catch (error: unknown) {
      setFailure(error instanceof ProjectApiError ? error.message : r.createFailed)
      setCreating(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="test-runs-title">
      <header className="panel-header panel-header--split">
        <div>
          <h2 id="test-runs-title">{r.title}</h2>
          <p className="scenario-hint">{r.hint}</p>
        </div>
        <button className="button button--primary button--compact" disabled={creating} onClick={create} type="button">
          {creating ? r.creating : r.newButton}
        </button>
      </header>

      {failure !== null && (
        <div className="inline-error" role="alert"><span aria-hidden="true">!</span>{failure}</div>
      )}

      {state.kind === 'loading' && <p className="panel-empty">{r.loading}</p>}
      {state.kind === 'failed' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>{state.message}
          <button className="button button--secondary button--compact" onClick={() => { setState({ kind: 'loading' }); setReload((n) => n + 1) }} type="button">{r.retry}</button>
        </div>
      )}
      {state.kind === 'ready' && (
        state.runs.length === 0 ? (
          <p className="panel-empty">{r.empty}</p>
        ) : (
          <ul className="scenario-list">
            {state.runs.map((run) => (
              <li className="scenario-row run-row" key={run.id}>
                <div className="scenario-row-main run-row-main">
                  <button className="scenario-name scenario-name--button" onClick={() => openRun(run.id)} type="button">
                    {run.name.length > 0 ? run.name : r.untitled}
                  </button>
                  {run.description !== null && run.description.length > 0 && (
                    <p className="scenario-row-desc">{run.description}</p>
                  )}
                </div>
                <p className="scenario-row-meta">{r.created(formatDate(run.createdAt))}</p>
                <button className="run-del-icon" onClick={() => setPendingDelete(run)} aria-label={r.delete} title={r.delete} type="button">✕</button>
              </li>
            ))}
          </ul>
        )
      )}

      {pendingDelete !== null && (
        <div className="run-del-overlay" onClick={() => !deleting && setPendingDelete(null)}>
          <div aria-modal="true" className="run-del-modal" onClick={(event) => event.stopPropagation()} role="dialog">
            <h3>{r.deleteTitle}</h3>
            <p className="run-del-name">{pendingDelete.name.length > 0 ? pendingDelete.name : r.untitled}</p>
            <p className="run-del-copy">{r.deleteCopy}</p>
            <div className="run-del-actions">
              <button className="button button--secondary" disabled={deleting} onClick={() => setPendingDelete(null)} type="button">{r.cancel}</button>
              <button className="button button--danger" disabled={deleting} onClick={confirmDelete} type="button">{deleting ? r.deleting : r.delete}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
