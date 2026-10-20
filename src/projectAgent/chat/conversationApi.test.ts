/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  parseConversation,
  parseConversationEvent,
  parseConversationList,
  parseMessage,
  parseMessageEvent,
  parseMessageList,
} from './conversationApi.ts'

const conversation = {
  id: 12,
  projectId: 1,
  title: 'QA 돌려 줘',
  status: 'AWAITING_TOOL',
  createdAt: '2026-10-20T00:00:00Z',
  lastMessageAt: '2026-10-20T00:01:00Z',
}

test('parseConversation reads every field and turns an empty title into null', () => {
  assert.deepEqual(parseConversation(conversation), conversation)
  assert.equal(parseConversation({ ...conversation, title: null })?.title, null)
  assert.equal(parseConversation({ ...conversation, id: '12' })?.id, 12)
})

test('parseConversation drops an unknown status or a missing id', () => {
  assert.equal(parseConversation({ ...conversation, status: 'PAUSED' }), null)
  assert.equal(parseConversation({ ...conversation, id: undefined }), null)
  assert.equal(parseConversation('nope'), null)
})

test('parseConversationList reads items and skips broken rows', () => {
  const list = parseConversationList({ items: [conversation, { id: 'x' }] })
  assert.equal(list.length, 1)
  assert.deepEqual(parseConversationList([conversation]), [])
})

test('parseMessage reads tool calls of an ASSISTANT message', () => {
  const message = parseMessage({
    id: 5,
    conversationId: 12,
    role: 'ASSISTANT',
    content: 'QA 실행 페이지를 엽니다.',
    payload: {
      toolCalls: [
        { callId: 'call_1', tool: 'open_page', args: { page: 'qa' } },
        { callId: '', tool: 'read_page', args: {} },
        { callId: 'call_2', tool: 'read_page' },
      ],
    },
    createdAt: 't',
  })
  assert.deepEqual(message?.toolCalls, [
    { callId: 'call_1', tool: 'open_page', args: { page: 'qa' } },
    { callId: 'call_2', tool: 'read_page', args: {} },
  ])
  assert.equal(message?.toolResult, null)
})

test('parseMessage reads a TOOL_RESULT payload and NOTICE kind', () => {
  const result = parseMessage({
    id: 6,
    conversationId: 12,
    role: 'TOOL_RESULT',
    content: '',
    payload: { callId: 'call_1', status: 'rejected', error: 'user declined' },
    createdAt: 't',
  })
  assert.deepEqual(result?.toolResult, { callId: 'call_1', status: 'rejected', error: 'user declined' })
  const notice = parseMessage({ id: 7, conversationId: 12, role: 'NOTICE', content: '멈췄습니다', payload: { kind: 'stopped' } })
  assert.equal(notice?.kind, 'stopped')
  assert.deepEqual(notice?.toolCalls, [])
})

test('parseMessage drops an unknown role', () => {
  assert.equal(parseMessage({ id: 1, role: 'SYSTEM', content: '' }), null)
})

test('parseMessageList keeps server order of valid rows', () => {
  const list = parseMessageList({
    items: [
      { id: 1, conversationId: 12, role: 'USER', content: 'a' },
      { id: 2, conversationId: 12, role: 'BOGUS', content: 'b' },
      { id: 3, conversationId: 12, role: 'ASSISTANT', content: 'c', payload: { toolCalls: [] } },
    ],
  })
  assert.deepEqual(list.map((message) => message.id), [1, 3])
})

test('SSE event parsers read JSON and return null for broken data', () => {
  assert.equal(parseMessageEvent('{"id":9,"conversationId":12,"role":"USER","content":"hi"}')?.content, 'hi')
  assert.equal(parseMessageEvent('not json'), null)
  assert.equal(parseConversationEvent(JSON.stringify(conversation))?.status, 'AWAITING_TOOL')
  assert.equal(parseConversationEvent('{'), null)
})
