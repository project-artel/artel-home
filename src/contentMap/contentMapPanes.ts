/*
 * content map 의 두 곁 pane 을 접은 선택.
 *
 * `projects/workspace/navCollapse.ts` 와 같은 이유로 세션을 넘어 남는다. 한 번 접은 사람이 빌드를
 * 옮길 때마다 다시 접어야 한다면 접기 자체가 쓸모없다. 다른 점은 pane 이 둘이라는 것뿐이라, 키만
 * 둘이고 나머지는 그쪽과 같은 모양이다.
 *
 * 두 값을 한 객체로 묶어 한 키에 넣지 않는다. 한쪽을 접는 일과 다른 쪽을 접는 일은 서로 무관하고,
 * 묶어 두면 저장한 JSON 의 모양이 바뀌는 날 둘 다 기본값으로 돌아간다.
 */

import { useCallback, useState } from 'react'

const TREE_KEY = 'artel.contentMap.treeCollapsed'
const INSPECTOR_KEY = 'artel.contentMap.inspectorCollapsed'

export type ContentMapPane = 'tree' | 'inspector'

function keyOf(pane: ContentMapPane): string {
  return pane === 'tree' ? TREE_KEY : INSPECTOR_KEY
}

/**
 * pane 하나의 펼침 상태와 그것을 뒤집는 함수.
 *
 * 상태와 저장을 한 자리에 묶는 이유는 둘을 떼어 놓으면 호출자가 매번 `setOpen(!open)` 과
 * `store(pane, open)` 을 나란히 써야 하기 때문이다. 저장에 넘기는 값은 뒤집기 **전**의 `open`
 * 인데, 그것이 마침 뒤집은 뒤의 `collapsed` 와 같다 — 맞는 코드지만 읽는 사람이 매번 한 번
 * 멈추고, pane 이 둘이라 그 멈춤이 두 번 생긴다.
 */
export function usePaneOpen(pane: ContentMapPane): [boolean, () => void] {
  const [open, setOpen] = useState(() => !readPaneCollapsed(pane))

  // 저장은 updater 밖에서 한다. updater 안에 두면 StrictMode 가 그것을 두 번 부르고, 순수해야
  // 하는 자리에서 storage 를 건드리게 된다.
  const toggle = useCallback(() => {
    const next = !open
    setOpen(next)
    storePaneCollapsed(pane, !next)
  }, [open, pane])

  return [open, toggle]
}

export function readPaneCollapsed(pane: ContentMapPane): boolean {
  try {
    return window.localStorage.getItem(keyOf(pane)) === 'true'
  } catch {
    // private mode 등에서 storage 가 막힐 수 있다. 펼친 상태가 기본값이다.
    return false
  }
}

export function storePaneCollapsed(pane: ContentMapPane, collapsed: boolean): void {
  try {
    window.localStorage.setItem(keyOf(pane), String(collapsed))
  } catch {
    // 저장에 실패해도 다음 방문에 기본값으로 돌아갈 뿐이라 알릴 일은 아니다.
  }
}
