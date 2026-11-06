/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ConversationStatus } from './conversationApi.ts'
import { readyEvents, removeEvent, type QueuedEvent } from './eventQueue.ts'

function event(sequence: number, conversationId: number): QueuedEvent {
  return { sequence, conversationId, kind: 'job_finished', summary: `job ${sequence}` }
}

test('readyEvents holds events while the conversation is busy', () => {
  const queue = [event(1, 7)]
  const statuses: Record<number, ConversationStatus> = { 7: 'RUNNING' }
  assert.deepEqual(readyEvents(queue, (id) => statuses[id]), [])
  statuses[7] = 'AWAITING_TOOL'
  assert.deepEqual(readyEvents(queue, (id) => statuses[id]), [])
})

test('readyEvents releases the oldest event once IDLE or ERROR', () => {
  const queue = [event(1, 7), event(2, 7)]
  assert.deepEqual(readyEvents(queue, () => 'IDLE').map((one) => one.sequence), [1])
  assert.deepEqual(readyEvents(queue, () => 'ERROR').map((one) => one.sequence), [1])
})

test('readyEvents picks one event per conversation', () => {
  const queue = [event(1, 7), event(2, 8), event(3, 7)]
  const statuses: Record<number, ConversationStatus> = { 7: 'IDLE', 8: 'RUNNING' }
  assert.deepEqual(readyEvents(queue, (id) => statuses[id]).map((one) => one.sequence), [1])
})

test('readyEvents tries a conversation whose status is unknown', () => {
  assert.deepEqual(readyEvents([event(1, 9)], () => undefined).map((one) => one.sequence), [1])
})

test('removeEvent removes only the given sequence', () => {
  assert.deepEqual(removeEvent([event(1, 7), event(2, 7)], 1).map((one) => one.sequence), [2])
})
