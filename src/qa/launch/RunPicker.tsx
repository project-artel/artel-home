import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../../i18n/useI18n'
import type { GameBuild } from '../../projects/gameTypes'
import { sectionHref } from '../../projects/workspace/sections'
import { bucketOf, childFolders, countRunsUnder, NO_VERSION, runsAt, runsIn } from '../../testRuns/runLibrary'
import type { TestRun } from '../../testRuns/testRunApi'
import type { RunFolder } from '../../testRuns/testRunFolders'
import { CheckIcon, SearchIcon } from '../qaModelIcons'

type Node = { bucket: string; folderId: string | null }

/**
 * 테스트 런을 고르는 팝오버(ARTEL-1084). 테스트 런 화면과 **같은 구조**다 — 게임 버전(최신순) 아래
 * 폴더(중첩), 그 노드의 런 목록. 위의 검색은 버전 · 폴더를 가리지 않고 찾는다.
 *
 * 테스트 런 화면의 숨김 버전 · 버전 묶음은 여기서 다루지 않는다. 고르는 자리에서는 모든 런이 보여야
 * 하고, 정리는 그 화면이 한다.
 */
export function RunPicker({
  projectId,
  runs,
  folders,
  builds,
  selectedRunId,
  onPick,
}: {
  projectId: string
  runs: TestRun[]
  folders: RunFolder[]
  builds: GameBuild[]
  selectedRunId: string | null
  onPick: (runId: string) => void
}) {
  const { t } = useI18n()
  const l = t.qa.launch
  const selected = runs.find((run) => run.id === selectedRunId) ?? null
  const [node, setNode] = useState<Node>({ bucket: selected === null ? NO_VERSION : bucketOf(selected), folderId: selected?.folderId ?? null })
  const [query, setQuery] = useState('')

  // 버전: 빌드가 보고된 순서의 역순(최신 먼저). editor build 는 버전으로 나열하지 않는다. 런만 가리키는
  // 버전(빌드 목록에 없는 것)도 런이 있으면 보인다.
  const versions = useMemo(() => {
    const known = builds.filter((build) => !build.isEditor).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    const list = known.map((build) => ({ bucket: build.id, name: build.label ?? build.version }))
    for (const run of runs) {
      if (run.gameBuild !== null && !list.some((one) => one.bucket === run.gameBuild?.gameBuildId)) {
        list.push({ bucket: run.gameBuild.gameBuildId, name: run.gameBuild.label ?? run.gameBuild.version })
      }
    }
    list.push({ bucket: NO_VERSION, name: l.noVersion })
    return list
  }, [builds, runs, l.noVersion])
  const latest = versions[0]?.bucket

  const searching = query.trim().length > 0
  const shown = searching
    ? runs.filter((run) => run.name.toLowerCase().includes(query.trim().toLowerCase()))
    : runsAt(runs, node.bucket, node.folderId)
  const crumbs = [versions.find((one) => one.bucket === node.bucket)?.name ?? '', ...(node.folderId === null ? [] : pathTo(folders, node.folderId).map((folder) => folder.name))]

  function folderRows(bucket: string, parentId: string | null, depth: number): React.ReactNode[] {
    return childFolders(folders, bucket, parentId).flatMap((folder) => [
      <li key={folder.id}>
        <button
          aria-current={node.bucket === bucket && node.folderId === folder.id ? 'true' : undefined}
          className="ql-tree-row"
          onClick={() => {
            setNode({ bucket, folderId: folder.id })
            setQuery('')
          }}
          style={{ paddingLeft: 10 + depth * 16 }}
          type="button"
        >
          <span aria-hidden="true" className="ql-tree-folder" />
          <span className="ql-tree-name">{folder.name}</span>
          <span className="ql-tree-count">{countRunsUnder(runs, folders, folder.id)}</span>
        </button>
      </li>,
      ...folderRows(bucket, folder.id, depth + 1),
    ])
  }

  return (
    <div aria-label={l.changeRun} className="ql-picker" role="dialog">
      <div className="ql-picker-search">
        <label className="ql-search">
          <SearchIcon size={15} />
          <span className="visually-hidden">{l.searchRuns}</span>
          <input autoFocus onChange={(event) => setQuery(event.target.value)} placeholder={l.searchRuns} type="search" value={query} />
        </label>
        <Link className="ql-link" to={sectionHref(projectId, 'test-runs')}>{l.openRunsPage}</Link>
      </div>
      <div className="ql-picker-body">
        <nav aria-label={l.versionsHeading} className="ql-tree">
          <span className="ql-tree-heading">{l.versionsHeading}</span>
          <ul>
            {versions.map((version) => (
              <li key={version.bucket}>
                <button
                  aria-current={node.bucket === version.bucket && node.folderId === null ? 'true' : undefined}
                  className="ql-tree-row ql-tree-row--version"
                  onClick={() => {
                    setNode({ bucket: version.bucket, folderId: null })
                    setQuery('')
                  }}
                  type="button"
                >
                  <span className="ql-tree-name mono">{version.name}</span>
                  {version.bucket === latest && version.bucket !== NO_VERSION && <span className="ql-badge">{l.latest}</span>}
                  <span className="ql-tree-count">{runsIn(runs, version.bucket).length}</span>
                </button>
                <ul>{folderRows(version.bucket, null, 1)}</ul>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ql-picker-list">
          <div className="ql-picker-crumbs">
            {searching ? <span>{l.searchRuns}</span> : crumbs.map((crumb, index) => (
              <span className={index === crumbs.length - 1 ? 'is-current' : undefined} key={index}>
                {crumb}{index < crumbs.length - 1 && <span aria-hidden="true"> / </span>}
              </span>
            ))}
            <span className="ql-spacer" />
            <span>{l.runsHere(shown.length)}</span>
          </div>
          {shown.length === 0 && <p className="ql-empty">{searching ? l.noMatch : l.emptyFolder}</p>}
          <ul role="listbox" aria-label={l.changeRun}>
            {shown.map((run) => (
              <li aria-selected={run.id === selectedRunId} key={run.id} role="option">
                <button className="ql-run-option" onClick={() => onPick(run.id)} type="button">
                  <span className="ql-run-option-text">
                    <span className="ql-run-option-name">{run.name}</span>
                    <span className="ql-run-option-meta">
                      {[run.gameBuild?.label ?? run.gameBuild?.version, l.runMeta(run.scenarioCount)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="ql-run-option-last">
                    {run.lastQaRun === null ? l.neverRun : `${run.lastQaRun.passed}/${run.lastQaRun.total}`}
                  </span>
                  {run.id === selectedRunId ? <CheckIcon size={15} /> : <span aria-hidden="true" style={{ width: 15 }} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

/** 폴더까지의 경로(위에서 아래로, 그 폴더 포함). */
function pathTo(folders: readonly RunFolder[], folderId: string): RunFolder[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const path: RunFolder[] = []
  const seen = new Set<string>()
  let current: string | null = folderId
  while (current !== null && !seen.has(current)) {
    seen.add(current)
    const folder = byId.get(current)
    if (folder === undefined) break
    path.unshift(folder)
    current = folder.parentId
  }
  return path
}
