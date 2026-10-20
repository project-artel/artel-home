import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { buildOptionText } from '../projects/gameBuilds'
import type { GameBuild } from '../projects/gameTypes'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { SearchField } from '../testCases/SearchField'
import type { DeveloperMacroSummary } from './developerMacroTypes'
import {
  agentLibraryItems,
  DEVELOPER_VIEW,
  developerLibraryItems,
  latestVersionBuild,
  resolveMacroView,
  searchMacros,
  selectViewParams,
  type LibraryMacro,
} from './macroLibrary'
import { MacroLibraryList } from './MacroLibraryList'
import { MacroSheet } from './MacroSheet'
import { MacroVersionList } from './MacroVersionList'
import { useBuildMacros, type MacroListStatus } from './useBuildMacros'
import { useDeveloperMacros } from './useDeveloperMacros'

/*
 * 프로젝트 작업공간의 Macro 라이브러리 (ARTEL-941, ARTEL-1102).
 *
 * 케이스 라이브러리와 같은 모양이다 — 왼쪽에 `버전` 목록, 오른쪽에 검색과 표가 든 라이브러리
 * 카드, 줄을 누르면 오른쪽 sheet. 읽기만 한다. agent macro 를 쓰는 길은 agent 의 frame 이고,
 * developer macro 를 쓰는 길은 MCP 다.
 *
 * `버전` 목록에서 build 를 고르면 그 build 에 tool loop agent 가 저장한 agent macro 를 보고,
 * 맨 아래 `개발자 macro (MCP)` 줄을 고르면 개발자가 MCP 로 프로젝트에 등록한 developer macro
 * 전부를 본다. developer macro 는 build 에 속하지 않으므로 build 화면에 섞지 않는다. 그 줄의
 * `이전 버전` · `다른 버전` 칩은 각 macro 의 기준 build 를 `현재` build 와 비교한다.
 *
 * ## 주소에 쓰는 자리는 전부 기존 parameter 를 보존한다
 *
 * `ContentMapSection` 과 `PerformanceSection` 은 `setSearchParams({ build })` 를 민
 * 객체로 부른다. 그것은 다른 parameter 를 전부 버리는데, 싣는 것이 `build` 하나뿐인
 * 동안에는 드러나지 않았다. 여기서 그대로 베끼면 `build` 와 `macro` 가 서로를 친다 —
 * macro 를 고르면 `build` 가 날아가고, `build` 가 없으니 아래 effect 가 기본 빌드를
 * 채우며 `macro` 를 날린다. 선택이 한 렌더도 살아남지 못한다.
 *
 * 그래서 주소에 쓰는 자리는 전부 `setSearchParams` 의 **함수형**을 쓴다. 직전 값을
 * react-router 에게 받으므로, 같은 tick 에 둘이 쓰더라도 나중 것이 앞의 것을 덮지 않는다
 * — 렌더에서 붙잡은 `searchParams` 로 짓는 것과 달리 경우를 따져서가 아니라 구조로
 * 막힌다. 주소에 쓰는 자리를 새로 만들면 그것도 같은 모양을 쓴다.
 *
 * 주소가 싣는 것은 둘이다. `build` 는 고른 build id 이거나 developer macro 줄이면
 * `developer`(`DEVELOPER_VIEW`)다. `macro` 는 연 macro 이고 `agent:<id>` · `developer:<name>`
 * 처럼 출처를 앞에 단다(`formatMacroParam`).
 */
export function MacroSection() {
  const { builds, projectId } = useWorkspace()
  const { t } = useI18n()
  const copy = t.macros.section
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBuild = searchParams.get('build')
  const view = resolveMacroView(builds, requestedBuild)

  // 주소가 늘 고른 build 를 말하게 한다. **`macro` 는 남긴다** — `?macro=agent:7` 만 달린
  // 주소를 붙여 넣었을 때 mount 하자마자 선택이 사라지면, 그 주소를 받은 사람은 보낸
  // 사람이 가리킨 macro 를 영영 못 본다.
  const selectedBuildId = view?.kind === 'build' ? view.build.id : null
  useEffect(() => {
    if (selectedBuildId === null || requestedBuild === selectedBuildId) return
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('build', selectedBuildId)
        return next
      },
      { replace: true },
    )
  }, [requestedBuild, selectedBuildId, setSearchParams])

  const selectView = useCallback(
    (buildParam: string) => setSearchParams((previous) => selectViewParams(previous, buildParam)),
    [setSearchParams],
  )

  // developer macro 는 화면을 열 때 한 번 다 읽는다. `버전` 목록의 developer macro 줄이 늘 수를
  // 달고, developer macro 화면도 이 목록을 그린다.
  const developer = useDeveloperMacros(projectId)

  if (view === null) {
    return (
      <section className="panel">
        <div className="panel-message">
          <h3>{copy.noBuildsTitle}</h3>
          <p className="panel-message-copy">{copy.noBuildsCopy}</p>
        </div>
      </section>
    )
  }

  const shared = {
    builds,
    developerCount:
      developer.status === 'ready' || developer.macros.length > 0 ? developer.macros.length : null,
    onSelectView: selectView,
    projectId,
  }

  return view.kind === 'build' ? (
    // `key` 가 build id 다. build 를 바꾸면 검색어와 agent macro 읽기가 처음부터 시작한다.
    <BuildMacroView {...shared} build={view.build} key={view.build.id} />
  ) : (
    <DeveloperMacroView
      {...shared}
      macros={developer.macros}
      onReload={developer.reload}
      status={developer.status}
    />
  )
}

type SharedViewProps = {
  builds: GameBuild[]
  developerCount: number | null
  onSelectView: (buildParam: string) => void
  projectId: string
}

/** build 하나의 agent macro. */
function BuildMacroView({ build, ...shared }: SharedViewProps & { build: GameBuild }) {
  const { t } = useI18n()
  const caseCopy = t.testCases.versions
  const copy = t.macros.section
  const agent = useBuildMacros(shared.projectId, build.id)
  const items = useMemo(() => agentLibraryItems(agent.macros), [agent.macros])
  const latest = latestVersionBuild(shared.builds)

  return (
    <MacroLibraryView
      {...shared}
      agentBuildId={build.id}
      emptyText={copy.empty}
      items={items}
      loadFailedText={copy.agentLoadFailed}
      onReload={agent.reload}
      referenceBuild={latest}
      selectedCount={agent.status === 'ready' ? agent.macros.length : null}
      selectedView={build.id}
      status={agent.status}
      titleChip={
        latest !== undefined && (
          <span className="tcl-current-version" title={caseCopy.currentTitle}>
            {caseCopy.current} <strong>{buildOptionText(latest, t.projects.builds.editorLabel)}</strong>
          </span>
        )
      }
    />
  )
}

/** 프로젝트의 developer macro 전부. 칩은 각 macro 의 기준 build 를 `현재` build 와 비교한다. */
function DeveloperMacroView({
  macros,
  onReload,
  status,
  ...shared
}: SharedViewProps & { macros: DeveloperMacroSummary[]; onReload: () => void; status: MacroListStatus }) {
  const { t } = useI18n()
  const copy = t.macros.section
  const items = useMemo(() => developerLibraryItems(macros), [macros])

  return (
    <MacroLibraryView
      {...shared}
      agentBuildId={null}
      emptyText={copy.developerEmpty}
      items={items}
      loadFailedText={copy.developerLoadFailed}
      onReload={onReload}
      referenceBuild={latestVersionBuild(shared.builds)}
      selectedCount={null}
      selectedView={DEVELOPER_VIEW}
      status={status}
      titleChip={
        <span className="tcl-current-version" title={copy.developerChipTitle}>
          <strong>{copy.developerChip}</strong>
        </span>
      }
    />
  )
}

/**
 * 라이브러리 틀. 한 출처의 줄들과 그 읽기 상태를 받아 `버전` 목록, 카드, sheet 를 그린다.
 * 검색과 `?macro=` 선택이 여기 산다.
 */
function MacroLibraryView({
  agentBuildId,
  builds,
  developerCount,
  emptyText,
  items,
  loadFailedText,
  onReload,
  onSelectView,
  projectId,
  referenceBuild,
  selectedCount,
  selectedView,
  status,
  titleChip,
}: SharedViewProps & {
  agentBuildId: string | null
  emptyText: string
  items: LibraryMacro[]
  loadFailedText: string
  onReload: () => void
  referenceBuild: GameBuild | undefined
  selectedCount: number | null
  selectedView: string
  status: MacroListStatus
  titleChip: ReactNode
}) {
  const { t } = useI18n()
  const copy = t.macros
  const caseCopy = t.testCases
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMacro = searchParams.get('macro')
  const [query, setQuery] = useState('')

  const shown = useMemo(() => searchMacros(items, query), [items, query])
  const filtered = query.trim().length > 0
  const selectedItem = items.find((item) => item.key === requestedMacro)

  // 이 화면에 없는 macro 를 주소에서 지운다. 다른 출처의 선택과 읽을 수 없는 값(`?macro=7`
  // 같은 옛 주소)도 여기서 지워진다. **목록이 뜬 뒤에만 판정한다** — 아직 읽는 중에 지우면
  // 멀쩡한 주소를 지우게 되고, 공유받은 링크가 그 한 번에 망가진다.
  useEffect(() => {
    if (requestedMacro === null || selectedItem !== undefined || status !== 'ready') return
    setSearchParams(
      (previous) => {
        // 위 조건은 렌더에서 붙잡은 값으로 판단한 것이다. updater 가 도는 시점에 다른
        // 값이 들어와 있으면 아무것도 하지 않는다.
        if (previous.get('macro') !== requestedMacro) return previous
        const next = new URLSearchParams(previous)
        next.delete('macro')
        return next
      },
      { replace: true },
    )
  }, [requestedMacro, selectedItem, status, setSearchParams])

  const openMacro = useCallback(
    (key: string) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('macro', key)
        return next
      })
    },
    [setSearchParams],
  )

  const closeSheet = useCallback(() => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      next.delete('macro')
      return next
    })
  }, [setSearchParams])

  const waiting = status === 'loading' && items.length === 0

  return (
    <div className="tcl cp-scope macro-library">
      <aside aria-label={caseCopy.versions.heading} className="tcl-folders">
        <MacroVersionList
          builds={builds}
          developerCount={developerCount}
          latestBuildId={referenceBuild?.id ?? null}
          onSelect={onSelectView}
          selectedCount={selectedCount}
          selectedView={selectedView}
        />
      </aside>

      <section aria-busy={status === 'loading' || undefined} aria-label={copy.section.title} className="panel tcl-list-panel">
        <header className="panel-header panel-header--split">
          <h2 className="tcl-title">
            {copy.section.title}
            <InfoHint>{copy.section.subtitle}</InfoHint>
            {titleChip}
          </h2>
        </header>

        {/* 주기적으로 다시 읽다가 실패해도 직전 목록이 있으면 그대로 남는다(`useBuildMacros`,
            `useDeveloperMacros`). 그때 이 알림이 그 목록이 지금의 사실이 아니라고 말한다. */}
        {status === 'error' && (
          <p className="tcl-notice" role="alert">
            <span>{loadFailedText}</span>
            <button className="button button--secondary button--compact" onClick={onReload} type="button">
              {copy.section.retry}
            </button>
          </p>
        )}

        <div className="tcl-filters">
          <div className="tcl-filter tcl-filter--grow">
            <SearchField
              clearLabel={caseCopy.filters.clearSearch}
              label={caseCopy.filters.search}
              onChange={setQuery}
              placeholder={copy.section.searchPlaceholder}
              value={query}
            />
          </div>
        </div>

        {waiting ? (
          <div aria-busy="true" className="panel-empty-block">
            <p className="panel-empty">{copy.section.loading}</p>
          </div>
        ) : status === 'error' && items.length === 0 ? null : shown.length === 0 ? (
          <div className="panel-empty-block">
            <p className="panel-empty">{filtered ? copy.section.emptyFiltered : emptyText}</p>
            {filtered && (
              <button className="button button--secondary button--compact" onClick={() => setQuery('')} type="button">
                {caseCopy.section.clearFilters}
              </button>
            )}
          </div>
        ) : (
          <div className="cp-listwrap">
            <div className="cp-list tcl-scroll">
              <MacroLibraryList
                builds={builds}
                items={shown}
                onOpen={openMacro}
                referenceBuild={referenceBuild}
                selectedKey={selectedItem?.key ?? null}
              />
            </div>
          </div>
        )}

        <div className="cp-foot">
          <span />
          <span>{copy.section.shownOf(shown.length, items.length)}</span>
        </div>
      </section>

      {selectedItem !== undefined && (
        <MacroSheet
          agentBuildId={agentBuildId}
          builds={builds}
          item={selectedItem}
          key={selectedItem.key}
          onClose={closeSheet}
          projectId={projectId}
          referenceBuild={referenceBuild}
        />
      )}
    </div>
  )
}
