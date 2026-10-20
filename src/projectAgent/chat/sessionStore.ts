import { wireCatalog } from '../catalog'
import type { AgentRegistryApi, PendingApproval } from '../registry/types'
import { browserLockManager, conversationLockName, isLockHeld, runIfLockAvailable, type LockManagerLike } from '../webLocks'
import * as conversationApi from './conversationApi'
import {
  conversationStreamUrl,
  isConflict,
  parseConversationEvent,
  parseMessageEvent,
  type AgentMessage,
  type Conversation,
  type ToolCall,
} from './conversationApi'
import { readyEvents, removeEvent, type JobEventKind, type QueuedEvent } from './eventQueue'
import { projectRoute } from './pagePath'
import { isBusy, isOwnedAssistant, lastMessageId, mergeMessages, needsResume, pendingToolCalls } from './threadState'
import { executeToolCall } from './toolExecutor'
import { forgetWatches, resumeWatches } from './tools/watchJob'
import type { ChoiceOption, JobState, ToolContext } from './toolTypes'

/*
 * project agent 대화의 상태와 그 상태를 움직이는 일(stream, tool 실행, event 대기열)을 한곳에 둔다.
 *
 * React component 가 아니라 class 인 이유: 대화창을 닫아도 agent 는 멈추지 않아야 한다. 그래서 이
 * store 는 대화창보다 위(`ProjectWorkspace`)에서 만들어지고, 대화창은 `useSyncExternalStore` 로
 * 읽기만 한다. 실행 중인 tool, 열린 EventSource, 대기 중인 event 가 component 의 mount 와 무관하게
 * 살아 있어야 해서 hook 안의 effect 로 나누지 않았다.
 */

export type ThreadLoad = 'loading' | 'ready' | 'error'

export type Thread = {
  conversation: Conversation | null
  messages: readonly AgentMessage[]
  load: ThreadLoad
}

/**
 * 이 탭이 실행할 책임이 있는 ASSISTANT 메시지. `isOwnedAssistant` 를 본다.
 *
 * `ownedAfterId` 는 이 탭이 POST 해서 저장된 입력(USER 메시지, EVENT, TOOL_RESULT)의 id 다. 그 뒤에
 * 오는 ASSISTANT 는 이 탭이 보낸 입력에 대한 답이므로 이 탭이 실행한다. 대화가 IDLE 이나 ERROR 로
 * 돌아오면 지운다.
 */
export type Ownership = {
  ownedAfterId: number | null
}

/** 대화의 tool 호출 잠금을 다른 탭이 잡고 있는지. 아직 확인하지 않은 대화는 값이 없다. */
export type ConversationLockState = 'held' | 'free'

export type PendingChoice = {
  conversationId: number
  question: string
  options: ChoiceOption[]
  multiple: boolean
}

export type SessionState = {
  listLoad: 'loading' | 'ready' | 'error'
  conversations: Conversation[]
  currentId: number | null
  threads: Record<number, Thread>
  ownership: Record<number, Ownership>
  /** 대화마다 이 탭이 실행을 시작한 tool 호출. 이어서 하기 카드를 숨기는 데 쓴다. */
  startedCallIds: Record<number, string[]>
  /** 이어서 하기 카드를 그릴지 정하려고 확인한 tool 호출 잠금. */
  conversationLocks: Record<number, ConversationLockState>
  runningCall: { conversationId: number; callId: string } | null
  choice: PendingChoice | null
  approval: PendingApproval | null
  jobs: Record<number, JobState[]>
  /** 사용자가 대화창을 연 채로 본 job. 닫힌 대화창의 badge 에서 뺀다. */
  seenJobKeys: string[]
  sending: boolean
  /** 화면에 한 줄로 보여 줄 마지막 오류. 다음 동작이 지운다. */
  error: string | null
  panelOpen: boolean
}

export type SessionDependencies = {
  projectId: string
  registry: AgentRegistryApi
  /** router 의 절대 경로로 이동한다. */
  navigate: (to: string) => void
}

/** 대화 stream 이 넘겨주는 것. EventSource 의 세 event 와 같다. */
export type StreamHandlers = {
  onMessage: (message: AgentMessage) => void
  onConversation: (conversation: Conversation) => void
  onOpen: () => void
}

/** 대화 API 가운데 store 가 부르는 것. 테스트가 가짜를 넣는다. */
export type SessionConversationApi = Pick<
  typeof conversationApi,
  | 'cancelConversation'
  | 'createConversation'
  | 'deleteConversation'
  | 'getConversation'
  | 'listConversations'
  | 'listMessages'
  | 'sendEvent'
  | 'sendMessage'
  | 'sendToolResult'
>

/** 브라우저에 묶인 것들. 기본값은 실제 API, `navigator.locks`, EventSource, setInterval 이다. */
export type SessionEnvironment = {
  api: SessionConversationApi
  lockManager: LockManagerLike | null
  /** stream 을 열고 닫는 함수를 돌려준다. stream 을 열 수 없는 환경이면 null. */
  connectStream: ((projectId: string, conversationId: number, handlers: StreamHandlers) => () => void) | null
  executeTool: typeof executeToolCall
  /** `callback` 을 반복해 부르고, 멈추는 함수를 돌려준다. */
  repeat: (callback: () => void, milliseconds: number) => () => void
}

/** job 이 끝났는데 대화가 바빠 보내지 못한 event 를 다시 보내고, 다른 탭의 잠금을 다시 확인하는 간격. */
const RETRY_MS = 5000

const EMPTY_OWNERSHIP: Ownership = { ownedAfterId: null }
const NO_CALL_IDS: string[] = []

function connectEventSource(projectId: string, conversationId: number, handlers: StreamHandlers): () => void {
  const source = new EventSource(conversationStreamUrl(projectId, conversationId), { withCredentials: true })
  source.addEventListener('message', (event: MessageEvent) => {
    const message = parseMessageEvent(String(event.data))
    if (message !== null) handlers.onMessage(message)
  })
  source.addEventListener('conversation', (event: MessageEvent) => {
    const conversation = parseConversationEvent(String(event.data))
    if (conversation !== null) handlers.onConversation(conversation)
  })
  source.addEventListener('open', () => handlers.onOpen())
  return () => source.close()
}

function browserEnvironment(): SessionEnvironment {
  return {
    api: conversationApi,
    lockManager: browserLockManager(),
    connectStream: typeof EventSource === 'undefined' ? null : connectEventSource,
    executeTool: executeToolCall,
    repeat: (callback, milliseconds) => {
      const timer = setInterval(callback, milliseconds)
      return () => clearInterval(timer)
    },
  }
}

function storageKey(projectId: string): string {
  return `artel.projectAgent.conversation.${projectId}`
}

export function readStoredConversation(projectId: string): number | null {
  try {
    const raw = window.localStorage.getItem(storageKey(projectId))
    const id = raw === null ? Number.NaN : Number(raw)
    return Number.isInteger(id) && id > 0 ? id : null
  } catch {
    // storage 가 막혀 있으면 새 대화로 시작할 뿐이다.
    return null
  }
}

function storeConversation(projectId: string, conversationId: number | null): void {
  try {
    if (conversationId === null) window.localStorage.removeItem(storageKey(projectId))
    else window.localStorage.setItem(storageKey(projectId), String(conversationId))
  } catch {
    // 저장이 막혀도 이번 방문에서는 그대로 쓴다.
  }
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export class AgentSessionStore {
  private state: SessionState
  private dependencies: SessionDependencies
  private readonly environment: SessionEnvironment
  private readonly listeners = new Set<() => void>()
  /** 대화마다 열린 stream 을 닫는 함수. */
  private readonly streams = new Map<number, () => void>()
  /** 지금 대화가 아니어도 이 탭이 답을 기다리는 대화. 답이 끝날 때까지 stream 을 연다. */
  private readonly backgroundStreamIds = new Set<number>()
  private readonly loadingThreadIds = new Set<number>()
  private readonly batchConversationIds = new Set<number>()
  private readonly batchControllers = new Map<number, AbortController>()
  /** 대화마다 job 감시를 끊는 controller. 감시는 tool 호출 묶음보다 오래 살고, 멈추기나 삭제 때 끊는다. */
  private readonly watchControllers = new Map<number, AbortController>()
  /** 잠금 확인이 진행 중인 대화. */
  private readonly lockQueriesInFlight = new Set<number>()
  /** 대화마다 마지막으로 잠금을 확인한 ASSISTANT 메시지 id. 같은 호출을 거듭 확인하지 않는다. */
  private readonly lockQueriedAssistant = new Map<number, number>()
  private choiceResolver: ((optionIds: string[] | null) => void) | null = null
  private eventQueue: QueuedEvent[] = []
  private readonly sendingEventSequences = new Set<number>()
  private eventSequence = 0
  private stopRetryTimer: (() => void) | null = null
  private unsubscribeRegistry: (() => void) | null = null
  private reconcileScheduled = false
  private started = false

  constructor(dependencies: SessionDependencies, environment: Partial<SessionEnvironment> = {}) {
    this.dependencies = dependencies
    this.environment = { ...browserEnvironment(), ...environment }
    this.state = {
      listLoad: 'loading',
      conversations: [],
      currentId: readStoredConversation(dependencies.projectId),
      threads: {},
      ownership: {},
      startedCallIds: {},
      conversationLocks: {},
      runningCall: null,
      choice: null,
      approval: null,
      jobs: {},
      seenJobKeys: [],
      sending: false,
      error: null,
      panelOpen: false,
    }
  }

  get projectId(): string {
    return this.dependencies.projectId
  }

  // ---- useSyncExternalStore ----

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = (): SessionState => this.state

  private setState(patch: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>)): void {
    const next = typeof patch === 'function' ? patch(this.state) : patch
    this.state = { ...this.state, ...next }
    for (const listener of this.listeners) listener()
    this.scheduleReconcile()
  }

  // ---- lifecycle ----

  start(): void {
    if (this.started) return
    this.started = true
    this.watchRegistry()
    this.stopRetryTimer = this.environment.repeat(() => this.onRetryTick(), RETRY_MS)
    void this.loadConversations()
    this.scheduleReconcile()
  }

  /** stream, tool 실행, job 감시, event 재전송을 모두 멈춘다. 이 뒤로는 네트워크를 부르지 않는다. */
  dispose(): void {
    this.started = false
    for (const close of this.streams.values()) close()
    this.streams.clear()
    for (const controller of this.batchControllers.values()) controller.abort()
    // 감시만 끊는다. localStorage 기록은 남겨 다시 mount 될 때 resumeWatches 가 이어 본다.
    for (const controller of this.watchControllers.values()) controller.abort()
    this.watchControllers.clear()
    this.stopRetryTimer?.()
    this.stopRetryTimer = null
    this.unsubscribeRegistry?.()
    this.unsubscribeRegistry = null
  }

  setDependencies(dependencies: SessionDependencies): void {
    const registryChanged = dependencies.registry !== this.dependencies.registry
    this.dependencies = dependencies
    if (registryChanged && this.started) this.watchRegistry()
  }

  setPanelOpen(open: boolean): void {
    if (open === this.state.panelOpen) return
    this.setState((state) => ({ panelOpen: open, seenJobKeys: open ? finishedJobKeys(state.jobs) : state.seenJobKeys }))
  }

  private watchRegistry(): void {
    this.unsubscribeRegistry?.()
    const registry = this.dependencies.registry
    const readApproval = () => {
      const approval = registry.pendingApproval()
      if (approval !== this.state.approval) this.setState({ approval })
    }
    this.unsubscribeRegistry = registry.subscribe(readApproval)
    readApproval()
  }

  // ---- 사용자 동작 ----

  selectConversation(conversationId: number): void {
    if (conversationId === this.state.currentId) return
    storeConversation(this.dependencies.projectId, conversationId)
    this.setState({ currentId: conversationId, error: null })
  }

  /** 대화는 첫 메시지를 보낼 때 만든다. 빈 대화가 목록에 쌓이지 않게 한다. */
  newConversation(): void {
    storeConversation(this.dependencies.projectId, null)
    this.setState({ currentId: null, error: null })
  }

  async removeConversation(conversationId: number): Promise<void> {
    try {
      await this.environment.api.deleteConversation(this.dependencies.projectId, conversationId)
    } catch (error) {
      this.setState({ error: errorText(error) })
      return
    }
    this.stopBatch(conversationId)
    this.onConversationStopped(conversationId)
    this.backgroundStreamIds.delete(conversationId)
    this.eventQueue = this.eventQueue.filter((event) => event.conversationId !== conversationId)
    if (this.state.currentId === conversationId) storeConversation(this.dependencies.projectId, null)
    this.setState((state) => {
      const conversations = state.conversations.filter((conversation) => conversation.id !== conversationId)
      const keepIds = new Set(Object.keys(state.threads).map(Number))
      keepIds.delete(conversationId)
      return {
        ...pruneConversationState(state, keepIds),
        threads: keepConversations(state.threads, keepIds),
        conversations,
        currentId: state.currentId === conversationId ? null : state.currentId,
      }
    })
  }

  async send(text: string): Promise<void> {
    const trimmed = text.trim()
    if (trimmed.length === 0 || this.state.sending) return
    const current = this.currentThread()
    if (isBusy(current?.conversation ?? null)) return
    this.setState({ sending: true, error: null })
    const { projectId, registry } = this.dependencies
    try {
      let conversationId = this.state.currentId
      if (conversationId === null) {
        const created = await this.environment.api.createConversation(projectId, wireCatalog())
        conversationId = created.id
        storeConversation(projectId, created.id)
        this.setState((state) => ({
          conversations: [created, ...state.conversations],
          threads: { ...state.threads, [created.id]: { conversation: created, messages: [], load: 'ready' } },
          currentId: created.id,
        }))
      }
      const stored = await this.environment.api.sendMessage(projectId, conversationId, {
        text: trimmed,
        pageCatalog: wireCatalog(),
        page: registry.snapshot(),
      })
      this.applyMessages(conversationId, [stored])
      // 저장된 뒤에야 표시한다. 답이 POST 응답보다 먼저 stream 으로 와도 thread 에 남아 있으므로,
      // 표시한 뒤의 reconcile 이 실행한다.
      this.ownRepliesAfter(conversationId, stored.id)
      this.patchConversation(conversationId, (conversation) => ({
        ...conversation,
        status: 'RUNNING',
        title: conversation.title ?? trimmed.slice(0, 60),
      }))
    } catch (error) {
      this.setState({ error: isConflict(error) ? null : errorText(error) })
    } finally {
      this.setState({ sending: false })
    }
  }

  /** 멈추기. 실행 중인 tool 을 끊고, 승인과 선택 대기를 닫고, 서버에 `cancel` 을 보낸다. */
  async cancel(): Promise<void> {
    const conversationId = this.state.currentId
    if (conversationId === null) return
    this.stopBatch(conversationId)
    this.onConversationStopped(conversationId)
    try {
      const conversation = await this.environment.api.cancelConversation(this.dependencies.projectId, conversationId)
      this.applyConversation(conversation)
    } catch (error) {
      this.setState({ error: errorText(error) })
    }
  }

  /**
   * 이어서 하기. 답이 없는 호출을 이 탭이 맡아 실행한다. 그 사이 다른 탭이 잠금을 잡았으면
   * 실행하지 않고 "다른 탭에서 진행 중" 으로 바뀐다.
   */
  resume(): void {
    const conversationId = this.state.currentId
    if (conversationId === null) return
    const pending = pendingToolCalls(this.state.threads[conversationId]?.messages ?? [])
    if (pending === null) return
    // 답이 없는 호출은 늘 가장 최근 ASSISTANT 의 것이라, 그 바로 앞 id 부터 맡으면 그 메시지와 그
    // 뒤의 답만 맡는다.
    this.updateOwnership(conversationId, () => ({ ownedAfterId: pending.assistantId - 1 }))
  }

  answerChoice(optionIds: string[]): void {
    this.resolveChoice(optionIds)
  }

  // ---- 내부: thread ----

  private currentThread(): Thread | null {
    const id = this.state.currentId
    return id === null ? null : (this.state.threads[id] ?? null)
  }

  private applyMessages(conversationId: number, incoming: AgentMessage[]): void {
    this.setState((state) => {
      const thread = state.threads[conversationId] ?? { conversation: null, messages: [], load: 'loading' as const }
      const messages = mergeMessages(thread.messages, incoming)
      if (messages === thread.messages) return {}
      return { threads: { ...state.threads, [conversationId]: { ...thread, messages } } }
    })
  }

  private applyConversation(conversation: Conversation): void {
    if (!isBusy(conversation)) this.backgroundStreamIds.delete(conversation.id)
    const previousStatus = this.state.threads[conversation.id]?.conversation?.status
    // AWAITING_TOOL 을 벗어났으면 서버가 더는 이 호출들의 결과를 받지 않는다. 다른 탭이 답했거나
    // 멈추기가 처리한 것이므로 실행 중인 묶음과 열린 선택, 승인 카드를 닫는다.
    if (previousStatus === 'AWAITING_TOOL' && conversation.status !== 'AWAITING_TOOL') this.stopBatch(conversation.id)
    this.setState((state) => {
      const thread = state.threads[conversation.id] ?? { conversation: null, messages: [], load: 'loading' as const }
      const listed = state.conversations.some((one) => one.id === conversation.id)
      return {
        threads: { ...state.threads, [conversation.id]: { ...thread, conversation } },
        conversations: listed
          ? state.conversations.map((one) => (one.id === conversation.id ? conversation : one))
          : [conversation, ...state.conversations],
        ownership: ownershipAfterStatus(state.ownership, conversation, thread.messages),
      }
    })
  }

  private patchConversation(conversationId: number, change: (conversation: Conversation) => Conversation): void {
    const conversation = this.state.threads[conversationId]?.conversation
    if (conversation !== null && conversation !== undefined) this.applyConversation(change(conversation))
  }

  private updateOwnership(conversationId: number, change: (ownership: Ownership) => Ownership): void {
    this.setState((state) => ({
      ownership: { ...state.ownership, [conversationId]: change(state.ownership[conversationId] ?? EMPTY_OWNERSHIP) },
    }))
  }

  /** 이 탭이 POST 해서 저장된 입력 `inputMessageId` 뒤에 생기는 ASSISTANT 를 이 탭이 맡는다. */
  private ownRepliesAfter(conversationId: number, inputMessageId: number): void {
    this.updateOwnership(conversationId, (ownership) => ({
      ownedAfterId: Math.max(ownership.ownedAfterId ?? 0, inputMessageId),
    }))
    if (conversationId !== this.state.currentId) this.backgroundStreamIds.add(conversationId)
  }

  private async loadConversations(): Promise<void> {
    try {
      const conversations = await this.environment.api.listConversations(this.dependencies.projectId)
      const currentId = this.state.currentId
      // 지워졌거나 다른 사람의 대화가 저장되어 있으면 새 대화로 시작한다.
      const keepCurrent = currentId === null || conversations.some((one) => one.id === currentId) || currentId in this.state.threads
      if (!keepCurrent) storeConversation(this.dependencies.projectId, null)
      this.setState((state) => {
        const merged = mergeConversationLists(conversations, state.conversations)
        const keepIds = new Set(merged.map((one) => one.id))
        if (keepCurrent && state.currentId !== null) keepIds.add(state.currentId)
        return {
          ...pruneConversationState(state, keepIds),
          listLoad: 'ready',
          conversations: merged,
          currentId: keepCurrent ? state.currentId : null,
        }
      })
    } catch {
      this.setState({ listLoad: 'error' })
    }
  }

  private async loadThread(conversationId: number): Promise<void> {
    if (this.loadingThreadIds.has(conversationId)) return
    this.loadingThreadIds.add(conversationId)
    const { projectId } = this.dependencies
    try {
      const [conversation, messages] = await Promise.all([
        this.environment.api.getConversation(projectId, conversationId),
        this.environment.api.listMessages(projectId, conversationId),
      ])
      this.applyMessages(conversationId, messages)
      this.applyConversation(conversation)
      this.setThreadLoad(conversationId, 'ready')
      this.onConversationOpened(conversationId)
    } catch {
      this.setThreadLoad(conversationId, 'error')
    } finally {
      this.loadingThreadIds.delete(conversationId)
    }
  }

  private setThreadLoad(conversationId: number, load: ThreadLoad): void {
    this.setState((state) => {
      const thread = state.threads[conversationId] ?? { conversation: null, messages: [], load }
      return { threads: { ...state.threads, [conversationId]: { ...thread, load } } }
    })
  }

  // ---- 내부: 상태가 바뀔 때마다 맞추는 일 ----

  private scheduleReconcile(): void {
    if (this.reconcileScheduled || !this.started) return
    this.reconcileScheduled = true
    queueMicrotask(() => {
      this.reconcileScheduled = false
      if (!this.started) return
      this.syncStreams()
      this.loadMissingThreads()
      this.startOwnedBatches()
      this.flushEvents()
      this.checkCurrentLock(false)
    })
  }

  private streamTargets(): Set<number> {
    const targets = new Set(this.backgroundStreamIds)
    if (this.state.currentId !== null) targets.add(this.state.currentId)
    for (const id of this.batchConversationIds) targets.add(id)
    return targets
  }

  private loadMissingThreads(): void {
    for (const id of this.streamTargets()) {
      if (this.state.threads[id] === undefined) {
        this.setThreadLoad(id, 'loading')
        void this.loadThread(id)
      }
    }
  }

  private syncStreams(): void {
    const connect = this.environment.connectStream
    if (connect === null) return
    const targets = this.streamTargets()
    for (const [id, close] of this.streams) {
      if (!targets.has(id)) {
        close()
        this.streams.delete(id)
      }
    }
    for (const id of targets) {
      if (!this.streams.has(id)) {
        this.streams.set(
          id,
          connect(this.dependencies.projectId, id, {
            onMessage: (message) => this.applyMessages(id, [message]),
            onConversation: (conversation) => this.applyConversation(conversation),
            // 처음 `GET messages` 와 연결 사이, 그리고 다시 연결되는 사이에 저장된 메시지를 다시
            // 읽는다. 처음 읽기가 아직 끝나지 않았어도 다시 읽는다. 그 읽기가 연결보다 먼저 DB 를
            // 읽었을 수 있다.
            onOpen: () => void this.refreshThread(id),
          }),
        )
      }
    }
  }

  private async refreshThread(conversationId: number): Promise<void> {
    const { projectId } = this.dependencies
    try {
      const [conversation, messages] = await Promise.all([
        this.environment.api.getConversation(projectId, conversationId),
        this.environment.api.listMessages(projectId, conversationId),
      ])
      this.applyMessages(conversationId, messages)
      this.applyConversation(conversation)
    } catch {
      // stream 이 다시 열릴 때 다시 읽는다.
    }
  }

  // ---- 내부: tool 실행 ----

  private startOwnedBatches(): void {
    for (const [key, thread] of Object.entries(this.state.threads)) {
      const conversationId = Number(key)
      if (this.batchConversationIds.has(conversationId)) continue
      const pending = pendingToolCalls(thread.messages)
      if (pending === null) continue
      const ownership = this.state.ownership[conversationId] ?? EMPTY_OWNERSHIP
      if (!isOwnedAssistant(pending.assistantId, ownership)) continue
      const started = this.state.startedCallIds[conversationId] ?? NO_CALL_IDS
      if (pending.calls.some((call) => started.includes(call.callId))) continue
      void this.runBatch(conversationId, pending.calls)
    }
  }

  /**
   * 대화의 잠금을 잡은 동안만 실행한다. 다른 탭이 잡고 있으면 그 탭이 실행 중이므로 이 탭은 맡은
   * 것을 내려놓고, 이어서 하기 카드 대신 "다른 탭에서 진행 중" 을 보여 준다.
   */
  private async runBatch(conversationId: number, calls: ToolCall[]): Promise<void> {
    this.batchConversationIds.add(conversationId)
    const controller = new AbortController()
    this.batchControllers.set(conversationId, controller)
    let granted = false
    try {
      granted = await runIfLockAvailable(this.environment.lockManager, conversationLockName(conversationId), () =>
        this.executeBatch(conversationId, calls, controller.signal),
      )
    } finally {
      this.batchConversationIds.delete(conversationId)
      if (this.batchControllers.get(conversationId) === controller) this.batchControllers.delete(conversationId)
      this.setState((state) => ({
        runningCall: state.runningCall?.conversationId === conversationId ? null : state.runningCall,
        ownership: granted ? state.ownership : withoutKey(state.ownership, conversationId),
      }))
    }
    if (!granted) this.checkLock(conversationId, true)
  }

  private async executeBatch(conversationId: number, calls: ToolCall[], signal: AbortSignal): Promise<void> {
    const callIds = calls.map((call) => call.callId)
    this.setState((state) => ({
      startedCallIds: {
        ...state.startedCallIds,
        [conversationId]: [...(state.startedCallIds[conversationId] ?? NO_CALL_IDS), ...callIds],
      },
    }))
    for (const call of calls) {
      if (signal.aborted) return
      this.setState({ runningCall: { conversationId, callId: call.callId } })
      // watch_job 이 시작한 감시는 결과를 보낸 뒤에도 돌아야 하므로 묶음의 signal 이 아니라 대화의
      // 감시 signal 을 받는다. 멈추기, 삭제, dispose 가 그 signal 을 끊는다.
      const callSignal = call.tool === 'watch_job' ? this.watchSignal(conversationId) : signal
      const body = await this.environment.executeTool(call, this.toolContext(conversationId, callSignal))
      if (signal.aborted) return
      try {
        const stored = await this.environment.api.sendToolResult(this.dependencies.projectId, conversationId, call.callId, body)
        this.applyMessages(conversationId, [stored])
        // 마지막 결과를 보내면 서버가 다음 step 을 부른다. 그 답도 이 탭이 이어서 실행한다.
        this.ownRepliesAfter(conversationId, stored.id)
      } catch (error) {
        // 409 는 다른 탭이 먼저 답했거나 멈추기가 처리한 것이다. 이 묶음을 그만둔다.
        if (isConflict(error)) return
        this.releaseBatch(conversationId, callIds)
        this.setState({ error: errorText(error) })
        return
      }
    }
  }

  /** 실행 중인 묶음을 끊고, 그 대화의 선택 카드와 승인 카드를 닫는다. */
  private stopBatch(conversationId: number): void {
    const controller = this.batchControllers.get(conversationId)
    if (controller === undefined) return
    // tool 은 registry 에 이 signal 을 넘기므로 승인 대기는 abort 만으로 `cancelled` 로 끝난다.
    controller.abort()
    if (this.state.choice?.conversationId === conversationId) this.resolveChoice(null)
    this.dependencies.registry.pendingApproval()?.reject()
  }

  /** 결과를 보내지 못했을 때 맡은 것을 내려놓는다. 그러면 이어서 하기 카드로 다시 시도할 수 있다. */
  private releaseBatch(conversationId: number, callIds: string[]): void {
    this.setState((state) => ({
      startedCallIds: {
        ...state.startedCallIds,
        [conversationId]: (state.startedCallIds[conversationId] ?? NO_CALL_IDS).filter((id) => !callIds.includes(id)),
      },
      ownership: withoutKey(state.ownership, conversationId),
    }))
  }

  // ---- 내부: 다른 탭의 잠금 ----

  private onRetryTick(): void {
    this.flushEvents()
    this.checkCurrentLock(true)
  }

  /** 지금 대화가 이어서 하기 카드를 그릴 상황이면 다른 탭이 잠금을 잡고 있는지 확인한다. */
  private checkCurrentLock(force: boolean): void {
    const conversationId = this.state.currentId
    if (conversationId === null) return
    const thread = this.state.threads[conversationId]
    if (thread === undefined) return
    const pending = needsResume(
      thread.conversation,
      thread.messages,
      this.state.ownership[conversationId] ?? EMPTY_OWNERSHIP,
      this.state.startedCallIds[conversationId] ?? NO_CALL_IDS,
    )
    if (pending === null) return
    if (!force && this.lockQueriedAssistant.get(conversationId) === pending.assistantId) return
    this.lockQueriedAssistant.set(conversationId, pending.assistantId)
    this.checkLock(conversationId, force)
  }

  private checkLock(conversationId: number, force: boolean): void {
    if (this.lockQueriesInFlight.has(conversationId)) return
    if (!force && this.state.conversationLocks[conversationId] !== undefined) return
    this.lockQueriesInFlight.add(conversationId)
    void isLockHeld(this.environment.lockManager, conversationLockName(conversationId))
      .catch(() => false)
      .then((held) => {
        this.lockQueriesInFlight.delete(conversationId)
        if (!this.started) return
        const lockState: ConversationLockState = held ? 'held' : 'free'
        if (this.state.conversationLocks[conversationId] === lockState) return
        this.setState((state) => ({ conversationLocks: { ...state.conversationLocks, [conversationId]: lockState } }))
      })
  }

  /** 대화를 처음 읽어 온 뒤 부른다. 새로고침 전에 지켜보던 job 의 진행 카드를 다시 지켜본다. */
  private onConversationOpened(conversationId: number): void {
    resumeWatches(this.toolContext(conversationId, this.watchSignal(conversationId)))
  }

  /** 사용자가 멈추기를 누르거나 대화를 지울 때 부른다. job 감시를 끊고 이어서 볼 기록도 지운다. */
  private onConversationStopped(conversationId: number): void {
    this.watchControllers.get(conversationId)?.abort()
    this.watchControllers.delete(conversationId)
    forgetWatches({ projectId: this.dependencies.projectId, conversationId })
  }

  /** 대화의 job 감시 signal. 멈추기, 삭제, dispose 때 abort 된다. */
  private watchSignal(conversationId: number): AbortSignal {
    let controller = this.watchControllers.get(conversationId)
    if (controller === undefined) {
      controller = new AbortController()
      this.watchControllers.set(conversationId, controller)
    }
    return controller.signal
  }

  private toolContext(conversationId: number, signal: AbortSignal): ToolContext {
    const { projectId, registry, navigate } = this.dependencies
    return {
      projectId,
      conversationId,
      registry,
      signal,
      navigate: (path) => navigate(projectRoute(projectId, path)),
      upsertJob: (job) => this.upsertJob(conversationId, job),
      postEvent: (kind, summary, data) => this.enqueueEvent(conversationId, kind, summary, data),
      askChoice: (question, options, multiple = false) => this.askChoice(conversationId, question, options, multiple, signal),
    }
  }

  private askChoice(
    conversationId: number,
    question: string,
    options: ChoiceOption[],
    multiple: boolean,
    signal: AbortSignal,
  ): Promise<string[] | null> {
    // 열린 선택 카드를 새 질문으로 덮으면 앞 질문의 답을 잃는다. 새 질문을 error 로 돌려보낸다.
    if (this.choiceResolver !== null) return Promise.reject(new Error('another choice is open'))
    if (signal.aborted) return Promise.resolve(null)
    return new Promise((resolve) => {
      const onAbort = () => {
        if (this.choiceResolver === settle) this.resolveChoice(null)
      }
      const settle = (optionIds: string[] | null) => {
        signal.removeEventListener('abort', onAbort)
        resolve(optionIds)
      }
      this.choiceResolver = settle
      this.setState({ choice: { conversationId, question, options, multiple } })
      signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  private resolveChoice(optionIds: string[] | null): void {
    const resolve = this.choiceResolver
    this.choiceResolver = null
    this.setState({ choice: null })
    resolve?.(optionIds)
  }

  private upsertJob(conversationId: number, job: JobState): void {
    this.setState((state) => {
      const jobs = state.jobs[conversationId] ?? []
      const exists = jobs.some((one) => one.key === job.key)
      const nextJobs = exists ? jobs.map((one) => (one.key === job.key ? job : one)) : [...jobs, job]
      const seen = state.panelOpen && job.state !== 'running' ? [...state.seenJobKeys, job.key] : state.seenJobKeys
      return { jobs: { ...state.jobs, [conversationId]: nextJobs }, seenJobKeys: seen }
    })
  }

  // ---- 내부: event 대기열 ----

  private enqueueEvent(conversationId: number, kind: JobEventKind, summary: string, data?: unknown): void {
    this.eventSequence += 1
    this.eventQueue = [...this.eventQueue, { sequence: this.eventSequence, conversationId, kind, summary, data }]
    this.flushEvents()
  }

  private flushEvents(): void {
    if (!this.started) return
    const statusOf = (conversationId: number) => this.state.threads[conversationId]?.conversation?.status
    for (const event of readyEvents(this.eventQueue, statusOf)) {
      if (this.sendingEventSequences.has(event.sequence)) continue
      void this.sendQueuedEvent(event)
    }
  }

  private async sendQueuedEvent(event: QueuedEvent): Promise<void> {
    this.sendingEventSequences.add(event.sequence)
    const { conversationId } = event
    try {
      const stored = await this.environment.api.sendEvent(this.dependencies.projectId, conversationId, {
        kind: event.kind,
        summary: event.summary,
        data: event.data,
      })
      this.eventQueue = removeEvent(this.eventQueue, event.sequence)
      this.applyMessages(conversationId, [stored])
      // 409 로 실패한 재시도는 여기까지 오지 않으므로 맡지 않는다.
      this.ownRepliesAfter(conversationId, stored.id)
      this.patchConversation(conversationId, (conversation) => ({ ...conversation, status: 'RUNNING' }))
    } catch (error) {
      // 409 는 아직 바쁘다는 뜻이라 다음 시도까지 둔다. 그 밖의 오류(지워진 대화 등)는 버린다.
      if (!isConflict(error)) this.eventQueue = removeEvent(this.eventQueue, event.sequence)
      if (!isConflict(error)) this.backgroundStreamIds.delete(conversationId)
    } finally {
      this.sendingEventSequences.delete(event.sequence)
    }
  }
}

function finishedJobKeys(jobs: Record<number, JobState[]>): string[] {
  return Object.values(jobs)
    .flat()
    .filter((job) => job.state !== 'running')
    .map((job) => job.key)
}

function withoutKey<T>(record: Record<number, T>, key: number): Record<number, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}

/**
 * 대화가 IDLE 이나 ERROR 로 돌아오면 그 차례의 답은 끝났으므로 맡은 것을 지운다. 다만 이 탭이 보낸
 * 입력 뒤에 아직 아무 메시지도 없으면 지우지 않는다. 입력을 보내기 전에 읽은 IDLE 이 늦게 도착한
 * 것일 수 있다.
 */
function ownershipAfterStatus(
  ownership: Record<number, Ownership>,
  conversation: Conversation,
  messages: readonly AgentMessage[],
): Record<number, Ownership> {
  const owned = ownership[conversation.id]
  if (owned === undefined || owned.ownedAfterId === null) return ownership
  if (conversation.status !== 'IDLE' && conversation.status !== 'ERROR') return ownership
  if (lastMessageId(messages) <= owned.ownedAfterId) return ownership
  return withoutKey(ownership, conversation.id)
}

function keepConversations<T>(record: Record<number, T>, keepIds: ReadonlySet<number>): Record<number, T> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => keepIds.has(Number(key))))
}

/** `keepIds` 에 없는 대화의 맡은 것, 시작한 호출, 잠금 확인 결과를 지운다. */
function pruneConversationState(
  state: SessionState,
  keepIds: ReadonlySet<number>,
): Pick<SessionState, 'ownership' | 'startedCallIds' | 'conversationLocks'> {
  return {
    ownership: keepConversations(state.ownership, keepIds),
    startedCallIds: keepConversations(state.startedCallIds, keepIds),
    conversationLocks: keepConversations(state.conversationLocks, keepIds),
  }
}

/** 서버 목록을 우선하되, 목록이 오기 전에 이 탭이 만든 대화는 남긴다. */
function mergeConversationLists(fromServer: Conversation[], local: Conversation[]): Conversation[] {
  const serverIds = new Set(fromServer.map((one) => one.id))
  return [...local.filter((one) => !serverIds.has(one.id)), ...fromServer]
}
