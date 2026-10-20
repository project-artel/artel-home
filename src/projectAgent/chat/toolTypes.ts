/**
 * 브라우저가 실행하는 agent tool 의 공통 타입. 계약 3절이다. 대화창(ARTEL-1129)이 dispatcher 와
 * 카드를 만들고, `watch_job` 과 `author_scenarios` 는 ARTEL-1130 이 채운다.
 */
import type { AgentRegistryApi, PageSnapshot, ToolStatus } from '../registry/types'

export type ToolResultBody = {
  status: ToolStatus
  result?: unknown
  error?: string
  page?: PageSnapshot
}

export type JobKind = 'content_map_scan' | 'qa_run' | 'author_scenarios'

/** 대화창에 그리는 진행 카드 하나. `key` 는 `${kind}:${id}` 다. */
export type JobState = {
  key: string
  kind: JobKind
  id: string
  label: string
  state: 'running' | 'finished' | 'failed'
  /** 진행 중에 보여 주는 짧은 문장. 예: "스텝 7/12". */
  progress?: string
  /** 끝났을 때의 요약. */
  detail?: string
  /** 결과를 볼 수 있는 페이지 경로. project 기준 상대 경로다. */
  href?: string
}

export type ChoiceOption = { id: string; label: string }

export type ToolContext = {
  projectId: string
  conversationId: number
  registry: AgentRegistryApi
  /** project 기준 상대 경로로 이동한다. 예: `qa-runs/55`. */
  navigate: (path: string) => void
  /** 진행 카드를 추가하거나 바꾼다. */
  upsertJob: (job: JobState) => void
  /** job 이 끝나면 event 를 보낸다. 대화가 바쁘면 IDLE 이 될 때까지 기다렸다 보낸다. */
  postEvent: (kind: 'job_finished' | 'job_failed', summary: string, data?: unknown) => void
  /** 선택 카드를 띄우고 답을 기다린다. 대화가 멈추면 null. */
  askChoice: (question: string, options: ChoiceOption[], multiple?: boolean) => Promise<string[] | null>
  /** 대화를 멈추면 abort 된다. */
  signal: AbortSignal
}

export type ToolHandler = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResultBody>
