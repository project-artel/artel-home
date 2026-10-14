import { useEffect, useId, useMemo, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { useI18n } from '../i18n/useI18n'
import { buildFolderTree, flattenFolderTree } from './testCaseFolders'
import { listFolderItems, type TestCaseFolder } from './testCaseFolderApi'
import type { TestCase } from './testCaseTypes'
import {
  arrangeVersions,
  listVersionCases,
  UNVERSIONED,
  versionName,
  type TestCaseVersionSummary,
  type VersionGroup,
} from './testCaseVersions'

/** 가져올 곳: 다른 버전, "버전 없음", 또는 폴더. */
type Source = { kind: 'version'; id: string } | { kind: 'folder'; id: string }

type Loaded = { key: string; cases: TestCase[] } | { key: string; failed: true }

/**
 * 다른 라이브러리(다른 버전 · 버전 없음 · 폴더)의 사용자 생성 TC 를 이 버전에 가져온다(ARTEL-1032).
 *
 * 왼쪽에서 출처를 고르면 오른쪽에 그 출처의 사용자 생성 TC 중 **이 버전에 아직 없는 것**만 보인다. 처음에는 전부 골라져
 * 있다. 자동 생성 TC 는 버전마다 콘텐츠 맵을 따르므로 보이지 않는다.
 */
export function ImportManualCasesDialog({
  folders,
  groups,
  onClose,
  onConfirm,
  projectId,
  target,
  versions,
}: {
  folders: readonly TestCaseFolder[]
  groups: readonly VersionGroup[]
  onClose: () => void
  onConfirm: (caseIds: string[]) => Promise<void>
  projectId: string
  target: TestCaseVersionSummary
  versions: readonly TestCaseVersionSummary[]
}) {
  const { t } = useI18n()
  const m = t.testCases.importManual
  const titleId = useId()
  const others = useMemo(
    () => versions.filter((version) => version.gameBuildId !== target.gameBuildId),
    [versions, target.gameBuildId],
  )
  const entries = useMemo(() => arrangeVersions(others, groups), [others, groups])
  const folderRows = useMemo(() => flattenFolderTree(buildFolderTree(folders)), [folders])
  const [source, setSource] = useState<Source | null>(null)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [targetIds, setTargetIds] = useState<ReadonlySet<string> | null>(null)
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const sourceKey = source === null ? null : `${source.kind}:${source.id}`

  // 이 버전에 이미 든 케이스. 가져올 목록에서 뺀다.
  useEffect(() => {
    const controller = new AbortController()
    listVersionCases(projectId, target.gameBuildId, null, controller.signal)
      .then((rows) => setTargetIds(new Set(rows.map((row) => row.testCase.id))))
      .catch(() => setTargetIds(new Set()))
    return () => controller.abort()
  }, [projectId, target.gameBuildId])

  useEffect(() => {
    if (source === null || sourceKey === null) return undefined
    const controller = new AbortController()
    const read =
      source.kind === 'version'
        ? listVersionCases(projectId, source.id, null, controller.signal).then((rows) =>
            rows.filter((row) => row.origin === 'MANUAL').map((row) => row.testCase),
          )
        : listFolderItems(projectId, source.id, target.gameBuildId, controller.signal).then((list) =>
            list.items.filter((item) => item.origin === 'MANUAL').map((item) => item.testCase),
          )
    read
      .then((cases) => {
        setLoaded({ key: sourceKey, cases })
        setPicked(new Set(cases.map((one) => one.id)))
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setLoaded({ key: sourceKey, failed: true })
      })
    return () => controller.abort()
  }, [projectId, source, sourceKey, target.gameBuildId])

  const current = loaded !== null && loaded.key === sourceKey ? loaded : null
  const candidates = useMemo(
    () => (current === null || 'failed' in current || targetIds === null ? [] : current.cases.filter((one) => !targetIds.has(one.id))),
    [current, targetIds],
  )
  const chosen = candidates.filter((one) => picked.has(one.id))

  const sourceButton = (key: Source, label: string, extra?: string) => {
    const on = source !== null && source.kind === key.kind && source.id === key.id
    return (
      <button
        aria-pressed={on}
        className={'mimp-source' + (on ? ' is-current' : '')}
        key={`${key.kind}:${key.id}`}
        onClick={() => setSource(key)}
        type="button"
      >
        <span className="vtree-name">{label}</span>
        {extra !== undefined && <span className="vtree-count">{extra}</span>}
      </button>
    )
  }

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title(versionName(target))}>
      <div className="mimp">
        <p className="field-hint">{m.hint}</p>
        <div className="mimp-body">
          <nav aria-label={m.sources} className="mimp-sources">
            <p className="mimp-heading">{m.versions}</p>
            {entries.map((entry) =>
              entry.kind === 'version' ? (
                sourceButton({ kind: 'version', id: entry.version.gameBuildId }, versionName(entry.version))
              ) : (
                <div className="mimp-group" key={`group:${entry.group.id}`}>
                  <p className="mimp-group-name">{entry.group.name}</p>
                  {entry.versions.map((version) =>
                    sourceButton({ kind: 'version', id: version.gameBuildId }, versionName(version)),
                  )}
                </div>
              ),
            )}
            {sourceButton({ kind: 'version', id: UNVERSIONED }, t.testCases.versions.unversioned)}
            {folderRows.length > 0 && <p className="mimp-heading">{m.folders}</p>}
            {folderRows.map((row) => (
              <div key={row.folder.id} style={{ paddingLeft: row.depth * 12 }}>
                {sourceButton({ kind: 'folder', id: row.folder.id }, row.folder.name)}
              </div>
            ))}
          </nav>
          <section aria-label={m.cases} className="mimp-cases">
            {source === null ? (
              <p className="panel-empty">{m.pickSource}</p>
            ) : current === null || targetIds === null ? (
              <p className="panel-empty" aria-busy="true">{m.loading}</p>
            ) : 'failed' in current ? (
              <p className="panel-empty" role="alert">{m.loadFailed}</p>
            ) : candidates.length === 0 ? (
              <p className="panel-empty">{m.empty}</p>
            ) : (
              <>
                <label className="mimp-all">
                  <input
                    checked={chosen.length === candidates.length}
                    onChange={() =>
                      setPicked(chosen.length === candidates.length ? new Set() : new Set(candidates.map((one) => one.id)))
                    }
                    type="checkbox"
                  />
                  {m.selectAll(candidates.length)}
                </label>
                <ul className="mimp-list">
                  {candidates.map((one) => (
                    <li key={one.id}>
                      <label className="mimp-case">
                        <input
                          checked={picked.has(one.id)}
                          onChange={() =>
                            setPicked((currentPicked) => {
                              const next = new Set(currentPicked)
                              if (next.has(one.id)) next.delete(one.id)
                              else next.add(one.id)
                              return next
                            })
                          }
                          type="checkbox"
                        />
                        <span className="mimp-case-step">{one.step.length > 0 ? one.step : t.testCases.row.untitled}</span>
                        <span className="mimp-case-scene">{one.scene}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </div>
        {failure !== null && (
          <div className="inline-error" role="alert">
            <span aria-hidden="true">!</span>
            {failure}
          </div>
        )}
        <div className="dialog-actions">
          <button className="button button--secondary" disabled={pending} onClick={onClose} type="button">
            {m.cancel}
          </button>
          <button
            className="button button--primary"
            disabled={pending || chosen.length === 0}
            onClick={() => {
              setPending(true)
              setFailure(null)
              onConfirm(chosen.map((one) => one.id)).catch(() => {
                setFailure(m.failed)
                setPending(false)
              })
            }}
            type="button"
          >
            {pending ? m.pending : m.confirm(chosen.length)}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
