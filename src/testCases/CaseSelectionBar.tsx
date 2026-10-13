import { useI18n } from '../i18n/useI18n'
import { MAX_BULK_SELECTION } from './testCaseTypes'

/** 고른 케이스의 건수와, 그 선택에 거는 동작. 선택이 없으면 부르는 쪽이 그리지 않는다. */
export function CaseSelectionBar({
  count,
  isLimitReached,
  limitNoteId,
  onClear,
  onDelete,
}: {
  count: number
  isLimitReached: boolean
  /** 비활성이 된 행 checkbox 의 `aria-describedby` 가 가리키는 안내 문구의 id. */
  limitNoteId: string
  onClear: () => void
  onDelete: () => void
}) {
  const { t } = useI18n()
  const m = t.testCases

  return (
    <div className="tcl-selection-bar">
      <span className="tcl-selection-count" role="status">{m.selection.count(count)}</span>
      {isLimitReached && (
        <span className="tcl-selection-note" id={limitNoteId}>
          {m.selection.limitNote(MAX_BULK_SELECTION)}
        </span>
      )}
      <span className="tcl-selection-spacer" />
      <button className="button button--secondary button--compact" onClick={onClear} type="button">
        {m.selection.clear}
      </button>
      <button className="button button--danger button--compact" onClick={onDelete} type="button">
        {m.bulkDelete.action}
      </button>
    </div>
  )
}
