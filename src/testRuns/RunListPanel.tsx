import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { formatDate } from '../projects/formatters'
import { ProjectApiError } from '../projects/projectApi'
import type { ExtrasStatus } from '../projects/workspace/workspaceContext'
import {
  createTestRun,
  deleteTestRun,
  getRunDeletionPreview,
  type RunDeletionPreview,
  type TestRun,
} from './testRunApi'

/**
 * The project's TestRuns — the entry point into the run map. A run bundles
 * scenarios (which bundle cases), so the project screen lists runs, not
 * scenarios: opening one navigates to its map, where its scenarios and their
 * cases are laid out and edited.
 *
 * The list is handed in rather than read here: the workspace loads it once for
 * the dashboard and this section together, so returning to this section does
 * not re-fetch what is already on screen.
 */
export function RunListPanel({
  onChanged,
  onReload,
  projectId,
  runs,
  status,
}: {
  /** Re-read the list after this panel creates or deletes a run. */
  onChanged: () => Promise<void>
  onReload: () => void
  projectId: string
  runs: TestRun[]
  status: ExtrasStatus
}) {
  const { t } = useI18n()
  const r = t.scenarios.runList
  const navigate = useNavigate()
  // 대시보드의 "이 케이스로 시나리오 만들기"가 실어 보낸 요청문. 런을 여는 길에 함께 넘겨
  // 입력창까지 도달시킨다 — 여기서 잃으면 버튼이 목적지 없는 링크가 된다.
  const [searchParams] = useSearchParams()
  const draft = searchParams.get('draft')
  const [creating, setCreating] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<TestRun | null>(null)
  const [deleting, setDeleting] = useState(false)
  // 이 런을 지우면 무엇이 같이 없어지는지(ARTEL-487). 열 때 읽어 온다 — 목록의 런마다 미리
  // 세면 화면 하나에 질의가 런 수만큼 붙는데, 정작 읽는 것은 지우려는 한 건뿐이다.
  const [impact, setImpact] = useState<RunDeletionPreview | null>(null)
  // 함께 지울지. 기본은 지우는 쪽이다 — 남겨 두면 어느 런에도 없는 시나리오가 케이스 커버리지를
  // 계속 채워, 사용자는 지웠는데 숫자가 그대로인 것을 본다. 되돌리기는 체크 해제 한 번이다.
  const [dropScenarios, setDropScenarios] = useState(true)

  useEffect(() => {
    if (pendingDelete === null) return
    const controller = new AbortController()
    setImpact(null)
    setDropScenarios(true)
    getRunDeletionPreview(projectId, pendingDelete.id, controller.signal)
      .then(setImpact)
      .catch(() => {
        // 못 세어도 삭제 자체는 할 수 있다. 그때는 체크박스 없이 런만 지운다.
      })
    return () => controller.abort()
  }, [pendingDelete, projectId])

  async function confirmDelete() {
    if (pendingDelete === null || deleting) return
    setDeleting(true)
    try {
      const removable = impact?.removableScenarioCount ?? 0
      await deleteTestRun(projectId, pendingDelete.id, dropScenarios && removable > 0)
      setPendingDelete(null)
      await onChanged()
    } catch (error: unknown) {
      setFailure(error instanceof ProjectApiError ? error.message : r.deleteFailed)
      setPendingDelete(null)
    } finally {
      setDeleting(false)
    }
  }

  // Opening a run always lands in the run's edit entry, which decides between the
  // empty-run shell and the newest scenario's studio (see RunEditPage).
  function openRun(runId: string) {
    const base = `/projects/${encodeURIComponent(projectId)}/test-runs/${encodeURIComponent(runId)}/edit`
    navigate(draft === null ? base : `${base}?draft=${encodeURIComponent(draft)}`)
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

      {status === 'loading' && <p className="panel-empty">{r.loading}</p>}
      {status === 'failed' && (
        <div className="inline-error" role="alert">
          <span aria-hidden="true">!</span>{r.loadFailed}
          <button className="button button--secondary button--compact" onClick={onReload} type="button">{r.retry}</button>
        </div>
      )}
      {status === 'ready' && (
        runs.length === 0 ? (
          <p className="panel-empty">{r.empty}</p>
        ) : (
          <ul className="scenario-list">
            {runs.map((run) => (
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
            {impact !== null && impact.removableScenarioCount > 0 && (
              <label className="run-del-option">
                <input
                  checked={dropScenarios}
                  disabled={deleting}
                  onChange={(event) => setDropScenarios(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  {r.deleteScenarios(impact.removableScenarioCount)}
                  <em className="run-del-note">{r.deleteScenariosWhy}</em>
                </span>
              </label>
            )}
            {impact !== null && impact.keptForQaHistoryCount > 0 && (
              <p className="run-del-note">{r.deleteKeptForHistory(impact.keptForQaHistoryCount)}</p>
            )}
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
