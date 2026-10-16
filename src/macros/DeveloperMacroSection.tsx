import { useCallback, useEffect, useId } from 'react'
import { useSearchParams } from 'react-router-dom'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import type { GameBuild } from '../projects/gameTypes'
import { DeveloperMacroDetail } from './DeveloperMacroDetail'
import { DeveloperMacroEmpty, DeveloperMacroList } from './DeveloperMacroList'
import { useDeveloperMacroSource, useDeveloperMacros } from './useDeveloperMacros'

/**
 * 고른 developer macro 를 싣는 주소 parameter.
 *
 * agent macro 의 `macro` 와 다른 이름이어야 한다. agent macro 는 숫자 id 로, developer
 * macro 는 이름으로 고르므로 한 칸을 같이 쓰면 `?macro=7` 이 어느 쪽인지 말하지 않는다.
 * 또 build 를 바꾸면 `MacroSection` 이 `macro` 를 지우는데, developer macro 는 build 에
 * 속하지 않으므로 그때 선택이 남아야 한다.
 */
export const DEVELOPER_MACRO_PARAM = 'developerMacro'

/**
 * macro 섹션 안의 developer macro 묶음 (ARTEL-1102).
 *
 * agent macro 아래에 따로 선다. 머리글에 `MCP` 칩을 달아 출처가 다르다는 것을 보이고,
 * 목록과 source 도 agent macro 와 다른 패널에 그린다. 읽기 전용이다 — 쓰는 길은 MCP 뿐이다.
 *
 * 프로젝트에 속한 자원이라 build 를 바꿔도 다시 읽지 않는다. build 가 바뀌면 각 줄의
 * relation 칩(`이전 빌드` · `이후 빌드` · `다른 빌드`)만 다시 계산된다.
 *
 * 주소에 쓰는 자리는 `MacroSection` 머리 주석의 규칙을 따라 전부 `setSearchParams` 의
 * 함수형을 쓴다. 여기서 쓰는 자리는 둘이다 — 고를 때와, 목록에 없는 이름을 지울 때.
 */
export function DeveloperMacroSection({
  builds,
  projectId,
  selectedBuild,
}: {
  builds: GameBuild[]
  projectId: string
  selectedBuild: GameBuild | undefined
}) {
  const { t } = useI18n()
  const copy = t.macros.developer
  const headingId = useId()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedName = searchParams.get(DEVELOPER_MACRO_PARAM)

  const { macros, status, reload } = useDeveloperMacros(projectId)
  const refreshing = status === 'loading'

  const selectedName =
    requestedName !== null && macros.some((macro) => macro.name === requestedName)
      ? requestedName
      : null

  // 목록에 없는 이름을 주소에서 지운다. 목록이 뜬 뒤에만, 그리고 updater 안에서 한 번 더
  // 확인한 뒤에만 지운다 — `MacroReport` 의 같은 effect 와 같은 이유다.
  useEffect(() => {
    if (status !== 'ready') return
    if (requestedName === null || selectedName !== null) return
    setSearchParams(
      (previous) => {
        if (previous.get(DEVELOPER_MACRO_PARAM) !== requestedName) return previous
        const next = new URLSearchParams(previous)
        next.delete(DEVELOPER_MACRO_PARAM)
        return next
      },
      { replace: true },
    )
  }, [status, requestedName, selectedName, setSearchParams])

  const selectMacro = useCallback(
    (name: string) => {
      setSearchParams((previous) => {
        const next = new URLSearchParams(previous)
        next.set(DEVELOPER_MACRO_PARAM, name)
        return next
      })
    },
    [setSearchParams],
  )

  const sourceRead = useDeveloperMacroSource(projectId, selectedName)

  return (
    <section aria-busy={refreshing || undefined} aria-labelledby={headingId} className="macro-developer">
      <header className="macro-developer-head">
        <h3 className="macro-developer-title" id={headingId}>
          {copy.title}
          <span className="macro-origin-chip">{copy.originChip}</span>
          <InfoHint>{copy.hint}</InfoHint>
        </h3>
        {/* 첫 로드 중에는 누를 것이 없다. 그 뒤로는 빈 목록에서도 선다 — MCP 로 방금
            등록한 사람이 이 화면을 떠나지 않고 확인하는 길이다. */}
        {!(refreshing && macros.length === 0) && (
          <button
            className="button button--secondary"
            disabled={refreshing}
            onClick={reload}
            type="button"
          >
            {t.macros.section.refresh}
          </button>
        )}
      </header>

      {refreshing && macros.length === 0 ? (
        <p aria-busy="true" className="panel-empty">
          {copy.loading}
        </p>
      ) : status === 'error' && macros.length === 0 ? (
        <div className="panel-message" role="alert">
          <p className="panel-message-copy">{copy.loadFailed}</p>
          <button className="button button--secondary" onClick={reload} type="button">
            {t.macros.states.retry}
          </button>
        </div>
      ) : macros.length === 0 ? (
        <DeveloperMacroEmpty />
      ) : (
        <>
          {status === 'error' && (
            <div className="macro-banner" role="status">
              <p className="macro-banner-title">{t.macros.states.refreshFailedTitle}</p>
              <p className="macro-banner-copy">{t.macros.states.refreshFailedCopy}</p>
            </div>
          )}
          <div className="macro-workspace">
            <section className="panel macro-list-panel">
              <DeveloperMacroList
                builds={builds}
                macros={macros}
                onSelect={selectMacro}
                selectedBuild={selectedBuild}
                selectedName={selectedName}
              />
            </section>
            <aside className="panel macro-detail-panel">
              <DeveloperMacroDetail
                builds={builds}
                macro={sourceRead.macro}
                onRetry={sourceRead.reload}
                selectedBuild={selectedBuild}
                status={sourceRead.status}
              />
            </aside>
          </div>
        </>
      )}
    </section>
  )
}
