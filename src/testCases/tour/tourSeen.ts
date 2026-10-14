/*
 * 튜토리얼을 봤는지 브라우저에 적는다(ARTEL-1033). 서버에 두지 않는다 — 처음 쓰는 사람에게 한 번 보이는 안내라,
 * 브라우저를 바꾸면 한 번 더 보여도 해가 없다. 저장소를 못 쓰는 브라우저(사생활 모드 등)에서는 매번 보이지 않게
 * "본 것" 으로 친다 — 매번 튀어나오는 안내가 한 번 못 보는 것보다 나쁘다.
 */

export const TOUR_VERSION = 1

export function tourKey(tourId: string): string {
  return `artel.tour.${tourId}.v${TOUR_VERSION}`
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function storage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function hasSeenTour(tourId: string, store: StorageLike | null = storage()): boolean {
  if (store === null) return true
  try {
    return store.getItem(tourKey(tourId)) !== null
  } catch {
    return true
  }
}

export function markTourSeen(tourId: string, how: 'done' | 'skipped', store: StorageLike | null = storage()): void {
  try {
    store?.setItem(tourKey(tourId), how)
  } catch {
    // 적지 못하면 다음에 한 번 더 보일 뿐이다.
  }
}
