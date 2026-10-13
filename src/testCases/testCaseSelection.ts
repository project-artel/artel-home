import { MAX_BULK_SELECTION } from './testCaseTypes'

/*
 * 케이스 라이브러리의 다중 선택 규칙.
 *
 * 컴포넌트가 아니라 이 파일에 두는 이유는 두 가지다. 규칙이 순수 함수라 렌더 없이 테스트할 수
 * 있고, 일괄 삭제와 폴더 이동(ARTEL-970)이 같은 선택을 읽기 때문이다. 선택은 id 의 집합이며,
 * 모든 함수는 받은 Set 을 바꾸지 않고 새 Set 을 돌려준다. 바뀐 것이 없을 때만 같은 참조를
 * 돌려주는 함수는 아래에 따로 적어 두었다.
 */

/** 보이는 목록 전체를 고르는 checkbox 가 그릴 상태. `some` 이 indeterminate 다. */
export type VisibleSelectionState = 'none' | 'some' | 'all'

/**
 * 한 줄을 고르거나 푼다. 이미 고른 줄은 상한과 상관없이 풀 수 있고, 새로 고르는 줄은
 * 상한에 닿았으면 무시한다(같은 Set 을 돌려준다).
 */
export function toggleSelection(
  selected: ReadonlySet<string>,
  caseId: string,
  limit: number = MAX_BULK_SELECTION,
): ReadonlySet<string> {
  const next = new Set(selected)
  if (next.delete(caseId)) return next
  if (selected.size >= limit) return selected

  next.add(caseId)
  return next
}

/** 상한 안에서 고를 수 있는 줄, 즉 보이는 목록의 앞 `limit` 건. */
function selectableIds(visibleIds: readonly string[], limit: number): readonly string[] {
  return visibleIds.slice(0, limit)
}

/**
 * 보이는 목록 전체를 고르거나 푼다.
 *
 * 고를 수 있는 줄이 이미 모두 선택돼 있으면 비우고, 아니면 그 줄들로 선택을 바꾼다. 보이는
 * 줄이 상한보다 많으면 앞 `limit` 건만 고른다 — 뒤쪽을 조용히 빼 놓는 대신 화면이 상한 안내를
 * 보인다.
 */
export function toggleAllVisible(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
  limit: number = MAX_BULK_SELECTION,
): ReadonlySet<string> {
  const selectable = selectableIds(visibleIds, limit)
  if (selectable.length > 0 && selectable.every((caseId) => selected.has(caseId))) {
    return new Set()
  }
  return new Set(selectable)
}

/**
 * 보이는 목록에 없는 id 를 선택에서 뺀다. 바뀐 것이 없으면 받은 Set 을 그대로 돌려준다 —
 * render 중에 `selected !== pruned` 로 비교해 상태를 갱신하는 호출부가 있어서, 같은 내용의
 * 새 Set 을 돌려주면 render 가 끝나지 않는다.
 */
export function pruneToVisible(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
): ReadonlySet<string> {
  if (selected.size === 0) return selected

  const visible = new Set(visibleIds)
  const kept = [...selected].filter((caseId) => visible.has(caseId))
  return kept.length === selected.size ? selected : new Set(kept)
}

export function describeVisibleSelection(
  selected: ReadonlySet<string>,
  visibleIds: readonly string[],
  limit: number = MAX_BULK_SELECTION,
): VisibleSelectionState {
  if (selected.size === 0) return 'none'

  const selectable = selectableIds(visibleIds, limit)
  const isEverySelectableSelected =
    selectable.length > 0 && selectable.every((caseId) => selected.has(caseId))
  return isEverySelectableSelected ? 'all' : 'some'
}
