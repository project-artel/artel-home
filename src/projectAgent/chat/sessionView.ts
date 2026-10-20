import type { SessionState, Thread } from './sessionStore'
import { isBusy, needsResume, threadItems, type PendingCalls, type ThreadItem } from './threadState'
import type { JobState } from './toolTypes'

/*
 * store 상태에서 대화창이 그릴 값을 뽑는 순수 함수.
 */

export type SessionBadge = {
  /** 닫힌 대화창의 다시 열기 버튼에 보여 줄 수. 0 이면 badge 를 그리지 않는다. */
  count: number
  approval: boolean
  choice: boolean
  finishedJobs: number
}

/** 대화창이 닫혀 있는 동안 사용자가 봐야 하는 것: 승인 대기, 선택 대기, 아직 보지 않은 끝난 job. */
export function sessionBadge(state: Pick<SessionState, 'approval' | 'choice' | 'jobs' | 'seenJobKeys'>): SessionBadge {
  const seen = new Set(state.seenJobKeys)
  const finishedJobs = Object.values(state.jobs)
    .flat()
    .filter((job) => job.state !== 'running' && !seen.has(job.key)).length
  const approval = state.approval !== null
  const choice = state.choice !== null
  return { count: (approval ? 1 : 0) + (choice ? 1 : 0) + finishedJobs, approval, choice, finishedJobs }
}

export type CurrentView = {
  thread: Thread | null
  items: ThreadItem[]
  jobs: JobState[]
  resume: PendingCalls | null
  busy: boolean
  /** 지금 대화의 선택 카드. 다른 대화의 선택은 그 대화로 가야 보인다. */
  choice: SessionState['choice']
}

const NO_JOBS: JobState[] = []

export function currentView(state: SessionState): CurrentView {
  const id = state.currentId
  const thread = id === null ? null : (state.threads[id] ?? null)
  const messages = thread?.messages ?? []
  const conversation = thread?.conversation ?? null
  const runningCallId =
    state.runningCall !== null && state.runningCall.conversationId === id ? state.runningCall.callId : null
  const ownership = (id === null ? undefined : state.ownership[id]) ?? { ownedAfterId: null, liveAssistantIds: [] }
  return {
    thread,
    items: threadItems(messages, runningCallId),
    jobs: (id === null ? undefined : state.jobs[id]) ?? NO_JOBS,
    resume: needsResume(conversation, messages, ownership, state.startedCallIds),
    busy: state.sending || isBusy(conversation),
    choice: state.choice !== null && state.choice.conversationId === id ? state.choice : null,
  }
}
