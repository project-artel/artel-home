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

type Loaded = { cases: TestCase[] } | { failed: true }

/**
 * 다른 라이브러리(다른 버전 · 버전 없음 · 폴더)의 사용자 생성 TC 를 이 버전에 가져온다(ARTEL-1032).
 *
 * 왼쪽에서 출처를 고르면 오른쪽에 그 출처의 사용자 생성 TC 중 **이 버전에 아직 없는 것**만 보인다. 자동 생성 TC 는 버전마다
 * 콘텐츠 맵을 따르므로 보이지 않는다.
 *
 * 고른 TC 는 출처를 옮겨도 남는다(ARTEL-1041). 그래서 여러 버전 · 폴더에서 골라 한 번에 가져온다. 출처마다 고른 수를 왼쪽에
 * 보이고, 처음 연 출처라도 저절로 고르지 않는다 — 출처를 둘러볼 때마다 고른 것이 늘어나면 무엇을 고른 건지 알 수 없다.
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
  // 출처마다 읽은 목록. 다시 고르면 다시 읽지 않고, 왼쪽의 "고른 수" 도 여기서 센다.
  const [loadedBySource, setLoadedBySource] = useState<ReadonlyMap<string, Loaded>>(new Map())
  const [targetIds, setTargetIds] = useState<ReadonlySet<string> | null>(null)
  const [picked, setPicked] = useState<ReadonlyMap<string, TestCase>>(new Map())
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
    if (source === null || sourceKey === null || loadedBySource.has(sourceKey)) return undefined
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
      .then((cases) => setLoadedBySource((current) => new Map(current).set(sourceKey, { cases })))
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return
        setLoadedBySource((current) => new Map(current).set(sourceKey, { failed: true }))
      })
    return () => controller.abort()
  }, [projectId, source, sourceKey, target.gameBuildId, loadedBySource])

  const current = sourceKey === null ? null : (loadedBySource.get(sourceKey) ?? null)
  const candidates = useMemo(() => visibleCases(current, targetIds), [current, targetIds])
  const chosenHere = candidates.filter((one) => picked.has(one.id))
  // 이 버전에 이미 있는 것은 고를 수 없다. 목록을 읽기 전에 고른 것이 그사이 들어갔을 일은 없지만 한 번 더 거른다.
  const chosen = [...picked.values()].filter((one) => targetIds === null || !targetIds.has(one.id))

  const pickedIn = (key: Source) =>
    visibleCases(loadedBySource.get(`${key.kind}:${key.id}`), targetIds).filter((one) => picked.has(one.id)).length

  const toggle = (cases: readonly TestCase[], on: boolean) =>
    setPicked((currentPicked) => {
      const next = new Map(currentPicked)
      for (const one of cases) {
        if (on) next.set(one.id, one)
        else next.delete(one.id)
      }
      return next
    })

  const sourceButton = (key: Source, label: string) => {
    const on = source !== null && source.kind === key.kind && source.id === key.id
    const count = pickedIn(key)
    const extra = count > 0 ? m.pickedIn(count) : undefined
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
    <Dialog hint={m.hint} labelledBy={titleId} onClose={onClose} title={m.title(versionName(target))}>
      <div className="mimp">
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
                    checked={chosenHere.length === candidates.length}
                    onChange={() => toggle(candidates, chosenHere.length !== candidates.length)}
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
                          onChange={() => toggle([one], !picked.has(one.id))}
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
        {/* 출처를 옮겨도 남는 선택. 무엇을 몇 건 골랐는지 늘 보인다. */}
        <div className="mimp-picked" aria-live="polite">
          <span>{chosen.length === 0 ? m.pickedNone : m.pickedTotal(chosen.length)}</span>
          {chosen.length > 0 && (
            <button className="button button--secondary button--compact" disabled={pending} onClick={() => setPicked(new Map())} type="button">
              {m.clearPicked}
            </button>
          )}
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

/** 출처 목록에서 이 버전에 아직 없는 것. 읽지 못했거나 아직 읽는 중이면 빈 목록이다. */
function visibleCases(loaded: Loaded | null | undefined, targetIds: ReadonlySet<string> | null): TestCase[] {
  if (loaded === null || loaded === undefined || 'failed' in loaded || targetIds === null) return []
  return loaded.cases.filter((one) => !targetIds.has(one.id))
}
