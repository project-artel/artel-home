import { useCallback, useMemo, useState } from 'react'
import {
  describeVisibleSelection,
  pruneToVisible,
  resolveAnchor,
  selectRange,
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
  /** Shift 클릭과 Shift 화살표가 범위를 재는 기준 줄. 보이지 않게 되면 `null` 이다. */
  anchorId: string | null
  isSelected: (caseId: string) => boolean
  /** 한 줄을 넣거나 뺀다. checkbox 와 Ctrl 클릭이 쓰며, 그 줄이 새 시작점이 된다. */
  toggle: (caseId: string) => void
  /** 그냥 클릭: 선택을 비우고 그 줄을 시작점으로 삼는다. */
  anchorAt: (caseId: string) => void
  /**
   * 시작점부터 `caseId` 까지를 선택한다. `additive` 면 기존 선택에 더한다. 시작점이 없으면
   * `fallbackAnchorId`(키보드가 움직이기 직전의 커서 줄)를 시작점으로 삼고, 그것도 없으면 그
   * 줄을 토글한다.
   */
  selectRangeTo: (caseId: string, additive: boolean, fallbackAnchorId?: string | null) => void
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
  const [storedAnchor, setStoredAnchor] = useState<string | null>(null)

  const selectedIds = pruneToVisible(stored, visibleIds)
  if (selectedIds !== stored) setStored(selectedIds)
  // 시작점도 선택과 같이 render 중에 정리한다. 숨겨진 줄을 기준으로 범위를 재면 사용자가 볼 수
  // 없는 줄이 범위의 한쪽 끝이 된다.
  const anchorId = resolveAnchor(storedAnchor, visibleIds)
  if (anchorId !== storedAnchor) setStoredAnchor(anchorId)

  const toggle = useCallback((caseId: string) => {
    setStored((current) => toggleSelection(current, caseId))
    setStoredAnchor(caseId)
  }, [])
  const anchorAt = useCallback((caseId: string) => {
    setStored(new Set())
    setStoredAnchor(caseId)
  }, [])
  const selectRangeTo = useCallback(
    (caseId: string, additive: boolean, fallbackAnchorId: string | null = null) => {
      const rangeAnchor = anchorId ?? resolveAnchor(fallbackAnchorId, visibleIds)
      setStored((current) => selectRange(current, visibleIds, rangeAnchor, caseId, additive))
      // Shift 로 범위를 늘려 가는 동안 시작점은 그대로여야 한다. 시작점이 없었던 경우에만 정한다.
      if (rangeAnchor === null || anchorId === null) setStoredAnchor(rangeAnchor ?? caseId)
    },
    [anchorId, visibleIds],
  )
  const toggleVisible = useCallback(
    () => setStored((current) => toggleAllVisible(current, visibleIds)),
    [visibleIds],
  )
  const clear = useCallback(() => {
    setStored(new Set())
    setStoredAnchor(null)
  }, [])

  const visibleState = useMemo(
    () => describeVisibleSelection(selectedIds, visibleIds),
    [selectedIds, visibleIds],
  )

  return {
    selectedIds,
    count: selectedIds.size,
    isLimitReached: selectedIds.size >= MAX_BULK_SELECTION,
    visibleState,
    anchorId,
    isSelected: (caseId) => selectedIds.has(caseId),
    toggle,
    anchorAt,
    selectRangeTo,
    toggleAllVisible: toggleVisible,
    clear,
  }
}
