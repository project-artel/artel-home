import { useEffect, useId, useMemo, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../i18n/useI18n'
import { EditorBadge } from '../projects/EditorBadge'
import { Picker } from './Picker'
import { SceneChip } from './SceneChip'
import { SearchField } from './SearchField'
import type { VerificationStatus } from './testCaseTypes'
import {
  arrangeVersions,
  carryVerdictsFrom,
  hiddenVersions,
  previewVerdictCarry,
  versionName,
  type TestCaseVersionSummary,
  type VerdictCarryPreviewRow,
  type VerdictCarryResult,
  type VersionGroup,
} from './testCaseVersions'

type Mode = 'SAME_CONTENT' | 'SELECTED' | 'NONE'
/** 고른 버전([sourceId])의 미리 보기. 다른 버전의 것이 남아 있으면 그 버전을 아직 읽는 중이다. */
type Loaded = { sourceId: string; rows: VerdictCarryPreviewRow[] | null }
type Preview = { status: 'loading' } | { status: 'failed' } | { status: 'ready'; rows: VerdictCarryPreviewRow[] }

/** 판정(통과 · 실패)이 난 수. */
const judged = (version: TestCaseVersionSummary) => version.counts.VERIFIED + version.counts.FAILED

/** 처음 고를 버전: 받는 버전이 아니고 TC 가 있는 가장 최근 버전. */
function firstSource(versions: readonly TestCaseVersionSummary[], targetId: string): string | null {
  return (
    [...versions]
      .filter((version) => version.gameBuildId !== targetId && !version.hidden && version.total > 0)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0]?.gameBuildId ?? null
  )
}

/**
 * 다른 버전의 판정 결과를 [target] 버전에 가져오는 창(ARTEL-1181).
 *
 * 버전은 수백 개까지 늘어나므로 고르기 상자 대신 가로로 긴 창을 쓴다. 왼쪽은 라이브러리 버전 트리와 같은 묶음 ·
 * 숨긴 버전 구조에 찾기 칸을 얹은 트리와 판정 방식 고르기, 오른쪽은 테스트 시나리오 탭처럼 고른 버전의 TC 표다.
 * 표의 판정 칸 · 씬 칩은 라이브러리 것을 그대로 쓴다.
 */
export function VerdictImportDialog({
  groups,
  onClose,
  onDone,
  projectId,
  target,
  versions,
}: {
  groups: readonly VersionGroup[]
  onClose: () => void
  onDone: (result: VerdictCarryResult, source: TestCaseVersionSummary | null, mode: Mode) => void
  projectId: string
  target: TestCaseVersionSummary
  versions: readonly TestCaseVersionSummary[]
}) {
  const { t } = useI18n()
  const m = t.testCases.importVerdicts
  const outcome = t.testCases.outcome
  const titleId = useId()
  const [sourceId, setSourceId] = useState<string | null>(() => firstSource(versions, target.gameBuildId))
  const [mode, setMode] = useState<Mode>('SAME_CONTENT')
  const [versionQuery, setVersionQuery] = useState('')
  const [rowQuery, setRowQuery] = useState('')
  const [view, setView] = useState<'carryable' | 'all'>('carryable')
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [showHidden, setShowHidden] = useState(false)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [treeEl, setTreeEl] = useState<HTMLDivElement | null>(null)
  const [tableEl, setTableEl] = useState<HTMLDivElement | null>(null)

  const source = versions.find((version) => version.gameBuildId === sourceId) ?? null

  useEffect(() => {
    if (sourceId === null) return
    const controller = new AbortController()
    previewVerdictCarry(projectId, target.gameBuildId, sourceId, controller.signal)
      .then((rows) => setLoaded({ sourceId, rows }))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setLoaded({ sourceId, rows: null })
      })
    return () => controller.abort()
  }, [projectId, sourceId, target.gameBuildId])

  const preview: Preview =
    loaded === null || loaded.sourceId !== sourceId
      ? { status: 'loading' }
      : loaded.rows === null ? { status: 'failed' } : { status: 'ready', rows: loaded.rows }

  const needle = versionQuery.trim().toLowerCase()
  const matches = (version: TestCaseVersionSummary) =>
    needle.length === 0 || versionName(version).toLowerCase().includes(needle) || version.version.toLowerCase().includes(needle)
  const entries = useMemo(() => arrangeVersions(versions, groups), [versions, groups])
  const hidden = useMemo(() => hiddenVersions(versions), [versions])

  const rows = preview.status === 'ready' ? preview.rows : []
  const carryable = rows.filter((row) => row.carryable)
  const rowNeedle = rowQuery.trim().toLowerCase()
  const shownRows = rows
    .filter((row) => view === 'all' || row.carryable)
    .filter((row) => rowNeedle.length === 0 || `${row.step} ${row.expectedValue} ${row.scene}`.toLowerCase().includes(rowNeedle))
  const pickedRows = carryable.filter((row) => picked.has(row.testCaseId))
  const targetJudged = judged(target)
  const count = mode === 'SELECTED' ? pickedRows.length : mode === 'SAME_CONTENT' ? carryable.length : targetJudged
  const ready = mode === 'NONE' ? targetJudged > 0 : source !== null && count > 0

  async function confirm() {
    if (!ready || pending) return
    setPending(true)
    setFailure(null)
    try {
      const result =
        mode === 'NONE'
          ? await carryVerdictsFrom(projectId, target.gameBuildId, null, { resetAll: true })
          : await carryVerdictsFrom(projectId, target.gameBuildId, sourceId, {
              testCaseIds: mode === 'SELECTED' ? pickedRows.map((row) => row.testCaseId) : undefined,
            })
      onDone(result, source, mode)
    } catch {
      setFailure(m.failed)
      setPending(false)
    }
  }

  const node = (version: TestCaseVersionSummary) => {
    if (!matches(version)) return null
    const isTarget = version.gameBuildId === target.gameBuildId
    const on = version.gameBuildId === sourceId
    return (
      <li key={version.gameBuildId}>
        <button
          aria-current={on ? 'true' : undefined}
          className={'vimp-node' + (on ? ' is-on' : '')}
          disabled={isTarget || pending}
          onClick={() => {
            setSourceId(version.gameBuildId)
            setPicked(new Set())
          }}
          type="button"
        >
          <FolderIcon />
          <span className="vimp-node-text">
            <span className="vimp-node-name">{versionName(version)}</span>
            <span className="vimp-node-sub">
              {isTarget ? m.targetNote : m.nodeSummary(version.total, version.counts.VERIFIED, version.counts.FAILED)}
            </span>
          </span>
          {version.isEditor && <EditorBadge />}
        </button>
      </li>
    )
  }

  const pill = (status: VerificationStatus) => (
    <span className={`vpill ${status}`}>
      <span className={`vdot ${status}`} />
      {outcome[status]}
    </span>
  )

  return (
    <Dialog hint={m.hint} labelledBy={titleId} onClose={onClose} title={m.title(versionName(target))}>
      <div className="vimp cp-scope">
        <aside aria-label={m.versionsHeading} className="vimp-left">
          <div className="vimp-left-head">
            <FolderIcon />
            <span>{m.versionsHeading}</span>
            <span className="vimp-count">{versions.length}</span>
          </div>
          <div className="vimp-search">
            <SearchField clearLabel={m.clear} label={m.versionSearch} onChange={setVersionQuery} placeholder={m.versionSearch} value={versionQuery} />
          </div>
          <div className="vimp-tree-wrap">
            <div className="vimp-tree" ref={setTreeEl}>
              <ul className="vimp-list">
                {entries.map((entry) => {
                  if (entry.kind === 'version') return node(entry.version)
                  const members = entry.versions.filter(matches)
                  if (needle.length > 0 && members.length === 0) return null
                  const isFolded = folded.has(entry.group.id) && needle.length === 0
                  return (
                    <li key={`group:${entry.group.id}`}>
                      <button
                        aria-expanded={!isFolded}
                        className="vimp-group"
                        onClick={() =>
                          setFolded((current) => {
                            const next = new Set(current)
                            if (next.has(entry.group.id)) next.delete(entry.group.id)
                            else next.add(entry.group.id)
                            return next
                          })
                        }
                        type="button"
                      >
                        <Chevron open={!isFolded} />
                        <span>{entry.group.name}</span>
                        <span className="vimp-count">{entry.versions.length}</span>
                      </button>
                      {!isFolded && <ul className="vimp-list vimp-list--nested">{members.map(node)}</ul>}
                    </li>
                  )
                })}
              </ul>
              {hidden.length > 0 && (
                <>
                  <button aria-expanded={showHidden} className="vimp-group" onClick={() => setShowHidden((value) => !value)} type="button">
                    <Chevron open={showHidden} />
                    <span>{t.testCases.versions.hiddenVersions(hidden.length)}</span>
                  </button>
                  {showHidden && <ul className="vimp-list vimp-list--nested">{hidden.map(node)}</ul>}
                </>
              )}
            </div>
            <EdgeScrollbar label={m.versionsHeading} scroller={treeEl} side="right" />
          </div>
          <div className="vimp-mode">
            <Picker
              label={m.modeLabel}
              onChange={(value) => setMode(value as Mode)}
              options={(['SAME_CONTENT', 'SELECTED', 'NONE'] as const).map((value) => ({ value, label: m.modes[value] }))}
              value={mode}
            />
            <p className="vimp-mode-hint">{m.modeHints[mode]}</p>
          </div>
        </aside>

        <section aria-label={m.crumb} className="vimp-right">
          {source === null ? (
            <p className="panel-empty">{m.noSource}</p>
          ) : (
            <>
              <header className="vimp-head">
                <span className="vimp-crumb">{m.crumb}</span>
                <h3 className="vimp-title">
                  {versionName(source)}
                  {source.isEditor && <EditorBadge />}
                </h3>
                <div className="vimp-stats">
                  <span className="vimp-stat">{m.stats.total} <b>{source.total}</b></span>
                  <span className="vimp-stat">{m.stats.passed} <b>{source.counts.VERIFIED}</b></span>
                  <span className="vimp-stat">{m.stats.failed} <b>{source.counts.FAILED}</b></span>
                  {preview.status === 'ready' && <span className="vimp-stat">{m.stats.carryable} <b>{carryable.length}</b></span>}
                </div>
              </header>
              <div className="vimp-tools">
                <SearchField clearLabel={m.clear} label={m.rowSearch} onChange={setRowQuery} placeholder={m.rowSearch} value={rowQuery} />
                <div className="vimp-seg" role="group">
                  {(['carryable', 'all'] as const).map((value) => (
                    <button aria-pressed={view === value} className={view === value ? 'is-on' : ''} key={value} onClick={() => setView(value)} type="button">
                      {m.views[value]}
                    </button>
                  ))}
                </div>
              </div>
              <div className={'vimp-table-wrap' + (mode === 'NONE' ? ' is-muted' : '')}>
                <div className="vimp-table" ref={setTableEl}>
                  {preview.status === 'loading' && <p className="panel-empty" aria-busy="true">{m.loading}</p>}
                  {preview.status === 'failed' && <p className="panel-empty" role="alert">{m.loadFailed}</p>}
                  {preview.status === 'ready' && rows.length === 0 && <p className="panel-empty">{m.empty}</p>}
                  {preview.status === 'ready' && rows.length > 0 && (
                    <table className="tcl-table vimp-tbl">
                      <colgroup>
                        <col className="tct-c-check" />
                        <col />
                        <col className="vimp-c-scene" />
                        <col className="vimp-c-verdict" />
                        <col className="vimp-c-verdict" />
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="tct-check-head">
                            {mode === 'SELECTED' && (
                              <label className="tct-check">
                                <input
                                  aria-label={m.selectAll}
                                  checked={carryable.length > 0 && pickedRows.length === carryable.length}
                                  onChange={(event) =>
                                    setPicked(event.target.checked ? new Set(carryable.map((row) => row.testCaseId)) : new Set())
                                  }
                                  type="checkbox"
                                />
                              </label>
                            )}
                          </th>
                          <th>{m.columns.step}</th>
                          <th>{m.columns.scene}</th>
                          <th>{m.columns.source(versionName(source))}</th>
                          <th>{m.columns.target}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {shownRows.map((row) => (
                          <tr className={'tct-row' + (row.carryable ? '' : ' is-blocked')} key={row.testCaseId}>
                            <td className="tct-check-cell">
                              {mode === 'SELECTED' && (
                                <label className="tct-check">
                                  <input
                                    aria-label={m.selectRow(row.step)}
                                    checked={picked.has(row.testCaseId)}
                                    disabled={!row.carryable}
                                    onChange={() =>
                                      setPicked((current) => {
                                        const next = new Set(current)
                                        if (next.has(row.testCaseId)) next.delete(row.testCaseId)
                                        else next.add(row.testCaseId)
                                        return next
                                      })
                                    }
                                    type="checkbox"
                                  />
                                </label>
                              )}
                            </td>
                            <td className="vimp-step"><CodeText text={row.step} /></td>
                            <td><SceneChip scene={row.scene} /></td>
                            <td>{pill(row.sourceStatus)}</td>
                            <td>
                              {row.carryable || row.reason === null
                                ? row.targetStatus === null ? null : pill(row.targetStatus)
                                : <span className="vimp-reason">{m.rowReasons[row.reason]}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <EdgeScrollbar label={m.crumb} scroller={tableEl} side="right" />
              </div>
            </>
          )}
          <footer className="vimp-foot">
            <span className="vimp-summary">
              {mode === 'SELECTED'
                ? m.summary.SELECTED(
                    pickedRows.length,
                    pickedRows.filter((row) => row.sourceStatus === 'VERIFIED').length,
                    pickedRows.filter((row) => row.sourceStatus === 'FAILED').length,
                    versionName(target),
                  )
                : mode === 'SAME_CONTENT'
                  ? m.summary.SAME_CONTENT(count, versionName(target))
                  : m.summary.NONE(count, versionName(target))}
              {failure !== null && <span className="vimp-failure" role="alert"> {failure}</span>}
            </span>
            <button className="button button--secondary" onClick={onClose} type="button">{t.testCases.generate.cancel}</button>
            <button className="button button--primary" disabled={!ready || pending} onClick={() => void confirm()} type="button">
              {mode === 'NONE' ? m.confirmReset : m.confirm}
            </button>
          </footer>
        </section>
      </div>
    </Dialog>
  )
}

/** 스텝 문장 속 백틱은 코드 이름이다. 라이브러리처럼 코드 칩으로 그린다. */
function CodeText({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, index) =>
        part.length === 0 ? null : index % 2 === 1 ? <code className="vimp-code" key={index} translate="no">{part}</code> : <span key={index}>{part}</span>,
      )}
    </>
  )
}

function FolderIcon() {
  return (
    <svg aria-hidden="true" className="vimp-folder" fill="none" height="18" stroke="currentColor" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width="18">
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  )
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="12">
      <path d={open ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
    </svg>
  )
}
