import { useId } from 'react'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import type { GameBuild } from '../projects/gameTypes'
import { DeveloperMacroBuildChip, DeveloperMacroRegistered } from './DeveloperMacroList'
import { writtenBuildText, type DeveloperMacroDetail as DeveloperMacro } from './developerMacroTypes'
import { macroSignature } from './macroTypes'
import type { MacroSourceStatus } from './useBuildMacros'

/**
 * 고른 developer macro 하나와 그 source (ARTEL-1102).
 *
 * `MacroDetail` 과 같은 상태 분기(`idle` · `loading` · `error` · 본문)와 같은 class 를 쓴다.
 * 그쪽을 넓혀 쓰지 않은 이유는 보여 주는 칸이 다르기 때문이다 — agent macro 는 `screen`
 * 을, developer macro 는 docstring 과 쓸 때 기준으로 삼은 build 를 보여 준다. 한 컴포넌트에
 * 두 모양을 넣으면 분기마다 "어느 macro 인가" 를 묻게 된다.
 *
 * 기준 build 는 메타 줄에 글로 적는다 — `v1 · 0.1.0 기준 · nubuli 등록 · …`. 칩은 목록과
 * 같이, 고른 build 와 다를 때만 하나 선다.
 *
 * heading 이 `MacroDetail` 보다 한 단계 낮다. 이 패널은 `DeveloperMacroSection` 의 `h3`
 * 아래에 있다. id 는 `useId` 로 만든다 — 같은 화면에 `MacroDetail` 이 함께 떠 있어 고정
 * id 를 쓰면 `aria-labelledby` 가 그쪽 제목을 가리킬 수 있다.
 */
export function DeveloperMacroDetail({
  builds,
  macro,
  onRetry,
  selectedBuild,
  status,
}: {
  builds: GameBuild[]
  macro: DeveloperMacro | null
  onRetry: () => void
  selectedBuild: GameBuild | undefined
  status: MacroSourceStatus
}) {
  const { t } = useI18n()
  const copy = t.macros.developer.detail
  const titleId = useId()
  const sourceTitleId = useId()

  if (status === 'idle') {
    return (
      <section aria-labelledby={titleId} className="macro-detail">
        <h4 className="macro-detail-title" id={titleId}>
          {copy.title}
        </h4>
        <p className="macro-detail-hint">{copy.hint}</p>
      </section>
    )
  }

  if (status === 'loading') {
    return (
      <section aria-busy="true" aria-labelledby={titleId} className="macro-detail">
        <h4 className="macro-detail-title" id={titleId}>
          {copy.title}
        </h4>
        <p className="panel-empty">{t.macros.detail.sourceLoading}</p>
      </section>
    )
  }

  if (status === 'error' || macro === null) {
    return (
      <section aria-labelledby={titleId} className="macro-detail">
        <h4 className="macro-detail-title" id={titleId}>
          {copy.title}
        </h4>
        <div className="panel-message" role="alert">
          <p className="panel-message-copy">{t.macros.detail.sourceFailed}</p>
          <button className="button button--secondary" onClick={onRetry} type="button">
            {t.macros.states.retry}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby={titleId} className="macro-detail">
      <header className="macro-detail-head">
        <h4 className="macro-detail-title" id={titleId}>
          <span className="mono">
            <span className="macro-detail-name">{macro.name}</span>
            {macroSignature(macro.parameters.map((name) => ({ name, type: null })))}
          </span>
        </h4>
        {/* 기준 build 는 칩이 아니라 글로 적는다. 칩은 고른 build 와 다를 때 하나만 선다. */}
        <p className="macro-detail-updated">
          {macro.version !== null && `${t.macros.developer.version(macro.version)} · `}
          {t.macros.developer.writtenAgainst(
            writtenBuildText(macro, builds, t.projects.builds.editorLabel),
          )}
          {' · '}
          <DeveloperMacroRegistered macro={macro} />
        </p>
      </header>

      <div className="macro-row-meta">
        <DeveloperMacroBuildChip builds={builds} macro={macro} selectedBuild={selectedBuild} />
      </div>

      {macro.docstring.length > 0 && (
        <div>
          <h5 className="macro-detail-subtitle">{copy.docstringLabel}</h5>
          <p className="macro-detail-docstring">{macro.docstring}</p>
        </div>
      )}

      <div className="macro-source">
        <div className="macro-source-head">
          <h5 className="macro-detail-subtitle" id={sourceTitleId}>
            {t.macros.detail.sourceLabel}
            <InfoHint>{copy.readOnly}</InfoHint>
          </h5>
        </div>
        {macro.source.length === 0 ? (
          <p className="panel-empty">{t.macros.detail.sourceEmpty}</p>
        ) : (
          // 가로 스크롤 영역을 키보드로 닿게 하는 방식은 `MacroDetail` 의 같은 자리와 같다.
          <pre
            aria-labelledby={sourceTitleId}
            className="macro-source-body mono"
            role="region"
            tabIndex={0}
          >
            {macro.source}
          </pre>
        )}
      </div>
    </section>
  )
}
