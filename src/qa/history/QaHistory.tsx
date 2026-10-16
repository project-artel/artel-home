import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { EdgeScrollbar } from '../../design-system/primitives/EdgeScrollbar'
import { useI18n } from '../../i18n/useI18n'
import { sectionHref } from '../../projects/workspace/sections'
import { useWorkspace } from '../../projects/workspace/workspaceContext'
import { ContextMenu } from '../../testCases/ContextMenu'
import { arrangeVersions, hiddenVersions, setVersionHidden, versionName, type TestCaseVersionSummary } from '../../testCases/testCaseVersions'
import { useTestCaseVersionList } from '../../testCases/useTestCaseVersions'
import { bucketOf, childFolders, NO_VERSION, strayBuilds } from '../../testRuns/runLibrary'
import { listRunFolders, type RunFolder } from '../../testRuns/testRunFolders'
import { offeredQaModels } from '../qaModelGroups'
import type { QaRunSummary } from '../launch/qaLaunchApi'
import { countByFilter, runOrdinals, testRunsUnder, type HistoryFilter } from './historyModel'
import { BoardSketch } from './HistorySketch'
import { RunCard } from './RunCard'
import { RunInspector } from './RunInspector'
import { useHistoryRuns } from './useHistoryRuns'

type Place = { bucket: string; folderId: string | null }

const FILTERS: HistoryFilter[] = ['ALL', 'FAILED', 'COMPLETED', 'CANCELLED']

/**
 * QA 히스토리(ARTEL-1100). 왼쪽은 게임 버전 → 폴더 트리, 가운데는 고른 자리의 테스트 런 카드,
 * 오른쪽은 고른 실행 하나.
 *
 * 시나리오와 실행은 계속 쌓인다. 그래서 프로젝트 전체를 한 줄로 늘어놓지 않고 버전으로 먼저 나누고,
 * 실행은 테스트 런마다 따로 읽는다. 트리는 테스트 런 화면과 같은 구조이고, 버전 숨기기도 케이스
 * 라이브러리 · 테스트 런 화면과 같은 설정이다 — 한 곳에서 숨기면 세 곳에서 숨는다.
 */
export function QaHistory() {
  const { t } = useI18n()
  const b = t.qa.history.board
  const { projectId, runs, tries, models } = useWorkspace()
  const versionList = useTestCaseVersionList(projectId)
  const [folders, setFolders] = useState<RunFolder[]>([])
  const [chosen, setChosen] = useState<Place | null>(null)
  const [filter, setFilter] = useState<HistoryFilter>('ALL')
  const [selected, setSelected] = useState<QaRunSummary | null>(null)
  const [showHidden, setShowHidden] = useState(false)
  const [versionMenu, setVersionMenu] = useState<{ version: TestCaseVersionSummary; x: number; y: number } | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [mainScroller, setMainScroller] = useState<HTMLDivElement | null>(null)
  const offered = useMemo(() => offeredQaModels(models), [models])

  useEffect(() => {
    const controller = new AbortController()
    listRunFolders(projectId, controller.signal).then(setFolders).catch(() => undefined)
    return () => controller.abort()
  }, [projectId])

  const ranRuns = useMemo(() => runs.filter((run) => run.lastQaRun !== null), [runs])
  const versions = versionList.versions
  const entries = useMemo(() => arrangeVersions(versions, versionList.groups), [versions, versionList.groups])
  const hidden = useMemo(() => hiddenVersions(versions), [versions])
  const strays = useMemo(() => strayBuilds(runs, versions), [runs, versions])

  // 처음 자리는 가장 최근에 돌린 테스트 런의 버전. 숨긴 버전이면 그 다음.
  const hiddenIds = useMemo(() => new Set(hidden.map((version) => version.gameBuildId)), [hidden])
  const place: Place = useMemo(() => {
    if (chosen !== null) return chosen
    const latest = [...ranRuns]
      .filter((run) => !hiddenIds.has(bucketOf(run)))
      .sort((a, b2) => (b2.lastQaRun?.startedAt ?? '').localeCompare(a.lastQaRun?.startedAt ?? ''))[0]
    return { bucket: latest === undefined ? NO_VERSION : bucketOf(latest), folderId: null }
  }, [chosen, ranRuns, hiddenIds])

  const cardRuns = useMemo(
    () =>
      testRunsUnder(ranRuns, folders, place.bucket, place.folderId).sort((a, b2) =>
        (b2.lastQaRun?.startedAt ?? '').localeCompare(a.lastQaRun?.startedAt ?? ''),
      ),
    [ranRuns, folders, place],
  )
  const historyOf = useHistoryRuns(projectId, cardRuns.map((run) => run.id), reloadToken)
  const loadedRuns = cardRuns.flatMap((run) => {
    const history = historyOf(run.id)
    return history.status === 'ready' ? history.runs : []
  })
  const counts = countByFilter(loadedRuns)
  const visibleSelected = selected !== null && loadedRuns.some((run) => run.id === selected.id) ? selected : null
  const selectedTestRun = visibleSelected === null ? undefined : runs.find((run) => run.id === visibleSelected.testRunId)
  const selectedHistory = selectedTestRun === undefined ? null : historyOf(selectedTestRun.id)
  const selectedOrdinal =
    visibleSelected !== null && selectedHistory?.status === 'ready'
      ? runOrdinals(selectedHistory.runs, selectedHistory.complete).get(visibleSelected.id) ?? null
      : null

  // 지금 고를 수 있는 모델이면 그 이름을, 아니면(옛 실행의 모델) 제공사 접두사를 뗀 id 를 쓴다.
  const modelLabel = (modelId: string) =>
    offered.find((model) => model.id === modelId)?.label ?? modelId.slice(modelId.lastIndexOf('/') + 1)
  const ranUnder = (bucket: string, folderId: string | null) => testRunsUnder(ranRuns, folders, bucket, folderId).length
  const placeName = place.bucket === NO_VERSION ? b.noVersion : nameOfBucket(place.bucket, versions, strays)

  function choose(next: Place) {
    setChosen(next)
    setSelected(null)
  }

  async function toggleHidden(version: TestCaseVersionSummary) {
    setFailure(null)
    try {
      await setVersionHidden(projectId, version.gameBuildId, !version.hidden)
      versionList.refresh()
      if (!version.hidden) setShowHidden(true)
    } catch {
      setFailure(b.hideFailed)
    }
  }

  const versionRow = (bucket: string, label: ReactNode, options: { latest?: boolean; version?: TestCaseVersionSummary } = {}) => (
    <li key={bucket}>
      <button
        aria-current={place.bucket === bucket && place.folderId === null ? 'true' : undefined}
        className={`qh-node${options.version?.hidden === true ? ' is-hidden' : ''}`}
        onClick={() => choose({ bucket, folderId: null })}
        onContextMenu={(event) => {
          if (options.version === undefined) return
          event.preventDefault()
          setVersionMenu({ version: options.version, x: event.clientX, y: event.clientY })
        }}
        type="button"
      >
        <span className="qh-node-name mono">{label}</span>
        {options.latest === true && <span className="qh-badge">{b.latest}</span>}
        <span className="qh-node-count mono">{ranUnder(bucket, null)}</span>
      </button>
      {folderRows(bucket, null, 1)}
    </li>
  )

  function folderRows(bucket: string, parentId: string | null, depth: number): ReactNode {
    const children = childFolders(folders, bucket, parentId)
    if (children.length === 0) return null
    return (
      <ul className="qh-tree">
        {children.map((folder) => (
          <li key={folder.id}>
            <button
              aria-current={place.folderId === folder.id ? 'true' : undefined}
              className="qh-node qh-node--folder"
              onClick={() => choose({ bucket, folderId: folder.id })}
              style={{ paddingLeft: 10 + depth * 14 }}
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="13" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="13">
                <path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2" />
              </svg>
              <span className="qh-node-name">{folder.name}</span>
              <span className="qh-node-count mono">{ranUnder(bucket, folder.id)}</span>
            </button>
            {folderRows(bucket, folder.id, depth + 1)}
          </li>
        ))}
      </ul>
    )
  }

  if (ranRuns.length === 0) return <HistoryEmpty projectId={projectId} />

  return (
    <div className="qh">
      <nav aria-label={b.versionsTitle} className="qh-rail">
        <div className="qh-rail-head">
          <span>{b.versionsTitle}</span>
          <span className="qh-muted">{b.newestFirst}</span>
        </div>
        <div className="qh-rail-body">
          <ul className="qh-tree">
            {strays.map((build) => versionRow(build.gameBuildId, build.label ?? build.version))}
            {entries.map((entry) =>
              entry.kind === 'version' ? (
                versionRow(entry.version.gameBuildId, versionName(entry.version), { latest: entry.version.latest, version: entry.version })
              ) : (
                <li key={`group:${entry.group.id}`}>
                  <span className="qh-group">{entry.group.name}</span>
                  <ul className="qh-tree">
                    {entry.versions.map((version) =>
                      versionRow(version.gameBuildId, versionName(version), { latest: version.latest, version }),
                    )}
                  </ul>
                </li>
              ),
            )}
            {versionRow(NO_VERSION, b.noVersion)}
          </ul>
          {hidden.length > 0 && (
            <>
              <button aria-expanded={showHidden} className="qh-hidden-toggle" onClick={() => setShowHidden((value) => !value)} type="button">
                <svg aria-hidden="true" fill="none" height="12" stroke="currentColor" strokeWidth="2" style={{ transform: showHidden ? 'rotate(90deg)' : undefined }} viewBox="0 0 24 24" width="12">
                  <path d="M9 6l6 6l-6 6" />
                </svg>
                {b.hiddenVersions(hidden.length)}
              </button>
              {showHidden && (
                <ul className="qh-tree">
                  {hidden.map((version) => versionRow(version.gameBuildId, versionName(version), { version }))}
                </ul>
              )}
            </>
          )}
        </div>
        <p className="qh-rail-note">{b.railNote}</p>
      </nav>

      <div className="qh-main-frame">
        <div className="qh-main" ref={setMainScroller}>
          <div className="qh-main-head">
            <h2 className="qh-place">{placeName}</h2>
            <span className="qh-muted">{b.summary(cardRuns.length, counts.ALL)}</span>
            <span className="qh-spacer" />
            <div aria-label={t.qa.history.filterLabel} className="qh-filters" role="group">
              {FILTERS.map((option) => (
                <button
                  aria-pressed={filter === option}
                  className={`qh-filter${filter === option ? ' is-on' : ''}`}
                  key={option}
                  onClick={() => setFilter(option)}
                  type="button"
                >
                  {option !== 'ALL' && <i aria-hidden="true" className={`qh-filter-dot qh-filter-dot--${option}`} />}
                  {option === 'ALL'
                    ? b.filterAll(counts.ALL)
                    : option === 'FAILED'
                      ? b.filterFailed(counts.FAILED)
                      : option === 'COMPLETED'
                        ? b.filterCompleted(counts.COMPLETED)
                        : b.filterCancelled(counts.CANCELLED)}
                </button>
              ))}
            </div>
          </div>
          {failure !== null && <div className="inline-error" role="alert"><span aria-hidden="true">!</span>{failure}</div>}

          {cardRuns.length === 0 ? (
            <div className="qh-empty-inline">
              <BoardSketch />
              <b>{b.emptyVersionTitle}</b>
              <span>{b.emptyVersionBody}</span>
            </div>
          ) : (
            <>
              {cardRuns.map((testRun) => (
                <RunCard
                  filter={filter}
                  history={historyOf(testRun.id)}
                  key={testRun.id}
                  modelLabel={modelLabel}
                  onRetry={() => setReloadToken((token) => token + 1)}
                  onSelect={setSelected}
                  selectedRunId={visibleSelected?.id ?? null}
                  testRun={testRun}
                />
              ))}
              {filter !== 'ALL' && counts[filter] === 0 && <p className="qh-muted">{b.noFilterMatch}</p>}
            </>
          )}
        </div>
        <EdgeScrollbar label={placeName} scroller={mainScroller} side="right" />
      </div>

      <RunInspector
        ordinalLabel={selectedOrdinal === null ? null : b.ordinal(selectedOrdinal)}
        projectId={projectId}
        run={visibleSelected}
        testRunName={selectedTestRun?.name ?? ''}
        tries={visibleSelected === null ? [] : tries.filter((qaTry) => qaTry.qaRunId === visibleSelected.id)}
      />

      {versionMenu !== null && (
        <ContextMenu
          items={[{ label: versionMenu.version.hidden ? b.show : b.hide, onSelect: () => void toggleHidden(versionMenu.version) }]}
          label={b.versionsTitle}
          onClose={() => setVersionMenu(null)}
          x={versionMenu.x}
          y={versionMenu.y}
        />
      )}
    </div>
  )
}

function nameOfBucket(bucket: string, versions: readonly TestCaseVersionSummary[], strays: ReturnType<typeof strayBuilds>): string {
  const version = versions.find((one) => one.gameBuildId === bucket)
  if (version !== undefined) return versionName(version)
  const stray = strays.find((one) => one.gameBuildId === bucket)
  return stray?.label ?? stray?.version ?? bucket
}

/** 한 번도 돌린 적이 없을 때. 무엇이 여기 쌓이는지를 그림으로 먼저 보인다. */
function HistoryEmpty({ projectId }: { projectId: string }) {
  const { t } = useI18n()
  const b = t.qa.history.board
  return (
    <div className="qh-empty">
      <BoardSketch />
      <h2>{b.emptyTitle}</h2>
      <p>{b.emptyBody}</p>
      <Link className="button button--primary" to={sectionHref(projectId, 'qa')}>{b.emptyAction}</Link>
    </div>
  )
}

