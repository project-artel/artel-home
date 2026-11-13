import { EMPTY_ARCH_SELECTION, parseArchSelection, withEngine, type QaArchSelection } from './qaArch'
import { asRecord } from '../projects/projectApi'
import { DEFAULT_QA_FUNCTION_OPTIONS, parseQaTryFunctionOptions, type QaFunctionOptions } from './qaFunctionOptions'
import type { QaInputMode } from './qaTypes'

export const LAST_ARCH_STORAGE_KEY = 'artel.qa.lastArch'

type ReadableStorage = Pick<Storage, 'getItem' | 'setItem'>

function storageOf(storage?: ReadableStorage): ReadableStorage {
  return storage ?? window.localStorage
}

function readLastArch(storage?: ReadableStorage): QaArchSelection {
  try {
    const text = storageOf(storage).getItem(LAST_ARCH_STORAGE_KEY)
    if (text === null) return EMPTY_ARCH_SELECTION
    const stored = parseArchSelection(JSON.parse(text))
    return stored === null ? EMPTY_ARCH_SELECTION : withEngine(stored, 'agent')
  } catch {
    return EMPTY_ARCH_SELECTION
  }
}

export type QaAdvancedSettings = {
  arch: QaArchSelection
  functionOptions: QaFunctionOptions
  inputMode: QaInputMode
}

export function readLastAdvancedSettings(projectId: string, storage?: ReadableStorage): QaAdvancedSettings {
  const defaults: QaAdvancedSettings = {
    arch: EMPTY_ARCH_SELECTION,
    functionOptions: DEFAULT_QA_FUNCTION_OPTIONS,
    inputMode: 'virtual',
  }
  try {
    const browserStorage = storageOf(storage)
    const text = browserStorage.getItem(`artel.qa.lastAdvancedSettings.${projectId}`)
    if (text === null) {
      return {
        ...defaults,
        arch: readLastArch(browserStorage),
        inputMode: browserStorage.getItem(`artel.qa.lastInputMode.${projectId}`) === 'os' ? 'os' : 'virtual',
      }
    }

    const saved = asRecord(JSON.parse(text))
    const arch = parseArchSelection(saved?.arch)
    const options = parseQaTryFunctionOptions(saved?.functionOptions)
    return {
      arch: arch === null ? EMPTY_ARCH_SELECTION : withEngine(arch, 'agent'),
      functionOptions: {
        cheatMode: options?.cheatMode ?? DEFAULT_QA_FUNCTION_OPTIONS.cheatMode,
        behaviorMode: options?.behaviorMode ?? DEFAULT_QA_FUNCTION_OPTIONS.behaviorMode,
        allowedCheats: options?.allowedCheats ?? null,
        allowedBehaviors: options?.allowedBehaviors ?? null,
      },
      inputMode: saved?.inputMode === 'os' ? 'os' : 'virtual',
    }
  } catch {
    return defaults
  }
}

export function storeLastAdvancedSettings(projectId: string, settings: QaAdvancedSettings, storage?: ReadableStorage): void {
  try {
    storageOf(storage).setItem(`artel.qa.lastAdvancedSettings.${projectId}`, JSON.stringify(settings))
  } catch {
    // 브라우저에서 저장을 차단해도 실행은 이어간다.
  }
}
