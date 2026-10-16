import { useEffect, useId, useRef } from 'react'
import { InfoHint } from '../design-system/primitives/InfoHint'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import type { GameBuild } from '../projects/gameTypes'
import { writtenBuildText } from './developerMacroTypes'
import { libraryParameterNames, type LibraryMacro } from './macroLibrary'
import { MacroRelationChip } from './MacroLibraryList'
import { macroScreenLabel, macroSignature } from './macroTypes'
import { useMacroSource, type MacroSourceStatus } from './useBuildMacros'
import { useDeveloperMacroSource } from './useDeveloperMacros'

/**
 * 고른 macro 하나를 여는 오른쪽 sheet (ARTEL-1102).
 *
 * 케이스 라이브러리가 케이스를 여는 `TestCaseSheet` 와 같은 자리, 같은 class(`tcl-scrim`,
 * `tcl-sheet`)다. 그쪽은 편집 폼을 싣지만 이쪽은 읽기만 한다 — 서명, 메타 줄, docstring,
 * (agent macro 면) 달린 `screen`, 그리고 source.
 *
 * 메타 줄과 칩은 목록이 이미 가진 값으로 바로 그린다. 서버에 다시 묻는 것은 목록에 없는
 * `source` 하나뿐이고, 그 읽기는 출처에 맞는 hook 하나만 실제로 요청을 보낸다.
 */
export function MacroSheet({
  agentBuildId,
  builds,
  item,
  onClose,
  projectId,
  referenceBuild,
}: {
  /** agent macro 가 저장된 build. agent macro 의 source 를 읽는 경로에 들어간다. */
  agentBuildId: string | null
  builds: GameBuild[]
  item: LibraryMacro
  onClose: () => void
  projectId: string
  /** developer macro 의 기준 build 와 비교할 `현재` build. */
  referenceBuild: GameBuild | undefined
}) {
  const { t } = useI18n()
  const copy = t.macros
  const titleId = useId()
  const sourceTitleId = useId()
  const closeRef = useRef<HTMLButtonElement | null>(null)

  const agentRead = useMacroSource(
    projectId,
    agentBuildId ?? '',
    item.origin === 'agent' && agentBuildId !== null ? item.macro.id : null,
  )
  const developerRead = useDeveloperMacroSource(projectId, item.origin === 'developer' ? item.macro.name : null)
  const sourceRead = item.origin === 'agent' ? agentRead : developerRead

  // 열리면 초점을 sheet 안으로 옮긴다. 뒤 표에 남아 있으면 `Escape` 를 표가 먼저 받는다.
  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  return (
    <>
      <div className="tcl-scrim" onClick={onClose} />
      <aside
        aria-labelledby={titleId}
        aria-modal="true"
        className="tcl-sheet macro-sheet"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            onClose()
          }
        }}
        role="dialog"
      >
        <header className="tcl-sheet-head">
          <div className="tcl-sheet-tags">
            {item.origin === 'developer' && (
              <MacroRelationChip builds={builds} macro={item.macro} referenceBuild={referenceBuild} />
            )}
          </div>
          <button aria-label={copy.sheet.close} className="tcl-sheet-close" onClick={onClose} ref={closeRef} type="button">
            ✕
          </button>
        </header>

        <h3 className="macro-sheet-title mono" id={titleId}>
          <span className="macro-row-name">{item.name}</span>
          {macroSignature(libraryParameterNames(item).map((name) => ({ name, type: null })))}
        </h3>
        <p className="tcl-sheet-meta">
          <MacroMeta builds={builds} item={item} />
        </p>

        {item.origin === 'developer' && item.macro.docstring.length > 0 && (
          <section className="macro-sheet-block">
            <h4 className="macro-sheet-subtitle">{copy.sheet.docstring}</h4>
            <p className="macro-sheet-docstring">{item.macro.docstring}</p>
          </section>
        )}

        {item.origin === 'agent' && (
          <section className="macro-sheet-block">
            <h4 className="macro-sheet-subtitle">{copy.sheet.screens}</h4>
            {item.macro.screens.length > 0 ? (
              <ul className="macro-sheet-screens">
                {item.macro.screens.map((screen) => (
                  <li className="macro-screen-badge" key={screen.id}>{macroScreenLabel(screen)}</li>
                ))}
              </ul>
            ) : (
              // 빈 관계는 사실이지 결손이 아니다. 무엇을 뜻하지 않는지도 적는다.
              <p className="macro-sheet-note">
                <strong>{copy.sheet.noScreens}</strong> {copy.sheet.noScreensCopy}
              </p>
            )}
          </section>
        )}

        <section className="macro-sheet-block">
          <h4 className="macro-sheet-subtitle" id={sourceTitleId}>
            {copy.sheet.source}
            <InfoHint>{item.origin === 'agent' ? copy.sheet.readOnlyAgent : copy.sheet.readOnlyDeveloper}</InfoHint>
          </h4>
          <MacroSource
            labelId={sourceTitleId}
            onRetry={sourceRead.reload}
            source={sourceRead.macro?.source ?? null}
            status={sourceRead.status}
          />
        </section>
      </aside>
    </>
  )
}

/**
 * sheet 의 메타 줄. developer macro 는 `v1 · 0.1.0 기준 · nubuli 등록 · 10월 15일 18:00`,
 * agent macro 는 `수정 10월 15일 18:00`. 등록한 사람을 지웠으면 그 칸 대신 `등록 <시각>` 이다.
 */
function MacroMeta({ builds, item }: { builds: GameBuild[]; item: LibraryMacro }) {
  const { t } = useI18n()
  const copy = t.macros.meta
  const date = formatDateTime(item.macro.updatedAt)
  if (item.origin === 'agent') return copy.updatedAt(date)

  const macro = item.macro
  const parts = [
    ...(macro.version === null ? [] : [copy.version(macro.version)]),
    copy.writtenAgainst(writtenBuildText(macro, builds, t.projects.builds.editorLabel)),
    macro.updatedBy === null ? copy.registeredAt(date) : copy.registeredBy(macro.updatedBy.nickname, date),
  ]
  return parts.join(' · ')
}

function MacroSource({
  labelId,
  onRetry,
  source,
  status,
}: {
  labelId: string
  onRetry: () => void
  source: string | null
  status: MacroSourceStatus
}) {
  const { t } = useI18n()
  const copy = t.macros

  if (status === 'loading' || status === 'idle') {
    return <p aria-busy="true" className="panel-empty">{copy.sheet.sourceLoading}</p>
  }
  if (status === 'error' || source === null) {
    return (
      <div className="panel-empty-block" role="alert">
        <p className="panel-empty">{copy.sheet.sourceFailed}</p>
        <button className="button button--secondary button--compact" onClick={onRetry} type="button">
          {copy.section.retry}
        </button>
      </div>
    )
  }
  if (source.length === 0) return <p className="panel-empty">{copy.sheet.sourceEmpty}</p>

  /*
   * 가로로 넘치는 영역이라 키보드만 쓰는 사람이 스크롤할 수 있어야 한다. `tabIndex` 와 이름이
   * 그 자리를 만들고, 이름은 바로 위 `h4` 를 빌린다. 줄을 접지 않는 이유는 `App.css` 의
   * `.macro-source-body` 에 적혀 있다.
   */
  return (
    <pre aria-labelledby={labelId} className="macro-source-body mono" role="region" tabIndex={0}>
      {source}
    </pre>
  )
}
