import { useCallback, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18n } from '../i18n/useI18n'
import { useWorkspace } from '../projects/workspace/workspaceContext'
import { MacroDetail } from './MacroDetail'
import { MacroList } from './MacroList'
import { useBuildMacros, useMacroSource } from './useBuildMacros'

/*
 * 프로젝트 작업공간의 macro 섹션 (ARTEL-941).
 *
 * 빌드 하나를 골라 그 빌드에 등록된 macro 를 목록으로 보고, 하나를 열어 source 를
 * 읽는다. 읽기만 한다 — 쓰는 길은 agent 의 frame 뿐이다.
 *
 * `ContentMapSection` / `ContentMapReport` 와 같은 분업이다. 빌드를 고르는 일만 바깥
 * 컴포넌트에 남고, 읽기와 상태는 `MacroReport` 가 진다.
 *
 * ## 주소에 쓰는 자리는 전부 기존 parameter 를 보존한다
 *
 * `ContentMapSection` 과 `PerformanceSection` 은 `setSearchParams({ build })` 를 민
 * 객체로 부른다. 그것은 다른 parameter 를 전부 버리는데, 싣는 것이 `build` 하나뿐인
 * 동안에는 드러나지 않았다. 여기서 그대로 베끼면 `build` 와 `macro` 가 서로를 친다 —
 * macro 를 고르면 `build` 가 날아가고, `build` 가 없으니 아래 effect 가 기본 빌드를
 * 채우며 `macro` 를 날린다. 선택이 한 렌더도 살아남지 못한다.
 *
 * 그래서 네 자리 전부 `setSearchParams` 의 **함수형**을 쓴다. 직전 값을 react-router
 * 에게 받으므로, 같은 tick 에 둘이 쓰더라도 나중 것이 앞의 것을 덮지 않는다 —
 * 렌더에서 붙잡은 `searchParams` 로 짓는 것과 달리 경우를 따져서가 아니라 구조로
 * 막힌다. 아래 목록은 예외 명단이 아니다. 주소에 쓰는 자리를 새로 만들면 그것도
 * 같은 모양을 쓴다.
 */
export function MacroSection() {
  const { builds, projectId } = useWorkspace()
  const { t } = useI18n()
  const copy = t.macros.section
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedBuildId = searchParams.get('build')
  const selectedBuild = builds.find((build) => build.id === requestedBuildId) ?? builds[0]

  // 주소가 늘 고른 빌드를 말하게 한다. **`macro` 는 남긴다** — `?macro=7` 만 달린
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
        // 다른 빌드의 macro id 는 뜻이 없다. 남겨 두면 그 빌드에 없는 id 가 되어
        // 곧바로 지워지거나, 더 나쁘게는 엉뚱한 macro 를 연다.
        next.delete('macro')
        return next
      })
    },
    [setSearchParams],
  )

  return (
    <section className="macro-section">
      <header className="macro-section-head">
        <div>
          <h2>{copy.title}</h2>
          <p className="section-intro">{copy.subtitle}</p>
        </div>
        {selectedBuild !== undefined && (
          <label className="macro-build-picker">
            <span>{copy.selectLabel}</span>
            <select onChange={(event) => changeBuild(event.target.value)} value={selectedBuild.id}>
              {builds.map((build) => (
                <option key={build.id} value={build.id}>
                  {build.label === null || build.label.length === 0
                    ? build.version
                    : `${build.version} · ${build.label}`}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>

      {selectedBuild === undefined ? (
        <div className="panel-message">
          <h3>{copy.noBuildsTitle}</h3>
          <p className="panel-message-copy">{copy.noBuildsCopy}</p>
        </div>
      ) : (
        /*
         * `key` 가 빌드 id 다. 빌드를 바꾸면 `MacroReport` 가 통째로 새로 마운트되어
         * 목록 state 가 초기값부터 시작한다 — 새로고침 중에는 직전 목록을 남기는
         * `useBuildMacros` 가, 빌드를 바꿀 때만은 남기지 않게 되는 자리가 여기다.
         */
        <MacroReport buildId={selectedBuild.id} key={selectedBuild.id} projectId={projectId} />
      )}
    </section>
  )
}

/** 한 빌드의 macro. 목록 읽기와 상태들, 그리고 `?macro=` 선택이 여기 산다. */
function MacroReport({ buildId, projectId }: { buildId: string; projectId: string }) {
  const { t } = useI18n()
  const copy = t.macros
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMacro = searchParams.get('macro')

  const { macros, status, reload } = useBuildMacros(projectId, buildId)
  const refreshing = status === 'loading'

  // 주소가 가리키는 id 가 이 빌드의 목록에 실제로 있을 때만 선택으로 친다.
  const selectedId =
    requestedMacro !== null && macros.some((macro) => macro.id === requestedMacro)
      ? requestedMacro
      : null

  // 목록에 없는 id 를 주소에서 지운다. **목록이 뜬 뒤에만 판정한다** — 아직 읽는
  // 중에 지우면 멀쩡한 주소를 지우게 되고, 공유받은 링크가 그 한 번에 망가진다.
  useEffect(() => {
    if (status !== 'ready') return
    if (requestedMacro === null || selectedId !== null) return
    setSearchParams(
      (previous) => {
        // 위 조건은 렌더에서 붙잡은 `requestedMacro` 로 판단한 것이고, 이 updater 가
        // 도는 시점에는 이미 다른 값이 들어와 있을 수 있다. 지우는 쓰기는 네 자리
        // 중 여기뿐이므로, 지우기 직전에 "내가 보고 판단한 그 값이 맞는가" 를 한 번
        // 더 본다. 아니면 아무것도 하지 않는다.
        if (previous.get('macro') !== requestedMacro) return previous
        const next = new URLSearchParams(previous)
        next.delete('macro')
        return next
      },
      { replace: true },
    )
  }, [status, requestedMacro, selectedId, setSearchParams])

  const selectMacro = useCallback(
    (macroId: string) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set('macro', macroId)
        return next
      })
    },
    [setSearchParams],
  )

  const sourceRead = useMacroSource(projectId, buildId, selectedId)

  // 첫 로드에만 화면을 비운다. 새로고침 중에는 직전 목록이 그대로 남고 `aria-busy` 만
  // 붙는다 — 사용자가 누른 것은 새로고침이지 닫기가 아니다.
  if (refreshing && macros.length === 0) {
    return (
      <section className="panel">
        <p aria-busy="true" className="panel-empty">
          {copy.states.loading}
        </p>
      </section>
    )
  }

  // 되돌아갈 목록이 없는 실패. 빌드가 없거나 접근할 수 없을 때도 여기로 온다 —
  // 서버가 404 의 세 이유를 가르지 않으므로 화면도 가르지 않는다.
  if (status === 'error' && macros.length === 0) {
    return (
      <section className="panel">
        <div className="panel-message" role="alert">
          <p className="panel-message-copy">{copy.states.loadFailed}</p>
          <button className="button button--secondary" onClick={reload} type="button">
            {copy.states.retry}
          </button>
        </div>
      </section>
    )
  }

  // 빌드는 있는데 macro 가 하나도 없다. 서버가 404 가 아니라 빈 목록으로 답하는
  // 자리이고, 오류도 로딩도 아니다 — 아직 agent 가 저장할 만한 것을 못 만난 것이다.
  if (macros.length === 0) {
    return (
      <section className="panel">
        <div className="panel-message">
          <h3>{copy.empty.title}</h3>
          <p className="panel-message-copy">{copy.empty.copy}</p>
        </div>
      </section>
    )
  }

  return (
    <div aria-busy={refreshing || undefined}>
      {/* 새로고침이 실패했고 직전 목록이 남아 있는 상태. 목록은 그대로 두되 지금의
          사실인 척하지 않는다 — 마지막으로 받은 것을 살아 있는 것처럼 보이면 안 된다. */}
      {status === 'error' && (
        <div className="macro-banner" role="status">
          <p className="macro-banner-title">{copy.states.refreshFailedTitle}</p>
          <p className="macro-banner-copy">{copy.states.refreshFailedCopy}</p>
        </div>
      )}

      <div className="macro-section-actions">
        {/* 라벨이 바뀌지 않는다. 말줄임표가 붙은 상태 문장은 button 이름이 아니고,
            누르는 순간 폭이 변해 포인터 밑에서 button 이 움직인다. 진행 중이라는
            사실은 `disabled` 와 바깥의 `aria-busy` 가 이미 말한다. */}
        <button
          className="button button--secondary"
          disabled={refreshing}
          onClick={reload}
          type="button"
        >
          {copy.section.refresh}
        </button>
      </div>

      <div className="macro-workspace">
        <section className="panel macro-list-panel">
          <MacroList macros={macros} onSelect={selectMacro} selectedId={selectedId} />
        </section>
        <aside className="panel macro-detail-panel">
          <MacroDetail
            macro={sourceRead.macro}
            onRetry={sourceRead.reload}
            status={sourceRead.status}
          />
        </aside>
      </div>
    </div>
  )
}
