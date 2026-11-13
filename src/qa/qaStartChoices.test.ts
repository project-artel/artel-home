import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPTY_ARCH_SELECTION, archEngine } from './qaArch'
import { LAST_ARCH_STORAGE_KEY, readLastAdvancedSettings, readLastModelKey, storeLastAdvancedSettings, storeLastModelKey } from './qaStartChoices'

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

test('마지막 모델 선택은 프로젝트별로 저장되고 키 출처를 유지한다', () => {
  const storage = fakeStorage()
  storeLastModelKey('one', 'platform:openai/example', storage)
  storeLastModelKey('two', 'user:openai/example', storage)
  assert.equal(readLastModelKey('one', storage), 'platform:openai/example')
  assert.equal(readLastModelKey('two', storage), 'user:openai/example')
  storeLastModelKey('one', 'user:openai/example', storage)
  assert.equal(readLastModelKey('one', storage), 'user:openai/example')
  assert.equal(readLastModelKey('three', storage), null)
})

test('저장소가 차단되어도 모델 선택을 읽고 저장할 때 예외가 발생하지 않는다', () => {
  assert.equal(readLastModelKey('one', throwingStorage), null)
  assert.doesNotThrow(() => storeLastModelKey('one', 'platform:openai/example', throwingStorage))
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
