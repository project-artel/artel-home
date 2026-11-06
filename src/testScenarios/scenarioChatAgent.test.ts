import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readScenarioChatAgent, storeScenarioChatAgent } from './scenarioChatAgent.ts'

function memory() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

test('고른 적 없으면 workflow 다', () => {
  assert.equal(readScenarioChatAgent(memory()), 'workflow')
})

test('마지막 선택을 기억한다', () => {
  const storage = memory()
  storeScenarioChatAgent('project', storage)
  assert.equal(readScenarioChatAgent(storage), 'project')
  storeScenarioChatAgent('workflow', storage)
  assert.equal(readScenarioChatAgent(storage), 'workflow')
})

test('알 수 없는 값이 저장돼 있으면 workflow 다', () => {
  const storage = memory()
  storage.setItem('artel.testScenario.chatAgent', 'other')
  assert.equal(readScenarioChatAgent(storage), 'workflow')
})

test('storage 가 막혀 있으면 workflow 다', () => {
  const blocked = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
  }
  assert.doesNotThrow(() => storeScenarioChatAgent('project', blocked))
  assert.equal(readScenarioChatAgent(blocked), 'workflow')
})
