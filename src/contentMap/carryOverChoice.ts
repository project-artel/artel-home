/*
 * TC 를 생성할 때 앞 버전의 사용자 생성 TC 를 이어 넣을지 고른 값.
 *
 * 생성할 때마다 고르지만, 매번 다시 고르게 하면 기본값과 다르게 쓰는 사람은 버튼 앞에서 늘 한 번
 * 더 손이 간다. 그래서 마지막 선택을 이 브라우저에 남긴다. 저장이 막혀 있으면 서버 기본값과 같은
 * "이어 넣는다" 로 돌아간다.
 */

const KEY = 'artel.contentMap.carryOverManualCases'

function storageOf(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  return storage ?? window.localStorage
}

export function readCarryOver(storage?: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  try {
    return storageOf(storage).getItem(KEY) !== 'false'
  } catch {
    return true
  }
}

export function storeCarryOver(carryOver: boolean, storage?: Pick<Storage, 'getItem' | 'setItem'>): void {
  try {
    storageOf(storage).setItem(KEY, String(carryOver))
  } catch {
    // private mode 등. 이번 화면에서만 기억한다.
  }
}

const VERDICTS_KEY = 'artel.contentMap.carryVerdicts'

/**
 * TC 를 생성할 때 내용이 같은 케이스가 앞 버전 판정을 이어받게 할지 고른 값(ARTEL-1180). 사용자 생성 TC 와 같은 까닭으로
 * 마지막 선택을 남기고, 못 읽으면 이어받는다.
 */
export function readCarryVerdicts(storage?: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  try {
    return storageOf(storage).getItem(VERDICTS_KEY) !== 'false'
  } catch {
    return true
  }
}

export function storeCarryVerdicts(carry: boolean, storage?: Pick<Storage, 'getItem' | 'setItem'>): void {
  try {
    storageOf(storage).setItem(VERDICTS_KEY, String(carry))
  } catch {
    // private mode 등. 이번 화면에서만 기억한다.
  }
}
