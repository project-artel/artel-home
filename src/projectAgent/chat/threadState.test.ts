/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { AgentMessage, Conversation, ToolCall } from './conversationApi.ts'
import { isOwnedAssistant, mergeMessages, needsResume, pendingToolCalls, threadItems } from './threadState.ts'

function message(id: number, role: AgentMessage['role'], extra: Partial<AgentMessage> = {}): AgentMessage {
  return { id, conversationId: 1, role, content: '', createdAt: '', toolCalls: [], toolResult: null, kind: null, ...extra }
}

function call(callId: string, tool = 'read_page'): ToolCall {
  return { callId, tool, args: {} }
}

function result(id: number, callId: string, status: 'ok' | 'error' = 'ok'): AgentMessage {
  return message(id, 'TOOL_RESULT', { toolResult: { callId, status, error: null } })
}

const awaiting: Conversation = {
  id: 1,
  projectId: 1,
  title: null,
  status: 'AWAITING_TOOL',
  createdAt: '',
  lastMessageAt: '',
}

test('mergeMessages drops ids it already has and sorts by id', () => {
  const existing = [message(1, 'USER'), message(3, 'ASSISTANT')]
  const merged = mergeMessages(existing, [message(3, 'ASSISTANT', { content: 'again' }), message(2, 'NOTICE')])
  assert.deepEqual(merged.map((one) => one.id), [1, 2, 3])
  assert.equal(merged[2].content, '')
})

test('mergeMessages returns the same array when nothing is new', () => {
  const existing = [message(1, 'USER')]
  assert.equal(mergeMessages(existing, [message(1, 'USER')]), existing)
  assert.equal(mergeMessages(existing, []), existing)
})

test('mergeMessages de-duplicates within one incoming batch', () => {
  const merged = mergeMessages([], [message(4, 'USER'), message(4, 'USER')])
  assert.equal(merged.length, 1)
})

test('pendingToolCalls returns unanswered calls of the latest ASSISTANT in order', () => {
  const messages = [
    message(1, 'USER'),
    message(2, 'ASSISTANT', { toolCalls: [call('a'), call('b'), call('c')] }),
    result(3, 'a'),
  ]
  assert.deepEqual(pendingToolCalls(messages), { assistantId: 2, calls: [call('b'), call('c')] })
})

test('pendingToolCalls ignores calls of an older ASSISTANT', () => {
  const messages = [
    message(2, 'ASSISTANT', { toolCalls: [call('a')] }),
    message(3, 'ASSISTANT', { content: 'done' }),
  ]
  assert.equal(pendingToolCalls(messages), null)
})

test('pendingToolCalls is null when every call has a result', () => {
  assert.equal(pendingToolCalls([message(2, 'ASSISTANT', { toolCalls: [call('a')] }), result(3, 'a')]), null)
})

test('isOwnedAssistant accepts a live id or an id after ownedAfterId', () => {
  assert.equal(isOwnedAssistant(5, { ownedAfterId: null, liveAssistantIds: [5] }), true)
  assert.equal(isOwnedAssistant(5, { ownedAfterId: 4, liveAssistantIds: [] }), true)
  assert.equal(isOwnedAssistant(5, { ownedAfterId: 5, liveAssistantIds: [] }), false)
  assert.equal(isOwnedAssistant(5, { ownedAfterId: null, liveAssistantIds: [] }), false)
})

test('needsResume shows the card for a loaded AWAITING_TOOL conversation this tab does not own', () => {
  const messages = [message(1, 'USER'), message(2, 'ASSISTANT', { toolCalls: [call('a')] })]
  const notOwned = { ownedAfterId: null, liveAssistantIds: [] }
  assert.deepEqual(needsResume(awaiting, messages, notOwned, []), { assistantId: 2, calls: [call('a')] })
})

test('needsResume hides the card when this tab owns or started the calls', () => {
  const messages = [message(1, 'USER'), message(2, 'ASSISTANT', { toolCalls: [call('a')] })]
  assert.equal(needsResume(awaiting, messages, { ownedAfterId: 1, liveAssistantIds: [] }, []), null)
  assert.equal(needsResume(awaiting, messages, { ownedAfterId: null, liveAssistantIds: [2] }, []), null)
  assert.equal(needsResume(awaiting, messages, { ownedAfterId: null, liveAssistantIds: [] }, ['a']), null)
})

test('needsResume hides the card unless the conversation is AWAITING_TOOL', () => {
  const messages = [message(2, 'ASSISTANT', { toolCalls: [call('a')] })]
  const notOwned = { ownedAfterId: null, liveAssistantIds: [] }
  assert.equal(needsResume({ ...awaiting, status: 'RUNNING' }, messages, notOwned, []), null)
  assert.equal(needsResume(null, messages, notOwned, []), null)
})

test('threadItems folds TOOL_RESULTs into step states', () => {
  const items = threadItems(
    [
      message(1, 'USER', { content: 'QA 돌려 줘' }),
      message(2, 'ASSISTANT', { content: '엽니다', toolCalls: [call('a', 'open_page'), call('b'), call('c')] }),
      result(3, 'a'),
      message(4, 'NOTICE', { content: '멈췄습니다', kind: 'stopped' }),
    ],
    'b',
  )
  assert.deepEqual(
    items.map((item) => item.kind),
    ['user', 'assistant', 'steps', 'notice'],
  )
  const steps = items[2].kind === 'steps' ? items[2].steps : []
  assert.deepEqual(steps.map((step) => step.state), ['ok', 'running', 'waiting'])
})

test('threadItems skips an empty assistant text but keeps its steps', () => {
  const items = threadItems([message(2, 'ASSISTANT', { content: '  ', toolCalls: [call('a')] })], null)
  assert.deepEqual(items.map((item) => item.kind), ['steps'])
})
