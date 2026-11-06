import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readCarryOver, storeCarryOver } from './carryOverChoice.ts'

function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

test('고른 적 없으면 이어 넣는다', () => {
  assert.equal(readCarryOver(memory()), true)
})

test('마지막 선택을 기억한다', () => {
  const storage = memory()
  storeCarryOver(false, storage)
  assert.equal(readCarryOver(storage), false)
  storeCarryOver(true, storage)
  assert.equal(readCarryOver(storage), true)
})

test('storage 가 막혀 있으면 이어 넣는다', () => {
  const blocked = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  assert.doesNotThrow(() => storeCarryOver(false, blocked))
  assert.equal(readCarryOver(blocked), true)
})
