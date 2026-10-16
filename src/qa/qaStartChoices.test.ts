import assert from 'node:assert/strict'
import test from 'node:test'
import { EMPTY_ARCH_SELECTION } from './qaArch'
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
