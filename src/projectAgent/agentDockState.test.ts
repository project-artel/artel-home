/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CHAT_WIDTH_MAX,
  CHAT_WIDTH_MIN,
  clampChatWidth,
  effectiveOpen,
  isFoldedRoute,
  isProjectAgentEnabled,
  readAgentOpen,
  readAgentWidth,
  storeAgentOpen,
  storeAgentWidth,
} from './agentDockState.ts'

type TestWindow = { localStorage: Storage }

function withStorage(storage: Partial<Storage>, run: () => void) {
  const scope = globalThis as unknown as { window?: TestWindow }
  const previous = scope.window
  scope.window = { localStorage: storage as Storage }
  try {
    run()
  } finally {
    scope.window = previous
  }
}

function memoryStorage(initial: Record<string, string> = {}): Partial<Storage> {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

const throwingStorage: Partial<Storage> = {
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
}

test('flag 는 문자열 true 일 때만 켜진다', () => {
  assert.equal(isProjectAgentEnabled({ VITE_PROJECT_AGENT: 'true' }), true)
  assert.equal(isProjectAgentEnabled({ VITE_PROJECT_AGENT: 'false' }), false)
  assert.equal(isProjectAgentEnabled({ VITE_PROJECT_AGENT: '1' }), false)
  assert.equal(isProjectAgentEnabled({}), false)
})

test('열림 상태는 저장된 값이 없으면 열림이다', () => {
  withStorage(memoryStorage(), () => assert.equal(readAgentOpen(), true))
  withStorage(memoryStorage({ 'artel.projectAgent.open': 'false' }), () => assert.equal(readAgentOpen(), false))
  withStorage(memoryStorage({ 'artel.projectAgent.open': 'true' }), () => assert.equal(readAgentOpen(), true))
})

test('열림 상태를 저장하면 다시 읽힌다', () => {
  withStorage(memoryStorage(), () => {
    storeAgentOpen(false)
    assert.equal(readAgentOpen(), false)
  })
})

test('저장소가 막혀도 던지지 않고 기본값을 쓴다', () => {
  withStorage(throwingStorage, () => {
    assert.equal(readAgentOpen(), true)
    assert.equal(readAgentWidth(), 400)
    storeAgentOpen(false)
    storeAgentWidth(500)
  })
})

test('폭은 기본 400 이고 저장값은 320 에서 720 으로 맞춘다', () => {
  withStorage(memoryStorage(), () => assert.equal(readAgentWidth(), 400))
  withStorage(memoryStorage({ 'artel.projectAgent.width': 'abc' }), () => assert.equal(readAgentWidth(), 400))
  withStorage(memoryStorage({ 'artel.projectAgent.width': '100' }), () => assert.equal(readAgentWidth(), CHAT_WIDTH_MIN))
  withStorage(memoryStorage({ 'artel.projectAgent.width': '9000' }), () => assert.equal(readAgentWidth(), CHAT_WIDTH_MAX))
  withStorage(memoryStorage({ 'artel.projectAgent.width': '512' }), () => assert.equal(readAgentWidth(), 512))
})

test('clampChatWidth 는 page slot 640px 을 남긴다', () => {
  // 1920 - 280 - 6 - 640 = 994 이므로 상한은 720 이다.
  assert.equal(clampChatWidth(900, 1920, 280), 720)
  // 1400 - 280 - 6 - 640 = 474
  assert.equal(clampChatWidth(700, 1400, 280), 474)
  assert.equal(clampChatWidth(200, 1400, 280), 320)
})

test('clampChatWidth 상한은 최소 폭 아래로 내려가지 않는다', () => {
  assert.equal(clampChatWidth(500, 900, 280), 320)
})

test('접히는 경로는 런 편집과 시나리오 상세뿐이다', () => {
  assert.equal(isFoldedRoute('p1', '/projects/p1/test-runs/r1/edit'), true)
  assert.equal(isFoldedRoute('p1', '/projects/p1/test-scenarios/s1'), true)
  assert.equal(isFoldedRoute('p1', '/projects/p1/test-runs/r1'), false)
  assert.equal(isFoldedRoute('p1', '/projects/p1/test-scenarios'), false)
  assert.equal(isFoldedRoute('p1', '/projects/p1'), false)
  assert.equal(isFoldedRoute('p1', '/projects/p2/test-scenarios/s1'), false)
  assert.equal(isFoldedRoute('a b', '/projects/a%20b/test-runs/r1/edit'), true)
})

test('접힌 경로에서는 손으로 다시 연 경우에만 열린다', () => {
  assert.equal(effectiveOpen({ stored: true, folded: true, reopenedHere: false }), false)
  assert.equal(effectiveOpen({ stored: false, folded: true, reopenedHere: true }), true)
  assert.equal(effectiveOpen({ stored: true, folded: false, reopenedHere: false }), true)
  assert.equal(effectiveOpen({ stored: false, folded: false, reopenedHere: true }), false)
})


test('전체 챗을 열어도 대시보드 dock의 저장된 닫힘 선택을 유지한다', () => {
  withStorage(memoryStorage({ 'artel.projectAgent.open': 'false' }), () => {
    const input = { stored: readAgentOpen(), folded: false, reopenedHere: false }
    assert.equal(effectiveOpen({ ...input, fullPage: true }), true)
    assert.equal(readAgentOpen(), false)
    assert.equal(effectiveOpen({ ...input, fullPage: false }), false)
  })
})
