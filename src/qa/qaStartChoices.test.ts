import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPTY_ARCH_SELECTION, archEngine } from './qaArch'
import { LAST_ARCH_STORAGE_KEY, readLastArch, storeLastArch } from './qaStartChoices'

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

test('last arch round trips', () => {
  const storage = fakeStorage()
  const selection = { label: 'a', phase_cycle: 'off', fold_threshold_chars: 10 } as const
  storeLastArch(selection, storage)
  assert.deepEqual(readLastArch(storage), selection)
})

test('blocked storage reads as empty and does not throw on store', () => {
  assert.deepEqual(readLastArch(throwingStorage), EMPTY_ARCH_SELECTION)
  assert.doesNotThrow(() => storeLastArch({ label: 'a' }, throwingStorage))
})

test('broken JSON reads as the empty selection', () => {
  assert.deepEqual(readLastArch(fakeStorage({ [LAST_ARCH_STORAGE_KEY]: '{oops' })), EMPTY_ARCH_SELECTION)
})

test('engine 이 생기기 전에 저장된 값은 agent 엔진으로 그대로 읽힌다', () => {
  // ARTEL-1091 이 남긴 모양 그대로다. `engine` 키가 없다.
  const before = JSON.stringify({ label: 'home-phase-off', phase_cycle: 'off', fold_threshold_chars: 56000 })
  const read = readLastArch(fakeStorage({ [LAST_ARCH_STORAGE_KEY]: before }))
  assert.deepEqual(read, { label: 'home-phase-off', phase_cycle: 'off', fold_threshold_chars: 56000 })
  assert.equal(archEngine(read), 'agent')
})

test('planner_executer 와 남겨 둔 knob 이 같은 키에 함께 저장되고 돌아온다', () => {
  const storage = fakeStorage()
  const selection = { label: 'arm', phase_cycle: 'off', engine: 'planner_executer' } as const
  storeLastArch(selection, storage)
  assert.deepEqual(readLastArch(storage), selection)
})
