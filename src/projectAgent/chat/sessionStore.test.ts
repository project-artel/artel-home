/// <reference types="node" />
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ProjectApiError } from '../../projects/projectApi.ts'
import { createActionRegistry } from '../registry/createActionRegistry.ts'
import type { LockManagerLike } from '../webLocks.ts'
import type { AgentMessage, Conversation, ConversationStatus, ToolCall } from './conversationApi.ts'
import { AgentSessionStore, type OwnershipStorage, type SessionConversationApi, type StreamHandlers } from './sessionStore.ts'
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

/** 탭 하나의 `sessionStorage` 를 흉내 낸다. 새로고침은 같은 객체를 새 store 에 다시 넘겨 흉내 낸다. */
function makeSessionStorage(seed: Iterable<[string, string]> = []): OwnershipStorage & { entries: Map<string, string> } {
  const entries = new Map<string, string>(seed)
  return {
    entries,
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
    removeItem: (key) => void entries.delete(key),
  }
}

function makeTab(
  api: SessionConversationApi,
  lockManager: LockManagerLike | null = null,
  ownershipStorage: OwnershipStorage | null = null,
) {
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
      ownershipStorage,
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

const ASK_CHOICE = call('c1', 'ask_choice', {
  question: 'which?',
  options: [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ],
})

/** 탭이 ask_choice 를 띄운 채 새로고침되기 직전까지 진행하고, 그 탭이 쓰던 sessionStorage 를 돌려준다. */
async function startOwnedChoice() {
  const world = makeServer()
  const locks = makeLockManager()
  const storage = makeSessionStorage()
  const before = makeTab(world.api, locks, storage)
  await openTab(before)
  await before.store.send('ask me')
  await settle()
  deliver([before], world.server, assistant(world.nextMessageId(), ASK_CHOICE), 'AWAITING_TOOL')
  await settle()
  assert.notEqual(before.store.getSnapshot().choice, null)
  return { ...world, locks, storage, before }
}

test('the tab that owned the turn runs the pending call again after a reload', async () => {
  const { server, api, locks, storage, before } = await startOwnedChoice()
  assert.equal(storage.entries.size, 1)

  before.store.dispose()
  await settle()
  const after = makeTab(api, locks, storage)
  await openTab(after)

  assert.deepEqual(after.executedCalls, ['c1'])
  assert.notEqual(after.store.getSnapshot().choice, null)
  const view = currentView(after.store.getSnapshot())
  assert.equal(view.resume, null)
  assert.equal(view.runningInOtherTab, false)

  after.store.answerChoice(['b'])
  await settle()
  assert.deepEqual(server.toolResults.map((one) => one.callId), ['c1'])
})

test('a reloaded tab asks for approval again instead of running the action', async () => {
  const world = makeServer()
  const storage = makeSessionStorage()
  const ran: unknown[] = []
  const register = (tab: Tab) =>
    tab.registry.registerAction({
      spec: { id: 'qa.startRun', page: 'qa', description: 'start', args: { type: 'object' }, risk: 'approve', summarize: () => 'start' },
      target: () => null,
      blocked: () => null,
      run: async (args) => ran.push(args),
    })
  const before = makeTab(world.api, null, storage)
  register(before)
  await openTab(before)
  await before.store.send('start')
  await settle()
  deliver([before], world.server, assistant(world.nextMessageId(), call('c1', 'call_action', { action: 'qa.startRun' })), 'AWAITING_TOOL')
  await settle()
  before.store.dispose()
  await settle()

  const after = makeTab(world.api, null, storage)
  register(after)
  await openTab(after)
  assert.notEqual(after.registry.pendingApproval(), null)
  assert.deepEqual(ran, [])
  assert.deepEqual(world.server.toolResults, [])
})

test('a tab without a stored record shows the resume card after loading the same conversation', async () => {
  const { api, locks, before } = await startOwnedChoice()
  before.store.dispose()
  await settle()
  const other = makeTab(api, locks, makeSessionStorage())
  await openTab(other)

  assert.deepEqual(other.executedCalls, [])
  assert.equal(other.store.getSnapshot().choice, null)
  assert.notEqual(currentView(other.store.getSnapshot()).resume, null)
})

test('a reloaded tab does not run the call while another tab holds the lock', async () => {
  const { api, locks, storage } = await startOwnedChoice()
  // before 는 여전히 잠금을 잡고 있다. 같은 기록을 가진 새 탭이 따로 열렸다.
  const after = makeTab(api, locks, makeSessionStorage(storage.entries))
  await openTab(after)
  after.tick()
  await settle()

  assert.deepEqual(after.executedCalls, [])
  assert.equal(after.store.getSnapshot().choice, null)
  const view = currentView(after.store.getSnapshot())
  assert.equal(view.resume, null)
  assert.equal(view.runningInOtherTab, true)
})

test('Stop clears the stored record', async () => {
  const { storage, before } = await startOwnedChoice()
  assert.equal(storage.entries.size, 1)
  await before.store.cancel()
  await settle()
  assert.equal(storage.entries.size, 0)
})

test('the stored record is cleared when the conversation returns to IDLE', async () => {
  const { server, nextMessageId, storage, before } = await startOwnedChoice()
  before.store.answerChoice(['a'])
  await settle()
  deliver([before], server, message(nextMessageId(), 'ASSISTANT', { content: 'done' }), 'IDLE')
  await settle()
  assert.equal(storage.entries.size, 0)
})

test('storage that throws does not break running tools', async () => {
  const { server, api, nextMessageId } = makeServer()
  const broken: OwnershipStorage = {
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
  const tab = makeTab(api, null, broken)
  await openTab(tab)
  await tab.store.send('go')
  await settle()
  deliver([tab], server, assistant(nextMessageId(), call('c1', 'read_page')), 'AWAITING_TOOL')
  await settle()
  assert.deepEqual(tab.executedCalls, ['c1'])
})
