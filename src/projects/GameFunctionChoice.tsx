import { useId, type ReactNode } from 'react'
import { useI18n } from '../i18n/useI18n'
import type { FunctionChoiceKind } from './gameFunctions'

const KINDS: FunctionChoiceKind[] = ['all', 'none', 'chosen']

/** 목록의 한 줄. catalog 에 없는 이름은 `description` 이 null 이고 `note` 로 그 사실을 붙인다. */
export type FunctionChoiceEntry = {
  name: string
  description: string | null
  note?: string
}

/**
 * cheat 나 behavior 한 축을 전부 · 없음 · 직접 선택 셋 중 하나로 고르는 칸(ARTEL-1055).
 *
 * run 시작의 고급 설정과 test case 편집기가 같은 칸을 써서 두 화면이 같은 모양이다. "직접 선택" 일 때만
 * 이름과 한 줄 설명이 붙은 체크박스 목록이 열리고, 머리 줄 오른쪽에 고른 개수가 보인다.
 */
export function GameFunctionChoice({
  chosen,
  emptyNote,
  entries,
  footer,
  kind,
  label,
  onKindChange,
  onToggle,
}: {
  /** 지금 체크된 이름. */
  chosen: readonly string[]
  /** "직접 선택" 인데 목록이 비었을 때 보일 문구. */
  emptyNote: string
  entries: FunctionChoiceEntry[]
  /** 목록 아래에 붙일 안내. */
  footer?: ReactNode
  kind: FunctionChoiceKind
  label: string
  onKindChange: (kind: FunctionChoiceKind) => void
  onToggle: (name: string) => void
}) {
  const { t } = useI18n()
  const m = t.gameFunctions.choice
  const labelId = useId()
  const labels: Record<FunctionChoiceKind, string> = { all: m.all, none: m.none, chosen: m.chosen }
  const checkedCount = entries.filter((entry) => chosen.includes(entry.name)).length

  return (
    <div className="gf-choice">
      <div className="gf-choice-head">
        <span className="gf-choice-label" id={labelId}>{label}</span>
        {kind === 'chosen' && entries.length > 0 && (
          <span className="gf-choice-count">{m.count(checkedCount, entries.length)}</span>
        )}
      </div>

      <div aria-labelledby={labelId} className="gf-seg" role="radiogroup">
        {KINDS.map((candidate) => (
          <button
            aria-checked={kind === candidate}
            className={'gf-seg-item' + (kind === candidate ? ' is-on' : '')}
            key={candidate}
            onClick={() => onKindChange(candidate)}
            role="radio"
            type="button"
          >
            {labels[candidate]}
          </button>
        ))}
      </div>

      {kind === 'chosen' &&
        (entries.length === 0 ? (
          <p className="gf-note">{emptyNote}</p>
        ) : (
          <ul aria-labelledby={labelId} className="gf-choice-list">
            {entries.map((entry) => (
              <li key={entry.name}>
                <label className="gf-choice-item">
                  <input checked={chosen.includes(entry.name)} onChange={() => onToggle(entry.name)} type="checkbox" />
                  <span className="gf-choice-text">
                    <span className="gf-choice-name">
                      <span className="mono" translate="no">{entry.name}</span>
                      {entry.note !== undefined && <span className="gf-chip">{entry.note}</span>}
                    </span>
                    {entry.description !== null && entry.description !== '' && (
                      <span className="gf-choice-desc" title={entry.description}>{entry.description}</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        ))}
      {kind === 'chosen' && footer}
    </div>
  )
}
