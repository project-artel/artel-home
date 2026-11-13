import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPTY_ARCH_SELECTION, archEngine } from './qaArch'
import { LAST_ARCH_STORAGE_KEY, readLastAdvancedSettings, storeLastAdvancedSettings } from './qaStartChoices'

function fakeStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  }
}

const throwingStorage = {
  getItem: (): string | null => {
    throw new Error('blocked')
  },
  setItem: (): void => {
    throw new Error('blocked')
  },
}

test('고급 설정은 프로젝트별로 한 번에 저장하고 복원한다', () => {
  const storage = fakeStorage()
  const settings = {
    arch: { label: 'a', phase_cycle: 'off' as const },
    functionOptions: { cheatMode: 'off' as const, behaviorMode: 'on' as const, allowedCheats: null, allowedBehaviors: ['walk'] },
    inputMode: 'os' as const,
  }
  storeLastAdvancedSettings('one', settings, storage)
  assert.deepEqual(readLastAdvancedSettings('one', storage), settings)
  assert.equal(readLastAdvancedSettings('two', storage).inputMode, 'virtual')
  assert.equal(readLastAdvancedSettings('two', storage).functionOptions.cheatMode, 'on')
})

test('기존 브라우저의 구조 설정과 입력 방식을 불러온다', () => {
  const storage = fakeStorage({
    [LAST_ARCH_STORAGE_KEY]: JSON.stringify({ label: 'arm', phase_cycle: 'off', engine: 'planner_executer' }),
    'artel.qa.lastInputMode.one': 'os',
  })
  const restored = readLastAdvancedSettings('one', storage)
  assert.deepEqual(restored.arch, { label: 'arm', phase_cycle: 'off' })
  assert.equal(archEngine(restored.arch), 'agent')
  assert.equal(restored.inputMode, 'os')
})

test('브라우저 저장소가 차단되면 고급 설정의 기본값으로 시작한다', () => {
  const defaults = readLastAdvancedSettings('one', throwingStorage)
  assert.deepEqual(defaults.arch, EMPTY_ARCH_SELECTION)
  assert.equal(defaults.inputMode, 'virtual')
  assert.doesNotThrow(() => storeLastAdvancedSettings('one', defaults, throwingStorage))
})
