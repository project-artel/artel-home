import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { macroScreenLabel, macroSignature, type MacroDetail as Macro } from './macroTypes'
import type { MacroSourceStatus } from './useBuildMacros'

/**
 * 고른 macro 하나와 그 source.
 *
 * 읽기 전용이다. 고치는 길은 agent 의 `edit_macro` 와 `register_macro` 뿐이라 이
 * 컴포넌트에는 어떤 입력도 없고, 그 사실을 글로도 한 줄 적는다 — 없는 조작 button 을
 * 찾아 헤매게 두는 것보다 싸다.
 */
export function MacroDetail({
  macro,
  onRetry,
  status,
}: {
  macro: Macro | null
  onRetry: () => void
  status: MacroSourceStatus
}) {
  const { t } = useI18n()
  const copy = t.macros.detail

  if (status === 'idle') {
    return (
      <section aria-labelledby="macro-detail-title" className="macro-detail">
        <h2 className="macro-detail-title" id="macro-detail-title">
          {copy.title}
        </h2>
        <p className="macro-detail-hint">{copy.hint}</p>
      </section>
    )
  }

  if (status === 'loading') {
    return (
      <section aria-busy="true" aria-labelledby="macro-detail-title" className="macro-detail">
        <h2 className="macro-detail-title" id="macro-detail-title">
          {copy.title}
        </h2>
        <p className="panel-empty">{copy.sourceLoading}</p>
      </section>
    )
  }

  if (status === 'error' || macro === null) {
    return (
      <section aria-labelledby="macro-detail-title" className="macro-detail">
        <h2 className="macro-detail-title" id="macro-detail-title">
          {copy.title}
        </h2>
        <div className="panel-message" role="alert">
          <p className="panel-message-copy">{copy.sourceFailed}</p>
          <button className="button button--secondary" onClick={onRetry} type="button">
            {t.macros.states.retry}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="macro-detail-title" className="macro-detail">
      <header className="macro-detail-head">
        <h2 className="macro-detail-title" id="macro-detail-title">
          <span className="mono">
            <span className="macro-detail-name">{macro.name}</span>
            {macroSignature(macro.parameters)}
          </span>
        </h2>
        <p className="macro-detail-updated">
          {t.macros.list.updatedAt(formatDateTime(macro.updatedAt))}
        </p>
      </header>

      <div className="macro-detail-screens">
        <h3 className="macro-detail-subtitle">{copy.screensLabel}</h3>
        {macro.screens.length > 0 ? (
          <ul className="macro-detail-screen-list">
            {macro.screens.map((screen) => (
              <li key={screen.id}>
                <span className="macro-screen-badge">{macroScreenLabel(t, screen)}</span>
              </li>
            ))}
          </ul>
        ) : (
          // 빈 관계는 사실이지 결손이 아니다. 그 사실이 무엇을 뜻하고 무엇을 뜻하지
          // 않는지를 둘 다 적는다 — 한쪽만 적으면 나머지 절반을 사용자가 짐작한다.
          <div className="macro-detail-unattached">
            <p className="macro-detail-unattached-title">{copy.noScreens}</p>
            <p className="macro-detail-unattached-copy">{copy.noScreensCopy}</p>
          </div>
        )}
      </div>

      <div className="macro-source">
        <div className="macro-source-head">
          <h3 className="macro-detail-subtitle">{copy.sourceLabel}</h3>
          <p className="macro-source-note">{copy.readOnly}</p>
        </div>
        {macro.source.length === 0 ? (
          <p className="panel-empty">{copy.sourceEmpty}</p>
        ) : (
          /*
           * 가로로 넘치는 영역이라 키보드만 쓰는 사람이 스크롤할 수 있어야 한다.
           * `tabIndex` 와 이름이 그 자리를 만든다.
           *
           * 줄을 접지 않는 이유는 `App.css` 의 `white-space: pre` 에 적혀 있다.
           */
          <pre
            aria-label={copy.sourceLabel}
            className="macro-source-body mono"
            role="group"
            tabIndex={0}
          >
            {macro.source}
          </pre>
        )}
      </div>
    </section>
  )
}
