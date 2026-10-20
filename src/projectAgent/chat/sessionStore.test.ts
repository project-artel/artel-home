/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProjectApiError } from '../../projects/projectApi.ts'
import { createActionRegistry } from '../registry/createActionRegistry.ts'
import type { LockManagerLike } from '../webLocks.ts'
import type { AgentMessage, Conversation, ConversationStatus, ToolCall } from './conversationApi.ts'
import { AgentSessionStore, type SessionConversationApi, type StreamHandlers } from './sessionStore.ts'
import { currentView } from './sessionView.ts'
import { executeToolCall } from './toolExecutor.ts'
import type { ToolContext, ToolResultBody } from './toolTypes.ts'

const CONVERSATION_ID = 1

function conversation(status: ConversationStatus): Conversation {
  return { id: CONVERSATION_ID, projectId: 1, title: 't', status, createdAt: '', lastMessageAt: '' }
}

function message(id: number, role: AgentMessage['role'], extra: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id,
    conversationId: CONVERSATION_ID,
    role,
    content: '',
    createdAt: '',
    toolCalls: [],
    toolResult: null,
    kind: null,
    ...extra,
  }
}

function assistant(id: number, ...calls: ToolCall[]): AgentMessage {
  return message(id, 'ASSISTANT', { toolCalls: calls })
}

function call(callId: string, tool: string, args: Record<string, unknown> = {}): ToolCall {
  return { callId, tool, args }
}

const conflict = () => new ProjectApiError(409, 'conflict', 'conversation_busy')

/** 서버 하나를 흉내 낸다. 여러 store(탭)가 같은 서버를 쓴다. */
function makeServer() {
  let nextId = 10
  const server = {
    status: 'IDLE' as ConversationStatus,
    messages: [] as AgentMessage[],
    toolResults: [] as { callId: string; body: ToolResultBody }[],
    eventAttempts: 0,
    eventsAccepted: 0,
    cancelled: 0,
    conflictToolResults: false,
    conflictEvents: false,
  }
  const api: SessionConversationApi = {
    listConversations: async () => [conversation(server.status)],
    createConversation: async () => conversation('IDLE'),
    getConversation: async () => conversation(server.status),
    listMessages: async () => [...server.messages],
    deleteConversation: async () => {},
    cancelConversation: async () => {
      server.cancelled += 1
      server.status = 'IDLE'
      return conversation('IDLE')
    },
    sendMessage: async (_projectId, _conversationId, body) => {
      const stored = message((nextId += 1), 'USER', { content: body.text })
      server.messages.push(stored)
      server.status = 'RUNNING'
      return stored
    },
    sendToolResult: async (_projectId, _conversationId, callId, body) => {
      if (server.conflictToolResults) throw conflict()
      server.toolResults.push({ callId, body })
      const stored = message((nextId += 1), 'TOOL_RESULT', { toolResult: { callId, status: body.status, error: null } })
      server.messages.push(stored)
      return stored
    },
    sendEvent: async (_projectId, _conversationId, body) => {
      server.eventAttempts += 1
      if (server.conflictEvents) throw conflict()
      server.eventsAccepted += 1
      const stored = message((nextId += 1), 'EVENT', { content: body.summary, kind: body.kind })
      server.messages.push(stored)
      return stored
    },
  }
  const nextMessageId = () => (nextId += 1)
  return { server, api, nextMessageId }
}

/** 탭끼리 나눠 쓰는 가짜 `navigator.locks`. */
function makeLockManager(): LockManagerLike {
  const held = new Set<string>()
  return {
    request: async (name, _options, callback) => {
      if (held.has(name)) return callback(null)
      held.add(name)
      try {
        return await callback({ name })
      } finally {
        held.delete(name)
      }
    },
    query: async () => ({ held: [...held].map((name) => ({ name })) }),
  }
}

type Tab = ReturnType<typeof makeTab>

function makeTab(api: SessionConversationApi, lockManager: LockManagerLike | null = null) {
  const registry = createActionRegistry({ highlightMilliseconds: 1, emptyPageGraceMilliseconds: 1 })
  const streams = new Map<number, StreamHandlers>()
  const executedCalls: string[] = []
  const watchContexts: ToolContext[] = []
  let retryTick: (() => void) | null = null
  const store = new AgentSessionStore(
    { projectId: '1', registry, navigate: () => {} },
    {
      api,
      lockManager,
      connectStream: (_projectId, conversationId, handlers) => {
        streams.set(conversationId, handlers)
        return () => streams.delete(conversationId)
      },
      executeTool: async (toolCall, context) => {
        executedCalls.push(toolCall.callId)
        if (toolCall.tool === 'watch_job') {
          watchContexts.push(context)
          return { status: 'ok', result: { watching: true } }
        }
        return executeToolCall(toolCall, context)
      },
      repeat: (callback) => {
        retryTick = callback
        return () => {
          retryTick = null
        }
      },
    },
  )
  return {
    store,
    registry,
    executedCalls,
    watchContexts,
    stream: () => {
      const handlers = streams.get(CONVERSATION_ID)
      assert.ok(handlers, 'stream is open')
      return handlers
    },
    tick: () => retryTick?.(),
    hasRetryTimer: () => retryTick !== null,
  }
}

async function settle(rounds = 8) {
  for (let round = 0; round < rounds; round += 1) await new Promise((resolve) => setTimeout(resolve, 2))
}

/** 탭을 시작하고 대화 1 을 연다. */
async function openTab(tab: Tab) {
  tab.store.start()
  await settle()
  tab.store.selectConversation(CONVERSATION_ID)
  await settle()
}

/** 서버가 ASSISTANT 를 저장하고 상태를 바꾼 것을 모든 탭의 stream 에 보낸다. */
function deliver(tabs: Tab[], server: { status: ConversationStatus; messages: AgentMessage[] }, reply: AgentMessage, status: ConversationStatus) {
  server.messages.push(reply)
  server.status = status
  for (const tab of tabs) {
    tab.stream().onMessage(reply)
    tab.stream().onConversation(conversation(status))
  }
}

test('only the tab that sent the message executes the reply; the other tab offers resume', async () => {
  const { server, api, nextMessageId } = makeServer()
  const sender = makeTab(api)
  const watcher = makeTab(api)
  await openTab(sender)
  await openTab(watcher)

  await sender.store.send('read the page')
  await settle()
  deliver([sender, watcher], server, assistant(nextMessageId(), call('c1', 'read_page')), 'AWAITING_TOOL')
  await settle()

  assert.deepEqual(sender.executedCalls, ['c1'])
  assert.deepEqual(watcher.executedCalls, [])
  assert.deepEqual(server.toolResults.map((one) => one.callId), ['c1'])
})

test('a tab that is not the sender sees "running in another tab" while the lock is held, and resume does not run', async () => {
  const { server, api, nextMessageId } = makeServer()
  const locks = makeLockManager()
  const sender = makeTab(api, locks)
  const watcher = makeTab(api, locks)
  await openTab(sender)
  await openTab(watcher)

  await sender.store.send('ask me')
  await settle()
  const choice = call('c1', 'ask_choice', {
    question: 'which?',
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  })
  deliver([sender, watcher], server, assistant(nextMessageId(), choice), 'AWAITING_TOOL')
  await settle()
  assert.notEqual(sender.store.getSnapshot().choice, null)

  watcher.tick()
  await settle()
  const watcherView = currentView(watcher.store.getSnapshot())
  assert.equal(watcherView.resume, null)
  assert.equal(watcherView.runningInOtherTab, true)

  watcher.store.resume()
  await settle()
  assert.deepEqual(watcher.executedCalls, [])
  assert.equal(watcher.store.getSnapshot().choice, null)
  assert.equal(currentView(watcher.store.getSnapshot()).runningInOtherTab, true)

  sender.store.answerChoice(['a'])
  await settle()
  assert.deepEqual(server.toolResults.map((one) => one.callId), ['c1'])
})

test('a 409 on tool-results ends the batch without running the next call', async () => {
  const { server, api, nextMessageId } = makeServer()
  const tab = makeTab(api)
  await openTab(tab)
  await tab.store.send('go')
  await settle()
  server.conflictToolResults = true
  deliver([tab], server, assistant(nextMessageId(), call('c1', 'read_page'), call('c2', 'read_page')), 'AWAITING_TOOL')
  await settle()
  assert.deepEqual(tab.executedCalls, ['c1'])
  assert.equal(tab.store.getSnapshot().error, null)
})

test('Stop during an approval cancels it without running the action or posting a result', async () => {
  const { server, api, nextMessageId } = makeServer()
  const tab = makeTab(api)
  const ran: unknown[] = []
  tab.registry.registerAction({
    spec: { id: 'qa.startRun', page: 'qa', description: 'start', args: { type: 'object' }, risk: 'approve', summarize: () => 'start' },
    target: () => null,
    blocked: () => null,
    run: async (args) => ran.push(args),
  })
  await openTab(tab)
  await tab.store.send('start a run')
  await settle()
  deliver([tab], server, assistant(nextMessageId(), call('c1', 'call_action', { action: 'qa.startRun' })), 'AWAITING_TOOL')
  await settle()
  assert.notEqual(tab.store.getSnapshot().approval, null)

  await tab.store.cancel()
  await settle()
  assert.equal(tab.registry.pendingApproval(), null)
  assert.equal(tab.store.getSnapshot().approval, null)
  assert.deepEqual(ran, [])
  assert.deepEqual(server.toolResults, [])
  assert.equal(server.cancelled, 1)
})

test('Stop during a choice closes the card and posts no result', async () => {
  const { server, api, nextMessageId } = makeServer()
  const tab = makeTab(api)
  await openTab(tab)
  await tab.store.send('ask')
  await settle()
  const choice = call('c1', 'ask_choice', {
    question: 'which?',
    options: [
      { id: 'a', label: 'A' },
      { id: 'b', label: 'B' },
    ],
  })
  deliver([tab], server, assistant(nextMessageId(), choice), 'AWAITING_TOOL')
  await settle()
  assert.notEqual(tab.store.getSnapshot().choice, null)
  await tab.store.cancel()
  await settle()
  assert.equal(tab.store.getSnapshot().choice, null)
  assert.deepEqual(server.toolResults, [])
})

test('leaving AWAITING_TOOL aborts the running batch and closes its approval', async () => {
  const { server, api, nextMessageId } = makeServer()
  const tab = makeTab(api)
  tab.registry.registerAction({
    spec: { id: 'qa.startRun', page: 'qa', description: 'start', args: { type: 'object' }, risk: 'approve', summarize: () => 'start' },
    target: () => null,
    blocked: () => null,
    run: async () => 'started',
  })
  await openTab(tab)
  await tab.store.send('start')
  await settle()
  deliver([tab], server, assistant(nextMessageId(), call('c1', 'call_action', { action: 'qa.startRun' })), 'AWAITING_TOOL')
  await settle()
  assert.notEqual(tab.registry.pendingApproval(), null)

  // 다른 탭이 결과를 보내 서버가 다음 step 으로 넘어갔다.
  server.status = 'RUNNING'
  tab.stream().onConversation(conversation('RUNNING'))
  await settle()
  assert.equal(tab.registry.pendingApproval(), null)
  assert.deepEqual(server.toolResults, [])
})

test('a second ask_choice while one is open becomes an error and leaves the first open', async () => {
  const { server, api, nextMessageId } = makeServer()
  const tab = makeTab(api)
  await openTab(tab)
  await tab.store.send('watch')
  await settle()
  deliver([tab], server, assistant(nextMessageId(), call('c1', 'watch_job', { kind: 'qa_run', id: '5' })), 'AWAITING_TOOL')
  await settle()
  const context = tab.watchContexts[0]
  const options = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ]
  const first = context.askChoice('first?', options)
  await assert.rejects(context.askChoice('second?', options), /another choice is open/)
  assert.equal(tab.store.getSnapshot().choice?.question, 'first?')
  tab.store.answerChoice(['b'])
  assert.deepEqual(await first, ['b'])
})

test('a job event that gets 409 stays queued, takes no ownership, and is sent on a later retry', async () => {
  const { server, api, nextMessageId } = makeServer()
  const tab = makeTab(api)
  await openTab(tab)
  await tab.store.send('watch the run')
  await settle()
  deliver([tab], server, assistant(nextMessageId(), call('c1', 'watch_job', { kind: 'qa_run', id: '5' })), 'AWAITING_TOOL')
  await settle()
  // 결과를 받은 서버가 마지막 답을 쓰고 IDLE 로 돌아왔다. 이 탭이 맡은 차례는 끝났다.
  deliver([tab], server, message(nextMessageId(), 'ASSISTANT', { content: 'watching' }), 'IDLE')
  await settle()
  assert.equal(tab.store.getSnapshot().ownership[CONVERSATION_ID], undefined)

  server.conflictEvents = true
  tab.watchContexts[0].postEvent('job_finished', 'QA run 5 finished')
  await settle()
  assert.equal(server.eventAttempts, 1)
  assert.equal(server.eventsAccepted, 0)
  assert.equal(tab.store.getSnapshot().ownership[CONVERSATION_ID], undefined)

  server.conflictEvents = false
  tab.tick()
  await settle()
  assert.equal(server.eventsAccepted, 1)
  const eventId = server.messages[server.messages.length - 1].id
  assert.deepEqual(tab.store.getSnapshot().ownership[CONVERSATION_ID], { ownedAfterId: eventId })
})

test('the signal given to watch_job outlives the batch and is aborted by Stop', async () => {
  const { server, api, nextMessageId } = makeServer()
  const tab = makeTab(api)
  await openTab(tab)
  await tab.store.send('watch')
  await settle()
  deliver([tab], server, assistant(nextMessageId(), call('c1', 'watch_job', { kind: 'qa_run', id: '5' })), 'AWAITING_TOOL')
  await settle()
  const signal = tab.watchContexts[0].signal
  assert.deepEqual(server.toolResults.map((one) => one.callId), ['c1'])
  assert.equal(signal.aborted, false)
  await tab.store.cancel()
  assert.equal(signal.aborted, true)
})

test('dispose stops event flushing and the retry timer', async () => {
  const { server, api, nextMessageId } = makeServer()
  const tab = makeTab(api)
  await openTab(tab)
  await tab.store.send('watch')
  await settle()
  deliver([tab], server, assistant(nextMessageId(), call('c1', 'watch_job', { kind: 'qa_run', id: '5' })), 'AWAITING_TOOL')
  await settle()
  deliver([tab], server, message(nextMessageId(), 'ASSISTANT', { content: 'watching' }), 'IDLE')
  await settle()
  const context = tab.watchContexts[0]

  tab.store.dispose()
  assert.equal(context.signal.aborted, true)
  assert.equal(tab.hasRetryTimer(), false)
  context.postEvent('job_finished', 'late')
  await settle()
  assert.equal(server.eventAttempts, 0)
})
