/*
 * QA run 을 시작할 때 마지막으로 고른 agent 구조(ARTEL-1091).
 *
 * 테스트 런 · 게임 · 모델 · reasoning 의 기본값은 서버의 실행 기록에서 읽는다.
 * 직접 고른 모델은 이 브라우저에 즉시 저장하고 다음에 화면을 열 때 우선 적용한다.
 * agent 구조는 run 을 시작할 때 저장한다.
 *
 * 엔진은 기억하지 않는다. 화면을 열면 늘 `agent` 가 골라져 있고, 다른 엔진은 그때 눌러서 고른다.
 */

import { EMPTY_ARCH_SELECTION, parseArchSelection, withEngine, type QaArchSelection } from './qaArch'

export const LAST_ARCH_STORAGE_KEY = 'artel.qa.lastArch'

type ReadableStorage = Pick<Storage, 'getItem' | 'setItem'>

function storageOf(storage?: ReadableStorage): ReadableStorage {
  return storage ?? window.localStorage
}

export function readLastArch(storage?: ReadableStorage): QaArchSelection {
  try {
    const text = storageOf(storage).getItem(LAST_ARCH_STORAGE_KEY)
    if (text === null) return EMPTY_ARCH_SELECTION
    const stored = parseArchSelection(JSON.parse(text))
    return stored === null ? EMPTY_ARCH_SELECTION : withEngine(stored, 'agent')
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

export function readLastModelKey(projectId: string, storage?: ReadableStorage): string | null {
  try {
    return storageOf(storage).getItem(`artel.qa.lastModel.${projectId}`)
  } catch {
    return null
  }
}

export function storeLastModelKey(projectId: string, modelKey: string, storage?: ReadableStorage): void {
  try {
    storageOf(storage).setItem(`artel.qa.lastModel.${projectId}`, modelKey)
  } catch {
    // 브라우저에서 저장을 차단해도 이번 화면에서는 선택을 유지한다.
  }
}
