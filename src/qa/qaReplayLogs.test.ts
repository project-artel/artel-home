import assert from 'node:assert/strict'
import test from 'node:test'
import { loadReplayLogContext, logsAround } from './qaReplayLogs'
import type { QaLog } from './qaTypes'

const at = (second: number) => new Date(Date.UTC(2026, 10, 4) + second * 1000).toISOString()
const row = (id: number): QaLog => ({ id: String(id), qaTryId: '1', createdAt: at(id), type: 'LOG', direction: 'ORCHE_INTERNAL', message: 'log', payload: null, messageId: null, correlationId: null })

test('시점 전후 로그를 표시하고 첫 로그 이전에도 빈 화면을 만들지 않는다', () => {
  const logs = Array.from({ length: 200 }, (_, index) => row(index + 1))
  assert.deepEqual(logsAround(logs, Date.parse(at(0)), 3).map(log => log.id), ['1', '2', '3'])
  assert.deepEqual(logsAround(logs, Date.parse(at(100)), 3).map(log => log.id), ['99', '100', '101'])
  assert.deepEqual(logsAround(logs, Date.parse(at(300)), 3).map(log => log.id), ['198', '199', '200'])
  assert.deepEqual(logsAround([], 0), [])
})

test('다음 verdict의 cursor에서 역순 조회하여 선택 시점에 도착하면 멈춘다', async context => {
  const cursors: (string | null)[] = []
  context.mock.method(globalThis, 'fetch', async (input: string) => {
    const cursor = new URL(input, 'http://localhost').searchParams.get('beforeId')
    cursors.push(cursor)
    const items = cursor === '10' ? [row(9), row(8)] : [row(7), row(6)]
    return new Response(JSON.stringify({ items, hasMore: true, nextBeforeId: items.at(-1)!.id }))
  })
  const logs = await loadReplayLogContext('1', Date.parse(at(7)), [row(10)], new AbortController().signal)
  assert.deepEqual(cursors, ['10', '8'])
  assert.deepEqual(logs.map(log => log.id), ['6', '7', '8', '9', '10'])
})

test('cursor가 진행하지 않으면 반복 조회를 멈추고 이미 취소된 요청은 보내지 않는다', async context => {
  const fetch = context.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ items: [row(9)], hasMore: true, nextBeforeId: '10' })))
  assert.equal((await loadReplayLogContext('1', Date.parse(at(1)), [row(10)], new AbortController().signal)).length, 2)
  const controller = new AbortController()
  controller.abort()
  assert.deepEqual(await loadReplayLogContext('1', 0, [], controller.signal), [])
  assert.equal(fetch.mock.calls.length, 1)
})
