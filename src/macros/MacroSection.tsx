import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { buildOptionText, selectBuild } from '../projects/gameBuilds'
import type { GameBuild } from '../projects/gameTypes'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { SearchField } from '../testCases/SearchField'
import {
  countByOrigin,
  filterByOrigin,
  formatMacroParam,
  mergeMacros,
  parseMacroParam,
  searchMacros,
  type OriginFilter,
} from './macroLibrary'
import { MacroLibraryList } from './MacroLibraryList'
import { MacroSheet } from './MacroSheet'
import { MacroVersionList } from './MacroVersionList'
import { useBuildMacros } from './useBuildMacros'
import { useDeveloperMacros } from './useDeveloperMacros'

/*
 * 프로젝트 작업공간의 Macro 라이브러리 (ARTEL-941, ARTEL-1102).
 *
 * 케이스 라이브러리와 같은 모양이다 — 왼쪽에 "버전" 목록, 오른쪽에 검색 · 출처 필터 · 표가
 * 든 라이브러리 카드, 줄을 누르면 오른쪽 sheet. 읽기만 한다. agent macro 를 쓰는 길은
 * agent 의 frame 이고, developer macro 를 쓰는 길은 MCP 다.
 *
 * agent macro(tool loop agent 가 build 마다 저장한 것)와 developer macro(개발자가 MCP 로
 * 프로젝트에 등록한 것)는 같은 DSL 의 `def` 이고 한 목록에 선다. 출처는 필터일 뿐이다.
 * 고른 build 가 바꾸는 것은 agent macro 쪽과, developer macro 줄의 `이전 버전` · `다른 버전`
 * 칩이다. developer macro 는 build 에 속하지 않아 build 를 바꿔도 다시 읽지 않는다.
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
 * 주소가 싣는 것은 둘이다. `build` 는 고른 build id, `macro` 는 연 macro 다. `macro` 는 두
 * 출처가 함께 쓰는 한 칸이라 `agent:<id>` · `developer:<name>` 처럼 출처를 앞에 단다
 * (`formatMacroParam`).
 */
export function MacroSection() {
  const { builds, projectId } = useWorkspace()
  const { t } = useI18n()
  const copy = t.macros.section
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBuildId = searchParams.get('build')
  const selectedBuild = selectBuild(builds, requestedBuildId)

  // 주소가 늘 고른 빌드를 말하게 한다. **`macro` 는 남긴다** — `?macro=agent:7` 만 달린
  // 주소를 붙여 넣었을 때 mount 하자마자 선택이 사라지면, 그 주소를 받은 사람은 보낸
  // 사람이 가리킨 macro 를 영영 못 본다.
  useEffect(() => {
    if (selectedBuild === undefined || requestedBuildId === selectedBuild.id) return
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('build', selectedBuild.id)
        return next
      },
      { replace: true },
    )
  }, [requestedBuildId, selectedBuild, setSearchParams])

  const changeBuild = useCallback(
    (buildId: string) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('build', buildId)
        // 다른 빌드의 agent macro id 는 뜻이 없다. 남겨 두면 그 빌드에 없는 id 가 되어
        // 곧바로 지워지거나, 더 나쁘게는 엉뚱한 macro 를 연다. developer macro 는 build 에
        // 속하지 않으므로 남긴다.
        if (parseMacroParam(previous.get('macro'))?.origin === 'agent') next.delete('macro')
        return next
      })
    },
    [setSearchParams],
  )

  if (selectedBuild === undefined) {
    return (
      <section className="panel">
        <div className="panel-message">
          <h3>{copy.noBuildsTitle}</h3>
          <p className="panel-message-copy">{copy.noBuildsCopy}</p>
        </div>
      </section>
    )
  }

  return (
    <MacroLibrary
      builds={builds}
      onSelectBuild={changeBuild}
      projectId={projectId}
      selectedBuild={selectedBuild}
    />
  )
}

/** 라이브러리 본체. 두 출처의 읽기, 검색과 필터, `?macro=` 선택이 여기 산다. */
function MacroLibrary({
  builds,
  onSelectBuild,
  projectId,
  selectedBuild,
}: {
  builds: GameBuild[]
  onSelectBuild: (buildId: string) => void
  projectId: string
  selectedBuild: GameBuild
}) {
  const { t } = useI18n()
  const copy = t.macros
  const caseCopy = t.testCases
  const editorLabel = t.projects.builds.editorLabel
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMacro = searchParams.get('macro')
  const [query, setQuery] = useState('')
  const [origin, setOrigin] = useState<OriginFilter>('ALL')

  // `useBuildMacros` 는 build 가 바뀌면 직전 build 의 목록을 내보내지 않는다(`scope`). 그래서
  // 여기서 `key` 로 새로 마운트하지 않아도 다른 build 의 agent macro 가 섞이지 않고, 검색어와
  // 필터는 build 를 바꿔도 남는다.
  const agent = useBuildMacros(projectId, selectedBuild.id)
  const developer = useDeveloperMacros(projectId)

  const merged = useMemo(() => mergeMacros(agent.macros, developer.macros), [agent.macros, developer.macros])
  const searched = useMemo(() => searchMacros(merged, query), [merged, query])
  const counts = countByOrigin(searched)
  const shown = filterByOrigin(searched, origin)
  const filtered = query.trim().length > 0 || origin !== 'ALL'

  const selection = parseMacroParam(requestedMacro)
  const selectedKey = selection === null ? null : formatMacroParam(selection)
  const selectedItem = merged.find((item) => item.key === selectedKey)
  const selectionListStatus =
    selection === null ? 'ready' : selection.origin === 'agent' ? agent.status : developer.status

  // 목록에 없는 macro 를 주소에서 지운다. **그 출처의 목록이 뜬 뒤에만 판정한다** — 아직
  // 읽는 중에 지우면 멀쩡한 주소를 지우게 되고, 공유받은 링크가 그 한 번에 망가진다.
  // 읽을 수 없는 값(`?macro=7` 같은 옛 주소)은 기다릴 것이 없어 바로 지운다.
  useEffect(() => {
    if (requestedMacro === null || selectedItem !== undefined) return
    if (selectionListStatus !== 'ready') return
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
  }, [requestedMacro, selectedItem, selectionListStatus, setSearchParams])

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

  const reloadAll = () => {
    agent.reload()
    developer.reload()
  }

  // 케이스 라이브러리처럼 최신 game version build 에 `현재` 를 단다. editor build 만 있는
  // 프로젝트에는 "현재 버전" 이 없다.
  const newest = selectBuild(builds, null)
  const latestBuild = newest !== undefined && !newest.isEditor ? newest : undefined

  // 둘 다 첫 로드를 마치기 전에는 표 자리만 기다린다. 한쪽만 그리면 나머지 출처가 나중에
  // 끼어들며 줄이 밀린다. build 를 바꾸면 agent 쪽 목록이 비므로 다시 여기로 온다.
  const waiting =
    (agent.status === 'loading' && agent.macros.length === 0) ||
    (developer.status === 'loading' && developer.macros.length === 0)
  const selectedCount =
    agent.status === 'ready' && developer.status === 'ready'
      ? agent.macros.length +
        developer.macros.filter((macro) => macro.gameBuildId === selectedBuild.id).length
      : null

  return (
    <div className="tcl cp-scope macro-library">
      <aside aria-label={caseCopy.versions.heading} className="tcl-folders">
        <MacroVersionList
          builds={builds}
          latestBuildId={latestBuild?.id ?? null}
          onSelect={onSelectBuild}
          selectedCount={selectedCount}
          selectedId={selectedBuild.id}
        />
      </aside>

      <section
        aria-busy={agent.status === 'loading' || developer.status === 'loading' || undefined}
        aria-label={copy.section.title}
        className="panel tcl-list-panel"
      >
        <header className="panel-header panel-header--split">
          <h2 className="tcl-title">
            {copy.section.title}
            <InfoHint>{copy.section.subtitle}</InfoHint>
            {latestBuild !== undefined && (
              <span className="tcl-current-version" title={caseCopy.versions.currentTitle}>
                {caseCopy.versions.current} <strong>{buildOptionText(latestBuild, editorLabel)}</strong>
              </span>
            )}
          </h2>
          <div className="tcl-head-actions">
            {/* 라벨이 바뀌지 않는다. 진행 중이라는 사실은 `disabled` 와 `aria-busy` 가 말한다. */}
            <button
              className="button button--secondary button--compact"
              disabled={agent.status === 'loading' || developer.status === 'loading'}
              onClick={reloadAll}
              type="button"
            >
              {copy.section.refresh}
            </button>
          </div>
        </header>

        {/* 한쪽 읽기가 실패해도 다른 쪽은 그린다. 실패한 쪽이 직전 목록을 들고 있으면 그것도
            그대로 남는다(`useBuildMacros`, `useDeveloperMacros`). */}
        {agent.status === 'error' && (
          <LoadFailedNotice message={copy.section.agentLoadFailed} onRetry={agent.reload} retryLabel={copy.section.retry} />
        )}
        {developer.status === 'error' && (
          <LoadFailedNotice
            message={copy.section.developerLoadFailed}
            onRetry={developer.reload}
            retryLabel={copy.section.retry}
          />
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

        <div className="tcl-status-row">
          <span className="field-label">{caseCopy.origin.label}</span>
          <div className="tcl-chips">
            {(['ALL', 'AGENT', 'DEVELOPER'] as const).map((option) => (
              <button
                aria-pressed={origin === option}
                className={origin === option ? 'fchip on' : 'fchip'}
                key={option}
                onClick={() => setOrigin(option)}
                type="button"
              >
                {option === 'ALL'
                  ? caseCopy.origin.all
                  : option === 'AGENT'
                    ? copy.origin.agent
                    : copy.origin.developer}{' '}
                {counts[option]}
              </button>
            ))}
          </div>
        </div>

        {waiting ? (
          <div aria-busy="true" className="panel-empty-block">
            <p className="panel-empty">{copy.section.loading}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="panel-empty-block">
            <p className="panel-empty">{filtered ? copy.section.emptyFiltered : copy.section.empty}</p>
            {filtered && (
              <button
                className="button button--secondary button--compact"
                onClick={() => {
                  setQuery('')
                  setOrigin('ALL')
                }}
                type="button"
              >
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
                selectedBuild={selectedBuild}
                selectedKey={selectedItem?.key ?? null}
              />
            </div>
          </div>
        )}

        <div className="cp-foot">
          <span />
          <span>{copy.section.shownOf(shown.length, merged.length)}</span>
        </div>
      </section>

      {selectedItem !== undefined && (
        <MacroSheet
          builds={builds}
          item={selectedItem}
          key={selectedItem.key}
          onClose={closeSheet}
          projectId={projectId}
          selectedBuild={selectedBuild}
        />
      )}
    </div>
  )
}

function LoadFailedNotice({
  message,
  onRetry,
  retryLabel,
}: {
  message: string
  onRetry: () => void
  retryLabel: string
}) {
  return (
    <p className="tcl-notice" role="alert">
      <span>{message}</span>
      <button className="button button--secondary button--compact" onClick={onRetry} type="button">
        {retryLabel}
      </button>
    </p>
  )
}
