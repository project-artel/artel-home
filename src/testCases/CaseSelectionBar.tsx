import { Button } from '../design-system/primitives/Button'
import { useI18n } from '../i18n/useI18n'
import { MAX_BULK_SELECTION } from './testCaseTypes'

/** 선택에 거는 동작 하나. 폴더 화면은 폴더에서 빼기 · 숨기기 같은 것을 더 단다(ARTEL-1024). */
export type SelectionAction = { label: string; onClick: () => void }

/** 고른 케이스의 건수와, 그 선택에 거는 동작. 선택이 없으면 부르는 쪽이 그리지 않는다. */
export function CaseSelectionBar({
  actions = [],
  count,
  isLimitReached,
  limitNoteId,
  moveLabel,
  onClear,
  onDelete,
  onMove,
}: {
  actions?: readonly SelectionAction[]
  /** 폴더 버튼의 이름. 없으면 "폴더로 이동" 이다. */
  moveLabel?: string
  count: number
  isLimitReached: boolean
  /** 비활성이 된 행 checkbox 의 `aria-describedby` 가 가리키는 안내 문구의 id. */
  limitNoteId: string
  onClear: () => void
  onDelete: () => void
  onMove: () => void
}) {
  const { t } = useI18n()
  const m = t.testCases

  return (
    <div className="tcl-selection-bar">
      <span className="tcl-selection-count" role="status">{m.selection.count(count)}</span>
      {isLimitReached && (
        <span className="tcl-selection-note" id={limitNoteId} title={m.selection.limitNote(MAX_BULK_SELECTION)}>
          {m.selection.limitNote(MAX_BULK_SELECTION)}
        </span>
      )}
      <span className="tcl-selection-spacer" />
      <Button variant="secondary" size="compact" onClick={onClear} type="button">
        {m.selection.clear}
      </Button>
      <Button variant="secondary" size="compact" onClick={onMove} type="button">
        {moveLabel ?? m.moveCases.action}
      </Button>
      {actions.map((action) => (
        <Button
          variant="secondary" size="compact"
          key={action.label}
          onClick={action.onClick}
          type="button"
        >
          {action.label}
        </Button>
      ))}
      <Button variant="danger" size="compact" onClick={onDelete} type="button">
        {m.bulkDelete.action}
      </Button>
    </div>
  )
}
