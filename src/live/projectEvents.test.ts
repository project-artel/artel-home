/// <reference types="node" />
import assert from 'node:assert/strict'
import { afterEach, beforeEach, mock, test } from 'node:test'
import {
  createProjectEventsRegistry,
  parseProjectChangedEvent,
  projectEventsUrl,
  type EventSourceLike,
} from './projectEvents.ts'

/*
 * The project change stream's frame parser and the per-tab registry that
 * shares one connection per project. The frames are written by hand from the
 * ARTEL-1123 contract; these tests prove how the client reads that contract,
 * not what the server sends.
 */

class FakeEventSource implements EventSourceLike {
  readyState = 0
  closed = false
  private listeners = new Map<string, ((event: Event) => void)[]>()

  readonly url: string

  constructor(url: string) {
    this.url = url
  }

  addEventListener(type: string, listener: (event: Event) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener])
  }

  close() {
    this.closed = true
    this.readyState = 2
  }

  emit(type: string, data?: string) {
    const event = data === undefined ? new Event(type) : new MessageEvent(type, { data })
    this.listeners.get(type)?.forEach((listener) => listener(event))
  }
}

function fixture() {
  const sources: FakeEventSource[] = []
  const registry = createProjectEventsRegistry((url) => {
    const source = new FakeEventSource(url)
    sources.push(source)
    return source
  }, 300)
  return { registry, sources }
}

beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }))
afterEach(() => mock.timers.reset())

test('parseProjectChangedEvent reads a known topic', () => {
  assert.equal(parseProjectChangedEvent('{"topic":"GAME_INSTANCES"}'), 'GAME_INSTANCES')
  assert.equal(parseProjectChangedEvent('{"topic":"USAGE"}'), 'USAGE')
  assert.equal(parseProjectChangedEvent('{"topic":"TEST_RUNS"}'), 'TEST_RUNS')
})

test('런 변경은 TEST_RUNS 구독만 갱신하고 재연결 ready도 재조회한다', () => {
  const { registry, sources } = fixture()
  let runs = 0
  let cases = 0
  registry.subscribe('10', { topics: ['TEST_RUNS'], onChange: () => { runs++ } })
  registry.subscribe('10', { topics: ['TEST_CASES'], onChange: () => { cases++ } })
  sources[0].emit('changed', '{"topic":"TEST_RUNS"}')
  sources[0].emit('changed', '{"topic":"TEST_RUNS"}')
  mock.timers.tick(300)
  assert.equal(runs, 1)
  assert.equal(cases, 0)
  sources[0].emit('ready')
  mock.timers.tick(300)
  assert.equal(runs, 2)
  assert.equal(cases, 1)
})

test('parseProjectChangedEvent drops unknown topics and broken frames', () => {
  assert.equal(parseProjectChangedEvent('{"topic":"SOMETHING_NEW"}'), null)
  assert.equal(parseProjectChangedEvent('{"topic":42}'), null)
  assert.equal(parseProjectChangedEvent('{}'), null)
  assert.equal(parseProjectChangedEvent('null'), null)
  assert.equal(parseProjectChangedEvent('not json'), null)
})

test('projectEventsUrl points at the project stream', () => {
  assert.match(projectEventsUrl('7'), /\/api\/projects\/7\/events$/)
})

test('subscribers of one project share one connection, closed with the last one', () => {
  const { registry, sources } = fixture()
  const first = registry.subscribe('7', { topics: ['MACROS'], onChange: () => {} })
  const second = registry.subscribe('7', { topics: ['ISSUES'], onChange: () => {} })
  const other = registry.subscribe('8', { topics: ['ISSUES'], onChange: () => {} })

  assert.equal(sources.length, 2)
  assert.match(sources[0].url, /\/projects\/7\/events$/)

  first()
  assert.equal(sources[0].closed, false)
  second()
  assert.equal(sources[0].closed, true)
  assert.equal(sources[1].closed, false)
  other()
  assert.equal(sources[1].closed, true)

  registry.subscribe('7', { topics: ['MACROS'], onChange: () => {} })
  assert.equal(sources.length, 3, 'a new first subscriber opens a fresh connection')
})

test('live follows open, ready, error and the last unsubscribe', () => {
  const { registry, sources } = fixture()
  let notified = 0
  registry.watchLive('7', () => notified++)
  const unsubscribe = registry.subscribe('7', { topics: ['MACROS'], onChange: () => {} })

  assert.equal(registry.isLive('7'), false)
  sources[0].emit('open')
  assert.equal(registry.isLive('7'), true)
  sources[0].emit('ready')
  assert.equal(notified, 1, 'ready after open is no change')
  sources[0].emit('error')
  assert.equal(registry.isLive('7'), false)
  sources[0].emit('ready')
  assert.equal(registry.isLive('7'), true)

  unsubscribe()
  assert.equal(registry.isLive('7'), false)
  assert.equal(notified, 4)
})

test('a closed source stays not live', () => {
  const { registry, sources } = fixture()
  registry.subscribe('7', { topics: ['MACROS'], onChange: () => {} })
  sources[0].emit('open')
  sources[0].readyState = 2
  sources[0].emit('error')
  assert.equal(registry.isLive('7'), false)
  assert.equal(sources[0].closed, true)
})

test('ready reaches every subscriber, changed only the matching ones', () => {
  const { registry, sources } = fixture()
  const calls: string[] = []
  registry.subscribe('7', { topics: ['MACROS'], onChange: () => calls.push('macros') })
  registry.subscribe('7', { topics: ['GAME_INSTANCES', 'GAME_BUILDS'], onChange: () => calls.push('game') })

  sources[0].emit('ready')
  mock.timers.tick(300)
  assert.deepEqual(calls.sort(), ['game', 'macros'])

  calls.length = 0
  sources[0].emit('changed', '{"topic":"GAME_BUILDS"}')
  sources[0].emit('changed', '{"topic":"SOMETHING_NEW"}')
  sources[0].emit('changed', 'not json')
  mock.timers.tick(300)
  assert.deepEqual(calls, ['game'])
})

test('a burst of frames becomes one call per subscriber', () => {
  const { registry, sources } = fixture()
  let calls = 0
  registry.subscribe('7', { topics: ['ISSUES'], onChange: () => calls++ })

  sources[0].emit('changed', '{"topic":"ISSUES"}')
  mock.timers.tick(100)
  sources[0].emit('changed', '{"topic":"ISSUES"}')
  mock.timers.tick(100)
  sources[0].emit('ready')
  assert.equal(calls, 0)
  mock.timers.tick(100)
  assert.equal(calls, 1)

  sources[0].emit('changed', '{"topic":"ISSUES"}')
  mock.timers.tick(300)
  assert.equal(calls, 2, 'a frame after the window starts a new one')
})

test('unsubscribing cancels a pending call', () => {
  const { registry, sources } = fixture()
  let calls = 0
  const keep = registry.subscribe('7', { topics: ['ISSUES'], onChange: () => {} })
  const leave = registry.subscribe('7', { topics: ['ISSUES'], onChange: () => calls++ })

  sources[0].emit('changed', '{"topic":"ISSUES"}')
  leave()
  mock.timers.tick(300)
  assert.equal(calls, 0)
  keep()
})
