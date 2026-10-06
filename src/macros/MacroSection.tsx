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
 * 읽는다. 읽기만 한다 — 고치는 길은 agent 의 `edit_macro` 와 `register_macro` 다.
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
 * 그래서 네 자리 전부 `new URLSearchParams(searchParams)` 를 거친다
 * (`TrackerLinkPanel.tsx:78` 의 관용구). 지우는 것은 의도한 자리에서만 지운다.
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
    const next = new URLSearchParams(searchParams)
    next.set('build', selectedBuild.id)
    setSearchParams(next, { replace: true })
  }, [requestedBuildId, selectedBuild, searchParams, setSearchParams])

  const changeBuild = useCallback(
    (buildId: string) => {
      const next = new URLSearchParams(searchParams)
      next.set('build', buildId)
      // 다른 빌드의 macro 번호는 뜻이 없다. 번호는 빌드마다 다시 매겨지므로 남겨 두면
      // 엉뚱한 macro 가 열린다.
      next.delete('macro')
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  return (
    <section className="macro-section">
      <header className="macro-section-head">
        <p className="section-intro">{copy.subtitle}</p>
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
          <h2>{copy.noBuildsTitle}</h2>
          <p className="panel-message-copy">{copy.noBuildsCopy}</p>
        </div>
      ) : (
        <MacroReport buildId={selectedBuild.id} key={selectedBuild.id} projectId={projectId} />
      )}
    </section>
  )
}

/** 한 빌드의 macro. 목록 읽기와 네 상태, 그리고 `?macro=` 선택이 여기 산다. */
function MacroReport({ buildId, projectId }: { buildId: string; projectId: string }) {
  const { t } = useI18n()
  const copy = t.macros
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedMacro = searchParams.get('macro')

  const { macros, status, reload } = useBuildMacros(projectId, buildId)

  // 주소가 가리키는 번호가 이 빌드의 목록에 실제로 있을 때만 선택으로 친다.
  const selectedNumber =
    requestedMacro !== null && macros.some((macro) => macro.number === requestedMacro)
      ? requestedMacro
      : null

  // 목록에 없는 번호를 주소에서 지운다. **목록이 뜬 뒤에만 판정한다** — 아직 읽는
  // 중에 지우면 멀쩡한 주소를 지우게 되고, 공유받은 링크가 그 한 번에 망가진다.
  useEffect(() => {
    if (status !== 'ready') return
    if (requestedMacro === null || selectedNumber !== null) return
    const next = new URLSearchParams(searchParams)
    next.delete('macro')
    setSearchParams(next, { replace: true })
  }, [status, requestedMacro, selectedNumber, searchParams, setSearchParams])

  const selectMacro = useCallback(
    (number: string) => {
      const next = new URLSearchParams(searchParams)
      next.set('macro', number)
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  const sourceRead = useMacroSource(projectId, buildId, selectedNumber)

  if (status === 'loading') {
    return (
      <section className="panel">
        <p aria-busy="true" className="panel-empty">
          {copy.states.loading}
        </p>
      </section>
    )
  }

  if (status === 'error') {
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

  // 빌드는 있는데 macro 가 하나도 없다. 오류도 로딩도 아니고, 아직 agent 가 저장할
  // 만한 것을 못 만난 것이다.
  if (macros.length === 0) {
    return (
      <section className="panel">
        <div className="panel-message">
          <h2>{copy.empty.title}</h2>
          <p className="panel-message-copy">{copy.empty.copy}</p>
        </div>
      </section>
    )
  }

  return (
    <>
      <div className="macro-section-actions">
        <button className="button button--secondary" onClick={reload} type="button">
          {copy.section.refresh}
        </button>
      </div>

      <div className="macro-workspace">
        <section className="panel macro-list-panel">
          <MacroList macros={macros} onSelect={selectMacro} selectedNumber={selectedNumber} />
        </section>
        <aside className="panel macro-detail-panel">
          <MacroDetail macro={sourceRead.macro} onRetry={sourceRead.reload} status={sourceRead.status} />
        </aside>
      </div>
    </>
  )
}
