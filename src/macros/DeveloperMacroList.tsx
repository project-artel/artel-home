import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import type { GameBuild } from '../projects/gameTypes'
import {
  relationToSelectedBuild,
  writtenBuildText,
  type DeveloperMacroSummary,
} from './developerMacroTypes'
import { macroSignature } from './macroTypes'

/**
 * 프로젝트의 developer macro 목록 (ARTEL-1102).
 *
 * 줄 모양은 `MacroList` 의 `MacroRow` 를 따른다. 같은 `.macro-row` 이고, 이름과 서명이
 * 등폭인 이유도 같다. 다른 것은 칩이다 — `screen` 대신 쓸 때 기준으로 삼은 build 와,
 * 그 build 가 고른 build 와 다를 때 그 관계(`WrittenBuildRelation`)를 말하는 칩이 선다.
 *
 * `selectedBuild` 가 없으면(프로젝트에 build 가 하나도 없으면) 비교할 대상이 없으므로
 * relation 칩을 그리지 않는다.
 */
export function DeveloperMacroList({
  builds,
  macros,
  onSelect,
  selectedBuild,
  selectedName,
}: {
  builds: GameBuild[]
  macros: DeveloperMacroSummary[]
  onSelect: (name: string) => void
  selectedBuild: GameBuild | undefined
  selectedName: string | null
}) {
  const { t } = useI18n()

  return (
    <ul aria-label={t.macros.developer.listLabel} className="macro-group-items">
      {macros.map((macro) => (
        <DeveloperMacroRow
          builds={builds}
          key={macro.name}
          macro={macro}
          onSelect={onSelect}
          selected={macro.name === selectedName}
          selectedBuild={selectedBuild}
        />
      ))}
    </ul>
  )
}

/**
 * developer macro 가 하나도 없을 때. MCP 로 등록한다는 사실 한 줄만 적는다 — 설정 방법은
 * 설정 안내 화면의 몫이다. agent macro 의 빈 상태(`panel-message`)보다 작게 그린다. agent macro
 * 목록 아래에 `padding` 40px 짜리 빈 상자가 서면 빈 상태가 목록보다 먼저 눈에 들어온다.
 */
export function DeveloperMacroEmpty() {
  const { t } = useI18n()
  const copy = t.macros.developer

  return (
    <div className="macro-developer-empty">
      <p className="macro-developer-empty-title">{copy.emptyTitle}</p>
      <p className="macro-developer-empty-copy">{copy.emptyCopy}</p>
    </div>
  )
}

function DeveloperMacroRow({
  builds,
  macro,
  onSelect,
  selected,
  selectedBuild,
}: {
  builds: GameBuild[]
  macro: DeveloperMacroSummary
  onSelect: (name: string) => void
  selected: boolean
  selectedBuild: GameBuild | undefined
}) {
  return (
    <li>
      <button
        aria-current={selected ? 'true' : undefined}
        className={selected ? 'macro-row macro-row--selected' : 'macro-row'}
        onClick={() => onSelect(macro.name)}
        type="button"
      >
        <span className="macro-row-signature mono">
          <span className="macro-row-name">{macro.name}</span>
          {macroSignature(macro.parameters.map((name) => ({ name, type: null })))}
        </span>
        {macro.docstring.length > 0 && (
          <span className="macro-row-docstring">{macro.docstring}</span>
        )}
        <span className="macro-row-meta">
          <DeveloperMacroBuildChips builds={builds} macro={macro} selectedBuild={selectedBuild} />
          <span className="macro-row-updated">
            <DeveloperMacroRegistered macro={macro} />
          </span>
        </span>
      </button>
    </li>
  )
}

/**
 * 쓸 때 기준으로 삼은 build 칩과, 그 build 가 고른 build 와 다를 때의 relation 칩.
 *
 * relation 칩은 경고 색이지만 "쓰지 말라" 는 뜻이 아니다. QA 엔진은 build 와 상관없이 전부
 * 받으므로, 칩이 말하는 것은 build 의 앞뒤뿐이다. 색 하나로 말하지 않도록 글이 함께 간다.
 */
export function DeveloperMacroBuildChips({
  builds,
  macro,
  selectedBuild,
}: {
  builds: GameBuild[]
  macro: DeveloperMacroSummary
  selectedBuild: GameBuild | undefined
}) {
  const { t } = useI18n()
  const copy = t.macros.developer
  const buildText = writtenBuildText(macro, builds, t.projects.builds.editorLabel)
  const relation =
    selectedBuild === undefined
      ? 'same'
      : relationToSelectedBuild(macro.gameBuildId, selectedBuild, builds)

  return (
    <>
      <span className="macro-build-chip">{copy.writtenAgainst(buildText)}</span>
      {relation !== 'same' && (
        <span className="macro-build-chip macro-build-chip--differs" title={copy.relationTitle[relation]}>
          {copy.relation[relation]}
        </span>
      )}
    </>
  )
}

/** `nubuli 등록 · 10월 16일 14:02`. 등록한 사람을 지웠으면 시각만 남는다. */
export function DeveloperMacroRegistered({ macro }: { macro: DeveloperMacroSummary }) {
  const { t } = useI18n()
  const copy = t.macros.developer
  const date = formatDateTime(macro.updatedAt)

  return macro.updatedBy === null
    ? copy.registeredAt(date)
    : copy.registeredBy(macro.updatedBy.nickname, date)
}
