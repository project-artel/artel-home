import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import {
  getScenarioLibrary,
  importOrder,
  importScenarios,
  initialExpanded,
  libraryRows,
  runSelection,
  toggleRun,
  toggleScenario,
  versionLabel,
  type LibraryVersion,
  type ScenarioImportResult,
} from './scenarioLibrary'

type LoadState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; versions: LibraryVersion[] }

/**
 * 다른 TR 의 TS 를 이 TR 로 복사해 오는 모달(ARTEL-995). 📁 버전 → 📁 TR → 📄 TS 파일 트리다.
 *
 * TS 를 하나씩 고르거나 TR 줄의 체크로 그 TR 을 통째로 고른다. 확인하면 서버가 복사본을 만들어 이 TR 끝에
 * 붙이고, 그 결과를 [onImported] 로 넘긴다. 복사본은 이 TR 버전의 TC 를 가리키게 바뀌어 오고, 짝이 없던
 * TC 는 `unmatchedCaseIds` 로 온다 — 그 알림은 부른 쪽이 띄운다(모달은 닫힌 뒤다).
 *
 * 트리 모양은 TC 라이브러리의 폴더 tree(`FolderPane`)와 같은 줄 스타일을 쓴다.
 */
export function ScenarioImportDialog({
  projectId,
  runId,
  onClose,
  onImported,
}: {
  projectId: string
  runId: string
  onClose: () => void
  onImported: (result: ScenarioImportResult) => void
}) {
  const { t } = useI18n()
  const m = t.scenarios.importDialog
  const titleId = useId()
  const [state, setState] = useState<LoadState>({ kind: 'loading' })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const submitting = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    getScenarioLibrary(projectId, controller.signal)
      .then((versions) => {
        setState({ kind: 'ready', versions })
        setExpanded(initialExpanded(versions))
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setState({ kind: 'failed' })
      })
    return () => controller.abort()
  }, [projectId, reload])

  const versions = useMemo(() => (state.kind === 'ready' ? state.versions : []), [state])
  const rows = useMemo(() => libraryRows(versions, expanded), [versions, expanded])
  const order = useMemo(() => importOrder(versions, selected), [versions, selected])

  function toggleOpen(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  async function confirm() {
    if (submitting.current || order.length === 0) return
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      onImported(await importScenarios(projectId, runId, order))
    } catch {
      setError(m.failed)
      setPending(false)
      submitting.current = false
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title}>
      <p className="dialog-copy">{m.copy}</p>
      <div className="scn-import-tree">
        {state.kind === 'loading' && <p className="empty-note">{m.loading}</p>}
        {state.kind === 'failed' && (
          <div className="panel-message" role="alert">
            <p>{m.loadFailed}</p>
            <button className="button button--secondary button--compact" onClick={() => {
                setState({ kind: 'loading' })
                setReload((n) => n + 1)
              }} type="button">
              {m.retry}
            </button>
          </div>
        )}
        {state.kind === 'ready' && versions.length === 0 && <p className="empty-note">{m.empty}</p>}
        {state.kind === 'ready' && versions.length > 0 && (
          <ul aria-label={m.treeLabel} aria-multiselectable="true" className="tcl-folder-list" role="tree">
            {rows.map((row) => {
              if (row.kind === 'version') {
                return (
                  <li aria-expanded={row.expanded} aria-level={1} key={row.key} role="treeitem">
                    <button className="tcl-folder" onClick={() => toggleOpen(row.key)} type="button">
                      <span aria-hidden="true" className="scn-import-caret">{row.expanded ? '▾' : '▸'}</span>
                      <span aria-hidden="true">📁</span>
                      <span className="tcl-folder-name">{versionLabel(row.version, m.noVersion)}</span>
                      <span className="tcl-folder-count">{m.runCount(row.runCount)}</span>
                    </button>
                  </li>
                )
              }
              if (row.kind === 'run') {
                const picked = runSelection(row.scenarioIds, selected)
                const name = row.run.testRunId === null ? m.looseScenarios : (row.run.name ?? m.untitledRun)
                return (
                  <li aria-expanded={row.expanded} aria-level={2} className="scn-import-row scn-import-row--run" key={row.key} role="treeitem">
                    <button aria-label={row.expanded ? m.collapse(name) : m.expand(name)} className="scn-import-caret-btn" onClick={() => toggleOpen(row.key)} type="button">
                      <span aria-hidden="true">{row.expanded ? '▾' : '▸'}</span>
                    </button>
                    <label className="tcl-folder">
                      <input
                        checked={picked === 'all'}
                        disabled={row.scenarioIds.length === 0}
                        onChange={() => setSelected((prev) => toggleRun(row.scenarioIds, prev))}
                        ref={(input) => { if (input) input.indeterminate = picked === 'some' }}
                        type="checkbox"
                      />
                      <span aria-hidden="true">📁</span>
                      <span className="tcl-folder-name" title={name}>{name}</span>
                      <span className="tcl-folder-count">{row.scenarioIds.length}</span>
                    </label>
                  </li>
                )
              }
              return (
                <li aria-level={3} aria-selected={selected.has(row.scenario.testScenarioId)} className="scn-import-row scn-import-row--scenario" key={row.key} role="treeitem">
                  <label className="tcl-folder">
                    <input
                      checked={selected.has(row.scenario.testScenarioId)}
                      onChange={() => setSelected((prev) => toggleScenario(row.scenario.testScenarioId, prev))}
                      type="checkbox"
                    />
                    <span aria-hidden="true">📄</span>
                    <span className="tcl-folder-name" title={row.scenario.title}>
                      {row.scenario.title.length > 0 ? row.scenario.title : m.untitledScenario}
                    </span>
                    <span className="tcl-folder-count">{m.stepCount(row.scenario.stepCount)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      {error !== null && <div className="inline-error" role="alert">{error}</div>}
      <div className="dialog-actions">
        <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">{m.cancel}</button>
        <button className="button button--primary" disabled={pending || order.length === 0} onClick={() => void confirm()} type="button">
          {pending ? m.importing : m.confirm(order.length)}
        </button>
      </div>
    </Dialog>
  )
}
