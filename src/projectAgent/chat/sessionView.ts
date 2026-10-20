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
  /** 이어서 하기 카드. 어느 탭도 이 대화의 잠금을 잡고 있지 않다고 확인했을 때만 있다. */
  resume: PendingCalls | null
  /** 답이 없는 호출을 다른 탭이 실행 중이다. 카드 대신 한 줄로 알린다. */
  runningInOtherTab: boolean
  busy: boolean
  /** 지금 대화의 선택 카드. 다른 대화의 선택은 그 대화로 가야 보인다. */
  choice: SessionState['choice']
}

const NO_JOBS: JobState[] = []
const NO_CALL_IDS: string[] = []

export function currentView(state: SessionState): CurrentView {
  const id = state.currentId
  const thread = id === null ? null : (state.threads[id] ?? null)
  const messages = thread?.messages ?? []
  const conversation = thread?.conversation ?? null
  const runningCallId =
    state.runningCall !== null && state.runningCall.conversationId === id ? state.runningCall.callId : null
  const ownership = (id === null ? undefined : state.ownership[id]) ?? { ownedAfterId: null }
  const startedCallIds = (id === null ? undefined : state.startedCallIds[id]) ?? NO_CALL_IDS
  const pending = needsResume(conversation, messages, ownership, startedCallIds)
  // 잠금을 아직 확인하지 않았으면 둘 다 그리지 않는다. 확인은 곧 끝난다.
  const lockState = id === null ? undefined : state.conversationLocks[id]
  return {
    thread,
    items: threadItems(messages, runningCallId),
    jobs: (id === null ? undefined : state.jobs[id]) ?? NO_JOBS,
    resume: pending !== null && lockState === 'free' ? pending : null,
    runningInOtherTab: pending !== null && lockState === 'held',
    busy: state.sending || isBusy(conversation),
    choice: state.choice !== null && state.choice.conversationId === id ? state.choice : null,
  }
}
