const STORAGE_KEY = 'artel.projectNavCollapsed'

/**
 * 레일을 접은 선택은 세션을 넘어 유지된다. 좁은 화면에서 한 번 접은 사람이
 * 프로젝트를 옮길 때마다 다시 접어야 한다면 접기 자체가 쓸모없어진다.
 */
export function readNavCollapsed(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    // private mode 등에서 storage 가 막힐 수 있다. 펼친 상태가 기본값이다.
    return false
  }
}

export function storeNavCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed))
  } catch {
    // 저장에 실패해도 다음 방문에 기본값으로 돌아갈 뿐이라 알릴 일은 아니다.
  }
}

const LAB_OPEN_KEY = 'artel.projectNavLabOpen'

/** 사이드바 맨 아래 실험실 묶음을 펴 두었나(ARTEL-1379). 처음에는 접혀 있다. */
export function readLabOpen(): boolean {
  try {
    return window.localStorage.getItem(LAB_OPEN_KEY) === 'true'
  } catch {
    return false
  }
}

export function storeLabOpen(open: boolean): void {
  try {
    window.localStorage.setItem(LAB_OPEN_KEY, String(open))
  } catch {
    // 저장에 실패해도 다음 방문에 접힌 채로 열릴 뿐이다.
  }
}
