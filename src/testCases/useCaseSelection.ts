import { useCallback, useMemo, useState } from 'react'
import {
  describeVisibleSelection,
  pruneToVisible,
  toggleAllVisible,
  toggleSelection,
  type VisibleSelectionState,
} from './testCaseSelection'
import { MAX_BULK_SELECTION } from './testCaseTypes'

export type CaseSelection = {
  selectedIds: ReadonlySet<string>
  count: number
  /** 상한에 닿았다. 아직 고르지 않은 줄은 더 고를 수 없다. */
  isLimitReached: boolean
  /** 보이는 목록 전체를 고르는 checkbox 가 그릴 상태. */
  visibleState: VisibleSelectionState
  isSelected: (caseId: string) => boolean
  toggle: (caseId: string) => void
  toggleAllVisible: () => void
  clear: () => void
}

/**
 * 목록에서 고른 test case 의 id 집합.
 *
 * 일괄 삭제와 폴더 이동이 이 hook 하나를 읽는다. 둘 다 `selectedIds` 를 요청에 싣고, 끝나면
 * `clear` 를 부른다.
 *
 * 필터가 바뀌어 보이지 않게 된 줄은 render 중에 선택에서 뺀다. effect 로 빼면 한 frame 동안
 * 숨은 줄이 건수와 삭제 대상에 남는다. `pruneToVisible` 이 바뀐 것이 없으면 같은 Set 을
 * 돌려주므로, 아래의 비교가 render 를 반복시키지 않는다.
 */
export function useCaseSelection(visibleIds: readonly string[]): CaseSelection {
  const [stored, setStored] = useState<ReadonlySet<string>>(() => new Set())

  const selectedIds = pruneToVisible(stored, visibleIds)
  if (selectedIds !== stored) setStored(selectedIds)

  const toggle = useCallback(
    (caseId: string) => setStored((current) => toggleSelection(current, caseId)),
    [],
  )
  const toggleVisible = useCallback(
    () => setStored((current) => toggleAllVisible(current, visibleIds)),
    [visibleIds],
  )
  const clear = useCallback(() => setStored(new Set()), [])

  const visibleState = useMemo(
    () => describeVisibleSelection(selectedIds, visibleIds),
    [selectedIds, visibleIds],
  )

  return {
    selectedIds,
    count: selectedIds.size,
    isLimitReached: selectedIds.size >= MAX_BULK_SELECTION,
    visibleState,
    isSelected: (caseId) => selectedIds.has(caseId),
    toggle,
    toggleAllVisible: toggleVisible,
    clear,
  }
}
