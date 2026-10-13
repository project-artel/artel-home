import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import {
  getScenarioLibrary,
  importOrder,
  importScenarios,
  initialExpanded,
  runKey,
  runSelection,
  toggleRun,
  toggleScenario,
  versionKey,
  versionLabel,
  type LibraryRun,
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
 * 버전은 접히는 카드, 런은 그 안의 섹션, 시나리오는 섹션 아래 체크 목록이다. 폴더 트리를 줄로 늘어놓던
 * 첫 판은 단계가 눈에 들어오지 않았다 — 카드와 섹션이 단계를 대신 말한다.
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

  function renderRun(version: LibraryVersion, run: LibraryRun) {
    const key = runKey(version, run)
    const open = expanded.has(key)
    const ids = run.testScenarios.map((scenario) => scenario.testScenarioId)
    const picked = runSelection(ids, selected)
    const name = run.testRunId === null ? m.looseScenarios : (run.name ?? m.untitledRun)
    return (
      <li aria-expanded={open} aria-level={2} className={`sil-run${picked !== 'none' ? ' is-picked' : ''}`} key={key} role="treeitem">
        <div className="sil-run-head">
          <label className="sil-check">
            <input
              aria-label={m.pickRun(name)}
              checked={picked === 'all'}
              disabled={ids.length === 0}
              onChange={() => setSelected((prev) => toggleRun(ids, prev))}
              ref={(input) => { if (input) input.indeterminate = picked === 'some' }}
              type="checkbox"
            />
          </label>
          <button aria-label={open ? m.collapse(name) : m.expand(name)} className="sil-run-toggle" onClick={() => toggleOpen(key)} type="button">
            <span className="sil-run-name" title={name}>{name}</span>
            <span className="sil-meta">{m.scenarioCount(ids.length)}</span>
            <Chevron open={open} />
          </button>
        </div>
        {open && (
          <ul className="sil-scenarios" role="group">
            {run.testScenarios.map((scenario) => {
              const checked = selected.has(scenario.testScenarioId)
              return (
                <li aria-level={3} aria-selected={checked} className={`sil-scenario${checked ? ' is-picked' : ''}`} key={scenario.testScenarioId} role="treeitem">
                  <label className="sil-scenario-label">
                    <input
                      checked={checked}
                      onChange={() => setSelected((prev) => toggleScenario(scenario.testScenarioId, prev))}
                      type="checkbox"
                    />
                    <span className="sil-scenario-title" title={scenario.title}>
                      {scenario.title.length > 0 ? scenario.title : m.untitledScenario}
                    </span>
                    <span className="sil-meta">{m.stepCount(scenario.stepCount)}</span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </li>
    )
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title}>
      <div className="sil">
        <p className="dialog-copy">{m.copy}</p>
        {state.kind === 'loading' && <p className="sil-empty">{m.loading}</p>}
        {state.kind === 'failed' && (
          <div className="panel-message" role="alert">
            <p>{m.loadFailed}</p>
            <button
              className="button button--secondary button--compact"
              onClick={() => {
                setState({ kind: 'loading' })
                setReload((n) => n + 1)
              }}
              type="button"
            >
              {m.retry}
            </button>
          </div>
        )}
        {state.kind === 'ready' && versions.length === 0 && <p className="sil-empty">{m.empty}</p>}
        {state.kind === 'ready' && versions.length > 0 && (
          <ul aria-label={m.treeLabel} aria-multiselectable="true" className="sil-versions" role="tree">
            {versions.map((version) => {
              const key = versionKey(version)
              const open = expanded.has(key)
              return (
                <li aria-expanded={open} aria-level={1} className={`sil-card${open ? ' is-open' : ''}`} key={key} role="treeitem">
                  <button className="sil-card-head" onClick={() => toggleOpen(key)} type="button">
                    <span className="sil-card-kicker">{version.gameBuild === null ? m.noVersionKicker : m.versionKicker}</span>
                    <span className="sil-card-title">{versionLabel(version, m.noVersion)}</span>
                    <span className="sil-chip">{m.runCount(version.testRuns.length)}</span>
                    <Chevron open={open} />
                  </button>
                  {open && (
                    <ul className="sil-runs" role="group">
                      {version.testRuns.map((run) => renderRun(version, run))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        {error !== null && <div className="inline-error" role="alert">{error}</div>}
        <div className="sil-footer">
          <span className="sil-selected" aria-live="polite">{order.length > 0 ? m.selected(order.length) : m.nothingSelected}</span>
          <div className="dialog-actions">
            <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">{m.cancel}</button>
            <button className="button button--primary" disabled={pending || order.length === 0} onClick={() => void confirm()} type="button">
              {pending ? m.importing : m.confirm(order.length)}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" className={`sil-chevron${open ? ' is-open' : ''}`} height="18" viewBox="0 0 24 24" width="18">
      <path d="M7 10l5 5 5-5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}
