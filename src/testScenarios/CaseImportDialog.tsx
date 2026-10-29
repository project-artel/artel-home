import { useTestCaseIdentifiers, useTestCaseLabel } from '../testCases/testCaseIdentifiers'
import { TestCaseHover } from '../testCases/TestCaseHover'
import { useId, useMemo, useState } from 'react'
import { Dialog } from '../design-system/primitives/Dialog'
import { EdgeScrollbar } from '../design-system/primitives/EdgeScrollbar'
import { InlineCode } from '../contentMap/InlineCode'
import { useI18n } from '../i18n/useI18n'
import { CaseSceneFilter } from '../testCases/CaseSceneFilter'
import { FolderPane, type FolderOperations } from '../testCases/FolderPane'
import { Picker } from '../testCases/Picker'
import { SceneChip } from '../testCases/SceneChip'
import { SearchField } from '../testCases/SearchField'
import { SpecGradeChip } from '../testCases/SpecGradeChip'
import { StatusPill } from '../testCases/StatusPill'
import { countOf, NO_FILTERS, selectTestCases, STATUS_CLASS, tallyTestCases, type TestCaseFilters } from '../testCases/testCaseLibrary'
import { ALL_FOLDERS, countFromFolders, filterByFolder, type FolderSelection } from '../testCases/testCaseFolders'
import { VERIFICATION_STATUSES, type TestCase } from '../testCases/testCaseTypes'
import { useFolderItems } from '../testCases/useFolderItems'
import { useTestCaseFolders } from '../testCases/useTestCaseFolders'
import { useTestCaseVersionList, useVersionCases } from '../testCases/useTestCaseVersions'
import { VersionList, type VersionOperations } from '../testCases/VersionList'
import type { ScenarioStep } from './scenarioTypes'
import type { ProjectCases } from './useProjectCases'
import './caseImport.css'

/** 고르기만 하는 창이라 폴더 · 버전을 바꾸는 일은 하지 않는다. [FolderPane] · [VersionList] 의 readOnly 가 부르지 않는다. */
const NO_FOLDER_OPS: FolderOperations = {
  create: async () => {},
  update: async () => {},
  clone: async () => {},
  remove: async () => {},
  dropCases: async () => {},
}
const NO_VERSION_OPS: VersionOperations = {
  setHidden: async () => {},
  copyToFolder: async () => {},
  assignGroup: async () => {},
  createGroup: async () => {},
  renameGroup: async () => {},
  deleteGroup: async () => {},
}
const NO_HISTORY = { canUndo: false, canRedo: false, busy: false, undo: () => {}, redo: () => {} }

/** 붙일 순서 줄의 한 칸. 같은 TC 를 두 번 넣을 수 있어 칸마다 따로 key 를 둔다. */
type Pick = { key: number; caseId: string }

/**
 * TS 에 TC 를 붙이는 창(ARTEL-1245). TC 라이브러리 화면을 그대로 창으로 옮겼다. 왼쪽에 이 런의 버전 하나와 폴더
 * tree, 오른쪽에 검색 · 결과 · 출처 · 화면 필터와 같은 표.
 *
 * 폴더에는 여러 버전의 TC 가 섞여 있다. 폴더는 이 런의 버전으로 풀어 읽고, 그 버전에 있고 숨기지 않은 것만 보인다.
 * TS 의 스텝에는 순서가 있고 같은 TC 를 여러 번 넣을 수 있다. 누른 순서대로 아래 "붙일 순서" 줄에 쌓이고, 끌어서
 * 순서를 바꾸고, ＋ 로 한 번 더 넣는다.
 */
export function CaseImportDialog({
  defaultAt,
  gameBuildId,
  onAdd,
  onClose,
  positions,
  project,
  projectId,
  steps,
  target,
}: {
  /** 처음 고른 붙일 자리(스텝 순번, 0 이면 맨 앞). */
  defaultAt: number
  /** 이 런의 버전. 없으면 프로젝트의 TC 전체에서 고른다. */
  gameBuildId: string | null
  /** 고른 순서대로의 TC id(같은 것이 여러 번 올 수 있다)와 붙일 자리. */
  onAdd: (caseIds: string[], at: number) => void
  onClose: () => void
  /** 고를 수 있는 붙일 자리. */
  positions: readonly { at: number; label: string }[]
  /** 버전이 없는 프로젝트에서 쓰는 TC 목록. */
  project: ProjectCases
  projectId: string
  /** TS 에 이미 든 스텝. "이미 n번 들어 있음" 을 센다. */
  steps: readonly ScenarioStep[]
  /** 창 제목 옆에 적는 붙일 TS. */
  target: { position: number; title: string }
}) {
  const { t } = useI18n()
  const caseLabel = useTestCaseLabel()
  const { numbers } = useTestCaseIdentifiers()
  const m = t.scenarios.caseImport
  const lib = t.testCases
  const titleId = useId()

  // ── 버전: 이 런의 버전 하나만 ──
  const versionList = useTestCaseVersionList(projectId)
  const runVersion = versionList.versions.find((version) => version.gameBuildId === gameBuildId)
  const versioned = gameBuildId !== null && versionList.status === 'ready' && runVersion !== undefined
  const versionCases = useVersionCases(projectId, versioned ? gameBuildId : null, null)

  // ── 폴더: 이 런의 버전으로 풀어 읽는다 ──
  const folderList = useTestCaseFolders(projectId, versioned ? gameBuildId : null)
  const [folder, setFolder] = useState<FolderSelection>(ALL_FOLDERS)
  const folderItems = useFolderItems(projectId, folder.kind === 'folder' ? folder.id : null, versioned ? gameBuildId : null)

  const allCases = useMemo<TestCase[]>(
    () => (versioned ? versionCases.rows.map((row) => ({ ...row.testCase, verificationStatus: row.verificationStatus ?? row.testCase.verificationStatus })) : project.cases),
    [versioned, versionCases.rows, project.cases],
  )
  const inFolder = useMemo<TestCase[]>(() => {
    if (folder.kind !== 'folder') return filterByFolder(allCases, folder, folderList.folders)
    // 폴더 안에서는 이 버전에 있고 이 버전에 숨기지 않은 것만.
    return folderItems.items
      .filter((item) => item.inVersion && !item.hidden)
      .map((item) => ({ ...item.testCase, verificationStatus: item.verificationStatus ?? item.testCase.verificationStatus }))
  }, [folder, allCases, folderList.folders, folderItems.items])
  const folderCounts = useMemo(() => countFromFolders(allCases, folderList.folders), [allCases, folderList.folders])

  // ── 필터 ──
  const [filters, setFilters] = useState<TestCaseFilters>(NO_FILTERS)
  const shown = useMemo(() => selectTestCases(inFolder, filters, 'NEWEST', numbers), [inFolder, filters, numbers])
  const tally = useMemo(() => tallyTestCases(inFolder), [inFolder])
  const byId = useMemo(() => new Map(allCases.concat(inFolder).map((testCase) => [testCase.id, testCase])), [allCases, inFolder])
  const held = useMemo(() => {
    const counts = new Map<string, number>()
    for (const step of steps) if (step.case_id !== null && step.case_id !== undefined) counts.set(String(step.case_id), (counts.get(String(step.case_id)) ?? 0) + 1)
    return counts
  }, [steps])

  // ── 붙일 순서 ──
  const [picks, setPicks] = useState<Pick[]>([])
  const [seq, setSeq] = useState(0)
  const [at, setAt] = useState(defaultAt)
  const [dragKey, setDragKey] = useState<number | null>(null)
  const [tableEl, setTableEl] = useState<HTMLDivElement | null>(null)
  const [trayEl, setTrayEl] = useState<HTMLDivElement | null>(null)

  const orderOf = (caseId: string) => picks.flatMap((pick, index) => (pick.caseId === caseId ? [index + 1] : []))
  const addOnce = (caseIds: string[]) => {
    setPicks((current) => [...current, ...caseIds.map((caseId, offset) => ({ key: seq + offset + 1, caseId }))])
    setSeq((value) => value + caseIds.length)
  }
  const removeCase = (caseId: string) => setPicks((current) => current.filter((pick) => pick.caseId !== caseId))
  const toggle = (caseId: string) => (orderOf(caseId).length > 0 ? removeCase(caseId) : addOnce([caseId]))
  const visibleState = shown.length === 0 ? 'none' : shown.every((testCase) => orderOf(testCase.id).length > 0) ? 'all' : shown.some((testCase) => orderOf(testCase.id).length > 0) ? 'some' : 'none'
  const toggleAll = () => {
    if (visibleState === 'all') {
      const gone = new Set(shown.map((testCase) => testCase.id))
      setPicks((current) => current.filter((pick) => !gone.has(pick.caseId)))
    } else addOnce(shown.filter((testCase) => orderOf(testCase.id).length === 0).map((testCase) => testCase.id))
  }
  const dropOn = (targetKey: number) => {
    if (dragKey === null || dragKey === targetKey) return
    setPicks((current) => {
      const from = current.findIndex((pick) => pick.key === dragKey)
      const to = current.findIndex((pick) => pick.key === targetKey)
      if (from < 0 || to < 0) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
    setDragKey(null)
  }

  const loading = versioned ? !versionCases.ready : project.status === 'loading'
  const failed = versioned ? versionCases.failed : project.status === 'error'
  const showFolders = folderList.folders.length > 0 || versioned

  return (
    <Dialog labelledBy={titleId} onClose={onClose} title={m.title}>
      <div className="cid cp-scope">
        <p className="cid-target">
          <span className="cid-target-no">{String(target.position).padStart(2, '0')}</span>
          <b>{target.title}</b>
          <span>{m.targetSteps(steps.length)}</span>
        </p>
        <div className={'cid-body' + (showFolders ? '' : ' is-flat')}>
          {showFolders && (
            <FolderPane
              counts={folderCounts}
              folders={folderList.folders}
              history={NO_HISTORY}
              onRetry={folderList.reload}
              onSelect={setFolder}
              operations={NO_FOLDER_OPS}
              readOnly
              selection={folder}
              showUnfiled={!versioned}
              status={folderList.status}
              top={versioned && runVersion !== undefined ? (
                <VersionList
                  groups={[]}
                  onSelect={() => setFolder(ALL_FOLDERS)}
                  operations={NO_VERSION_OPS}
                  readOnly
                  selectedId={folder.kind === 'all' ? runVersion.gameBuildId : null}
                  showUnversioned={false}
                  unversionedTotal={0}
                  versions={[{ ...runVersion, latest: false, total: allCases.length }]}
                />
              ) : undefined}
            />
          )}
          <section className="cid-main">
            <div className="tcl-filters">
              <div className="tcl-filter tcl-filter--grow">
                <SearchField
                  clearLabel={lib.filters.clearSearch}
                  label={lib.filters.search}
                  onChange={(query) => setFilters({ ...filters, query })}
                  placeholder={lib.filters.searchPlaceholder}
                  value={filters.query}
                />
              </div>
            </div>
            <div className="tcl-status-row">
              <span className="field-label">{lib.filters.status}</span>
              <div className="tcl-chips">
                <button className={filters.status === 'ALL' ? 'fchip on' : 'fchip'} onClick={() => setFilters({ ...filters, status: 'ALL' })} type="button">
                  {lib.filters.allStatuses} {tally.total}
                </button>
                {VERIFICATION_STATUSES.map((status) => (
                  <button className={filters.status === status ? 'fchip on' : 'fchip'} key={status} onClick={() => setFilters({ ...filters, status })} type="button">
                    <span className={`vdot vdot--${STATUS_CLASS[status]}`} />
                    {lib.outcome[status]} {countOf(tally, status)}
                  </button>
                ))}
                <span aria-hidden="true" className="tcl-chips-sep" />
                <span className="field-label">{lib.origin.label}</span>
                {(['ALL', 'MAP', 'MANUAL'] as const).map((origin) => (
                  <button aria-pressed={filters.origin === origin} className={filters.origin === origin ? 'fchip on' : 'fchip'} key={origin} onClick={() => setFilters({ ...filters, origin })} type="button">
                    {origin === 'ALL' ? lib.origin.all : lib.origin[origin]}
                  </button>
                ))}
              </div>
            </div>
            <CaseSceneFilter
              cases={inFolder}
              labels={{ all: lib.filters.allScenes, noMatch: lib.filters.noMatch, scene: lib.filters.scene, search: lib.filters.sceneSearch }}
              onChange={(scene) => setFilters({ ...filters, scene })}
              value={filters.scene}
            />
            <div className="cid-tablewrap">
              <div className="cid-scroll" ref={setTableEl}>
                {failed ? (
                  <p className="inline-error" role="alert">{m.loadFailed}</p>
                ) : loading ? (
                  <p className="dialog-copy" role="status">{m.loading}</p>
                ) : shown.length === 0 ? (
                  <p className="dialog-copy">{inFolder.length === 0 ? m.empty : m.noMatch}</p>
                ) : (
                  <table className="tcl-table">
                    <colgroup>
                      <col className="tct-c-check" />
                      <col />
                      <col className="tct-c-scene" />
                      <col className="tct-c-spec" />
                      <col className="tct-c-res" />
                      <col className="tct-c-exp" />
                      <col className="cid-c-more" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="tct-check-head" scope="col">
                          <label className="tct-check">
                            <input
                              aria-label={lib.selection.selectAll}
                              checked={visibleState === 'all'}
                              onChange={toggleAll}
                              ref={(node) => {
                                if (node) node.indeterminate = visibleState === 'some'
                              }}
                              type="checkbox"
                            />
                          </label>
                        </th>
                        <th scope="col">{lib.editor.step}</th>
                        <th scope="col">{lib.editor.scene}</th>
                        <th scope="col">{lib.editor.specGrade}</th>
                        <th scope="col">{lib.filters.status}</th>
                        <th scope="col">{lib.editor.expectedValue}</th>
                        <th scope="col"><span className="visually-hidden">{m.addAgain}</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((testCase) => {
                        const order = orderOf(testCase.id)
                        const times = held.get(testCase.id) ?? 0
                        return (
                          <tr className={'tct-row' + (order.length > 0 ? ' chosen' : '')} key={testCase.id} onClick={() => toggle(testCase.id)}>
                            <td className="tct-check-cell" onClick={(event) => event.stopPropagation()}>
                              {order.length > 0 ? (
                                <button aria-label={m.unpick(order.join(', '))} className="cid-order" onClick={() => removeCase(testCase.id)} title={m.orderTitle} type="button">
                                  {order.join(',')}
                                </button>
                              ) : (
                                <label className="tct-check">
                                  <input
                                    aria-label={lib.selection.selectRow(testCase.step.length > 0 ? testCase.step : lib.row.untitled)}
                                    checked={false}
                                    onChange={() => addOnce([testCase.id])}
                                    type="checkbox"
                                  />
                                </label>
                              )}
                            </td>
                            <td className="tct-step">
                              <span className="tct-step-in">
                                <span className="tc-id">{caseLabel(testCase.id)}</span>
                                <span className={`vdot ${testCase.verificationStatus}`} />
                                {testCase.origin !== undefined && (
                                  <span className={'tct-origin tct-origin--' + testCase.origin.toLowerCase()} title={testCase.origin === 'MAP' ? lib.origin.mapTitle : lib.origin.manualTitle}>
                                    {lib.origin[testCase.origin]}
                                  </span>
                                )}
                                <TestCaseHover projectId={projectId} caseId={testCase.id} gameBuildId={gameBuildId}><span className="tct-step-text">
                                  {testCase.step.length > 0 ? <InlineCode className="tct-code" text={testCase.step} /> : lib.row.untitled}
                                  {times > 0 && <span className="tct-absent-note">{m.held(times)}</span>}
                                </span></TestCaseHover>
                              </span>
                            </td>
                            <td><SceneChip scene={testCase.scene} /></td>
                            <td><SpecGradeChip bare status={testCase.status} /></td>
                            <td><StatusPill labels={lib} status={testCase.verificationStatus} /></td>
                            <td className="tct-quiet tct-expected">
                              {testCase.expectedValue.length > 0 ? <InlineCode className="tct-code" text={testCase.expectedValue} /> : lib.row.noExpectedValue}
                            </td>
                            <td onClick={(event) => event.stopPropagation()}>
                              <button className="cid-more" onClick={() => addOnce([testCase.id])} title={m.addAgain} type="button">＋1</button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <EdgeScrollbar label={m.title} scroller={tableEl} side="right" />
            </div>
          </section>
        </div>

        <div className="cid-traywrap">
          <div aria-label={m.order} className="cid-tray" ref={setTrayEl}>
            <span className="cid-tray-label">{m.order}</span>
            {picks.length === 0 ? (
              <span className="cid-tray-hint">{m.orderHint}</span>
            ) : (
              picks.map((pick, index) => {
                const testCase = byId.get(pick.caseId)
                return (
                  <span
                    className={'cid-pick' + (dragKey === pick.key ? ' is-dragging' : '')}
                    draggable
                    key={pick.key}
                    onDragEnd={() => setDragKey(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={(event) => {
                      setDragKey(pick.key)
                      event.dataTransfer.effectAllowed = 'move'
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      dropOn(pick.key)
                    }}
                  >
                    <span className="cid-order is-static">{index + 1}</span>
                    <span className="tc-id">{caseLabel(pick.caseId)}</span>
                    <span className="cid-pick-text">
                      {testCase !== undefined && testCase.step.length > 0 ? <InlineCode className="tct-code" text={testCase.step} /> : caseLabel(pick.caseId)}
                    </span>
                    <button
                      aria-label={m.addAgain}
                      onClick={() => {
                        setPicks((current) => {
                          const next = [...current]
                          next.splice(index + 1, 0, { key: seq + 1, caseId: pick.caseId })
                          return next
                        })
                        setSeq((value) => value + 1)
                      }}
                      title={m.addAgain}
                      type="button"
                    >
                      ＋
                    </button>
                    <button aria-label={m.remove} onClick={() => setPicks((current) => current.filter((one) => one.key !== pick.key))} title={m.remove} type="button">×</button>
                  </span>
                )
              })
            )}
          </div>
          <EdgeScrollbar label={m.order} scroller={trayEl} side="bottom" />
        </div>

        <div className="dialog-actions cid-actions">
          <span className="cid-count">{picks.length > 0 ? m.count(picks.length) : m.none}</span>
          <div className="cid-where">
            <Picker label={m.where} onChange={(value) => setAt(Number(value))} options={positions.map((one) => ({ value: String(one.at), label: one.label }))} value={String(at)} />
          </div>
          <button className="button button--secondary" onClick={onClose} type="button">{m.cancel}</button>
          <button className="button button--primary" disabled={picks.length === 0} onClick={() => onAdd(picks.map((pick) => pick.caseId), at)} type="button">
            {m.confirm(picks.length)}
          </button>
        </div>
      </div>
    </Dialog>
  )
}
