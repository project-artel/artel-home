import { useI18n } from '../i18n/useI18n'
import { formatDate, PLACEHOLDER } from '../projects/formatters'
import type { GameBuild } from '../projects/gameTypes'
import {
  relationToSelectedBuild,
  writtenBuildText,
  type DeveloperMacroSummary,
} from './developerMacroTypes'
import {
  firstDocstringLine,
  libraryDocstring,
  libraryParameterNames,
  type LibraryMacro,
} from './macroLibrary'
import { macroSignature } from './macroTypes'

/**
 * Macro 라이브러리의 표 (ARTEL-1102).
 *
 * 케이스 라이브러리의 표(`tcl-table`, `tct-row`)와 같은 줄 모양이다. 줄이 싣는 것은 셋뿐이다 —
 * 서명, docstring 첫 줄, 수정한 날. 한 화면에는 한 출처만 서므로 출처 칩은 없다. developer
 * macro 가 `현재` build(`referenceBuild`)와 다른 build 를 기준으로 쓰였으면 서명 뒤에 amber 칩
 * 하나가 더 선다. 나머지(기준 build, source, `screen`, 등록자)는 칩의 `title` 과 줄을 눌러 여는
 * sheet 의 몫이다. 기준 build 를 칸으로 두지 않은 이유는 label 이 붙으면 칸이 넘쳐 서명 칸을
 * 줄이기 때문이다.
 *
 * 줄 전체가 눌리지만, 키보드로 닿는 것은 서명 button 이다. 케이스 라이브러리는 표 바깥의
 * 키 처리로 줄을 옮기는데, 읽기만 하는 이 표에는 그 장치를 들이지 않았다.
 */
export function MacroLibraryList({
  builds,
  items,
  onOpen,
  referenceBuild,
  selectedKey,
}: {
  builds: GameBuild[]
  items: LibraryMacro[]
  onOpen: (key: string) => void
  /** developer macro 의 기준 build 와 비교할 build(`현재`). 없으면 칩을 그리지 않는다. */
  referenceBuild: GameBuild | undefined
  selectedKey: string | null
}) {
  const { t } = useI18n()
  const copy = t.macros

  return (
    <table aria-label={copy.section.listLabel} className="tcl-table macro-table">
      <colgroup>
        <col className="mct-c-macro" />
        <col className="mct-c-doc" />
        <col className="mct-c-updated" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{copy.columns.macro}</th>
          <th scope="col">{copy.columns.docstring}</th>
          <th scope="col">{copy.columns.updated}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => {
          const picked = item.key === selectedKey
          const docstringLine = firstDocstringLine(libraryDocstring(item))
          return (
            <tr
              aria-current={picked ? true : undefined}
              className={'tct-row' + (picked ? ' picked' : '')}
              key={item.key}
              onClick={() => onOpen(item.key)}
            >
              <td className="tct-step">
                <span className="tct-step-in">
                  <button
                    className="macro-row-open mono"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpen(item.key)
                    }}
                    type="button"
                  >
                    <span className="macro-row-name">{item.name}</span>
                    {macroSignature(libraryParameterNames(item).map((name) => ({ name, type: null })))}
                  </button>
                  {item.origin === 'developer' && (
                    <MacroRelationChip builds={builds} macro={item.macro} referenceBuild={referenceBuild} />
                  )}
                </span>
              </td>
              <td className="tct-quiet" title={docstringLine.length > 0 ? docstringLine : undefined}>
                {docstringLine.length > 0 ? docstringLine : PLACEHOLDER}
              </td>
              <td className="tct-quiet mono">{formatDate(item.macro.updatedAt)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/**
 * developer macro 를 쓸 때 기준으로 삼은 build 가 `현재` build 와 다를 때만 서는 칩 하나.
 *
 * `older` 만 `이전 버전` 으로 따로 말하고, `newer` 와 `different` 는 둘 다 `다른 버전` 이다.
 * 어느 build 를 기준으로 썼는지는 `title` 에 남기고, sheet 의 메타 줄에도 글로 적는다.
 *
 * 경고 색이지만 "쓰지 말라" 는 뜻이 아니다. QA 엔진은 build 와 상관없이 전부 받으므로, 칩이
 * 말하는 것은 build 의 앞뒤뿐이다.
 */
export function MacroRelationChip({
  builds,
  macro,
  referenceBuild,
}: {
  builds: GameBuild[]
  macro: DeveloperMacroSummary
  referenceBuild: GameBuild | undefined
}) {
  const { t } = useI18n()
  if (referenceBuild === undefined) return null
  const relation = relationToSelectedBuild(macro.gameBuildId, referenceBuild, builds)
  if (relation === 'same') return null

  const buildText = writtenBuildText(macro, builds, t.projects.builds.editorLabel)
  return (
    <span className="macro-build-chip macro-build-chip--differs" title={t.macros.meta.writtenAgainst(buildText)}>
      {relation === 'older' ? t.macros.relation.older : t.macros.relation.other}
    </span>
  )
}
