import type { AgentMessage, Conversation, ToolCall, ToolResultRecord } from './conversationApi'

/*
 * 대화 한 개의 메시지를 다루는 순수 함수. React 와 네트워크를 모르므로 node:test 로 검사한다.
 */

/**
 * `GET messages` 와 SSE 로 온 메시지를 합친다. 같은 id 는 하나만 남기고 id 순으로 정렬한다.
 *
 * stream 은 지난 메시지를 다시 보내지 않으므로, 브라우저는 `GET messages` 를 먼저 읽고 stream 을
 * 연다. 그 사이에 저장된 메시지는 stream 이 열린 뒤 다시 읽어 합치는데, 그때 같은 메시지가 두 번
 * 올 수 있다.
 */
export function mergeMessages(existing: readonly AgentMessage[], incoming: readonly AgentMessage[]): readonly AgentMessage[] {
  const knownIds = new Set(existing.map((message) => message.id))
  const fresh = new Map<number, AgentMessage>()
  for (const message of incoming) {
    if (!knownIds.has(message.id)) fresh.set(message.id, message)
  }
  // 새 것이 없으면 같은 배열을 돌려준다. React state 가 바뀌지 않아 다시 그리지 않는다.
  if (fresh.size === 0) return existing
  return [...existing, ...fresh.values()].sort((left, right) => left.id - right.id)
}

/** 가장 최근 ASSISTANT 메시지. 없으면 null. */
export function latestAssistant(messages: readonly AgentMessage[]): AgentMessage | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'ASSISTANT') return messages[index]
  }
  return null
}

/** callId 별 TOOL_RESULT. */
export function toolResultsById(messages: readonly AgentMessage[]): Map<string, ToolResultRecord> {
  const results = new Map<string, ToolResultRecord>()
  for (const message of messages) {
    if (message.toolResult !== null) results.set(message.toolResult.callId, message.toolResult)
  }
  return results
}

export type PendingCalls = {
  /** tool 호출을 실은 ASSISTANT 메시지의 id. */
  assistantId: number
  /** TOOL_RESULT 가 아직 없는 호출. 원래 순서를 지킨다. */
  calls: ToolCall[]
}

/**
 * 답이 아직 없는 tool 호출. 서버는 가장 최근 ASSISTANT 메시지의 호출에만 결과를 받으므로
 * (`not_pending`), 그보다 앞의 메시지는 보지 않는다.
 */
export function pendingToolCalls(messages: readonly AgentMessage[]): PendingCalls | null {
  const assistant = latestAssistant(messages)
  if (assistant === null || assistant.toolCalls.length === 0) return null
  const answered = toolResultsById(messages)
  const calls = assistant.toolCalls.filter((call) => !answered.has(call.callId))
  return calls.length === 0 ? null : { assistantId: assistant.id, calls }
}

/**
 * 이 탭이 실행할 책임이 있는 ASSISTANT 메시지인지.
 *
 * - SSE 로 이 탭에 바로 도착했거나(`liveAssistantIds`),
 * - 이 탭이 메시지나 event 를 보낸 뒤에 생긴 것(`ownedAfterId` 보다 큰 id)이다.
 *
 * 둘째 조건은 `GET messages` 와 stream 연결 사이에 도착해 다시 읽기로만 받은 응답을 위한 것이다.
 * 그 응답은 SSE 로 오지 않았지만 이 탭이 보낸 말에 대한 답이다. 새로고침한 탭은 둘 다 없으므로
 * 이어서 하기 카드를 본다.
 */
export function isOwnedAssistant(
  assistantId: number,
  ownership: { ownedAfterId: number | null; liveAssistantIds: readonly number[] },
): boolean {
  if (ownership.liveAssistantIds.includes(assistantId)) return true
  return ownership.ownedAfterId !== null && assistantId > ownership.ownedAfterId
}

/**
 * 이어서 하기 카드를 보여 줄지. `AWAITING_TOOL` 이고 답이 없는 호출이 있는데, 이 탭이 그 호출을
 * 시작하지도 않았고 맡지도 않았을 때다. 다른 탭이 실행 중일 수도 있지만 그 탭은 알 수 없으므로
 * 카드를 보여 주고 사용자가 고르게 한다.
 */
export function needsResume(
  conversation: Conversation | null,
  messages: readonly AgentMessage[],
  ownership: { ownedAfterId: number | null; liveAssistantIds: readonly number[] },
  startedCallIds: readonly string[],
): PendingCalls | null {
  if (conversation === null || conversation.status !== 'AWAITING_TOOL') return null
  const pending = pendingToolCalls(messages)
  if (pending === null) return null
  if (isOwnedAssistant(pending.assistantId, ownership)) return null
  if (pending.calls.some((call) => startedCallIds.includes(call.callId))) return null
  return pending
}

/** 마지막 메시지 id. 메시지가 없으면 0. */
export function lastMessageId(messages: readonly AgentMessage[]): number {
  return messages.length === 0 ? 0 : messages[messages.length - 1].id
}

export type StepState = ToolResultRecord['status'] | 'running' | 'waiting'

export type ToolStep = {
  callId: string
  tool: string
  args: Record<string, unknown>
  state: StepState
  error: string | null
}

export type ThreadItem =
  | { kind: 'user'; id: number; text: string }
  | { kind: 'assistant'; id: number; text: string }
  | { kind: 'steps'; id: number; steps: ToolStep[] }
  | { kind: 'event'; id: number; text: string; eventKind: string | null }
  | { kind: 'notice'; id: number; text: string; noticeKind: string | null }

/**
 * 화면에 그릴 줄. TOOL_RESULT 는 따로 그리지 않고 그 호출의 step 줄 상태로 들어간다.
 *
 * @param runningCallId 지금 이 탭이 실행 중인 호출. 그 step 은 `running` 으로 그린다.
 */
export function threadItems(messages: readonly AgentMessage[], runningCallId: string | null): ThreadItem[] {
  const results = toolResultsById(messages)
  const items: ThreadItem[] = []
  for (const message of messages) {
    if (message.role === 'USER') {
      items.push({ kind: 'user', id: message.id, text: message.content })
    } else if (message.role === 'ASSISTANT') {
      if (message.content.trim().length > 0) {
        items.push({ kind: 'assistant', id: message.id, text: message.content })
      }
      if (message.toolCalls.length > 0) {
        items.push({
          kind: 'steps',
          id: message.id,
          steps: message.toolCalls.map((call) => {
            const result = results.get(call.callId)
            const state: StepState =
              result !== undefined ? result.status : call.callId === runningCallId ? 'running' : 'waiting'
            return { callId: call.callId, tool: call.tool, args: call.args, state, error: result?.error ?? null }
          }),
        })
      }
    } else if (message.role === 'EVENT') {
      items.push({ kind: 'event', id: message.id, text: message.content, eventKind: message.kind })
    } else if (message.role === 'NOTICE') {
      items.push({ kind: 'notice', id: message.id, text: message.content, noticeKind: message.kind })
    }
  }
  return items
}

/** 대화가 바빠서 메시지와 event 를 받지 않는 상태인지. */
export function isBusy(conversation: Conversation | null): boolean {
  return conversation !== null && (conversation.status === 'RUNNING' || conversation.status === 'AWAITING_TOOL')
}
