/*
 * QA run 을 시작할 때 마지막으로 고른 agent 구조(ARTEL-1091).
 *
 * 테스트 런 · 게임 · 모델 · reasoning 은 서버의 실행 기록(`listProjectQaRuns`)에서 마지막 조합을
 * 읽어 첫 선택으로 쓴다(ARTEL-1084). agent 구조는 그 기록에 없으므로 이 브라우저에 남긴다.
 *
 * 저장은 선택을 바꿀 때마다가 아니라 run 을 시작하는 순간에 한다. 고르다 만 값이 아니라 실제로
 * 돌린 값만 다음 폼의 기본값이 되게 하려는 것이다. 저장이 막혀 있으면 기억하지 않는다.
 */

import { EMPTY_ARCH_SELECTION, parseArchSelection, type QaArchSelection } from './qaArch'

export const LAST_ARCH_STORAGE_KEY = 'artel.qa.lastArch'

type ReadableStorage = Pick<Storage, 'getItem' | 'setItem'>

function storageOf(storage?: ReadableStorage): ReadableStorage {
  return storage ?? window.localStorage
}

export function readLastArch(storage?: ReadableStorage): QaArchSelection {
  try {
    const text = storageOf(storage).getItem(LAST_ARCH_STORAGE_KEY)
    if (text === null) return EMPTY_ARCH_SELECTION
    return parseArchSelection(JSON.parse(text)) ?? EMPTY_ARCH_SELECTION
  } catch {
    return EMPTY_ARCH_SELECTION
  }
}

export function storeLastArch(selection: QaArchSelection, storage?: ReadableStorage): void {
  try {
    storageOf(storage).setItem(LAST_ARCH_STORAGE_KEY, JSON.stringify(selection))
  } catch {
    // private mode 등. 이번 화면에서만 기억한다.
  }
}
