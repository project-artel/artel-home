import { useMemo } from 'react'
import { useI18n } from '../i18n/useI18n'
import { formatDateTime } from '../projects/formatters'
import { compareMacros, macroScreenLabel, macroSignature, type MacroSummary } from './macroTypes'

/**
 * 이 빌드의 macro 목록. 두 묶음으로 갈려 있다.
 *
 * 가르는 규칙은 `screens` 가 비었는가 하나뿐이고, 그래서 여기 `filter` 두 번으로 산다.
 * 별도 모듈로 빼지 않은 이유는 짧아서가 아니라, 빈 `screens` 가 무슨 뜻인지를 두 번째
 * 파일에 또 적게 되기 때문이다. 그 뜻은 `macroTypes.ts` 의 `MacroSummary.screens` 가
 * 한 번 말한다.
 *
 * 빈 묶음은 머리글째 그리지 않는다. 전부 달려 있는 빌드에서 "미정 · 0" 머리글은
 * 없는 문제를 가리키고, 전부 미정인 빌드에서 "달림 · 0" 도 마찬가지다.
 */
export function MacroList({
  macros,
  onSelect,
  selectedNumber,
}: {
  macros: MacroSummary[]
  onSelect: (number: string) => void
  selectedNumber: string | null
}) {
  const { t } = useI18n()
  const copy = t.macros.list

  const { attached, unattached } = useMemo(() => {
    const sorted = [...macros].sort(compareMacros)
    return {
      attached: sorted.filter((macro) => macro.screens.length > 0),
      unattached: sorted.filter((macro) => macro.screens.length === 0),
    }
  }, [macros])

  return (
    <div className="macro-list" aria-label={copy.label} role="group">
      {attached.length > 0 && (
        <section className="macro-group">
          <h3 className="macro-group-heading">{copy.attachedHeading(attached.length)}</h3>
          <ul className="macro-group-items">
            {attached.map((macro) => (
              <MacroRow
                key={macro.number}
                macro={macro}
                onSelect={onSelect}
                selected={macro.number === selectedNumber}
              />
            ))}
          </ul>
        </section>
      )}

      {unattached.length > 0 && (
        <section className="macro-group">
          <h3 className="macro-group-heading">{copy.unattachedHeading(unattached.length)}</h3>
          {/* 빈 뱃지 칸에서 사용자가 혼자 추론하게 두지 않는다. 빈 관계가 "미정"
              이라는 것과 "아무 데서나 된다"가 아니라는 것, 둘 다 글로 적는다. */}
          <p className="macro-group-copy">{copy.unattachedCopy}</p>
          <ul className="macro-group-items">
            {unattached.map((macro) => (
              <MacroRow
                key={macro.number}
                macro={macro}
                onSelect={onSelect}
                selected={macro.number === selectedNumber}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

/**
 * 한 줄. 이름과 서명은 등폭이다 — 둘 다 코드에서 온 식별자이고, 비례 글꼴로 섞어 놓으면
 * `openShop` 과 `open5hop` 이 같아 보인다.
 *
 * 화살표 키를 가로채지 않는다. 평범한 button 들이라 tab 으로 닿고, `KnowledgeInspector`
 * 의 항목 목록과 같은 모양이다.
 */
function MacroRow({
  macro,
  onSelect,
  selected,
}: {
  macro: MacroSummary
  onSelect: (number: string) => void
  selected: boolean
}) {
  const { t } = useI18n()
  const copy = t.macros.list

  return (
    <li>
      <button
        aria-current={selected ? 'true' : undefined}
        className={selected ? 'macro-row macro-row--selected' : 'macro-row'}
        onClick={() => onSelect(macro.number)}
        type="button"
      >
        <span className="macro-row-signature mono">
          <span className="macro-row-name">{macro.name}</span>
          {macroSignature(macro.parameters)}
        </span>
        <span className="macro-row-meta">
          {macro.screens.map((screen) => (
            <span className="macro-screen-badge" key={screen.id}>
              {macroScreenLabel(t, screen)}
            </span>
          ))}
          <span className="macro-row-updated">{copy.updatedAt(formatDateTime(macro.updatedAt))}</span>
        </span>
      </button>
    </li>
  )
}
