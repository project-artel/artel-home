import { wireCatalog } from '../catalog'
import type { AgentRegistryApi, PendingApproval } from '../registry/types'
import {
  cancelConversation,
  conversationStreamUrl,
  createConversation,
  deleteConversation,
  getConversation,
  isConflict,
  listConversations,
  listMessages,
  parseConversationEvent,
  parseMessageEvent,
  sendEvent,
  sendMessage,
  sendToolResult,
  type AgentMessage,
  type Conversation,
  type ToolCall,
} from './conversationApi'
import { readyEvents, removeEvent, type JobEventKind, type QueuedEvent } from './eventQueue'
import { projectRoute } from './pagePath'
import { isBusy, isOwnedAssistant, lastMessageId, mergeMessages, pendingToolCalls } from './threadState'
import { executeToolCall } from './toolExecutor'
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

/** 이 탭이 실행할 책임이 있는 ASSISTANT 메시지. `isOwnedAssistant` 를 본다. */
export type Ownership = {
  ownedAfterId: number | null
  liveAssistantIds: number[]
}

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
  /** 이 탭이 실행을 시작한 tool 호출. 이어서 하기 카드를 숨기는 데 쓴다. */
  startedCallIds: string[]
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

/** job 이 끝났는데 대화가 바빠 보내지 못한 event 를 다시 시도하는 간격. */
const EVENT_RETRY_MS = 5000

const EMPTY_OWNERSHIP: Ownership = { ownedAfterId: null, liveAssistantIds: [] }

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
  private readonly listeners = new Set<() => void>()
  private readonly streams = new Map<number, EventSource>()
  /** 지금 대화가 아니어도 이 탭이 답을 기다리는 대화. 답이 끝날 때까지 stream 을 연다. */
  private readonly backgroundStreamIds = new Set<number>()
  private readonly loadingThreadIds = new Set<number>()
  private readonly batchConversationIds = new Set<number>()
  private readonly batchControllers = new Map<number, AbortController>()
  private choiceResolver: ((optionIds: string[] | null) => void) | null = null
  private eventQueue: QueuedEvent[] = []
  private readonly sendingEventSequences = new Set<number>()
  private eventSequence = 0
  private eventTimer: ReturnType<typeof setInterval> | null = null
  private unsubscribeRegistry: (() => void) | null = null
  private reconcileScheduled = false
  private started = false

  constructor(dependencies: SessionDependencies) {
    this.dependencies = dependencies
    this.state = {
      listLoad: 'loading',
      conversations: [],
      currentId: readStoredConversation(dependencies.projectId),
      threads: {},
      ownership: {},
      startedCallIds: [],
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
    this.eventTimer = setInterval(() => this.flushEvents(), EVENT_RETRY_MS)
    void this.loadConversations()
    this.scheduleReconcile()
  }

  dispose(): void {
    this.started = false
    for (const source of this.streams.values()) source.close()
    this.streams.clear()
    for (const controller of this.batchControllers.values()) controller.abort()
    if (this.eventTimer !== null) clearInterval(this.eventTimer)
    this.eventTimer = null
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
      await deleteConversation(this.dependencies.projectId, conversationId)
    } catch (error) {
      this.setState({ error: errorText(error) })
      return
    }
    this.batchControllers.get(conversationId)?.abort()
    this.onConversationStopped(conversationId)
    this.backgroundStreamIds.delete(conversationId)
    if (this.state.currentId === conversationId) storeConversation(this.dependencies.projectId, null)
    this.setState((state) => {
      const threads = { ...state.threads }
      delete threads[conversationId]
      return {
        conversations: state.conversations.filter((conversation) => conversation.id !== conversationId),
        threads,
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
        const created = await createConversation(projectId, wireCatalog())
        conversationId = created.id
        storeConversation(projectId, created.id)
        this.setState((state) => ({
          conversations: [created, ...state.conversations],
          threads: { ...state.threads, [created.id]: { conversation: created, messages: [], load: 'ready' } },
          currentId: created.id,
        }))
      }
      // 이 메시지 뒤에 오는 ASSISTANT 는 이 탭이 실행한다. 보내기 전에 표시해 두어야 응답이
      // stream 보다 먼저 와도 놓치지 않는다.
      this.claimReplies(conversationId)
      const stored = await sendMessage(projectId, conversationId, {
        text: trimmed,
        pageCatalog: wireCatalog(),
        page: registry.snapshot(),
      })
      this.applyMessages(conversationId, [stored])
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
    this.batchControllers.get(conversationId)?.abort()
    if (this.state.choice?.conversationId === conversationId) this.resolveChoice(null)
    this.dependencies.registry.pendingApproval()?.reject()
    this.onConversationStopped(conversationId)
    try {
      const conversation = await cancelConversation(this.dependencies.projectId, conversationId)
      this.applyConversation(conversation)
    } catch (error) {
      this.setState({ error: errorText(error) })
    }
  }

  /** 이어서 하기. 답이 없는 호출을 이 탭이 맡아 실행한다. */
  resume(): void {
    const conversationId = this.state.currentId
    if (conversationId === null) return
    const pending = pendingToolCalls(this.state.threads[conversationId]?.messages ?? [])
    if (pending === null) return
    this.updateOwnership(conversationId, (ownership) => ({
      ...ownership,
      liveAssistantIds: [...ownership.liveAssistantIds, pending.assistantId],
    }))
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
    this.setState((state) => {
      const thread = state.threads[conversation.id] ?? { conversation: null, messages: [], load: 'loading' as const }
      const listed = state.conversations.some((one) => one.id === conversation.id)
      return {
        threads: { ...state.threads, [conversation.id]: { ...thread, conversation } },
        conversations: listed
          ? state.conversations.map((one) => (one.id === conversation.id ? conversation : one))
          : [conversation, ...state.conversations],
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

  /** 지금까지의 마지막 메시지 뒤에 생기는 ASSISTANT 를 이 탭이 맡는다. */
  private claimReplies(conversationId: number): void {
    const lastId = lastMessageId(this.state.threads[conversationId]?.messages ?? [])
    this.updateOwnership(conversationId, (ownership) => ({
      ...ownership,
      ownedAfterId: Math.max(ownership.ownedAfterId ?? 0, lastId),
    }))
    if (conversationId !== this.state.currentId) this.backgroundStreamIds.add(conversationId)
  }

  private async loadConversations(): Promise<void> {
    try {
      const conversations = await listConversations(this.dependencies.projectId)
      const currentId = this.state.currentId
      // 지워졌거나 다른 사람의 대화가 저장되어 있으면 새 대화로 시작한다.
      const keepCurrent = currentId === null || conversations.some((one) => one.id === currentId) || currentId in this.state.threads
      if (!keepCurrent) storeConversation(this.dependencies.projectId, null)
      this.setState((state) => ({
        listLoad: 'ready',
        conversations: mergeConversationLists(conversations, state.conversations),
        currentId: keepCurrent ? state.currentId : null,
      }))
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
        getConversation(projectId, conversationId),
        listMessages(projectId, conversationId),
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
    if (typeof EventSource === 'undefined') return
    const targets = this.streamTargets()
    for (const [id, source] of this.streams) {
      if (!targets.has(id)) {
        source.close()
        this.streams.delete(id)
      }
    }
    for (const id of targets) {
      if (!this.streams.has(id)) this.streams.set(id, this.openStream(id))
    }
  }

  private openStream(conversationId: number): EventSource {
    const source = new EventSource(conversationStreamUrl(this.dependencies.projectId, conversationId), {
      withCredentials: true,
    })
    source.addEventListener('message', (event: MessageEvent) => {
      const message = parseMessageEvent(String(event.data))
      if (message === null) return
      // SSE 로 바로 온 ASSISTANT 는 이 탭이 실행한다. stream 은 지난 메시지를 다시 보내지 않으므로
      // 여기 오는 것은 방금 저장된 것뿐이다.
      if (message.role === 'ASSISTANT' && message.toolCalls.length > 0) {
        this.updateOwnership(conversationId, (ownership) => ({
          ...ownership,
          liveAssistantIds: [...ownership.liveAssistantIds, message.id],
        }))
      }
      this.applyMessages(conversationId, [message])
    })
    source.addEventListener('conversation', (event: MessageEvent) => {
      const conversation = parseConversationEvent(String(event.data))
      if (conversation !== null) this.applyConversation(conversation)
    })
    // 처음 `GET messages` 와 연결 사이, 그리고 다시 연결되는 사이에 저장된 메시지를 다시 읽는다.
    // 처음 읽기가 아직 끝나지 않았어도 다시 읽는다. 그 읽기가 연결보다 먼저 DB 를 읽었을 수 있다.
    source.addEventListener('open', () => void this.refreshThread(conversationId))
    return source
  }

  private async refreshThread(conversationId: number): Promise<void> {
    const { projectId } = this.dependencies
    try {
      const [conversation, messages] = await Promise.all([
        getConversation(projectId, conversationId),
        listMessages(projectId, conversationId),
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
      if (pending.calls.some((call) => this.state.startedCallIds.includes(call.callId))) continue
      void this.runBatch(conversationId, pending.assistantId, pending.calls)
    }
  }

  private async runBatch(conversationId: number, assistantId: number, calls: ToolCall[]): Promise<void> {
    this.batchConversationIds.add(conversationId)
    const controller = new AbortController()
    this.batchControllers.set(conversationId, controller)
    const callIds = calls.map((call) => call.callId)
    this.setState((state) => ({ startedCallIds: [...state.startedCallIds, ...callIds] }))
    // 마지막 결과를 보내면 서버가 다음 step 을 부른다. 그 답도 이 탭이 이어서 실행한다.
    this.updateOwnership(conversationId, (ownership) => ({
      ...ownership,
      ownedAfterId: Math.max(ownership.ownedAfterId ?? 0, assistantId),
    }))
    try {
      for (const call of calls) {
        if (controller.signal.aborted) return
        this.setState({ runningCall: { conversationId, callId: call.callId } })
        const body = await executeToolCall(call, this.toolContext(conversationId, controller.signal))
        if (controller.signal.aborted) return
        try {
          const stored = await sendToolResult(this.dependencies.projectId, conversationId, call.callId, body)
          this.applyMessages(conversationId, [stored])
        } catch (error) {
          // 409 는 다른 탭이 먼저 답했거나 멈추기가 처리한 것이다. 이 묶음을 그만둔다.
          if (isConflict(error)) return
          this.releaseBatch(conversationId, callIds)
          this.setState({ error: errorText(error) })
          return
        }
      }
    } finally {
      this.batchConversationIds.delete(conversationId)
      this.batchControllers.delete(conversationId)
      this.setState((state) => ({
        runningCall: state.runningCall?.conversationId === conversationId ? null : state.runningCall,
      }))
    }
  }

  /** 결과를 보내지 못했을 때 맡은 것을 내려놓는다. 그러면 이어서 하기 카드로 다시 시도할 수 있다. */
  private releaseBatch(conversationId: number, callIds: string[]): void {
    this.setState((state) => ({
      startedCallIds: state.startedCallIds.filter((id) => !callIds.includes(id)),
      ownership: { ...state.ownership, [conversationId]: EMPTY_OWNERSHIP },
    }))
  }

  /**
   * hook point: 대화를 처음 읽어 온 뒤 부른다. branch 를 합칠 때 `watchJob.ts` 의
   * `resumeWatches(context)` 를 여기서 부른다(새로고침 뒤 job 진행 카드를 다시 지켜보게 한다).
   */
  private onConversationOpened(conversationId: number): void {
    const context = this.toolContext(conversationId, new AbortController().signal)
    void context
  }

  /**
   * hook point: 사용자가 멈추기를 누르거나 대화를 지울 때 부른다. branch 를 합칠 때
   * `watchJob.ts` 의 `forgetWatches(context)` 를 여기서 부른다.
   */
  private onConversationStopped(conversationId: number): void {
    const context = this.toolContext(conversationId, new AbortController().signal)
    void context
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
    return new Promise((resolve) => {
      this.choiceResolver?.(null)
      this.choiceResolver = resolve
      this.setState({ choice: { conversationId, question, options, multiple } })
      signal.addEventListener('abort', () => {
        if (this.choiceResolver === resolve) this.resolveChoice(null)
      })
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
    const statusOf = (conversationId: number) => this.state.threads[conversationId]?.conversation?.status
    for (const event of readyEvents(this.eventQueue, statusOf)) {
      if (this.sendingEventSequences.has(event.sequence)) continue
      void this.sendQueuedEvent(event)
    }
  }

  private async sendQueuedEvent(event: QueuedEvent): Promise<void> {
    this.sendingEventSequences.add(event.sequence)
    const { conversationId } = event
    this.claimReplies(conversationId)
    try {
      const stored = await sendEvent(this.dependencies.projectId, conversationId, {
        kind: event.kind,
        summary: event.summary,
        data: event.data,
      })
      this.eventQueue = removeEvent(this.eventQueue, event.sequence)
      this.applyMessages(conversationId, [stored])
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

/** 서버 목록을 우선하되, 목록이 오기 전에 이 탭이 만든 대화는 남긴다. */
function mergeConversationLists(fromServer: Conversation[], local: Conversation[]): Conversation[] {
  const serverIds = new Set(fromServer.map((one) => one.id))
  return [...local.filter((one) => !serverIds.has(one.id)), ...fromServer]
}
