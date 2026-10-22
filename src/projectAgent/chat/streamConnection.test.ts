/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { STREAM_RETRY_BASE_MS, STREAM_RETRY_MAX_MS, connectWithRetry, streamRetryDelay, type StreamSource, type StreamTimers } from './streamConnection.ts'

const CONNECTING = 0
const OPEN = 1
const CLOSED = 2

class FakeSource implements StreamSource {
  readyState = CONNECTING
  closed = false
  private listeners = new Map<string, ((event: MessageEvent) => void)[]>()

  addEventListener(type: string, listener: (event: MessageEvent) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  close(): void {
    this.closed = true
    this.readyState = CLOSED
  }

  emit(type: string, data = ''): void {
    for (const listener of this.listeners.get(type) ?? []) listener({ data } as MessageEvent)
  }
}

function fakeTimers(): StreamTimers & { delays: number[]; run: () => void; cancelled: number } {
  const queue: (() => void)[] = []
  const timers = {
    delays: [] as number[],
    cancelled: 0,
    schedule: (callback: () => void, milliseconds: number) => {
      timers.delays.push(milliseconds)
      queue.push(callback)
      return queue.length
    },
    cancel: () => {
      timers.cancelled += 1
    },
    run: () => queue.shift()?.(),
  }
  return timers
}

test('streamRetryDelay doubles from the base and stops at the cap', () => {
  assert.equal(streamRetryDelay(0), STREAM_RETRY_BASE_MS)
  assert.equal(streamRetryDelay(1), STREAM_RETRY_BASE_MS * 2)
  assert.equal(streamRetryDelay(20), STREAM_RETRY_MAX_MS)
})

test('a source the browser gave up on is reopened, and the reopen reads the thread again', () => {
  const sources: FakeSource[] = []
  const timers = fakeTimers()
  let opens = 0
  const events: string[] = []
  connectWithRetry(
    () => {
      const source = new FakeSource()
      sources.push(source)
      return source
    },
    ['message'],
    { onEvent: (type, data) => events.push(`${type}:${data}`), onOpen: () => (opens += 1) },
    timers,
  )

  // 서버가 재시작되는 동안 proxy 가 502 를 돌려주면 브라우저는 CLOSED 로 둔다.
  sources[0].readyState = CLOSED
  sources[0].emit('error')
  assert.deepEqual(timers.delays, [STREAM_RETRY_BASE_MS])
  timers.run()
  assert.equal(sources.length, 2)

  sources[1].readyState = OPEN
  sources[1].emit('open')
  sources[1].emit('message', '{"id":1}')
  assert.equal(opens, 1)
  assert.deepEqual(events, ['message:{"id":1}'])
})

test('an error while the browser is still reconnecting is left to the browser', () => {
  const sources: FakeSource[] = []
  const timers = fakeTimers()
  connectWithRetry(
    () => {
      const source = new FakeSource()
      sources.push(source)
      return source
    },
    [],
    { onEvent: () => {}, onOpen: () => {} },
    timers,
  )
  sources[0].emit('error')
  assert.deepEqual(timers.delays, [])
  assert.equal(sources.length, 1)
})

test('closing stops a scheduled reopen', () => {
  const sources: FakeSource[] = []
  const timers = fakeTimers()
  const close = connectWithRetry(
    () => {
      const source = new FakeSource()
      sources.push(source)
      return source
    },
    [],
    { onEvent: () => {}, onOpen: () => {} },
    timers,
  )
  sources[0].readyState = CLOSED
  sources[0].emit('error')
  close()
  assert.equal(timers.cancelled, 1)
})
