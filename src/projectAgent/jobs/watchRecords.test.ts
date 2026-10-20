import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WATCH_RECORD_MAX_AGE_MS,
  clearWatchRecords,
  loadWatchRecords,
  removeWatchRecord,
  saveWatchRecord,
  watchStorageKey,
  type WatchRecord,
} from './watchRecords'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

const NOW = 5_000_000
const scanRecord: WatchRecord = { kind: 'content_map_scan', id: '7', label: 'Scan', startedAtMs: NOW - 1000 }
const qaRecord: WatchRecord = { kind: 'qa_run', id: '55', label: 'QA', startedAtMs: NOW - 2000 }

test('saved watches are read back for the same conversation only', () => {
  const storage = memoryStorage()
  saveWatchRecord(storage, '1', 12, scanRecord, NOW)
  saveWatchRecord(storage, '1', 12, qaRecord, NOW)
  assert.deepEqual(loadWatchRecords(storage, '1', 12, NOW), [scanRecord, qaRecord])
  assert.deepEqual(loadWatchRecords(storage, '1', 13, NOW), [])
  assert.deepEqual(loadWatchRecords(storage, '2', 12, NOW), [])
})

test('saving the same job again replaces the old record', () => {
  const storage = memoryStorage()
  saveWatchRecord(storage, '1', 12, qaRecord, NOW)
  saveWatchRecord(storage, '1', 12, { ...qaRecord, label: 'Renamed' }, NOW)
  assert.deepEqual(loadWatchRecords(storage, '1', 12, NOW).map((record) => record.label), ['Renamed'])
})

test('removing the last record deletes the storage key', () => {
  const storage = memoryStorage()
  saveWatchRecord(storage, '1', 12, qaRecord, NOW)
  removeWatchRecord(storage, '1', 12, 'qa_run', '55', NOW)
  assert.equal(storage.values.has(watchStorageKey('1', 12)), false)
})

test('records older than the age limit are dropped on load', () => {
  const storage = memoryStorage()
  const old = { ...qaRecord, startedAtMs: NOW - WATCH_RECORD_MAX_AGE_MS - 1 }
  saveWatchRecord(storage, '1', 12, old, old.startedAtMs)
  assert.deepEqual(loadWatchRecords(storage, '1', 12, NOW), [])
})

test('malformed storage reads as no watches', () => {
  const key = watchStorageKey('1', 12)
  assert.deepEqual(loadWatchRecords(memoryStorage({ [key]: 'not json' }), '1', 12, NOW), [])
  assert.deepEqual(loadWatchRecords(memoryStorage({ [key]: '{"a":1}' }), '1', 12, NOW), [])
  const mixed = JSON.stringify([qaRecord, { kind: 'other', id: '1', startedAtMs: NOW }, { kind: 'qa_run', id: '', startedAtMs: NOW }, 5])
  assert.deepEqual(loadWatchRecords(memoryStorage({ [key]: mixed }), '1', 12, NOW), [qaRecord])
})

test('a storage that throws never breaks the watch', () => {
  const broken = {
    getItem: () => {
      throw new Error('blocked')
    },
    setItem: () => {
      throw new Error('blocked')
    },
    removeItem: () => {
      throw new Error('blocked')
    },
  }
  assert.deepEqual(loadWatchRecords(broken, '1', 12, NOW), [])
  assert.doesNotThrow(() => saveWatchRecord(broken, '1', 12, qaRecord, NOW))
  assert.doesNotThrow(() => clearWatchRecords(broken, '1', 12))
})
