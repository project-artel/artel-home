import type { ConversationStatus } from './conversationApi'

/*
 * job 이 끝났다는 event 의 대기열. 서버는 `POST events` 를 IDLE 이나 ERROR 일 때만 받는다
 * (그 밖에는 `409 conversation_busy`). job 은 agent 가 다른 일을 하는 중에도 끝나므로, 보낼 수 있을
 * 때까지 여기서 기다린다.
 */

export type JobEventKind = 'job_finished' | 'job_failed'

export type QueuedEvent = {
  /** 대기열 안에서만 쓰는 순번. 같은 event 를 두 번 지우지 않게 한다. */
  sequence: number
  conversationId: number
  kind: JobEventKind
  summary: string
  data?: unknown
}

export function canReceiveEvent(status: ConversationStatus | undefined): boolean {
  return status === 'IDLE' || status === 'ERROR'
}

/**
 * 지금 보낼 event. 대화마다 가장 오래된 것 하나만 고른다. 하나를 보내면 서버가 바로 model 을
 * 부르므로(RUNNING), 같은 대화의 다음 event 는 다시 IDLE 이 된 뒤에 보낸다.
 *
 * @param statusOf 대화 상태. 이 탭이 상태를 모르는 대화(stream 을 열지 않은 대화)는 `undefined`
 *   이고, 그때는 보내 보고 409 면 다시 기다린다.
 */
export function readyEvents(
  queue: readonly QueuedEvent[],
  statusOf: (conversationId: number) => ConversationStatus | undefined,
): QueuedEvent[] {
  const seenConversations = new Set<number>()
  const ready: QueuedEvent[] = []
  for (const event of queue) {
    if (seenConversations.has(event.conversationId)) continue
    seenConversations.add(event.conversationId)
    const status = statusOf(event.conversationId)
    if (status === undefined || canReceiveEvent(status)) ready.push(event)
  }
  return ready
}

export function removeEvent(queue: readonly QueuedEvent[], sequence: number): QueuedEvent[] {
  return queue.filter((event) => event.sequence !== sequence)
}
