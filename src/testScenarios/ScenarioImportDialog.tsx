import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import { ClipboardListIcon, PlaylistAddIcon } from './scenarioIcons'
import {
  currentVersionKey,
  findRun,
  getScenarioLibrary,
  importScenarios,
  initialActiveRun,
  initialExpanded,
  runKey,
  runSelection,
  scenarioOrigins,
  toggleRun,
  toggleScenario,
  versionKey,
  versionLabel,
  type LibraryVersion,
  type ScenarioImportResult,
} from './scenarioLibrary'

type LoadState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; versions: LibraryVersion[] }

/**
 * 다른 런의 시나리오를 이 런으로 복사해 오는 모달(ARTEL-995).
 *
 * 왼쪽은 게임 버전 → 런 트리, 오른쪽은 고른 런의 시나리오 목록, 위는 지금까지 고른 것이다. 여러 런에서
 * 섞어 고를 수 있고, 고른 순서가 곧 이 런 끝에 붙는 순서다. 두 목록은 따로 스크롤되고, 그 위의 머리
 * (게임 버전 · 런 제목 · 전체 고르기 · 검색)는 고정이다.
 *
 * 확인하면 서버가 복사본을 만들어 붙이고 결과를 [onImported] 로 넘긴다. 복사본은 이 런 버전의 TC 를
 * 가리키게 바뀌어 오고, 짝이 없던 TC 는 `unmatchedCaseIds` 로 온다 — 그 알림은 부른 쪽이 띄운다.
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
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [treeNode, setTreeNode] = useState<HTMLUListElement | null>(null)
  const [listNode, setListNode] = useState<HTMLUListElement | null>(null)
  const submitting = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    getScenarioLibrary(projectId, controller.signal)
      .then((versions) => {
        setState({ kind: 'ready', versions })
        setExpanded(initialExpanded(versions))
        setActiveKey(initialActiveRun(versions, runId))
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setState({ kind: 'failed' })
      })
    return () => controller.abort()
  }, [projectId, runId, reload])

  const versions = useMemo(() => (state.kind === 'ready' ? state.versions : []), [state])
  const origins = useMemo(() => scenarioOrigins(versions, m.noVersion, m.looseScenarios), [versions, m])
  const thisVersion = useMemo(() => currentVersionKey(versions, runId), [versions, runId])
  const active = findRun(versions, activeKey)
  const activeIds = active?.run.testScenarios.map((scenario) => scenario.testScenarioId) ?? []
  const allPicked = runSelection(activeIds, picked) === 'all'
  const needle = query.trim()
  const shown = (active?.run.testScenarios ?? []).filter((scenario) => needle === '' || scenario.title.includes(needle))

  function toggleOpen(key: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openRun(key: string) {
    setActiveKey(key)
    setQuery('')
  }

  // 런을 바꾸면 목록을 맨 위부터 보인다. 앞 런에서 내려간 자리가 남으면 새 목록의 중간부터 보인다.
  useEffect(() => {
    listNode?.scrollTo({ top: 0 })
  }, [activeKey, listNode])

  async function confirm() {
    if (submitting.current || picked.length === 0) return
    submitting.current = true
    setPending(true)
    setError(null)
    try {
      onImported(await importScenarios(projectId, runId, picked))
    } catch {
      setError(m.failed)
      setPending(false)
      submitting.current = false
    }
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title}>
      <div className="sil">
        <p className="sil-copy">{m.copy}</p>

        <section aria-label={m.pickedLabel} className="sil-tray">
          <span className="sil-tray-count">
            {m.pickedLabel}
            <strong>{picked.length}</strong>
          </span>
          {picked.length === 0 ? (
            <span className="sil-tray-empty">{m.trayEmpty}</span>
          ) : (
            <ul className="sil-tray-list">
              {picked.map((id) => (
                <li className="sil-tile" key={id}>
                  <ClipboardListIcon className="sil-tile-icon" />
                  <span className="sil-tile-text">
                    <span className="sil-tile-title">{origins.get(id)?.title || m.untitledScenario}</span>
                    <span className="sil-tile-from">{origins.get(id)?.from}</span>
                  </span>
                  <button
                    aria-label={m.unpick}
                    className="sil-tile-remove"
                    onClick={() => setPicked((prev) => toggleScenario(id, prev))}
                    type="button"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="sil-body">
          <nav aria-label={m.treeLabel} className="sil-side">
            <div className="sil-side-head">
              <span>{m.versionsHeading}</span>
              <span className="sil-muted">{m.newestFirst}</span>
            </div>
            <div className="sil-scroll">
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
                <ul aria-label={m.treeLabel} className="sil-tree" ref={setTreeNode} role="tree">
                  {versions.map((version) => {
                    const vKey = versionKey(version)
                    const open = expanded.has(vKey)
                    return (
                      <li aria-expanded={open} key={vKey} role="treeitem">
                        <button className="sil-version" onClick={() => toggleOpen(vKey)} type="button">
                          <FolderIcon open={open} />
                          <span className="sil-version-text">
                            <span className="sil-version-name">{versionLabel(version, m.noVersion)}</span>
                            <span className="sil-muted">{m.runCount(version.testRuns.length)}</span>
                          </span>
                          {vKey === thisVersion && <span className="sil-badge">{m.thisVersion}</span>}
                        </button>
                        {open && (
                          <ul className="sil-runs" role="group">
                            {version.testRuns.map((run) => {
                              const rKey = runKey(version, run)
                              const isActive = rKey === activeKey
                              const ids = run.testScenarios.map((scenario) => scenario.testScenarioId)
                              const count = ids.filter((id) => picked.includes(id)).length
                              const name = run.testRunId === null ? m.looseScenarios : (run.name ?? m.untitledRun)
                              return (
                                <li aria-selected={isActive} key={rKey} role="treeitem">
                                  <button className={`sil-run${isActive ? ' is-active' : ''}`} onClick={() => openRun(rKey)} type="button">
                                    <FolderIcon open={false} small />
                                    <span className="sil-run-name" title={name}>{name}</span>
                                    {count > 0 && <span className="sil-run-picked">{count}</span>}
                                    <span className="sil-muted">{ids.length}</span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
              <ScrollEdges scroller={treeNode} />
              <EdgeScrollbar label={m.treeLabel} scroller={treeNode} side="right" />
            </div>
          </nav>

          <main className="sil-main">
            <div className="sil-main-head">
              <div className="sil-main-title">
                <span className="sil-muted">{active === null ? '' : m.runOf(versionLabel(active.version, m.noVersion))}</span>
                <h3>{active === null ? m.pickRunHint : (active.run.name ?? m.looseScenarios)}</h3>
              </div>
              {active !== null && activeIds.length > 0 && (
                <button
                  aria-pressed={allPicked}
                  className={`sil-all${allPicked ? ' is-on' : ''}`}
                  onClick={() => setPicked((prev) => toggleRun(activeIds, prev))}
                  type="button"
                >
                  {allPicked ? <CheckIcon /> : <PlaylistAddIcon />}
                  {allPicked ? m.allPicked : m.pickAll}
                </button>
              )}
            </div>
            <label className="sil-search">
              <SearchIcon />
              <span className="visually-hidden">{m.search}</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder={m.searchPlaceholder}
                type="search"
                value={query}
              />
            </label>
            <div aria-hidden="true" className="sil-cols">
              <span />
              <span>{m.colScenario}</span>
              <span>{m.colSteps}</span>
              <span>{m.colCases}</span>
              <span>{m.colUpdated}</span>
            </div>
            <div className="sil-scroll">
              <ul aria-label={m.listLabel} className="sil-list" ref={setListNode}>
                {shown.map((scenario) => {
                  const checked = picked.includes(scenario.testScenarioId)
                  return (
                    <li key={scenario.testScenarioId}>
                      <label className={`sil-row${checked ? ' is-picked' : ''}`}>
                        <span className="sil-row-check">
                          <input
                            checked={checked}
                            onChange={() => setPicked((prev) => toggleScenario(scenario.testScenarioId, prev))}
                            type="checkbox"
                          />
                        </span>
                        <span className="sil-row-title">
                          <ClipboardListIcon className="sil-row-icon" />
                          <span title={scenario.title}>{scenario.title.length > 0 ? scenario.title : m.untitledScenario}</span>
                        </span>
                        <span className="sil-num">{scenario.stepCount}</span>
                        <span className="sil-num">{scenario.caseCount}</span>
                        <span className="sil-date">{formatDay(scenario.updatedAt)}</span>
                      </label>
                    </li>
                  )
                })}
                {active !== null && shown.length === 0 && needle !== '' && (
                  <li className="sil-empty">{m.noMatch(needle)}</li>
                )}
              </ul>
              <ScrollEdges scroller={listNode} />
              <EdgeScrollbar label={m.listLabel} scroller={listNode} side="right" />
            </div>
          </main>
        </div>

        {error !== null && <div className="inline-error" role="alert">{error}</div>}
        <div className="dialog-actions sil-actions">
          <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">{m.cancel}</button>
          <button className="button button--primary" disabled={pending || picked.length === 0} onClick={() => void confirm()} type="button">
            {pending ? m.importing : m.confirm(picked.length)}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

/**
 * 스텝 편집기와 같은 끝 표시: 위·아래로 더 있으면 페이드와 ▴/▾ 를 띄우고, 끝에 닿으면 감춘다.
 * 스크롤하는 목록이 아니라 그 부모(`.sil-scroll`)에 겹쳐 그려야 페이드가 내용과 함께 흘러가지 않는다.
 */
function ScrollEdges({ scroller }: { scroller: HTMLElement | null }) {
  const [edge, setEdge] = useState({ top: true, bottom: true })
  useEffect(() => {
    if (scroller === null) return undefined
    const read = () => setEdge({
      top: scroller.scrollTop <= 2,
      bottom: scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2,
    })
    const first = setTimeout(read, 0)
    const resize = new ResizeObserver(read)
    resize.observe(scroller)
    const mutation = new MutationObserver(read)
    mutation.observe(scroller, { childList: true, subtree: true })
    scroller.addEventListener('scroll', read, { passive: true })
    return () => {
      clearTimeout(first)
      resize.disconnect()
      mutation.disconnect()
      scroller.removeEventListener('scroll', read)
    }
  }, [scroller])
  return (
    <>
      <div aria-hidden="true" className={`sil-fade sil-fade--top${edge.top ? ' is-hidden' : ''}`}><span>▴</span></div>
      <div aria-hidden="true" className={`sil-fade sil-fade--bottom${edge.bottom ? ' is-hidden' : ''}`}><span>▾</span></div>
    </>
  )
}

function formatDay(value: string | null): string {
  return value !== null && value.length >= 10 ? value.slice(5, 10) : ''
}

function FolderIcon({ open, small = false }: { open: boolean; small?: boolean }) {
  const size = small ? 18 : 22
  return (
    <svg aria-hidden="true" className="sil-folder" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" viewBox="0 0 24 24" width={size}>
      <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6l2 2.2h8.4A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
      {!small && (open ? <path d="M9 13.5h6" /> : <path d="M9 13.5h6M12 10.5v6" />)}
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" viewBox="0 0 24 24" width="18">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4-4" />
    </svg>
  )
}
